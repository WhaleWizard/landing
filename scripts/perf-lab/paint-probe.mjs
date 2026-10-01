// Poll what the browser shows during the first seconds of a page: paint entries, hydration marker, hero opacity.
import { chromium, devices } from 'playwright';
const URL = process.argv[2] || 'http://localhost:4174/consult/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ ...devices['iPhone 12'], locale: 'ru-RU' });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
await cdp.send('Network.enable');
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
const t0 = Date.now();
page.goto(URL, { waitUntil: 'commit' }).catch(() => {});
const rows = [];
for (let i = 0; i < 40; i++) {
  await page.waitForTimeout(150);
  const r = await page.evaluate(() => {
    const paints = performance.getEntriesByType('paint').map(p => `${p.name.replace('first-','')}@${Math.round(p.startTime)}`).join(' ');
    const html = document.documentElement;
    const sec = document.querySelector('#hero');
    const photo = document.querySelector('.consult-studio-hero__photo-wrap');
    const copy = document.querySelector('.consult-studio-hero__content');
    const cs = (el) => el ? getComputedStyle(el) : null;
    const sheets = [...document.styleSheets].map(s => (s.href || 'inline').replace(/^.*\/assets\//, '')).join(',');
    return {
      t: Math.round(performance.now()), ready: document.readyState, paints, pre: html.dataset.wwPrehydrate || '-', fs: html.dataset.wwFirstScreen || '-',
      root: document.getElementById('root')?.children.length, shell: !!document.getElementById('ww-static-shell'),
      bodyBg: cs(document.body)?.backgroundColor, htmlBg: cs(html)?.backgroundColor, secBg: cs(sec)?.backgroundColor,
      photoOp: cs(photo)?.opacity, photoAnim: cs(photo)?.animationName + '/' + cs(photo)?.animationPlayState, copyOp: cs(copy)?.opacity,
      sheets: sheets.slice(0, 160),
    };
  }).catch(e => ({ err: String(e).slice(0, 80) }));
  rows.push(r);
  if (i === 9 || i === 16 || i === 24) await page.screenshot({ path: `paint-probe-${i}.png` }).catch(() => {});
  if (r.copyOp === '1' && r.pre === '-' && i > 12) break;
}
for (const r of rows) console.log(JSON.stringify(r));
await browser.close();
