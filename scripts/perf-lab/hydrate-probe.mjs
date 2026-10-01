// Real Chromium check of a hydrated page: console warnings, markers released, static shell removed, DOM identity of the h1.
import { chromium, devices } from 'playwright';
const URLS = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
for (const url of URLS) {
  const ctx = await browser.newContext({ ...devices['iPhone 12'], locale: 'ru-RU' });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const messages = [];
  page.on('console', (m) => { if (['warning', 'error'].includes(m.type())) messages.push(`${m.type()}: ${m.text().slice(0, 200)}`); });
  page.on('pageerror', (e) => messages.push(`pageerror: ${String(e).slice(0, 200)}`));
  await page.addInitScript(() => {
    document.addEventListener('DOMContentLoaded', () => { window.__h1 = document.querySelector('#root h1'); window.__body = document.querySelector('.blog-article-content'); });
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(4000);
  const r = await page.evaluate(() => ({
    pre: document.documentElement.dataset.wwPrehydrate ?? null,
    shell: !!document.getElementById('ww-static-shell'),
    h1Same: window.__h1 === document.querySelector('#root h1'),
    bodySame: window.__body ? window.__body === document.querySelector('.blog-article-content') : null,
    h1: document.querySelector('#root h1')?.textContent.slice(0, 60),
    footer: !!document.querySelector('footer'),
    fcp: Math.round(performance.getEntriesByType('paint').find(p => p.name === 'first-contentful-paint')?.startTime || 0),
  }));
  const name = url.replace(/^.*4174\//, '').replace(/[^a-z0-9]+/gi, '_').slice(0, 40) || 'home';
  await page.screenshot({ path: `hydrate-${name}.png`, fullPage: false });
  console.log(JSON.stringify({ url: url.replace('http://localhost:4174', ''), ...r, messages: messages.filter(m => !/ipwho|net::ERR|Failed to load resource|favicon/.test(m)) }));
  await ctx.close();
}
await browser.close();
