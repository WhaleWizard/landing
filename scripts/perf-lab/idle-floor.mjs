// Idle CPU floor: same measurement as idle-variants (base only) for several pages, to know what headless Chrome costs on its own.
import { chromium, devices } from 'playwright';
const URLS = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--no-sandbox'] });
for (const url of URLS) {
  const ctx = await browser.newContext({ ...devices['iPhone 12'], locale: 'ru-RU' });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(2500);
  await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
  await cdp.send('Profiler.start');
  const t0 = Date.now();
  await page.waitForTimeout(6000);
  const { profile } = await cdp.send('Profiler.stop');
  const win = Date.now() - t0;
  const nodes = new Map(profile.nodes.map(n => [n.id, n]));
  let busy = 0, program = 0, gc = 0;
  for (let i = 0; i < profile.samples.length; i++) { const n = nodes.get(profile.samples[i]); const d = profile.timeDeltas[i] || 0; const f = n.callFrame.functionName; if (f === '(idle)') continue; busy += d; if (f === '(program)') program += d; if (f === '(garbage collector)') gc += d; }
  console.log(url.replace('http://localhost:4174', '').padEnd(16), 'window', win, 'busy', Math.round(busy / 1000), 'program', Math.round(program / 1000), 'js', Math.round((busy - program - gc) / 1000));
  await ctx.close();
}
await browser.close();
