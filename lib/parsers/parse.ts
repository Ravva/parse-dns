import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import * as cheerio from 'cheerio';
import { type BrowserContext, chromium } from 'playwright';
import { UNIVERSAL_SPECS_CONFIG } from '../../lib/universal-specs';
import { CATEGORY_URLS } from './category-urls';

// ── Env ──────────────────────────────────────────────────────────────────
const envPath = resolve(process.cwd(), '.env.local');
try {
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
} catch {
  console.error(
    '⚠ .env.local not found. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.'
  );
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const supabase = createClient(supabaseUrl, supabaseKey);

const PRODUCTS_PER_CATEGORY = 36;

type ParsedProduct = {
  id: string;
  source: 'dns-shop' | 'citilink';
  source_url: string;
  category_id: string;
  name: string;
  brand: string | null;
  price_current: number | null;
  price_old: number | null;
  in_stock: boolean;
  image_url: string | null;
  specs: Record<string, unknown>;
  key_specs: Record<string, string>;
  rating: number | null;
  parsed_at: string;
};

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Normalizes brand name to proper Title Case.
 * "INTEL" → "Intel", "AMD" → "AMD", "GIGABYTE" → "Gigabyte", etc.
 */
function normalizeBrand(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Known brands that should stay uppercase
  const uppercaseBrands = new Set(['AMD', 'MSI', 'ASUS', 'ID']);
  if (uppercaseBrands.has(trimmed.toUpperCase()) && trimmed === trimmed.toUpperCase()) {
    return trimmed;
  }

  // Title case: "INTEL" → "Intel", "GIGABYTE" → "Gigabyte"
  if (trimmed === trimmed.toUpperCase() && trimmed.length > 3) {
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  }

  return trimmed;
}

function extractUniversalSpecs(
  categoryId: string,
  source: 'dns' | 'citilink',
  data: string | Record<string, unknown>
): Record<string, string> {
  const config = UNIVERSAL_SPECS_CONFIG[categoryId];
  if (!config) return {};

  const specs: Record<string, string> = {};

  if (source === 'dns' && typeof data === 'string') {
    // DNS: data is the name string containing [Specs...]
    const match = data.match(/\[(.*?)\]/);
    if (match?.[1]) {
      const text = match[1];
      for (const [key, regex] of Object.entries(config.dnsRegex)) {
        const valMatch = text.match(regex);
        if (valMatch?.[1]) {
          specs[key] = valMatch[1];
        }
      }
    }
  } else if (source === 'citilink' && typeof data === 'object' && data !== null) {
    // Citilink: data is a map of properties
    for (const [propName, propValue] of Object.entries(data)) {
      if (!propValue) continue;
      const val = String(propValue);
      const key = config.citilinkMap[propName];
      if (key) {
        specs[key] = val;
      }
    }
  }

  return specs;
}

/**
 * Waits for qrator anti-bot cookies to appear in the browser context.
 */
async function waitForQratorCookies(context: BrowserContext, timeoutMs = 45000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const cookies = await context.cookies();
    const names = new Set(cookies.map((c) => c.name));
    if (names.has('qrator_jsid2') || names.has('qrator_jsid')) return true;
    if (Date.now() > deadline) return false;
    await new Promise((r) => setTimeout(r, 500));
  }
}

/**
 * Creates a stealth browser context with anti-detection measures.
 */
async function createStealthContext(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    extraHTTPHeaders: {
      'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      'sec-ch-ua': '"Not/A";v="8", "Chromium";v="123", "Google Chrome";v="123"',
      'sec-ch-ua-platform': '"Windows"',
      'sec-ch-ua-mobile': '?0',
    },
  });

  // Mask automation signals
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'languages', {
      get: () => ['ru-RU', 'ru', 'en-US'],
    });
    Object.defineProperty(navigator, 'language', { get: () => 'ru-RU' });
    Object.defineProperty(navigator, 'plugins', {
      get: () => [1, 2, 3, 4, 5],
    });
    // @ts-ignore
    window.chrome = { runtime: {} };
  });

  return context;
}

// ── DNS-Shop Parser ──────────────────────────────────────────────────────

