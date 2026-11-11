import { chromium } from 'playwright';

async function testSpaNav() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  console.log('Testing client-side SPA navigation...');
  await page.goto('https://www.whalewzrd.com/', { waitUntil: 'load' });
  await page.waitForTimeout(2000);

  const transitions = [
    { from: '/', to: '/google-ads', clickSelector: 'a[href="/google-ads"]' },
    { from: '/google-ads', to: '/meta-ads', clickSelector: 'a[href="/meta-ads"]' },
    { from: '/meta-ads', to: '/meta-apps', clickSelector: 'a[href="/meta-apps"]' },
    { from: '/meta-apps', to: '/cases', clickSelector: 'a[href="/cases/"], a[href="/cases"]' },
    { from: '/cases', to: '/blog', clickSelector: 'a[href="/blog/"], a[href="/blog"]' },
    { from: '/blog', to: '/about', clickSelector: 'a[href="/about"]' },
    { from: '/about', to: '/calculator', clickSelector: 'a[href="/calculator"]' },
  ];

  for (const t of transitions) {
    const t0 = performance.now();
    const link = await page.$(t.clickSelector);
    if (!link) {
      console.log(`Link not found: ${t.clickSelector} on ${t.from}`);
      continue;
    }
    await link.click();
    // Wait for the URL to change
    await page.waitForURL(`**${t.to}*`, { timeout: 10000 });
    // Measure time until heading or main element is visible
    await page.waitForSelector('main h1', { timeout: 10000 });
    const elapsed = Math.round(performance.now() - t0);
    console.log(`Navigated from ${t.from} to ${t.to} in ${elapsed}ms`);
    await page.waitForTimeout(1000);
  }

  await browser.close();
}

testSpaNav().catch(console.error);
