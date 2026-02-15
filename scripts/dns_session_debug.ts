import { writeFileSync } from 'node:fs';
import { type BrowserContext, type Page, chromium } from 'playwright';

type DebugResult = {
  url: string;
  status: number | null;
  finalUrl: string;
  cookieNames: string[];
};

async function dumpPage(page: Page, prefix: string) {
  const html = await page.content();
  writeFileSync(`${prefix}.html`, html, 'utf8');
  await page.screenshot({ path: `${prefix}.png`, fullPage: true });
}

async function gotoAndReport(
  context: BrowserContext,
  url: string,
  prefix: string
): Promise<DebugResult> {
  const page = await context.newPage();
  const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(4000);

  await dumpPage(page, prefix);

  const cookies = await context.cookies();
  await page.close();

  return {
    url,
    status: resp?.status() ?? null,
    finalUrl: page.url(),
    cookieNames: cookies.map((c) => c.name).sort(),
  };
}

async function main() {
  const headless = process.env.HEADLESS !== '0';

  const browser = await chromium.launch({
    headless,
    args: ['--disable-blink-features=AutomationControlled'],
  });

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

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    Object.defineProperty(navigator, 'languages', { get: () => ['ru-RU', 'ru', 'en-US'] });
    Object.defineProperty(navigator, 'language', { get: () => 'ru-RU' });
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4] });
    // @ts-ignore
    window.chrome = { runtime: {} };
  });

  const base = await gotoAndReport(
    context,
    'https://www.dns-shop.ru/?cityPath=msk',
    'debug_dns_base'
  );
  const product = await gotoAndReport(
    context,
    'https://www.dns-shop.ru/product/d94bad20176fed20/processor-amd-ryzen-5-5600x-oem/?cityPath=msk',
    'debug_dns_product'
  );

  console.log(JSON.stringify({ headless, base, product }, null, 2));

  await context.close();
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
