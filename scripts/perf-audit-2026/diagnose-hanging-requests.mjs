import { chromium } from 'playwright';

async function diagnose() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  console.log('Navigating to https://www.whalewzrd.com/blog with waitUntil: load...');
  const ongoing = new Map();

  page.on('request', (req) => {
    ongoing.set(req, { url: req.url(), time: Date.now() });
  });

  page.on('requestfinished', (req) => {
    ongoing.delete(req);
  });

  page.on('requestfailed', (req) => {
    console.log(`FAILED: ${req.url()} (${req.failure()?.errorText})`);
    ongoing.delete(req);
  });

  await page.goto('https://www.whalewzrd.com/blog', { waitUntil: 'load', timeout: 30000 });
  console.log('Page loaded! Waiting 10 seconds to observe any ongoing or repeating requests...');

  await page.waitForTimeout(10000);

  console.log(`\nRemaining active/ongoing requests (${ongoing.size}):`);
  for (const [req, info] of ongoing.entries()) {
    console.log(`- ${info.url} [pending for ${Date.now() - info.time}ms]`);
  }

  await browser.close();
}

diagnose().catch(console.error);
