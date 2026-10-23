import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const dist = path.resolve('dist');
const server = http.createServer((req, res) => {
  let p = req.url.split('?')[0];
  if (p === '/') p = '/index.html';
  let fp = path.join(dist, p);
  if (fs.existsSync(fp) && fs.statSync(fp).isDirectory()) fp = path.join(fp, 'index.html');
  if (!fs.existsSync(fp)) fp = path.join(dist, 'index.html');
  res.writeHead(200);
  res.end(fs.readFileSync(fp));
});

server.listen(0, async () => {
  const port = server.address().port;
  const browser = await chromium.launch();
  const routes = ['/', '/meta-ads', '/google-ads', '/consult', '/calculator', '/marketing-glossary'];

  for (const route of routes) {
    for (const width of [1920, 1440, 768, 375, 320]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      await page.goto('http://127.0.0.1:' + port + route);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);

      const findings = await page.evaluate(() => {
        const issues = [];
        // Inspect all button-like elements
        const buttons = Array.from(document.querySelectorAll('button, a[role="button"], a[class*="button"], a[class*="btn"]'));
        
        // 1. Check Hero actions
        const heroActions = document.querySelector('[class*="flex"][class*="gap"] button, [class*="flex"][class*="gap"] a');
        if (heroActions && heroActions.parentElement) {
          const siblings = Array.from(heroActions.parentElement.children).filter(c => 
            c.tagName === 'BUTTON' || c.tagName === 'A'
          );
          if (siblings.length >= 2) {
            const r0 = siblings[0].getBoundingClientRect();
            const r1 = siblings[1].getBoundingClientRect();
            if (r0.height > 0 && r1.height > 0) {
              const diff = Math.abs(r0.height - r1.height);
              if (diff >= 1) {
                issues.push({
                  type: 'HERO_BUTTON_HEIGHT_MISMATCH',
                  btn1: { text: siblings[0].innerText.trim(), height: r0.height, width: r0.width },
                  btn2: { text: siblings[1].innerText.trim(), height: r1.height, width: r1.width },
                  diff
                });
              }
            }
          }
        }

        // 2. Check icon centering inside buttons
        buttons.forEach(b => {
          const svg = b.querySelector('svg');
          if (svg) {
            const br = b.getBoundingClientRect();
            const sr = svg.getBoundingClientRect();
            if (br.height > 0 && sr.height > 0) {
              const bCenterY = br.top + br.height / 2;
              const sCenterY = sr.top + sr.height / 2;
              const deltaY = Math.abs(bCenterY - sCenterY);
              if (deltaY > 2.5) { // More than 2.5px optical asymmetry
                issues.push({
                  type: 'BUTTON_ICON_OPTICAL_MISALIGNMENT',
                  btnText: b.innerText.trim().slice(0, 30),
                  deltaY: Math.round(deltaY * 10) / 10,
                  btnHeight: Math.round(br.height),
                  iconHeight: Math.round(sr.height)
                });
              }
            }
          }
        });

        // 3. Check for border radius mismatches among sibling button groups
        const groups = document.querySelectorAll('[role="group"], [class*="segmented"], [class*="tabs"]');
        groups.forEach(g => {
          const items = Array.from(g.children);
          if (items.length >= 2) {
            const radii = items.map(it => window.getComputedStyle(it).borderRadius);
            const first = radii[0];
            const hasMismatch = radii.some(r => r !== first);
            if (hasMismatch) {
              issues.push({
                type: 'GROUP_BORDER_RADIUS_INCONSISTENCY',
                radii
              });
            }
          }
        });

        return issues;
      });

      if (findings.length > 0) {
        console.log(`Route ${route} @ ${width}px:`, JSON.stringify(findings, null, 2));
      }
      await page.close();
    }
  }

  await browser.close();
  server.close();
});
