import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium, webkit } from 'playwright';

const DIST_DIR = path.resolve('dist');
const SCREENSHOT_DIR = path.resolve('audit/visual/screenshots/before');
const MEASUREMENTS_DIR = path.resolve('audit/visual/measurements');

if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
if (!fs.existsSync(MEASUREMENTS_DIR)) fs.mkdirSync(MEASUREMENTS_DIR, { recursive: true });

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8'
};

function createStaticServer() {
  const server = http.createServer((req, res) => {
    let reqPath = decodeURIComponent(req.url.split('?')[0]);
    if (reqPath === '/') reqPath = '/index.html';

    let filePath = path.join(DIST_DIR, reqPath);
    if (!fs.existsSync(filePath)) {
      // Try directory index
      const dirIndex = path.join(filePath, 'index.html');
      if (fs.existsSync(dirIndex)) {
        filePath = dirIndex;
      } else {
        // Fallback for SPA routing if not asset
        if (!path.extname(reqPath)) {
          filePath = path.join(DIST_DIR, 'index.html');
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
          return;
        }
      }
    } else if (fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    try {
      const data = fs.readFileSync(filePath);
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      });
      res.end(data);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('500 Server Error: ' + err.message);
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
  '/blog/kak-meta-ads-i-google-ads-sozdayut-effektivnuyu-voronku-prodazh',
  '/cases',
  '/cases/prodvizhenie-premialnogo-konserzh-servisa-klienty-i-trafik-dlya-konserzh-servisa-cherez-targetirovannuyu-reklamu',
  '/faq',
  '/marketing-glossary',
  '/privacy-policy',
  '/offer',
  '/cookie-policy',
  '/thank-you'
];

const DESKTOP_VIEWPORTS = [
  { name: 'desktop-1920', width: 1920, height: 1080, dpr: 1 },
  { name: 'desktop-1440', width: 1440, height: 900, dpr: 2 },
  { name: 'desktop-1366', width: 1366, height: 768, dpr: 1 },
  { name: 'desktop-1280', width: 1280, height: 720, dpr: 1 },
  { name: 'desktop-1024', width: 1024, height: 768, dpr: 1 },
  { name: 'desktop-768', width: 768, height: 1024, dpr: 1 }
];

const MOBILE_VIEWPORTS = [
  { name: 'mobile-320', width: 320, height: 568, dpr: 2 },
  { name: 'mobile-360', width: 360, height: 800, dpr: 3 },
  { name: 'mobile-375', width: 375, height: 667, dpr: 2 },
  { name: 'mobile-390', width: 390, height: 844, dpr: 3 },
  { name: 'mobile-393', width: 393, height: 851, dpr: 2.75 },
  { name: 'mobile-412', width: 412, height: 915, dpr: 2.625 },
  { name: 'mobile-414', width: 414, height: 896, dpr: 3 },
  { name: 'mobile-430', width: 430, height: 932, dpr: 3 },
  { name: 'mobile-480', width: 480, height: 854, dpr: 2 }
];

const BOUNDARY_VIEWPORTS = [
  { name: 'boundary-639', width: 639, height: 800, dpr: 1 },
  { name: 'boundary-640', width: 640, height: 800, dpr: 1 },
  { name: 'boundary-767', width: 767, height: 1024, dpr: 1 },
  { name: 'boundary-768', width: 768, height: 1024, dpr: 1 },
  { name: 'boundary-1023', width: 1023, height: 768, dpr: 1 },
  { name: 'boundary-1024', width: 1024, height: 768, dpr: 1 }
];

async function runForensics() {
  console.log('--- Starting Visual Forensics Suite ---');
  const { server, port } = await createStaticServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Static server running at ${baseUrl}`);

  const browser = await chromium.launch({ headless: true });
  const allFindings = [];
  const measurements = {};

  try {
    for (const route of ROUTES) {
      console.log(`\nAuditing route: ${route}`);
      measurements[route] = {};

      // 1. Inspect on standard Desktop (1920x1080)
      {
        const page = await browser.newPage({
          viewport: { width: 1920, height: 1080 },
          deviceScaleFactor: 1
        });

        await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(500); // Allow animations/layout to settle

        const routeClean = route === '/' ? 'home' : route.replace(/\//g, '_').replace(/^_/, '');
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `${routeClean}_desktop-1920_full.png`),
          fullPage: true
        });

        // Run in-page forensic DOM evaluation
        const domAnalysis = await page.evaluate(() => {
          const res = {
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            headings: [],
            buttons: [],
            cards: [],
            navbar: null
          };

          // Navbar evaluation
          const nav = document.querySelector('nav') || document.querySelector('header');
          if (nav) {
            const r = nav.getBoundingClientRect();
            const cs = window.getComputedStyle(nav);
            res.navbar = {
              tag: nav.tagName,
              width: r.width,
              height: r.height,
              top: r.top,
              position: cs.position,
              backdropFilter: cs.backdropFilter,
              borderBottom: cs.borderBottom
            };
          }

          // Headings evaluation
          const headings = document.querySelectorAll('h1, h2, h3');
          headings.forEach((h) => {
            const r = h.getBoundingClientRect();
            const cs = window.getComputedStyle(h);
            const text = h.textContent.trim().replace(/\s+/g, ' ');
            const words = text.split(' ');
            const lastWord = words[words.length - 1] || '';

            // Check lines via Range
            let lineCount = 1;
            try {
              const range = document.createRange();
              range.selectNodeContents(h);
              lineCount = range.getClientRects().length;
            } catch {}

            res.headings.push({
              tag: h.tagName,
              text: text.slice(0, 60),
              width: Math.round(r.width),
              height: Math.round(r.height),
              lineHeight: cs.lineHeight,
              fontSize: cs.fontSize,
              fontWeight: cs.fontWeight,
              wordCount: words.length,
              lastWord,
              lastWordLength: lastWord.length,
              lineCount,
              isClipped: h.scrollHeight > h.clientHeight + 1
            });
          });

          // Buttons evaluation
          const buttons = document.querySelectorAll('button, a[role="button"], a.btn, a[class*="button"]');
          buttons.forEach((b) => {
            const r = b.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return;
            const cs = window.getComputedStyle(b);
            const text = b.textContent.trim().replace(/\s+/g, ' ');

            // Check internal icon
            const svg = b.querySelector('svg');
            let iconInfo = null;
            if (svg) {
              const sr = svg.getBoundingClientRect();
              iconInfo = {
                width: Math.round(sr.width),
                height: Math.round(sr.height),
                top: Math.round(sr.top),
                centerY: Math.round(sr.top + sr.height / 2),
                btnCenterY: Math.round(r.top + r.height / 2)
              };
            }

            res.buttons.push({
              text: text.slice(0, 30),
              width: Math.round(r.width),
              height: Math.round(r.height),
              borderRadius: cs.borderRadius,
              borderWidth: cs.borderWidth,
              paddingTop: cs.paddingTop,
              paddingBottom: cs.paddingBottom,
              paddingLeft: cs.paddingLeft,
              paddingRight: cs.paddingRight,
              fontSize: cs.fontSize,
              icon: iconInfo
            });
          });

          return res;
        });

        measurements[route]['desktop-1920'] = domAnalysis;

        if (domAnalysis.hasOverflow) {
          allFindings.push({
            id: `VIS-OVERFLOW-D-${allFindings.length + 1}`,
            route,
            viewport: '1920x1080',
            severity: 'V1',
            desc: `Horizontal overflow: scrollWidth (${domAnalysis.scrollWidth}px) > clientWidth (${domAnalysis.clientWidth}px)`
          });
        }

        await page.close();
      }

      // 2. Inspect on primary Mobile (375x667 and 390x844)
      for (const mv of [
        { name: 'mobile-375', width: 375, height: 667, dpr: 2 },
        { name: 'mobile-390', width: 390, height: 844, dpr: 3 }
      ]) {
        const page = await browser.newPage({
          viewport: { width: mv.width, height: mv.height },
          deviceScaleFactor: mv.dpr,
          isMobile: true,
          hasTouch: true
        });

        await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(500);

        const routeClean = route === '/' ? 'home' : route.replace(/\//g, '_').replace(/^_/, '');
        await page.screenshot({
          path: path.join(SCREENSHOT_DIR, `${routeClean}_${mv.name}_full.png`),
          fullPage: true
        });

        const mobileAnalysis = await page.evaluate(() => {
          const res = {
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
            hasOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
            headings: [],
            buttons: []
          };

          const headings = document.querySelectorAll('h1, h2, h3');
          headings.forEach((h) => {
            const r = h.getBoundingClientRect();
            const cs = window.getComputedStyle(h);
            const text = h.textContent.trim().replace(/\s+/g, ' ');
            const words = text.split(' ');
            const lastWord = words[words.length - 1] || '';

            let lineCount = 1;
            try {
              const range = document.createRange();
              range.selectNodeContents(h);
              lineCount = range.getClientRects().length;
            } catch {}

            res.headings.push({
              tag: h.tagName,
              text: text.slice(0, 60),
              width: Math.round(r.width),
              height: Math.round(r.height),
              lineHeight: cs.lineHeight,
              fontSize: cs.fontSize,
              wordCount: words.length,
              lastWord,
              lastWordLength: lastWord.length,
              lineCount,
              isClipped: h.scrollHeight > h.clientHeight + 1
            });
          });

          const buttons = document.querySelectorAll('button, a[role="button"], a.btn, a[class*="button"]');
          buttons.forEach((b) => {
            const r = b.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) return;
            const cs = window.getComputedStyle(b);
            const text = b.textContent.trim().replace(/\s+/g, ' ');
            res.buttons.push({
              text: text.slice(0, 30),
              width: Math.round(r.width),
              height: Math.round(r.height),
              borderRadius: cs.borderRadius,
              borderWidth: cs.borderWidth,
              paddingTop: cs.paddingTop,
              paddingBottom: cs.paddingBottom,
              fontSize: cs.fontSize
            });
          });

          return res;
        });

        measurements[route][mv.name] = mobileAnalysis;

        if (mobileAnalysis.hasOverflow) {
          allFindings.push({
            id: `VIS-OVERFLOW-M-${allFindings.length + 1}`,
            route,
            viewport: `${mv.width}x${mv.height}`,
            severity: 'V1',
            desc: `Mobile horizontal overflow: scrollWidth (${mobileAnalysis.scrollWidth}px) > clientWidth (${mobileAnalysis.clientWidth}px)`
          });
        }

        // Check for orphaned single short words on multiline headings
        mobileAnalysis.headings.forEach((h) => {
          if (h.lineCount > 1 && h.lastWordLength <= 3 && h.wordCount > 3) {
            allFindings.push({
              id: `VIS-TYPO-ORPHAN-${allFindings.length + 1}`,
              route,
              viewport: `${mv.width}x${mv.height}`,
              severity: 'V2',
              desc: `Heading ${h.tag} has orphaned short trailing word "${h.lastWord}" (${h.lastWordLength} chars) on last line: "${h.text}"`
            });
          }
          if (h.isClipped) {
            allFindings.push({
              id: `VIS-TYPO-CLIP-${allFindings.length + 1}`,
              route,
              viewport: `${mv.width}x${mv.height}`,
              severity: 'V1',
              desc: `Heading ${h.tag} text is vertically clipped: scrollHeight > clientHeight`
            });
          }
        });

        await page.close();
      }
    }

    // Save measurements
    fs.writeFileSync(
      path.join(MEASUREMENTS_DIR, 'baseline_measurements.json'),
      JSON.stringify(measurements, null, 2),
      'utf8'
    );

    console.log(`\n--- Completed Forensics Run ---`);
    console.log(`Total Findings Identified: ${allFindings.length}`);
    for (const f of allFindings) {
      console.log(`[${f.severity}] ${f.id} (${f.route} @ ${f.viewport}): ${f.desc}`);
    }

    fs.writeFileSync(
      path.join(MEASUREMENTS_DIR, 'initial_findings.json'),
      JSON.stringify(allFindings, null, 2),
      'utf8'
    );
  } finally {
    await browser.close();
    server.close();
  }
}

runForensics().catch((err) => {
  console.error('Forensics suite failed:', err);
  process.exit(1);
});
