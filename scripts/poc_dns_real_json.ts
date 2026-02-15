import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import axios from "axios";
import * as cheerio from "cheerio";
import { chromium, type APIResponse, type BrowserContext } from "playwright";

type SpecItem = { group: string | null; name: string; value: string };

type UnifiedOut = {
  source: "dns-shop.ru";
  fetchedAt: string;
  url: string;
  debug: Record<string, unknown>;
  product: {
    name: string | null;
    description: string | null;
    brand: string | null;
    sku: string | null;
    price: { current: number | null; old: number | null; currency: string | null };
    availability: string | null;
    images: string[];
    rating: { value: number | null; count: number | null };
  };
  specs: SpecItem[];
  raw: Record<string, unknown>;
};

type DnsNormalized = {
  name: string | null;
  price: {
    current: number | null;
    old: number | null;
  };
  brand: string | null;
  availabilityText: string | null;
  specifications: Record<string, string>;
  images: string[];
};

function ensureOutDir() {
  mkdirSync("out", { recursive: true });
}

function stripAmbiguousUnicode(input: string): string {
  // Делает JSON “чистым” для IDE: убираем NBSP и невидимые символы,
  // из-за которых VS Code показывает "ambiguous unicode characters".
  return input
    .replace(/\u00a0/g, " ") // NBSP -> обычный пробел
    .replace(/[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, ""); // zero-width + bidi marks + BOM
}

function stripLocXml(line: string): string | null {
  const m = line.match(/<loc>([^<]+)<\/loc>/i);
  return m?.[1] ?? null;
}

async function pickLiveDnsProductUrl(contains: string): Promise<string> {
  const indexXml = (await axios.get("https://www.dns-shop.ru/sitemap.xml", { timeout: 30000 })).data as string;
  const lines = indexXml.split(/\r?\n/);
  const firstProductsSitemap =
    lines.map(stripLocXml).find((u) => u && /sitemap-products\d+\.xml/i.test(u)) ?? null;

  if (!firstProductsSitemap) {
    throw new Error("DNS sitemap.xml: не нашел ссылок на sitemap-products*.xml");
  }

  // Считываем первые ~5MB и ищем подходящую ссылку на товар.
  const resp = await axios.get(firstProductsSitemap, {
    timeout: 30000,
    headers: { Range: "bytes=0-5000000" },
    responseType: "text",
    transformResponse: (x) => x, // важно: не пытаться JSON.parse
  });

  const chunk = String(resp.data);
  const locRegex = /<loc>(https:\/\/www\.dns-shop\.ru\/product\/[^<]+)<\/loc>/gi;
  const candidates: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = locRegex.exec(chunk))) {
    const url = match[1];
    if (url.toLowerCase().includes(contains.toLowerCase())) candidates.push(url);
    if (candidates.length >= 50) break;
  }

  if (candidates.length === 0) {
    throw new Error(
      `DNS ${path.basename(firstProductsSitemap)}: не нашел product URL по подстроке ${JSON.stringify(contains)} в первых 5MB`,
    );
  }

  // Рандомный товар (в рамках первых N найденных из sitemap-chunk).
  return candidates[Math.floor(Math.random() * candidates.length)];
}

async function waitForDnsCookies(context: BrowserContext) {
  const deadline = Date.now() + 45000;
  for (;;) {
    const cookies = await context.cookies();
    const names = new Set(cookies.map((c) => c.name));
    // В текущей конфигурации DNS чаще ставит qrator_jsid2.
    if (names.has("qrator_jsid2") || names.has("qrator_jsid")) return;
    if (Date.now() > deadline) {
      throw new Error("DNS: cookies qrator_jsid/qrator_jsid2 не появились за 45 секунд");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

function parseDnsHtml(url: string, html: string): DnsNormalized {
  const $ = cheerio.load(html);

  // NOTE: На DNS часть данных рендерится динамически. Для PoC мы используем:
  // - базовые мета-теги (og:title) как fallback на name
  // - дальше дополняем данные через microdata endpoint (см. ниже)

  const name =
    $("h1.product-card-top__title").text().trim() ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    $("h1").first().text().trim() ||
    null;

  const priceText =
    $(".product-buy__price").first().text().trim() ||
    $('[data-role="price"]').text().trim() ||
    $(".price-block__main").text().trim() ||
    null;

  const oldPriceText =
    $(".product-buy__price_old").text().trim() || $(".price-block__old").text().trim() || null;

  const current = priceText ? Number.parseInt(priceText.replace(/\s/g, "").replace(/\D/g, ""), 10) : null;
  const old = oldPriceText ? Number.parseInt(oldPriceText.replace(/\s/g, "").replace(/\D/g, ""), 10) : null;

  const brand =
    $('[itemprop="brand"]').text().trim() || $(".product-card-top__brand").text().trim() || null;

  const availabilityText =
    $(".product-buy__availability").text().trim() || $('[data-role="availability"]').text().trim() || null;

  const specifications: Record<string, string> = {};
  $(".product-characteristics__item").each((_, elem) => {
    const n = $(elem).find(".product-characteristics__item-name").text().trim();
    const v = $(elem).find(".product-characteristics__item-value").text().trim();
    if (n && v) specifications[n] = v;
  });

  if (Object.keys(specifications).length === 0) {
    $("tr").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length !== 2) return;
      const n = $(cells[0]).text().trim();
      const v = $(cells[1]).text().trim();
      if (n && v) specifications[n] = v;
    });
  }

  const images: string[] = [];
  $('img[itemprop="image"], .product-images-slider__main-img img').each((_, img) => {
    const src = $(img).attr("src") || $(img).attr("data-src");
    if (!src) return;
    if (src.includes("stub")) return;
    const full = src.startsWith("http") ? src : `https://www.dns-shop.ru${src}`;
    if (!images.includes(full)) images.push(full);
  });

  return {
    name,
    price: { current: Number.isFinite(current) ? current : null, old: Number.isFinite(old) ? old : null },
    brand,
    availabilityText,
    specifications,
    images,
  };
}

