import { chromium } from 'playwright';

async function check(url) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const requests = [];

  page.on('request', (req) => {
    requests.push({ url: req.url(), method: req.method(), time: Date.now() });
  });

  page.on('response', (res) => {
    const item = requests.find((r) => r.url === res.url());
    if (item) {
      item.status = res.status();
      item.duration = Date.now() - item.time;
    }
  });

  console.log(`Checking ${url}...`);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(6000);

  const pending = requests.filter((r) => !r.status);
  console.log(`Total requests: ${requests.length}. Pending: ${pending.length}`);
  for (const p of pending) {
    console.log(`  PENDING: [${p.method}] ${p.url}`);
  }
  const slow = requests.filter((r) => r.status && r.duration > 2000);
  console.log(`Slow (>2s): ${slow.length}`);
  for (const s of slow) {
    console.log(`  SLOW (${s.duration}ms): [${s.status}] ${s.url}`);
  }

  await browser.close();
}

async function run() {
  await check('https://www.whalewzrd.com/cases');
  await check('https://www.whalewzrd.com/faq');
}

run();
