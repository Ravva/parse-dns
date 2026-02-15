import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";

function ensureOutDir() {
  mkdirSync("out", { recursive: true });
}

function safeJsonParse(s: string): unknown | null {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function findProductJsonLd(jsonlds: string[]): unknown | null {
  for (const raw of jsonlds) {
    const parsed = safeJsonParse(raw);
    if (!parsed) continue;

    const candidates = Array.isArray(parsed) ? parsed : [parsed];
    for (const c of candidates) {
      if (c && typeof c === "object" && (c as any)["@type"] === "Product") return c;
    }
  }
  return null;
}

async function main() {
  ensureOutDir();

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
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    // @ts-ignore
    window.chrome = { runtime: {} };
  });

  const page = await context.newPage();

  const home = await page.goto("https://www.citilink.ru/", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(6000);

  // Пытаемся получить ссылку на товар через поисковую выдачу.
  // Примечание: URL/DOM у Citilink может меняться; PoC специально делает минимум допущений.
  const searchUrl = "https://www.citilink.ru/search/?text=%D0%BF%D1%80%D0%BE%D1%86%D0%B5%D1%81%D1%81%D0%BE%D1%80";
  const search = await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(6000);

  const productHref = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));
    const hrefs = anchors.map((a) => a.getAttribute("href") || "").filter(Boolean);
    const product = hrefs.find((h) => /\/product\//i.test(h)) || null;
    return product ? new URL(product, location.href).toString() : null;
  });

  if (!productHref) {
    const html = await page.content();
    writeFileSync("out/citilink_debug_search.html", html, "utf8");
    throw new Error("Citilink: не нашел ссылку /product/ на странице поиска (сохранил out/citilink_debug_search.html)");
  }

  const productNav = await page.goto(productHref, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(6000);

  const jsonlds = await page.$$eval('script[type="application/ld+json"]', (nodes) =>
    nodes.map((n) => (n.textContent || "").trim()).filter(Boolean),
  );

  const productJsonLd = findProductJsonLd(jsonlds);

  // Нормализация: на основе JSON-LD (если есть).
  const normalized = (() => {
    if (!productJsonLd || typeof productJsonLd !== "object") return { name: null, price: null };
    const p = productJsonLd as any;
    const name = typeof p.name === "string" ? p.name : null;
    const offers = p.offers;
    const price =
      offers && typeof offers === "object"
        ? typeof (offers as any).price === "string" || typeof (offers as any).price === "number"
          ? (offers as any).price
          : null
        : null;
    return { name, price };
  })();

  const out = {
    source: "citilink.ru",
    fetchedAt: new Date().toISOString(),
    url: productHref,
    debug: {
      homeStatus: home?.status() ?? null,
      searchStatus: search?.status() ?? null,
      productNavStatus: productNav?.status() ?? null,
      jsonldCount: jsonlds.length,
    },
    raw: {
      jsonld: productJsonLd,
    },
    normalized,
  };

  writeFileSync("out/citilink_poc.json", JSON.stringify(out, null, 2), "utf8");

  await page.close();
  await context.close();
  await browser.close();

  console.log(`Wrote out/citilink_poc.json (name=${normalized.name ?? "null"})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

