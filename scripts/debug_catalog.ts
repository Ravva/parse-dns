/**
 * Debug script: saves catalog page HTML to out/ for selector analysis.
 * Usage: tsx scripts/debug_catalog.ts citilink
 *        tsx scripts/debug_catalog.ts dns
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import * as cheerio from 'cheerio';
import { chromium } from 'playwright';

const urls: Record<string, string> = {
  citilink: 'https://www.citilink.ru/catalog/processory/',
  dns: 'https://www.dns-shop.ru/catalog/17a899cd16404e77/processory/',
};

async function main() {
  const source = process.argv[2] || 'citilink';
  const url = urls[source];
  if (!url) {
    console.error(`Unknown source: ${source}. Use 'citilink' or 'dns'.`);
    return;
  }

  console.log(`Fetching ${source}: ${url}`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    locale: 'ru-RU',
    extraHTTPHeaders: { 'Accept-Language': 'ru-RU,ru;q=0.9' },
  });

  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(5000);

  const html = await page.content();
  const $ = cheerio.load(html);

  mkdirSync('out', { recursive: true });
  writeFileSync(`out/debug_${source}.html`, html, 'utf-8');
  console.log(`Saved HTML to out/debug_${source}.html (${html.length} bytes)`);
  console.log(`Title: ${$('title').text().trim()}`);

  // Check for __NEXT_DATA__
  const nextDataText = $('#__NEXT_DATA__').first().text();
  if (nextDataText) {
    writeFileSync(`out/debug_${source}_nextdata.json`, nextDataText, 'utf-8');
    console.log(`__NEXT_DATA__ found, saved to out/debug_${source}_nextdata.json`);

    try {
      const nextData = JSON.parse(nextDataText);
      console.log('Top keys:', Object.keys(nextData));
      console.log('Props keys:', Object.keys(nextData.props || {}));
      const pageProps = nextData.props?.pageProps;
      if (pageProps) {
        console.log('pageProps keys:', Object.keys(pageProps));
      }
    } catch (e) {
      console.error('Failed to parse __NEXT_DATA__:', e);
    }
  } else {
    console.log('No __NEXT_DATA__ found');
  }

  // Dump some selectors
  console.log('\n--- Selector Analysis ---');
  const selectors = [
    '[data-meta-product-id]',
    '[data-product-id]',
    '.ProductCardVertical',
    '.product-card-list__item',
    '.catalog-product',
    '[data-id].catalog-product',
    '.ProductCardCategoryList',
    'a[href*="/product/"]',
  ];
  for (const sel of selectors) {
    const count = $(sel).length;
    if (count > 0) {
      console.log(`  ${sel}: ${count} elements`);
      // Show first element's tag and classes
      const first = $(sel).first();
      console.log(`    tag=${first.prop('tagName')}, class="${first.attr('class')?.slice(0, 80)}"`);
    }
  }

  await browser.close();
}

main().catch(console.error);
