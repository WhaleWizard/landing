const { chromium, webkit } = require('playwright');
const fs = require('fs');
const path = require('path');
const { startAuditServer } = require('./mobile-audit-server.cjs');

const VIEWPORTS = [
  { name: '320px (Small Android)', width: 320, height: 568, dpr: 2, engine: 'chromium' },
  { name: '360px (Compact Android)', width: 360, height: 640, dpr: 3, engine: 'chromium' },
  { name: '375px (iPhone SE)', width: 375, height: 667, dpr: 2, engine: 'webkit' },
  { name: '390px (iPhone 13/14)', width: 390, height: 844, dpr: 3, engine: 'webkit' },
  { name: '393px (Pixel 7)', width: 393, height: 851, dpr: 2.75, engine: 'chromium' },
  { name: '412px (Galaxy S21)', width: 412, height: 915, dpr: 2.625, engine: 'chromium' },
  { name: '414px (iPhone Max)', width: 414, height: 896, dpr: 3, engine: 'webkit' },
  { name: '430px (iPhone 15 Pro Max)', width: 430, height: 932, dpr: 3, engine: 'webkit' },
  { name: '480px (Wide Mobile)', width: 480, height: 854, dpr: 2, engine: 'chromium' },
  { name: '639px (Boundary sm-1)', width: 639, height: 900, dpr: 2, engine: 'chromium' },
  { name: '640px (Boundary sm)', width: 640, height: 900, dpr: 2, engine: 'chromium' },
  { name: '641px (Boundary sm+1)', width: 641, height: 900, dpr: 2, engine: 'chromium' },
  { name: '767px (Boundary md-1)', width: 767, height: 900, dpr: 2, engine: 'chromium' },
  { name: '768px (Boundary md)', width: 768, height: 900, dpr: 2, engine: 'chromium' },
  { name: '769px (Boundary md+1)', width: 769, height: 900, dpr: 2, engine: 'chromium' },
];

const ROUTES = [
  '/',
  '/meta-apps/',
  '/meta-ads/',
  '/google-ads/',
  '/consult/',
  '/blog/',
  '/cases/',
  '/faq/',
  '/calculator/',
  '/roi-calculator/',
  '/marketing-glossary/',
  '/privacy-policy/',
  '/offer/',
  '/cookie-policy/',
];