async function parseDnsCatalog(
  categoryId: string,
  catalogUrl: string,
  limit: number
): Promise<ParsedProduct[]> {
  console.log(`  [DNS] Parsing ${categoryId}: ${catalogUrl}`);
  const products: ParsedProduct[] = [];

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
    ],
  });

  try {
    const context = await createStealthContext(browser);
    const page = await context.newPage();

    // Step 1: Navigate to main page to get qrator session
    console.log('  [DNS] Warming up session on main page...');
    await page.goto('https://www.dns-shop.ru/?cityPath=msk', {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(4000);

    // Step 2: Wait for qrator cookies
    const gotCookies = await waitForQratorCookies(context);
    if (!gotCookies) {
      console.warn('  [DNS] ⚠ qrator cookies not received in 45s, skipping DNS.');
      await browser.close();
      return products;
    }
    console.log('  [DNS] ✓ qrator session established');

    // Step 3: Navigate to catalog page and WAIT for hydration
    const cityUrl = catalogUrl.includes('?')
      ? `${catalogUrl}&cityPath=msk`
      : `${catalogUrl}?cityPath=msk`;

    console.log('  [DNS] Navigating to catalog...');
    await page.goto(cityUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });

    // Wait for product cards and prices to be rendered
    try {
      await page.waitForSelector('.catalog-product', { timeout: 15000 });
      // Wait a bit more for dynamic price widgets to load
      await page.waitForTimeout(4000);

      // Scroll down to trigger lazy loading if needed
      await page.evaluate(() => {
        window.scrollBy(0, 1000);
      });
      await page.waitForTimeout(1000);
    } catch (e) {
      console.warn('  [DNS] ⚠ Timeout waiting for product selector');
    }

    // Step 4: Get fully rendered HTML
    const html = await page.content();
    const $ = cheerio.load(html);

    const title = $('title').text().trim();
    console.log(`  [DNS] Page: "${title}" (${html.length} bytes)`);

    if (title === 'HTTP 403' || html.length < 5000) {
      console.warn('  [DNS] ⚠ Page blocked (403 or empty). Skipping.');
      await browser.close();
      return products;
    }

    // Try multiple selector strategies for product cards
    let cards = $('[data-id].catalog-product');
    if (cards.length === 0) cards = $('.catalog-product');
    if (cards.length === 0) cards = $('[data-product-id]');
    if (cards.length === 0) cards = $('.products-list__item');

    console.log(`  [DNS] Found ${cards.length} card elements`);

    let count = 0;
    cards.each((_, el) => {
      if (count >= limit) return;

      const $el = $(el);
      // Use data-product (GUID) as the primary ID source
      const guid = $el.attr('data-product');
      const dataId = guid || $el.attr('data-id') || $el.attr('data-product-id') || `auto-${count}`;

      // Name
      const nameFull =
        $el.find('.catalog-product__name span').text().trim() ||
        $el.find('.catalog-product__name').text().trim() ||
        $el.find('a').first().text().trim();
      if (!nameFull) return;

      // Clean name (remove [specs]) for display
      const name = nameFull.replace(/\[.*?\]/, '').trim();

      // Extract Universal Specs from full name
      const key_specs = extractUniversalSpecs(categoryId, 'dns', nameFull);

      // Brand from name
      const connectors = [
        'Процессор',
        'Видеокарта',
        'Материнская',
        'плата',
        'Оперативная',
        'память',
        'SSD',
        'накопитель',
        'Жесткий',
        'диск',
        'Блок',
        'питания',
        'Корпус',
        'Кулер',
        'для',
        'ТБ',
        'ГБ',
        'МБ',
        'TB',
        'GB',
        'MB', // Capacity units
        'SATA',
        'PCI-E',
        'M.2',
        '2.5"',
        '3.5"', // Form factors/interfaces
      ];
      const nameParts = name.split(' ').filter((p) => {
        if (connectors.includes(p)) return false;
        if (p.length <= 1) return false;
        // Ignore digits (e.g. "1" or "500") or "1000"
        if (/^\d+$/.test(p)) return false;
        // Ignore 1ТБ, 500ГБ combined
        if (/^\d+([ТГM]Б|TB|GB|MB)$/i.test(p)) return false;
        return true;
      });
      const brand = nameParts.length > 0 ? normalizeBrand(nameParts[0]) : null;

      // URL
      const linkEl = $el.find('a.catalog-product__name, a[href*="/product/"]').first();
      const href = linkEl.attr('href') ?? '';
      const sourceUrl = href.startsWith('http') ? href : `https://www.dns-shop.ru${href}`;

      // Price - parsed directly from DOM (now that we use page.content())
      const priceText =
        $el.find('.product-buy__price').text().trim() ||
        $el.find('[data-role="price"]').text().trim() ||
        $el.find('.product-price__current').text().trim();

      const priceCurrent = priceText
        ? Number.parseInt(priceText.replace(/\s/g, '').replace(/\D/g, ''), 10) || null
        : null;

      const oldPriceText = $el.find('.product-buy__prev').text().trim();
      const priceOld = oldPriceText
        ? Number.parseInt(oldPriceText.replace(/\s/g, '').replace(/\D/g, ''), 10) || null
        : null;

      // Stock
      const buyBtn = $el.find('.buy-btn, .product-buy__btn');
      const inStock = buyBtn.length > 0;

      // Image
      const imgEl = $el.find('img');
      const imageUrl = imgEl.attr('src') || imgEl.attr('data-src') || null;

      // Rating
      const ratingText = $el.find('.catalog-product__rating').text().trim();
      const rating = ratingText ? Number.parseFloat(ratingText) || null : null;

      products.push({
        id: `dns-${dataId}`,
        source: 'dns-shop',
        source_url: sourceUrl,
        category_id: categoryId,
        name,
        brand,
        price_current: priceCurrent,
        price_old: priceOld,
        in_stock: inStock,
        image_url: imageUrl,
        specs: {},
        key_specs,
        rating,
        parsed_at: new Date().toISOString(),
      });
      count++;
    });

    if (products.length === 0) {
      console.log('  [DNS] No products found. Taking screenshot...');
      await page.screenshot({ path: `debug-dns-${categoryId}.png`, fullPage: true });
    }

    console.log(`  [DNS] Found ${products.length} products in ${categoryId}`);
    await context.close();
  } catch (err) {
    console.error(`  [DNS] Error parsing ${categoryId}:`, err);
  } finally {
    await browser.close();
  }

  return products;
}