function extractMicrodataPathFromHtml(html: string): string | null {
  const m = html.match(/window\.cardMicrodataUrl\s*=\s*'([^']+)'/);
  return m?.[1] ?? null;
}

function extractCharacteristicsPathFromHtml(html: string): string | null {
  const m = html.match(/id="product-card-characteristics"[^>]+data-url="([^"]+)"/);
  return m?.[1] ?? null;
}

function parseDnsMicrodataResponse(microText: string): {
  productJsonLd: unknown | null;
  productPatch: Partial<UnifiedOut["product"]>;
} {
  // DNS microdata endpoint на практике возвращает JSON:
  // {"result":true,"data":{ "@type":"Product", ... }}
  // Но на блокировках может вернуться HTML с JS-челленджем, поэтому есть fallback.

  let productJsonLd: unknown | null = null;
  const productPatch: Partial<UnifiedOut["product"]> = {};

  try {
    const parsed = JSON.parse(microText);
    const maybeProduct = (parsed && typeof parsed === "object" && (parsed as any).data) ? (parsed as any).data : null;
    if (maybeProduct && typeof maybeProduct === "object" && (maybeProduct as any)["@type"] === "Product") {
      productJsonLd = maybeProduct;
    }
  } catch {
    // ignore, fallback to HTML parsing below
  }

  if (!productJsonLd) {
    const $ = cheerio.load(microText);
    const jsonlds = $('script[type="application/ld+json"]')
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean);

    for (const raw of jsonlds) {
      try {
        const parsed = JSON.parse(raw);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        const prod = arr.find((x) => x && typeof x === "object" && (x as any)["@type"] === "Product");
        if (prod) {
          productJsonLd = prod;
          break;
        }
      } catch {}
    }
  }

  // Патчим нормализованные поля тем, что смогли вытащить из JSON-LD.
  if (productJsonLd && typeof productJsonLd === "object") {
    const p = productJsonLd as any;
    if (typeof p.name === "string") productPatch.name = p.name;
    if (typeof p.description === "string") productPatch.description = p.description;
    if (p.brand && typeof p.brand === "object" && typeof p.brand.name === "string") {
      productPatch.brand = p.brand.name;
    }
    if (typeof p.sku === "string" || typeof p.sku === "number") productPatch.sku = String(p.sku);
    if (p.offers) {
      const offers = Array.isArray(p.offers) ? p.offers[0] : p.offers;
      if (offers && typeof offers === "object") {
        const price = (offers as any).price;
        const priceNum = typeof price === "string" ? Number.parseInt(price.replace(/\D/g, ""), 10) : price;
        if (Number.isFinite(priceNum)) {
          productPatch.price = {
            current: priceNum,
            old: null,
            currency: typeof (offers as any).priceCurrency === "string" ? (offers as any).priceCurrency : "RUB",
          };
        }
        if (typeof (offers as any).availability === "string") productPatch.availability = (offers as any).availability;
      }
    }
    if (p.aggregateRating && typeof p.aggregateRating === "object") {
      const rv = Number((p.aggregateRating as any).ratingValue);
      const rc = Number((p.aggregateRating as any).reviewCount);
      productPatch.rating = { value: Number.isFinite(rv) ? rv : null, count: Number.isFinite(rc) ? rc : null };
    }
    if (typeof p.image === "string") productPatch.images = [p.image];
    if (Array.isArray(p.image) && p.image.every((x: any) => typeof x === "string")) {
      productPatch.images = p.image;
    }
  }

  return { productJsonLd, productPatch };
}