async function runAudit() {
  const server = await startAuditServer(4173);
  const baseUrl = 'http://localhost:4173';

  console.log('[Audit] Launching browsers...');
  const crBrowser = await chromium.launch();
  const wkBrowser = await webkit.launch();

  const results = {
    timestamp: new Date().toISOString(),
    routes: {},
    responsive: [],
    heroForensics: {},
    overflows: []
  };

  // 1. Performance Baseline across primary routes on 393px (Android) & 390px (iOS)
  console.log('\n========================================');
  console.log('1. MEASURING MOBILE PERFORMANCE BASELINE');
  console.log('========================================');

  for (const route of ['/', '/meta-apps/', '/meta-ads/', '/google-ads/', '/consult/', '/blog/', '/cases/']) {
    for (const vp of [
      { width: 393, height: 851, dpr: 2.75, browser: crBrowser, engine: 'chromium', label: 'Pixel 7 (Chromium)' },
      { width: 390, height: 844, dpr: 3, browser: wkBrowser, engine: 'webkit', label: 'iPhone 13 (WebKit)' }
    ]) {
      const context = await vp.browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        deviceScaleFactor: vp.dpr,
        isMobile: true,
        hasTouch: true,
      });

      const page = await context.newPage();

      // Collect network size and requests
      let totalBytes = 0;
      let requestCount = 0;
      page.on('response', async (res) => {
        requestCount++;
        try {
          const buffer = await res.body();
          totalBytes += buffer.length;
        } catch (e) {
          const headers = res.headers();
          const len = headers['content-length'] ? Number(headers['content-length']) : 0;
          totalBytes += len;
        }
      });

      const t0 = Date.now();
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'load' });
      await page.waitForTimeout(2500); // Wait for hydration and settled state

      const perf = await page.evaluate(() => {
        const nav = performance.getEntriesByType('navigation')[0] || {};
        const paint = performance.getEntriesByType('paint') || [];
        const fcp = paint.find(p => p.name === 'first-contentful-paint')?.startTime || 0;
        
        let cls = 0;
        try {
          const lso = performance.getEntriesByType('layout-shift') || [];
          for (const entry of lso) {
            if (!entry.hadRecentInput) cls += entry.value;
          }
        } catch (e) {}

        const h1 = document.querySelector('h1');
        const hero = document.getElementById('hero');

        return {
          ttfb: nav.responseStart || 0,
          domContentLoaded: nav.domContentLoadedEventEnd || 0,
          loadEvent: nav.loadEventEnd || 0,
          fcp: Math.round(fcp),
          cls: Math.round(cls * 1000) / 1000,
          h1Text: h1 ? h1.innerText.replace(/\n+/g, ' ') : null,
          h1Rect: h1 ? { width: h1.offsetWidth, height: h1.offsetHeight } : null,
          heroVisible: !!hero && hero.offsetHeight > 0,
          heroHeight: hero ? hero.offsetHeight : 0,
          documentScrollWidth: document.documentElement.scrollWidth,
          hasOverflow: document.documentElement.scrollWidth > window.innerWidth
        };
      });

      const key = `${route} [${vp.label}]`;
      results.routes[key] = {
        route,
        engine: vp.engine,
        viewport: `${vp.width}x${vp.height}`,
        ...perf,
        totalBytes,
        requestCount
      };

      console.log(`[Baseline] ${key} -> FCP: ${perf.fcp}ms, CLS: ${perf.cls}, Requests: ${requestCount}, Size: ${Math.round(totalBytes/1024)}kB, Overflow: ${perf.hasOverflow}`);

      await context.close();
    }
  }

  // 2. Comprehensive Responsive Sweep on all 15 viewports for / and /meta-apps/
  console.log('\n========================================');
  console.log('2. RESPONSIVE & OVERFLOW SCAN (15 VIEWPORTS)');
  console.log('========================================');

  for (const vp of VIEWPORTS) {
    const b = vp.engine === 'webkit' ? wkBrowser : crBrowser;
    const context = await b.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.dpr,
      isMobile: true,
      hasTouch: true,
    });

    for (const route of ['/', '/meta-apps/', '/meta-ads/', '/blog/']) {
      const page = await context.newPage();
      await page.goto(`${baseUrl}${route}`, { waitUntil: 'load' });
      await page.waitForTimeout(1000);

      const check = await page.evaluate((vpWidth) => {
        const docScrollWidth = document.documentElement.scrollWidth;
        const bodyScrollWidth = document.body.scrollWidth;
        const overflow = docScrollWidth > vpWidth + 1 || bodyScrollWidth > vpWidth + 1;

        // Find overflowing elements
        const culprits = [];
        if (overflow) {
          const all = document.querySelectorAll('*');
          for (const el of all) {
            const rect = el.getBoundingClientRect();
            if (rect.right > vpWidth + 2 && rect.width > 0 && rect.height > 0) {
              const id = el.id ? `#${el.id}` : '';
              const cls = el.className && typeof el.className === 'string' ? `.${el.className.split(' ').slice(0, 2).join('.')}` : '';
              culprits.push(`${el.tagName.toLowerCase()}${id}${cls} (width=${Math.round(rect.width)}px, right=${Math.round(rect.right)}px)`);
              if (culprits.length >= 5) break;
            }
          }
        }

        const h1 = document.querySelector('h1');
        const h1Lines = Array.from(h1 ? h1.querySelectorAll('span.block') : []).map(l => ({
          text: l.innerText,
          scrollWidth: l.scrollWidth,
          clientWidth: l.clientWidth,
          overflow: l.scrollWidth > l.clientWidth + 1
        }));

        return {
          viewportWidth: vpWidth,
          docScrollWidth,
          overflow,
          culprits,
          h1Lines
        };
      }, vp.width);

      if (check.overflow) {
        console.warn(`[OVERFLOW DETECTED] ${route} @ ${vp.width}px (${vp.name}): docScrollWidth=${check.docScrollWidth}px! Culprits:`, check.culprits);
        results.overflows.push({
          route,
          viewport: vp.width,
          name: vp.name,
          engine: vp.engine,
          docScrollWidth: check.docScrollWidth,
          culprits: check.culprits
        });
      }

      // Capture screenshot for 320px, 375px, 390px, 430px
      if ([320, 375, 390, 430].includes(vp.width) && ['/', '/meta-apps/'].includes(route)) {
        const cleanRoute = route.replace(/\//g, '') || 'home';
        const snapPath = path.join(__dirname, `../audit/mobile/screenshots/${cleanRoute}-${vp.width}px-${vp.engine}.png`);
        await page.screenshot({ path: snapPath, fullPage: false });
      }

      await page.close();
    }

    await context.close();
  }

  // 3. Deep Hero Animation Forensics on /meta-apps/
  console.log('\n========================================');
  console.log('3. DEEP HERO ANIMATION FORENSICS (/meta-apps/)');
  console.log('========================================');

  for (const engineName of ['chromium', 'webkit']) {
    const b = engineName === 'webkit' ? wkBrowser : crBrowser;
    const context = await b.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
    });

    const page = await context.newPage();
    await page.goto(`${baseUrl}/meta-apps/`, { waitUntil: 'load' });

    // Sample DOM every 150ms for 3 seconds to trace animation evolution
    const samples = [];
    const startTime = Date.now();
    for (let i = 0; i < 20; i++) {
      const sample = await page.evaluate((elapsed) => {
        const h1 = document.querySelector('h1');
        const lines = Array.from(h1 ? h1.querySelectorAll('.hero-title-effect, span.block') : []).map(el => {
          const comp = window.getComputedStyle(el);
          return {
            text: el.innerText,
            dataEffect: el.getAttribute('data-effect'),
            dataSpeed: el.getAttribute('data-speed'),
            opacity: comp.opacity,
            visibility: comp.visibility,
            transform: comp.transform,
            color: comp.color,
            fontSize: comp.fontSize,
            display: comp.display,
            rect: el.getBoundingClientRect()
          };
        });

        const words = Array.from(h1 ? h1.querySelectorAll('.hero-title-effect__word') : []).map(w => {
          const comp = window.getComputedStyle(w);
          return {
            text: w.innerText,
            opacity: comp.opacity,
            visibility: comp.visibility,
            transform: comp.transform,
            color: comp.color
          };
        });

        const chars = Array.from(h1 ? h1.querySelectorAll('.hero-title-effect__character') : []).map(c => {
          const comp = window.getComputedStyle(c);
          return {
            char: c.innerText,
            opacity: comp.opacity,
            visibility: comp.visibility
          };
        });

        const activeAnimations = el => {
          if (!el || typeof el.getAnimations !== 'function') return [];
          return el.getAnimations({ subtree: true }).map(a => ({
            name: a.animationName,
            playState: a.playState,
            currentTime: a.currentTime
          }));
        };

        return {
          elapsed,
          h1Animations: activeAnimations(h1),
          lines,
          wordCount: words.length,
          words: words.slice(0, 4),
          charCount: chars.length
        };
      }, Date.now() - startTime);

      samples.push(sample);
      await page.waitForTimeout(150);
    }

    results.heroForensics[engineName] = samples;
    await context.close();
  }

  // 4. Mobile Interaction Audit (Menu open/close, CTA click, form focus)
  console.log('\n========================================');
  console.log('4. MOBILE INTERACTION & NAVIGATION AUDIT');
  console.log('========================================');

  const navContext = await crBrowser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
  });
  const navPage = await navContext.newPage();
  await navPage.goto(`${baseUrl}/`, { waitUntil: 'load' });
  await navPage.waitForTimeout(1000);

  // Click hamburger menu
  const menuBtn = navPage.locator('button[aria-label*="меню"], button[aria-label*="Menu"], .ww-public-navbar button').last();
  await menuBtn.click();
  await navPage.waitForTimeout(300);

  const menuOpenState = await navPage.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]');
    const bodyFixed = document.body.style.position === 'fixed';
    const bodyOverflow = document.body.style.overflow === 'hidden';
    const links = Array.from(document.querySelectorAll('[role="dialog"] a, [role="dialog"] button')).map(el => el.innerText.trim());
    return {
      dialogVisible: !!dialog,
      bodyFixed,
      bodyOverflow,
      links
    };
  });
  console.log('[Interaction] Mobile Menu Open:', menuOpenState);

  // Close menu
  const closeBtn = navPage.locator('[role="dialog"] button').first();
  await closeBtn.click();
  await navPage.waitForTimeout(300);

  const menuClosedState = await navPage.evaluate(() => {
    return {
      dialogPresent: !!document.querySelector('[role="dialog"]'),
      bodyFixed: document.body.style.position === 'fixed',
      bodyOverflow: document.body.style.overflow
    };
  });
  console.log('[Interaction] Mobile Menu Closed:', menuClosedState);

  await navContext.close();

  // 5. Hero Title Animation Effects Matrix Test
  console.log('\n========================================');
  console.log('5. TESTING ALL HERO ANIMATION EFFECTS (ACCENT VS NORMAL)');
  console.log('========================================');

  const effects = ['none', 'fade-up', 'fade-in', 'slide-left', 'slide-right', 'blur-reveal', 'typewriter', 'words'];
  results.effectsMatrix = {};

  for (const engineName of ['chromium', 'webkit']) {
    const b = engineName === 'webkit' ? wkBrowser : crBrowser;
    const context = await b.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });

    results.effectsMatrix[engineName] = {};

    for (const effect of effects) {
      const page = await context.newPage();
      
      // Override /api/site-content to return titleLines with this effect
      await page.route('**/api/site-content*', async (route) => {
        const json = {
          success: true,
          version: 1,
          content: {
            hero: {
              titleLines: [
                { text: 'Обычная строка', effect: effect, tone: 'default' },
                { text: 'Акцентная строка градиент', effect: effect, tone: 'accent' },
                { text: 'Поддерживающая строка', effect: effect, tone: 'supporting' }
              ]
            }
          }
        };
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(json) });
      });

      await page.goto(`${baseUrl}/meta-apps/`, { waitUntil: 'load' });
      // Wait for all title animations to finish
      await page.evaluate(async () => {
        const anims = document.getAnimations().filter(a => a.animationName && a.animationName.includes('hero-title'));
        if (anims.length) {
          await Promise.all(anims.map(a => a.finished.catch(() => {})));
        }
      });
      await page.waitForTimeout(300);

      const effectEval = await page.evaluate(() => {
        const h1 = document.querySelector('h1');
        if (!h1) return { error: 'No h1' };
        
        const lines = Array.from(h1.querySelectorAll('.hero-title-effect, span.block')).map(el => {
          const comp = window.getComputedStyle(el);
          const words = Array.from(el.querySelectorAll('.hero-title-effect__word')).map(w => {
            const wc = window.getComputedStyle(w);
            return {
              text: w.innerText,
              opacity: wc.opacity,
              visibility: wc.visibility,
              color: wc.color,
              webkitTextFillColor: wc.webkitTextFillColor,
              bgClip: wc.backgroundClip || wc.webkitBackgroundClip,
              bgImage: wc.backgroundImage ? wc.backgroundImage.slice(0, 30) : 'none'
            };
          });

          const chars = Array.from(el.querySelectorAll('.hero-title-effect__character')).map(c => {
            const cc = window.getComputedStyle(c);
            return {
              char: c.innerText,
              opacity: cc.opacity,
              visibility: cc.visibility,
              color: cc.color,
              webkitTextFillColor: cc.webkitTextFillColor,
              bgClip: cc.backgroundClip || cc.webkitBackgroundClip,
              bgImage: cc.backgroundImage ? cc.backgroundImage.slice(0, 30) : 'none'
            };
          });

          return {
            text: el.innerText,
            dataEffect: el.getAttribute('data-effect'),
            opacity: comp.opacity,
            visibility: comp.visibility,
            color: comp.color,
            webkitTextFillColor: comp.webkitTextFillColor,
            bgClip: comp.backgroundClip || comp.webkitBackgroundClip,
            bgImage: comp.backgroundImage ? comp.backgroundImage.slice(0, 30) : 'none',
            wordCount: words.length,
            wordsSample: words.slice(0, 2),
            charCount: chars.length,
            charsSample: chars.slice(0, 2)
          };
        });

        return { lines };
      });

      results.effectsMatrix[engineName][effect] = effectEval;
      console.log(`[Effect Matrix] ${engineName} - ${effect} -> lines: ${effectEval.lines?.length || 0}`);
      await page.close();
    }

    await context.close();
  }

  // Write all results to files
  const reportPath = path.join(__dirname, '../audit/mobile/reports/mobile-audit-results.json');
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

  console.log('\nAudit complete! Closing browsers and server.');
  await crBrowser.close();
  await wkBrowser.close();
  await new Promise(r => server.close(r));
}

runAudit().catch(err => {
  console.error('[FATAL AUDIT ERROR]', err);
  process.exit(1);
});
