import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const dist = path.resolve('dist');

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

const MOBILE_VIEWPORTS = [
  { name: 'mobile-320', width: 320, height: 568, dpr: 2 },
  { name: 'mobile-360', width: 360, height: 800, dpr: 3 },
  { name: 'mobile-375', width: 375, height: 667, dpr: 2 },
  { name: 'mobile-390', width: 390, height: 844, dpr: 3 },
  { name: 'mobile-412', width: 412, height: 915, dpr: 2.625 }
];

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

async function main() {
  const { server, port } = await createStaticServer();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Mobile Stress Suite listening on ${baseUrl}`);

  const browser = await chromium.launch({ headless: true });
  const findings = [];

  try {
    for (const route of ROUTES) {
      console.log(`Testing mobile routes: ${route}`);
      for (const vp of MOBILE_VIEWPORTS) {
        const page = await browser.newPage({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: vp.dpr,
          isMobile: true,
          hasTouch: true
        });

        await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(300);

        const pageFindings = await page.evaluate(({ vpName, rPath, vpWidth }) => {
          const issues = [];

          // 1. Check doc overflow
          const docEl = document.documentElement;
          if (docEl.scrollWidth > vpWidth) {
            issues.push({
              type: 'HORIZONTAL_OVERFLOW',
              route: rPath,
              viewport: vpName,
              details: `document.scrollWidth (${docEl.scrollWidth}px) > viewport (${vpWidth}px), delta: ${docEl.scrollWidth - vpWidth}px`
            });
          }

          // 2. Check individual element bounding boxes exceeding viewport
          const allEls = document.querySelectorAll('body *');
          for (const el of allEls) {
            const r = el.getBoundingClientRect();
            // Ignore fixed elements, ambient blur layers, or hidden items
            const cs = window.getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
            if (cs.position === 'fixed' || cs.position === 'absolute') continue;
            const clsStr = typeof el.className === 'string' ? el.className : (el.className?.baseVal || '');
            if (clsStr.includes('pointer-events-none') || clsStr.includes('blur-[128px]') || clsStr.includes('blur-2xl') || clsStr.includes('blur-3xl')) continue;

            if (r.right > vpWidth + 2 && r.width > 0 && r.height > 0) {
              issues.push({
                type: 'ELEMENT_OVERFLOW',
                route: rPath,
                viewport: vpName,
                tag: el.tagName,
                className: clsStr.slice(0, 60),
                rect: { right: Math.round(r.right), width: Math.round(r.width) },
                text: el.innerText ? el.innerText.slice(0, 30).replace(/\n/g, ' ') : ''
              });
              break; // report first overflowing element per page to avoid flooding
            }
          }

          // 3. Check interactive tap target sizes (< 36px height or width)
          const interactives = document.querySelectorAll('button, [role="button"], input, select, textarea');
          for (const el of interactives) {
            const r = el.getBoundingClientRect();
            const cs = window.getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') continue;
            if (r.width > 0 && r.height > 0) {
              // Ignore hidden inputs or honeypots
              if (el.tagName === 'INPUT' && (el.type === 'hidden' || cs.position === 'absolute' || r.top < -100)) continue;
              if (r.height < 36 || r.width < 36) {
                const iCls = typeof el.className === 'string' ? el.className : (el.className?.baseVal || '');
                issues.push({
                  type: 'SMALL_TAP_TARGET',
                  route: rPath,
                  viewport: vpName,
                  tag: el.tagName,
                  rect: { width: Math.round(r.width), height: Math.round(r.height) },
                  text: el.innerText ? el.innerText.slice(0, 25).replace(/\n/g, ' ') : (el.getAttribute('aria-label') || el.name || ''),
                  className: iCls.slice(0, 50)
                });
              }
            }
          }

          // 4. Check typography clipping on headings
          const headings = document.querySelectorAll('h1, h2');
          for (const h of headings) {
            const r = h.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) {
              const diffH = h.scrollHeight - h.clientHeight;
              const cs = window.getComputedStyle(h);
              // If scrollHeight exceeds clientHeight significantly and overflow is hidden/clip
              if (diffH > 4 && (cs.overflow === 'hidden' || cs.overflowY === 'hidden')) {
                issues.push({
                  type: 'HEADING_CLIPPED',
                  route: rPath,
                  viewport: vpName,
                  tag: h.tagName,
                  text: h.innerText.slice(0, 40),
                  diffH
                });
              }
            }
          }

          return issues;
        }, { vpName: vp.name, rPath: route, vpWidth: vp.width });

        findings.push(...pageFindings);
        await page.close();
      }
    }

    fs.writeFileSync(
      path.resolve('audit/visual/measurements/mobile_stress_findings.json'),
      JSON.stringify(findings, null, 2),
      'utf8'
    );

    console.log(`\n=== Mobile Stress Suite Concluded ===`);
    console.log(`Total Findings: ${findings.length}`);
    const byType = {};
    findings.forEach((f) => {
      byType[f.type] = (byType[f.type] || 0) + 1;
    });
    console.log(byType);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
