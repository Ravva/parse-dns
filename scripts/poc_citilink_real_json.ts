import { mkdirSync, writeFileSync } from 'node:fs';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';

type SpecItem = { group: string | null; name: string; value: string };

type UnifiedOut = {
  source: 'citilink.ru';
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

function ensureOutDir() {
  mkdirSync('out', { recursive: true });
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
      if (!c || typeof c !== 'object') continue;
      if ((c as any)['@type'] === 'Product') return c;
      const graph = (c as any)['@graph'];
      if (Array.isArray(graph)) {
        const prod = graph.find(
          (x) => x && typeof x === 'object' && (x as any)['@type'] === 'Product'
        );
        if (prod) return prod;
      }
    }
  }
  return null;
}

function extractNextDataJson(html: string): any | null {
  // Regex может обрезать содержимое при редких последовательностях в строках.
  // Cheerio достает именно текст script-тега.
  const $ = cheerio.load(html);
  const text = $('#__NEXT_DATA__').first().text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function extractNameValueSpecsFromUnknownJson(data: unknown): SpecItem[] {
  const out: SpecItem[] = [];

  function walk(node: any, currentGroup: string | null = null) {
    if (!node || typeof node !== 'object') return;

    // Citilink grouped structure: { name: "...", items: [ { name, value }, ... ] }
    if (typeof node.name === 'string' && Array.isArray(node.items)) {
      for (const item of node.items) {
        walk(item, node.name.trim());
      }
      return;
    }

    // Canonical Citilink-ish shape: { name: string, value: string, measure?: string }
    if (typeof node.name === 'string' && typeof node.value === 'string') {
      const name = node.name.trim();
      const value = node.value.trim();
      const measure = typeof node.measure === 'string' ? node.measure.trim() : '';
      if (name && value) {
        out.push({
          group: currentGroup,
          name,
          value: measure ? `${value} ${measure}` : value,
        });
      }
    }

    if (Array.isArray(node)) {
      for (const x of node) walk(x, currentGroup);
      return;
    }

    for (const k of Object.keys(node)) {
      const v = node[k];
      if (v && typeof v === 'object') walk(v, currentGroup);
    }
  }

  walk(data as any);

  const seen = new Set<string>();
  return out.filter((s) => {
    const key = `${s.group ?? ''}||${s.name}||${s.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function main() {
  ensureOutDir();

  const browser = await chromium.launch({
    headless: process.env.HEADLESS !== '0',
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    // @ts-ignore
    window.chrome = { runtime: {} };
  });

  const page = await context.newPage();

  // Пытаемся перехватить "полные" характеристики, если они догружаются с бэка.
  let capturedApiSpecs: SpecItem[] = [];
  const capturedRpc: Array<{
    url: string;
    method: string;
    contentType: string | null;
    status: number;
    body?: string;
  }> = [];
  const capturedRpcUrls = new Set<string>();
  page.on('response', async (r) => {
    const u = r.url();
    if (!u.includes('rpc.citilink.ru/catalog-site')) return;
    if (!capturedRpcUrls.has(u)) capturedRpcUrls.add(u);

    try {
      const json = await r.json();
      const specs = extractNameValueSpecsFromUnknownJson(json);
      if (specs.length > capturedApiSpecs.length) capturedApiSpecs = specs;

      // Сохраняем один "сэмпл" ответа для реверса, чтобы вытащить полные группы/пары.
      if (capturedRpc.length < 3) {
        capturedRpc.push({
          url: u,
          method: r.request().method(),
          contentType: r.headers()['content-type'] ?? null,
          status: r.status(),
          body: JSON.stringify(json).slice(0, 50_000),
        });
      }
    } catch {
      // ignore
    }
  });

  page.on('requestfinished', async (req) => {
    const u = req.url();
    if (!u.includes('rpc.citilink.ru/catalog-site')) return;
    try {
      const postData = req.postData();
      if (postData && capturedRpc.length < 3) {
        capturedRpc.push({
          url: u,
          method: req.method(),
          contentType: req.headers()['content-type'] ?? null,
          status: 0,
          body: postData.slice(0, 50_000),
        });
      }
    } catch {
      // ignore
    }
  });

  let home: any = null;
  let search: any = null;
  const provided =
    process.env.CITILINK_URL || process.argv.slice(2).find((a) => a.startsWith('http')) || null;

  if (!provided) {
    home = await page.goto('https://www.citilink.ru/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(6000);
  }

  let productHref: string | null = null;

  if (provided) {
    productHref = provided;
  } else {
    // Пытаемся получить ссылку на товар через поисковую выдачу.
    // Примечание: URL/DOM у Citilink может меняться; PoC специально делает минимум допущений.
    const searchUrl =
      'https://www.citilink.ru/search/?text=%D0%BF%D1%80%D0%BE%D1%86%D0%B5%D1%81%D1%81%D0%BE%D1%81%D1%81%D0%BE%D1%80';
    search = await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(6000);

    productHref = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
      const hrefs = anchors
        .map((a) => a.getAttribute('href') || '')
        .filter(Boolean)
        .filter((h) => /\/product\//i.test(h))
        .map((h) => new URL(h, location.href).toString());

      const uniq: string[] = [];
      for (const h of hrefs) if (!uniq.includes(h)) uniq.push(h);
      const slice = uniq.slice(0, 20);
      if (slice.length === 0) return null;
      return slice[Math.floor(Math.random() * slice.length)];
    });
  }

  if (!productHref) {
    const html = await page.content();
    writeFileSync('out/citilink_debug_search.html', html, 'utf8');
    throw new Error(
      'Citilink: не нашел ссылку /product/ на странице поиска (сохранил out/citilink_debug_search.html)'
    );
  }

  // Для более полных характеристик стараемся открыть именно вкладку "properties".
  const characteristicsHref = (() => {
    try {
      const u = new URL(productHref);
      const parts = u.pathname.split('/').filter(Boolean); // ["product", slug, tab?]
      if (parts.length >= 3 && parts[0] === 'product') {
        parts[2] = 'properties';
        u.pathname = `/${parts.join('/')}/`;
        return u.toString();
      }
      u.pathname = u.pathname.replace(/\/+$/, '') + '/properties/';
      return u.toString();
    } catch {
      return productHref;
    }
  })();

  const productNav = await page.goto(characteristicsHref, {
    waitUntil: 'domcontentloaded',
    timeout: 60000,
  });
  await page.waitForTimeout(6000);
  await page.mouse.wheel(0, 1500);
  await page.waitForTimeout(4000);
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(8000);

  // Scrape specs from DOM as a robust source
  const domSpecs: SpecItem[] = await page.evaluate(() => {
    const results: { group: string | null; name: string; value: string }[] = [];

    // Select all property groups
    // Based on inspection, groups are often in StyledPropertyGroupWrapper or similar
    const groupNodes = Array.from(
      document.querySelectorAll(
        'li[class*="StyledPropertyGroupWrapper"], div[class*="StyledPropertyGroupWrapper"]'
      )
    );

    for (const groupNode of groupNodes) {
      const groupTitle =
        groupNode.querySelector('h4, div[class*="StyledHeading"]')?.textContent?.trim() || null;
      const rowNodes = groupNode.querySelectorAll(
        'div[class*="PropertiesItem"], div[class*="es7ht5z1"]'
      );

      for (const rowNode of rowNodes) {
        const nameNode = rowNode.querySelector('[class*="PropertiesName"], [class*="es7ht5z3"]');
        const valueNode = rowNode.querySelector('[class*="PropertiesValue"], [class*="es7ht5z6"]');

        const name = nameNode?.textContent?.trim() || '';
        const value = valueNode?.textContent?.trim() || '';

        if (name && value) {
          results.push({ group: groupTitle, name, value });
        }
      }
    }

    // If still empty, try a more generic approach
    if (results.length === 0) {
      const allRows = Array.from(
        document.querySelectorAll('div[class*="PropertiesItem"], div[class*="es7ht5z1"]')
      );
      for (const row of allRows) {
        // Find text content that looks like name:value
        const nameNode = row.querySelector('div:first-child, span:first-child');
        const valueNode = row.querySelector('div:last-child, span:last-child');
        const name = nameNode?.textContent?.trim() || '';
        const value = valueNode?.textContent?.trim() || '';
        if (name && value && name !== value) {
          results.push({ group: null, name, value });
        }
      }
    }

    return results;
  });

  const jsonlds = await page.$$eval('script[type="application/ld+json"]', (nodes) =>
    nodes.map((n) => (n.textContent || '').trim()).filter(Boolean)
  );

  const productJsonLd = findProductJsonLd(jsonlds);
  const html = await page.content();
  writeFileSync('out/citilink_poc.html', html, 'utf8');

  const nextData = extractNextDataJson(html);
  // Citilink держит initialState либо в nextData.props.initialState, либо в nextData.props.pageProps.initialState (зависит от сборки/страницы).
  const initialState =
    nextData?.props?.initialState ?? nextData?.props?.pageProps?.initialState ?? null;
  const productBase = initialState?.productPage?.productHeader?.payload?.productBase ?? null;

  const product: UnifiedOut['product'] = (() => {
    // Prefer SSR state (__NEXT_DATA__) because it includes full "properties" array.
    if (productBase && typeof productBase === 'object') {
      const pb = productBase as any;
      const images: string[] = [];
      const imgs = Array.isArray(pb.images) ? pb.images : [];
      for (const img of imgs) {
        const sources = Array.isArray(img?.sources) ? img.sources : [];
        // prefer XL
        const xl = sources.find((s: any) => s?.size === 'XL')?.url;
        if (typeof xl === 'string') images.push(xl);
        else if (typeof sources[0]?.url === 'string') images.push(sources[0].url);
      }

      const priceRaw = pb.price?.club || pb.price?.current || null;
      const priceNum =
        typeof priceRaw === 'string'
          ? Number.parseInt(priceRaw.replace(/\D/g, ''), 10)
          : Number(priceRaw);

      return {
        name: typeof pb.name === 'string' ? pb.name : null,
        description:
          typeof pb.description === 'string' && pb.description.trim() ? pb.description : null,
        brand: typeof pb.brand?.name === 'string' ? pb.brand.name : null,
        sku:
          typeof pb.searchDescription === 'string'
            ? pb.searchDescription
            : typeof pb.id === 'string'
              ? pb.id
              : null,
        price: { current: Number.isFinite(priceNum) ? priceNum : null, old: null, currency: 'RUB' },
        availability:
          typeof pb.isAvailable === 'boolean'
            ? pb.isAvailable
              ? 'in_stock'
              : 'out_of_stock'
            : null,
        images,
        rating: {
          value: Number.isFinite(Number(pb.rating)) ? Number(pb.rating) : null,
          count: Number.isFinite(Number(pb.counters?.opinions))
            ? Number(pb.counters.opinions)
            : null,
        },
      };
    }

    // Fallback: JSON-LD.
    if (!productJsonLd || typeof productJsonLd !== 'object') {
      return {
        name: null,
        description: null,
        brand: null,
        sku: null,
        price: { current: null, old: null, currency: null },
        availability: null,
        images: [],
        rating: { value: null, count: null },
      };
    }

    const p = productJsonLd as any;
    const name = typeof p.name === 'string' ? p.name : null;
    const description = typeof p.description === 'string' ? p.description : null;
    const brand =
      p.brand && typeof p.brand === 'object' && typeof p.brand.name === 'string'
        ? p.brand.name
        : null;
    const sku = typeof p.sku === 'string' || typeof p.sku === 'number' ? String(p.sku) : null;

    const offers = p.offers;
    const offer = Array.isArray(offers) ? offers[0] : offers;
    const priceRaw = offer && typeof offer === 'object' ? (offer as any).price : null;
    const priceNum =
      typeof priceRaw === 'number'
        ? priceRaw
        : typeof priceRaw === 'string'
          ? Number.parseInt(priceRaw.replace(/\D/g, ''), 10)
          : Number.NaN;

    const currency =
      offer && typeof offer === 'object' && typeof (offer as any).priceCurrency === 'string'
        ? (offer as any).priceCurrency
        : null;
    const availability =
      offer && typeof offer === 'object' && typeof (offer as any).availability === 'string'
        ? (offer as any).availability
        : null;

    const images: string[] = [];
    if (typeof p.image === 'string') images.push(p.image);
    if (Array.isArray(p.image) && p.image.every((x: any) => typeof x === 'string'))
      images.push(...p.image);

    const rating =
      p.aggregateRating && typeof p.aggregateRating === 'object'
        ? {
            value: Number.isFinite(Number((p.aggregateRating as any).ratingValue))
              ? Number((p.aggregateRating as any).ratingValue)
              : null,
            count: Number.isFinite(Number((p.aggregateRating as any).reviewCount))
              ? Number((p.aggregateRating as any).reviewCount)
              : null,
          }
        : { value: null, count: null };

    return {
      name,
      description,
      brand,
      sku,
      price: { current: Number.isFinite(priceNum) ? priceNum : null, old: null, currency },
      availability,
      images,
      rating,
    };
  })();

  const specs: SpecItem[] = (() => {
    const out: SpecItem[] = [];

    const addPairs = (pairs: any[], group: string | null) => {
      for (const p of pairs) {
        const name = typeof p?.name === 'string' ? p.name.trim() : '';
        const value = typeof p?.value === 'string' ? p.value.trim() : '';
        if (!name || !value) continue;
        out.push({ group, name, value });
      }
    };

    const baseProps = Array.isArray(productBase?.properties) ? productBase.properties : [];
    addPairs(baseProps, null);

    const extraPayload = initialState?.productPage?.properties?.payload ?? null;
    if (extraPayload) {
      if (Array.isArray((extraPayload as any).properties)) {
        // Recursively add through walk logic to handle nested groups
        const extraSpecs = extractNameValueSpecsFromUnknownJson(extraPayload);
        out.push(...extraSpecs);
      } else if (Array.isArray((extraPayload as any).items)) {
        addPairs((extraPayload as any).items, null);
      }
    }

    // Add DOM scraped specs - they are often the most complete
    out.push(...domSpecs);

    // Dedup
    const seen = new Set<string>();
    return out.filter((s) => {
      const k = `${s.group ?? ''}||${s.name}||${s.value}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  })();

  // Если удалось вытащить больше характеристик из сетевого JSON, используем его.
  const finalSpecs = capturedApiSpecs.length > specs.length ? capturedApiSpecs : specs;

  const out: UnifiedOut = {
    source: 'citilink.ru',
    fetchedAt: new Date().toISOString(),
    url: characteristicsHref,
    debug: {
      homeStatus: home?.status() ?? null,
      searchStatus: search?.status?.() ?? null,
      productNavStatus: productNav?.status() ?? null,
      jsonldCount: jsonlds.length,
      capturedRpcUrls: Array.from(capturedRpcUrls).slice(0, 20),
    },
    product,
    specs: finalSpecs,
    raw: {
      jsonld: productJsonLd,
      nextData: nextData ? { hasNextData: true } : { hasNextData: false },
      rpcSamples: capturedRpc,
      htmlSnippet: html.slice(0, 50_000),
    },
  };

  writeFileSync('out/citilink_poc.json', JSON.stringify(out, null, 2), 'utf8');

  await page.close();
  await context.close();
  await browser.close();

  console.log(
    `Wrote out/citilink_poc.json (name=${out.product.name ?? 'null'}, specs=${out.specs.length})`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
