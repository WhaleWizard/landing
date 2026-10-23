import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/api/articles') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(fs.readFileSync(path.join(dist, 'articles.seed.json')));
    return;
  }
  if (p === '/') p = '/index.html';
  let fp = path.join(dist, p);
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
  if (!fs.existsSync(fp)) {
    if (!path.extname(p)) fp = path.join(dist, 'index.html');
    else { res.writeHead(404); res.end('404'); return; }
  }
  const ext = path.extname(fp).toLowerCase();
  const m = { '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.html': 'text/html' };
  res.writeHead(200, { 'Content-Type': m[ext] || 'application/octet-stream' });
  res.end(fs.readFileSync(fp));
});

server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true });

  await page.goto(`http://127.0.0.1:${port}/`);
  await page.evaluate(() => document.fonts.ready);

  // Scroll sequentially through the page to mount each section cleanly
  for (const scrollY of [800, 1600, 2400, 3200, 4000, 4800]) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), scrollY);
    await page.waitForTimeout(350);
  }

  const results = await page.evaluate(() => {
    const data = {};

    // 1. Services cards
    const sCards = Array.from(document.querySelectorAll('#services h3')).map((h) => {
      const card = h.closest('.group, [class*="rounded"]');
      const r = card ? card.getBoundingClientRect() : h.getBoundingClientRect();
      return {
        title: h.innerText.trim(),
        width: Math.round(r.width),
        height: Math.round(r.height),
        top: Math.round(r.top)
      };
    });
    data.services = sCards;

    // 2. Cases cards
    const cCards = Array.from(document.querySelectorAll('#cases h3')).map((h) => {
      const card = h.closest('.group, [class*="rounded"]');
      const r = card ? card.getBoundingClientRect() : h.getBoundingClientRect();
      return {
        title: h.innerText.trim(),
        width: Math.round(r.width),
        height: Math.round(r.height),
        top: Math.round(r.top)
      };
    });
    data.cases = cCards;

    // 3. Testimonials cards
    const tCards = Array.from(document.querySelectorAll('#about h3, #about p.italic, #about [class*="quote"]')).map((el) => {
      const card = el.closest('[class*="rounded"]');
      if (!card) return null;
      const r = card.getBoundingClientRect();
      return {
        text: (el.innerText || '').slice(0, 30),
        width: Math.round(r.width),
        height: Math.round(r.height),
        top: Math.round(r.top)
      };
    }).filter(Boolean);
    data.testimonials = tCards;

    return data;
  });

  console.log('Cards geometry on Home (1440px):', JSON.stringify(results, null, 2));

  await browser.close();
  server.close();
});
