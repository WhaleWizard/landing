import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  let fp = path.join(dist, p);
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
  if (!fs.existsSync(fp)) {
    if (!path.extname(p)) fp = path.join(dist, 'index.html');
    else {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404');
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

async function main() {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Deep Visual Inspection Suite listening on ${baseUrl}`);

  const browser = await chromium.launch({ headless: true });
  const routes = [
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

  const viewports = [
    { name: 'desktop-1920', width: 1920, height: 1080, dpr: 1 },
    { name: 'desktop-1440', width: 1440, height: 900, dpr: 2 },
    { name: 'desktop-1024', width: 1024, height: 768, dpr: 1 },
    { name: 'desktop-768', width: 768, height: 1024, dpr: 1 },
    { name: 'mobile-390', width: 390, height: 844, dpr: 3 },
    { name: 'mobile-375', width: 375, height: 667, dpr: 2 },
    { name: 'mobile-360', width: 360, height: 800, dpr: 3 },
    { name: 'mobile-320', width: 320, height: 568, dpr: 2 }
  ];

  const results = {
    overflows: [],
    orphans: [],
    buttonHeightMismatches: [],
    stickyNavbarAnomalies: [],
    cardAlignmentIssues: [],
    focusRingIssues: [],
    hoverReflows: []
  };

  try {
    for (const route of routes) {
      console.log(`Inspecting ${route}...`);
      for (const vp of viewports) {
        const page = await browser.newPage({
          viewport: { width: vp.width, height: vp.height },
          deviceScaleFactor: vp.dpr
        });

        await page.goto(`${baseUrl}${route}`, { waitUntil: 'networkidle' });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(300);

        const pageData = await page.evaluate(({ vpName, rPath, vpWidth }) => {
          const report = {
            overflow: null,
            orphans: [],
            buttonMismatches: [],
            cardAlignments: []
          };

          // 1. Check overflow
          const docEl = document.documentElement;
          if (docEl.scrollWidth > vpWidth) {
            report.overflow = {
              route: rPath,
              viewport: vpName,
              scrollWidth: docEl.scrollWidth,
              clientWidth: vpWidth,
              diff: docEl.scrollWidth - vpWidth
            };
          }

          // 2. Check line wrapping on all headings via TreeWalker
          const headings = document.querySelectorAll('h1, h2, h3');
          headings.forEach((h) => {
            const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
            const words = [];
            let node;
            while ((node = walker.nextNode())) {
              const text = node.textContent;
              const re = /\S+/g;
              let match;
              while ((match = re.exec(text))) {
                const range = document.createRange();
                range.setStart(node, match.index);
                range.setEnd(node, match.index + match[0].length);
                const rect = range.getBoundingClientRect();
                if (rect.width > 0 && rect.height > 0) {
                  words.push({
                    word: match[0],
                    top: Math.round(rect.top),
                    left: Math.round(rect.left),
                    width: rect.width,
                    height: rect.height
                  });
                }
              }
            }

            const lines = [];
            words.forEach((w) => {
              let line = lines.find((l) => Math.abs(l.top - w.top) <= 5);
              if (!line) {
                line = { top: w.top, words: [] };
                lines.push(line);
              }
              line.words.push(w.word);
            });
            lines.sort((a, b) => a.top - b.top);

            if (lines.length > 1) {
              const lastLine = lines[lines.length - 1];
              // If last line has only 1 word and word is <= 4 chars or headline has > 3 lines with single word
              if (lastLine.words.length === 1 && (lastLine.words[0].length <= 4 || lines.length >= 4)) {
                report.orphans.push({
                  route: rPath,
                  viewport: vpName,
                  tag: h.tagName,
                  headingText: h.innerText.slice(0, 60),
                  lineCount: lines.length,
                  lines: lines.map((l) => l.words.join(' ')),
                  orphanedWord: lastLine.words[0]
                });
              }
            }
          });

          // 3. Check button heights in action clusters
          const clusters = document.querySelectorAll('.flex.flex-col.sm\\:flex-row, .flex.gap-4, .flex.gap-3, [class*="gap-"]');
          clusters.forEach((c) => {
            const btns = Array.from(c.children).filter(
              (el) => el.tagName === 'BUTTON' || el.tagName === 'A'
            );
            if (btns.length >= 2) {
              const r0 = btns[0].getBoundingClientRect();
              const r1 = btns[1].getBoundingClientRect();
              if (r0.height > 20 && r1.height > 20) {
                const diff = Math.abs(r0.height - r1.height);
                if (diff >= 1.5) {
                  report.buttonMismatches.push({
                    route: rPath,
                    viewport: vpName,
                    btn1: { text: btns[0].innerText.trim().slice(0, 20), height: r0.height },
                    btn2: { text: btns[1].innerText.trim().slice(0, 20), height: r1.height },
                    diff
                  });
                }
              }
            }
          });

          // 4. Check card height consistency in grid rows
          const grids = document.querySelectorAll('.grid');
          grids.forEach((grid) => {
            const cards = Array.from(grid.children);
            if (cards.length >= 2) {
              const rowGroups = {};
              cards.forEach((card) => {
                const r = card.getBoundingClientRect();
                if (r.height > 50) {
                  const topKey = Math.round(r.top / 10) * 10;
                  if (!rowGroups[topKey]) rowGroups[topKey] = [];
                  rowGroups[topKey].push({
                    height: Math.round(r.height),
                    text: card.innerText.trim().slice(0, 25)
                  });
                }
              });

              Object.values(rowGroups).forEach((row) => {
                if (row.length >= 2) {
                  const heights = row.map((c) => c.height);
                  const minH = Math.min(...heights);
                  const maxH = Math.max(...heights);
                  // If difference between sibling cards in the same visual row is significant (> 10px) without deliberate masonry
                  if (maxH - minH > 15) {
                    report.cardAlignments.push({
                      route: rPath,
                      viewport: vpName,
                      minHeight: minH,
                      maxHeight: maxH,
                      diff: maxH - minH,
                      cards: row
                    });
                  }
                }
              });
            }
          });

          return report;
        }, { vpName: vp.name, rPath: route, vpWidth: vp.width });

        if (pageData.overflow) results.overflows.push(pageData.overflow);
        if (pageData.orphans.length > 0) results.orphans.push(...pageData.orphans);
        if (pageData.buttonMismatches.length > 0) results.buttonHeightMismatches.push(...pageData.buttonMismatches);
        if (pageData.cardAlignments.length > 0) results.cardAlignmentIssues.push(...pageData.cardAlignments);

        // 5. Check sticky navbar on scroll (for 1440 and 390)
        if (vp.name === 'desktop-1440' || vp.name === 'mobile-390') {
          const navTest = await page.evaluate(async () => {
            const nav = document.querySelector('nav');
            if (!nav) return null;
            const topBefore = nav.getBoundingClientRect().top;
            const hBefore = nav.getBoundingClientRect().height;

            window.scrollTo({ top: 150 });
            await new Promise((r) => setTimeout(r, 100));

            const topAfter = nav.getBoundingClientRect().top;
            const hAfter = nav.getBoundingClientRect().height;
            const csAfter = window.getComputedStyle(nav);

            return {
              topBefore,
              hBefore,
              topAfter,
              hAfter,
              position: csAfter.position,
              backdrop: csAfter.backdropFilter
            };
          });

          if (navTest && navTest.position !== 'fixed' && navTest.position !== 'sticky') {
            results.stickyNavbarAnomalies.push({
              route,
              viewport: vp.name,
              issue: `Navbar position is neither sticky nor fixed: ${navTest.position}`
            });
          }
        }

        await page.close();
      }
    }

    fs.writeFileSync(
      path.resolve('audit/visual/measurements/deep_inspection_results.json'),
      JSON.stringify(results, null, 2),
      'utf8'
    );

    console.log('\n--- Deep Visual Inspection Finished ---');
    console.log(`Total Overflows: ${results.overflows.length}`);
    console.log(`Total Heading Orphans: ${results.orphans.length}`);
    console.log(`Total Button Mismatches: ${results.buttonHeightMismatches.length}`);
    console.log(`Total Card Height Mismatches in Rows: ${results.cardAlignmentIssues.length}`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error('Deep inspection failed:', err);
  process.exit(1);
});
