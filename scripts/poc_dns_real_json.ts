import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import axios from "axios";
import * as cheerio from "cheerio";
import { chromium, type APIResponse, type BrowserContext } from "playwright";

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
  let match: RegExpExecArray | null;
  while ((match = locRegex.exec(chunk))) {
    const url = match[1];
    if (url.toLowerCase().includes(contains.toLowerCase())) return url;
  }

  throw new Error(
    `DNS ${path.basename(firstProductsSitemap)}: не нашел product URL по подстроке ${JSON.stringify(contains)} в первых 5MB`,
  );
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

function parseDnsMicrodataResponse(microText: string): {
  productJsonLd: unknown | null;
  normalizedPatch: Partial<DnsNormalized>;
} {
  // DNS microdata endpoint на практике возвращает JSON:
  // {"result":true,"data":{ "@type":"Product", ... }}
  // Но на блокировках может вернуться HTML с JS-челленджем, поэтому есть fallback.

  let productJsonLd: unknown | null = null;
  const normalizedPatch: Partial<DnsNormalized> = {};

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
    if (typeof p.name === "string") normalizedPatch.name = p.name;
    if (p.brand && typeof p.brand === "object" && typeof p.brand.name === "string") {
      normalizedPatch.brand = p.brand.name;
    }
    if (p.offers) {
      const offers = Array.isArray(p.offers) ? p.offers[0] : p.offers;
      if (offers && typeof offers === "object") {
        const price = (offers as any).price;
        const priceNum = typeof price === "string" ? Number.parseInt(price.replace(/\D/g, ""), 10) : price;
        if (Number.isFinite(priceNum)) {
          normalizedPatch.price = { current: priceNum, old: null };
        }
      }
    }
    if (typeof p.image === "string") normalizedPatch.images = [p.image];
    if (Array.isArray(p.image) && p.image.every((x: any) => typeof x === "string")) {
      normalizedPatch.images = p.image;
    }
  }

  return { productJsonLd, normalizedPatch };
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

  let normalized = parseDnsHtml(urlWithCity, html);

  // Добираем данные через microdata endpoint, который DNS сам использует.
  let microdata: { url: string; status: number; productJsonLd: unknown | null } | null = null;
  const microPath = extractMicrodataPathFromHtml(html);
  if (microPath) {
    const microUrl = new URL(microPath, "https://www.dns-shop.ru").toString();
    const microResp = await context.request.get(microUrl, { timeout: 60000 });
    const microText = stripAmbiguousUnicode(await microResp.text());
    writeFileSync("out/dns_microdata.txt", microText, "utf8");
    const { productJsonLd, normalizedPatch } = parseDnsMicrodataResponse(microText);
    microdata = { url: microUrl, status: microResp.status(), productJsonLd };

    // Мерджим patch поверх html-парсинга.
    normalized = {
      name: normalizedPatch.name ?? normalized.name,
      brand: normalizedPatch.brand ?? normalized.brand,
      availabilityText: normalized.availabilityText,
      specifications: normalized.specifications,
      images: normalizedPatch.images ?? normalized.images,
      price: normalizedPatch.price ?? normalized.price,
    };
  }

  const cookies = await context.cookies();
  const cookieNames = cookies.map((c) => c.name).sort();

  const out = {
    source: "dns-shop.ru",
    fetchedAt: new Date().toISOString(),
    url: urlWithCity,
    debug: {
      baseStatus: baseResp?.status() ?? null,
      productNavStatus: productResp?.status() ?? null,
      htmlStatus,
      cookieNames,
    },
    raw: {
      pwa: pwaJson,
      microdata,
      htmlSnippet: html.slice(0, 50_000),
    },
    normalized,
  };

  writeFileSync("out/dns_poc.json", JSON.stringify(out, null, 2), "utf8");
  writeFileSync("out/dns_poc.html", html, "utf8");

  await page.close();
  await context.close();
  await browser.close();

  console.log(`Wrote out/dns_poc.json (name=${normalized.name ?? "null"}, price=${normalized.price.current ?? "null"})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
