// Layout shifts on a page under mobile emulation: which nodes moved, from where to where, and when.
import { chromium, devices } from 'playwright';
const URL = process.argv[2];
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext(process.env.LHVIEW ? { viewport: { width: 412, height: 823 }, deviceScaleFactor: 1.75, isMobile: true, hasTouch: true, locale: 'ru-RU' } : { ...devices['iPhone 12'], locale: 'ru-RU' });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
// network: unthrottled when NOTHROTTLE=1
  if (!process.env.NOTHROTTLE) await cdp.send("Network.enable");
if (!process.env.NOTHROTTLE) await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
await page.addInitScript(() => {
  window.__ls = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      if (e.hadRecentInput) continue;
      window.__ls.push({ t: Math.round(e.startTime), value: +e.value.toFixed(4), sources: (e.sources || []).map((s) => ({
        node: s.node ? `${s.node.tagName.toLowerCase()}.${String(s.node.className || '').slice(0, 50)}` : '?',
        from: [s.previousRect.y, s.previousRect.height], to: [s.currentRect.y, s.currentRect.height],
      })) });
    }
  }).observe({ type: 'layout-shift', buffered: true });
  window.__fonts = [];
  document.fonts?.addEventListener?.('loadingdone', () => window.__fonts.push(Math.round(performance.now())));
});
await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(6000);
const r = await page.evaluate(() => ({ shifts: window.__ls, fontsDoneAt: window.__fonts, h1Font: getComputedStyle(document.querySelector('#root h1')).fontSize, h1Family: getComputedStyle(document.querySelector('#root h1')).fontFamily.slice(0, 40) }));
console.log(JSON.stringify(r, null, 1));
await browser.close();