function parseDnsCharacteristicsHtml(characteristicsHtml: string): SpecItem[] {
  const $ = cheerio.load(characteristicsHtml);

  const specs: SpecItem[] = [];

  // Современная разметка DNS: группы + li.
  $(".product-characteristics__group").each((_, groupEl) => {
    const group = $(groupEl).find(".product-characteristics__group-title").first().text().replace(/\s+/g, " ").trim();
    $(groupEl)
      .find(".product-characteristics__spec")
      .each((_, specEl) => {
        const name = $(specEl)
          .find(".product-characteristics__spec-title-content")
          .first()
          .text()
          .replace(/\s+/g, " ")
          .trim();
        const value = $(specEl)
          .find(".product-characteristics__spec-value")
          .first()
          .text()
          .replace(/\s+/g, " ")
          .trim();
        if (!name || !value) return;
        specs.push({ group: group || null, name, value });
      });
  });

  // Таблица (самый частый вариант)
  $("tr").each((_, tr) => {
    const cells = $(tr).find("th, td");
    if (cells.length < 2) return;
    const name = $(cells[0]).text().replace(/\s+/g, " ").trim();
    const value = $(cells[1]).text().replace(/\s+/g, " ").trim();
    if (!name || !value) return;
    specs.push({ group: null, name, value });
  });

  // dl/dt/dd (fallback)
  $("dt").each((_, dt) => {
    const name = $(dt).text().replace(/\s+/g, " ").trim();
    const dd = $(dt).next("dd");
    const value = dd.text().replace(/\s+/g, " ").trim();
    if (!name || !value) return;
    specs.push({ group: null, name, value });
  });

  // Dedup
  const seen = new Set<string>();
  return specs.filter((s) => {
    const k = `${s.group ?? ""}||${s.name}||${s.value}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function decodeDnsEscapedPath(p: string): string {
  // В HTML DNS часто экранирует "/" как "\/"
  return p.replace(/\\\//g, "/");
}

function parseDnsCharacteristicsActualJson(data: unknown): SpecItem[] {
  // Формат может меняться. Делаем максимально терпимый разбор:
  // ищем группы/спеки по типичным ключам.
  const specs: SpecItem[] = [];

  function walk(node: any, group: string | null) {
    if (!node || typeof node !== "object") return;

    // Типичный вариант: { title/name, items/specs/list: [...] }
    const nextGroup =
      typeof node.title === "string"
        ? node.title
        : typeof node.name === "string"
          ? node.name
          : group;

    // Типичный вариант спеки: { title/name, value }
    if (typeof node.value === "string") {
      const name = typeof node.title === "string" ? node.title : typeof node.name === "string" ? node.name : null;
      if (name) {
        const value = node.value.trim();
        if (value) specs.push({ group: nextGroup ?? null, name: name.trim(), value });
      }
    }

    for (const k of Object.keys(node)) {
      const v = (node as any)[k];
      if (Array.isArray(v)) {
        for (const item of v) walk(item, nextGroup ?? null);
      } else if (v && typeof v === "object") {
        walk(v, nextGroup ?? null);
      }
    }
  }

  walk(data as any, null);

  const seen = new Set<string>();
  return specs.filter((s) => {
    const key = `${s.group ?? ""}||${s.name}||${s.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function main() {
  ensureOutDir();

  const productUrl = await pickLiveDnsProductUrl("/processor-");
  const urlWithCity = productUrl.includes("?") ? `${productUrl}&cityPath=msk` : `${productUrl}?cityPath=msk`;

  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== "0",
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    viewport: { width: 1366, height: 768 },
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    extraHTTPHeaders: {
      "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
      "sec-ch-ua": '"Not/A";v="8", "Chromium";v="123", "Google Chrome";v="123"',
      "sec-ch-ua-platform": '"Windows"',
      "sec-ch-ua-mobile": "?0",
    },
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    Object.defineProperty(navigator, "languages", { get: () => ["ru-RU", "ru", "en-US"] });
    Object.defineProperty(navigator, "language", { get: () => "ru-RU" });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4] });
    // @ts-ignore
    window.chrome = { runtime: {} };
  });

  let pwaJson: unknown = null;

  const page = await context.newPage();
  page.on("response", async (r) => {
    const u = r.url();
    if (!u.includes("/pwa/pwa/get-product")) return;
    try {
      // Иногда ответ может быть не JSON, поэтому try/catch.
      pwaJson = await r.json();
    } catch {}
  });

  // Прогрев сессии и получение qrator cookies.
  const baseResp = await page.goto("https://www.dns-shop.ru/?cityPath=msk", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(4000);
  await waitForDnsCookies(context);

  // Переход на товар: иногда это триггерит PWA запросы, которые мы пытаемся перехватить.
  const productResp = await page.goto(urlWithCity, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(4000);

  // Забираем HTML тем же контекстом, чтобы cookies/заголовки совпадали.
  let htmlResp: APIResponse | null = null;
  htmlResp = await context.request.get(urlWithCity, { timeout: 60000 });

  // Если внезапно получили не-200, пробуем еще раз после небольшой паузы (иногда после JS-челленджа).
  if (htmlResp.status() >= 400) {
    await page.waitForTimeout(3000);
    htmlResp = await context.request.get(urlWithCity, { timeout: 60000 });
  }

  const htmlStatus = htmlResp.status();
  const html = stripAmbiguousUnicode(await htmlResp.text());

  const normalized = parseDnsHtml(urlWithCity, html);

  let product: UnifiedOut["product"] = {
    name: normalized.name,
    description: null,
    brand: normalized.brand,
    sku: null,
    price: { current: normalized.price.current, old: normalized.price.old, currency: null },
    availability: normalized.availabilityText,
    images: normalized.images,
    rating: { value: null, count: null },
  };

  // Добираем данные через microdata endpoint, который DNS сам использует.
  let microdata: { url: string; status: number; productJsonLd: unknown | null } | null = null;
  const microPath = extractMicrodataPathFromHtml(html);
  if (microPath) {
    const microUrl = new URL(microPath, "https://www.dns-shop.ru").toString();
    const microResp = await context.request.get(microUrl, { timeout: 60000 });
    const microText = stripAmbiguousUnicode(await microResp.text());
    writeFileSync("out/dns_microdata.txt", microText, "utf8");
    const { productJsonLd, productPatch } = parseDnsMicrodataResponse(microText);
    microdata = { url: microUrl, status: microResp.status(), productJsonLd };

    product = {
      ...product,
      ...productPatch,
      price: productPatch.price ?? product.price,
      images: productPatch.images ?? product.images,
      rating: productPatch.rating ?? product.rating,
    };
  }

  // Характеристики: грузятся отдельным URL.
  let characteristics: { url: string; status: number } | null = null;
  let specs: SpecItem[] = [];
  const charPath = extractCharacteristicsPathFromHtml(html);
  if (charPath) {
    const charUrl = new URL(charPath, "https://www.dns-shop.ru").toString();
    const charResp = await context.request.get(charUrl, { timeout: 60000 });
    const charHtml = stripAmbiguousUnicode(await charResp.text());
    writeFileSync("out/dns_characteristics.html", charHtml, "utf8");
    characteristics = { url: charUrl, status: charResp.status() };
    specs = parseDnsCharacteristicsHtml(charHtml);

    // Пытаемся получить "актуальные" характеристики из внутреннего JSON-эндпоинта,
    // который используется на странице характеристик.
    const m = charHtml.match(/\\\/catalog\\\/product\\\/get-product-characteristics-actual\\\/\?id=[0-9a-f-]+/i);
    if (m?.[0]) {
      const actualPath = decodeDnsEscapedPath(m[0]);
      const actualUrl = new URL(actualPath, "https://www.dns-shop.ru").toString();
      const actualResp = await context.request.get(actualUrl, { timeout: 60000 });
      const actualText = stripAmbiguousUnicode(await actualResp.text());
      writeFileSync("out/dns_characteristics_actual.json", actualText, "utf8");
      try {
        const parsed = JSON.parse(actualText);
        // endpoint чаще возвращает { result: true, html: "<div ...>...</div>" }
        const html = typeof parsed?.html === "string" ? parsed.html : null;
        const fromHtml = html ? parseDnsCharacteristicsHtml(html) : [];
        const fromJson = parseDnsCharacteristicsActualJson(parsed);
        const best = fromHtml.length >= fromJson.length ? fromHtml : fromJson;
        if (best.length > specs.length) specs = best;
      } catch {
        // ignore
      }
    }
  }

  const cookies = await context.cookies();
  const cookieNames = cookies.map((c) => c.name).sort();

  const out: UnifiedOut = {
    source: "dns-shop.ru",
    fetchedAt: new Date().toISOString(),
    url: urlWithCity,
    debug: {
      baseStatus: baseResp?.status() ?? null,
      productNavStatus: productResp?.status() ?? null,
      htmlStatus,
      cookieNames,
      characteristics,
    },
    product,
    specs,
    raw: {
      pwa: pwaJson,
      microdata,
      htmlSnippet: html.slice(0, 50_000),
    },
  };

  writeFileSync("out/dns_poc.json", JSON.stringify(out, null, 2), "utf8");
  writeFileSync("out/dns_poc.html", html, "utf8");

  await page.close();
  await context.close();
  await browser.close();

  console.log(
    `Wrote out/dns_poc.json (name=${out.product.name ?? "null"}, price=${out.product.price.current ?? "null"}, specs=${out.specs.length})`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
