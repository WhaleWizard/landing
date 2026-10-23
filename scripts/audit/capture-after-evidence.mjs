import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
const AFTER_DIR = path.resolve('audit/visual/screenshots/after');
if (!fs.existsSync(AFTER_DIR)) {
  fs.mkdirSync(AFTER_DIR, { recursive: true });
}

function createStaticServer() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    let fp = path.join(dist, p);
    if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
    if (!fs.existsSync(fp)) {
      if (!path.extname(p)) fp = path.join(dist, 'index.html');
      else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }
    }

    const ext = path.extname(fp).toLowerCase();
    const mimes = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.webp': 'image/webp',
      '.svg': 'image/svg+xml',
      '.woff2': 'font/woff2',
      '.ico': 'image/x-icon'
    };

    try {
      const data = fs.readFileSync(fp);
      res.writeHead(200, { 'Content-Type': mimes[ext] || 'application/octet-stream' });
      res.end(data);
    } catch (e) {
      res.writeHead(500);
      res.end(e.message);
    }
  });

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({ server, port });
    });
  });
}

const ROUTES = [
  '/',
  '/meta-ads',
  '/meta-apps',
  '/google-ads',
  '/consult',
  '/calculator',
  '/roi-calculator',
  '/blog',
  '/cases',
  '/faq',
  '/marketing-glossary',
  '/privacy-policy',
  '/offer',
  '/cookie-policy',
  '/thank-you'
];

async function run() {
  console.log('--- Capturing After Visual Evidence ---');
  const { server, port } = await createStaticServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  const browser = await chromium.launch({ headless: true });

  const metrics = {};

  try {
    for (const route of ROUTES) {
      const routeClean = route === '/' ? 'home' : route.replace(/\//g, '_').replace(/^_/, '');
      console.log(`Capturing After for route: ${route}`);

      // Desktop 1920
      {
        const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
        await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(400);

        await page.screenshot({
          path: path.join(AFTER_DIR, `${routeClean}_desktop-1920_full.png`),
          fullPage: true
        });
        await page.close();
      }

      // Mobile 375
      {
        const page = await browser.newPage({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 2 });
        await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(400);

        await page.screenshot({
          path: path.join(AFTER_DIR, `${routeClean}_mobile-375_full.png`),
          fullPage: true
        });

        // Specific component verifications
        if (route === '/') {
          // Services mobile cards verification
          const cardMetrics = await page.evaluate(() => {
            const cards = document.querySelectorAll('.rounded-2xl.bg-card\\/70');
            return Array.from(cards).map((c) => ({
              height: c.getBoundingClientRect().height,
              classList: c.className
            }));
          });
          metrics['services_mobile_cards'] = cardMetrics;
        }

        if (route === '/marketing-glossary') {
          // H1 lines verification
          const h1Info = await page.evaluate(() => {
            const h1 = document.querySelector('h1');
            if (!h1) return null;
            return {
              text: h1.innerText,
              fontSize: window.getComputedStyle(h1).fontSize,
              lineHeight: window.getComputedStyle(h1).lineHeight,
              clientHeight: h1.clientHeight,
              scrollHeight: h1.scrollHeight
            };
          });
          metrics['glossary_h1'] = h1Info;
        }

        if (route === '/google-ads') {
          const headings = await page.evaluate(() => {
            const h2s = document.querySelectorAll('h2');
            return Array.from(h2s).map((h) => ({
              text: h.innerText,
              clientHeight: h.clientHeight
            }));
          });
          metrics['google_ads_headings'] = headings;
        }

        await page.close();
      }

      // Mobile 390
      {
        const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 });
        await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(400);

        await page.screenshot({
          path: path.join(AFTER_DIR, `${routeClean}_mobile-390_full.png`),
          fullPage: true
        });
        await page.close();
      }
    }

    fs.writeFileSync(
      path.resolve('audit/visual/measurements/after_verification_metrics.json'),
      JSON.stringify(metrics, null, 2),
      'utf8'
    );
    console.log('✅ After screenshots and verification metrics saved successfully.');
  } finally {
    await browser.close();
    server.close();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