// ── Citilink Parser (via __NEXT_DATA__ JSON) ─────────────────────────────

interface CitilinkProduct {
  id: string;
  name: string;
  shortName: string;
  slug: string;
  isAvailable: boolean;
  imagesList: Array<{ url: Record<string, string> }>;
  price: {
    price: number;
    old: number;
    club: number;
    discount: number;
  };
  brand: { name: string };
  rating: number;
  propertiesList: Array<{ name: string; value: string }>;
}

function extractNextDataProducts(html: string): CitilinkProduct[] {
  const $ = cheerio.load(html);
  const text = $('#__NEXT_DATA__').first().text();
  if (!text) {
    console.warn('  [Citilink] __NEXT_DATA__ not found in HTML');
    return [];
  }

  try {
    const data = JSON.parse(text);
    const products =
      data?.props?.initialState?.subcategory?.productsFilter?.payload?.productsFilter?.products;
    if (Array.isArray(products)) {
      return products;
    }
    console.warn('  [Citilink] Products array not found in __NEXT_DATA__');
    return [];
  } catch (e) {
    console.error('  [Citilink] Failed to parse __NEXT_DATA__:', e);
    return [];
  }
}

async function parseCitilinkCatalog(
  categoryId: string,
  catalogUrl: string,
  limit: number
): Promise<ParsedProduct[]> {
  console.log(`  [Citilink] Parsing ${categoryId}: ${catalogUrl}`);
  const products: ParsedProduct[] = [];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'ru-RU',
    extraHTTPHeaders: {
      'Accept-Language': 'ru-RU,ru;q=0.9',
    },
  });

  try {
    const page = await context.newPage();
    await page.goto(catalogUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 60000,
    });
    await page.waitForTimeout(3000);

    const html = await page.content();
    const citilinkProducts = extractNextDataProducts(html);
    console.log(`  [Citilink] Found ${citilinkProducts.length} products in __NEXT_DATA__`);

    if (citilinkProducts.length === 0) {
      console.log('  [Citilink] No products found in __NEXT_DATA__. Taking screenshot...');
      await page.screenshot({ path: `debug-citilink-${categoryId}.png`, fullPage: true });
      // Dump html to file for inspection
      const fs = await import('node:fs');
      fs.writeFileSync(`debug-citilink-${categoryId}.html`, html);
    }

    let count = 0;
    for (const p of citilinkProducts) {
      if (count >= limit) break;

      const name = p.name || p.shortName;
      if (!name) continue;

      const sourceUrl = `https://www.citilink.ru/product/${p.slug}-${p.id}/`;

      let imageUrl: string | null = null;
      if (p.imagesList?.length > 0) {
        const firstImg = p.imagesList[0]?.url;
        imageUrl = firstImg?.VERTICAL || firstImg?.HORIZONTAL || firstImg?.SHORT || null;
      }

      const keySpecsRaw: Record<string, string> = {};
      if (Array.isArray(p.propertiesList)) {
        for (const prop of p.propertiesList) {
          if (prop.name && prop.value) {
            keySpecsRaw[prop.name] = prop.value;
          }
        }
      }

      // Map to Universal Specs
      const key_specs = extractUniversalSpecs(categoryId, 'citilink', keySpecsRaw);

      products.push({
        id: `citilink-${p.id}`,
        source: 'citilink',
        source_url: sourceUrl,
        category_id: categoryId,
        name,
        brand: normalizeBrand(p.brand?.name),
        price_current: p.price?.price || null,
        price_old: p.price?.old > 0 ? p.price.old : null,
        in_stock: p.isAvailable ?? false,
        image_url: imageUrl,
        specs: {},
        key_specs,
        rating: p.rating || null,
        parsed_at: new Date().toISOString(),
      });
      count++;
    }

    console.log(`  [Citilink] Extracted ${products.length} products for ${categoryId}`);
  } catch (err) {
    console.error(`  [Citilink] Error parsing ${categoryId}:`, err);
  } finally {
    await browser.close();
  }

  return products;
}

