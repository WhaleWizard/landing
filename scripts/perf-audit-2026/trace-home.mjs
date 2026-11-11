import { chromium } from 'playwright';

async function traceHome() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const resources = [];

  page.on('response', (res) => {
    try {
      const timing = res.request().timing();
      resources.push({
        url: res.url(),
        status: res.status(),
        type: res.request().resourceType(),
        duration: timing ? Math.round(timing.responseEnd) : 0,
        headers: res.headers(),
      });
    } catch (e) {}
  });

  const t0 = Date.now();
  await page.goto('https://www.whalewzrd.com/', { waitUntil: 'load' });
  const loadTime = Date.now() - t0;
  await page.waitForTimeout(3000);

  console.log(`Page Load Time: ${loadTime}ms. Total resources: ${resources.length}`);

  // Sort by duration descending
  resources.sort((a, b) => b.duration - a.duration);

  console.log('\nTop 15 slowest resources:');
  for (const r of resources.slice(0, 15)) {
    const filename = r.url.split('/').pop()?.split('?')[0] || r.url;
    console.log(`- [${r.status}] [${r.type}] ${filename.padEnd(35)}: ${r.duration}ms (${r.url})`);
  }

  await browser.close();
}

traceHome();