// ── Orchestrator ─────────────────────────────────────────────────────────

async function saveProducts(products: ParsedProduct[]) {
  if (products.length === 0) return 0;

  // Deduplicate by ID (keep last occurrence — some pages have duplicate data-id)
  const deduped = [...new Map(products.map((p) => [p.id, p])).values()];

  const { error, count } = await supabase
    .from('products')
    .upsert(deduped, { onConflict: 'id', ignoreDuplicates: false })
    .select();

  if (error) {
    console.error('  Error saving to Supabase:', error.message);
    return 0;
  }
  return count ?? products.length;
}

async function main() {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║    Parse DNS — Product Parser            ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log();

  const { data: parseRun } = await supabase
    .from('parse_runs')
    .insert({ source: 'all', status: 'running' })
    .select()
    .single();

  let totalProducts = 0;
  const categories = Object.keys(CATEGORY_URLS);

  const targetCategory = process.argv[2];
  const targetSource = process.argv[3]; // 'dns' | 'citilink' | undefined

  let categoriesToParse = categories;
  if (targetCategory && targetCategory !== 'all') {
    categoriesToParse = targetCategory.split(',').map((c) => c.trim());
  }

  for (const categoryId of categoriesToParse) {
    const urls = CATEGORY_URLS[categoryId];
    if (!urls) {
      console.warn(`  Unknown category: ${categoryId}`);
      continue;
    }

    console.log(`\n▸ Category: ${categoryId}`);
    console.log(`  Urls:`, urls);
    console.log(`  TargetSource:`, targetSource);

    // DNS-Shop
    if ((!targetSource || targetSource === 'dns') && urls.dns) {
      try {
        const dnsProducts = await parseDnsCatalog(categoryId, urls.dns, PRODUCTS_PER_CATEGORY);
        const saved = await saveProducts(dnsProducts);
        totalProducts += saved;
        console.log(`  [DNS] Saved ${saved} products`);
      } catch (err) {
        console.error(`  [DNS] Failed for ${categoryId}:`, err);
      }
    }

    // Citilink
    if (!targetSource || targetSource === 'citilink') {
      try {
        const citilinkProducts = await parseCitilinkCatalog(
          categoryId,
          urls.citilink,
          PRODUCTS_PER_CATEGORY
        );
        const saved = await saveProducts(citilinkProducts);
        totalProducts += saved;
        console.log(`  [Citilink] Saved ${saved} products`);
      } catch (err) {
        console.error(`  [Citilink] Failed for ${categoryId}:`, err);
      }
    }
  }

  if (parseRun) {
    await supabase
      .from('parse_runs')
      .update({
        status: 'completed',
        products_count: totalProducts,
        completed_at: new Date().toISOString(),
      })
      .eq('id', parseRun.id);
  }

  console.log(`\n✓ Done! Total products saved: ${totalProducts}`);
}

main().catch(console.error);
