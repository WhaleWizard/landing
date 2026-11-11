import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.AUDIT_TARGET_URL || 'https://www.whalewzrd.com';
const OUTPUT_DIR = path.resolve('audit/perf-lag-forensics');

const ROUTES = [
  { path: '/', name: 'Home' },
  { path: '/meta-ads', name: 'Meta Ads' },
  { path: '/meta-apps', name: 'Meta Apps' },
  { path: '/google-ads', name: 'Google Ads' },
  { path: '/consult', name: 'Consult' },
  { path: '/about', name: 'About' },
  { path: '/cases', name: 'Cases List' },
  { path: '/cases/prodvizhenie-premialnogo-konserzh-servisa-klienty-i-trafik-dlya-konserzh-servisa-cherez-targetirovannuyu-reklamu', name: 'Case Article' },
  { path: '/blog', name: 'Blog List' },
  { path: '/blog/kak-meta-ads-i-google-ads-sozdayut-effektivnuyu-voronku-prodazh', name: 'Blog Article' },
  { path: '/faq', name: 'FAQ' },
  { path: '/marketing-glossary', name: 'Marketing Glossary' },
  { path: '/calculator', name: 'Calculator' },
  { path: '/roi-calculator', name: 'ROI Calculator' },
  { path: '/privacy-policy', name: 'Privacy Policy' },
  { path: '/offer', name: 'Offer' },
  { path: '/cookie-policy', name: 'Cookie Policy' },
  { path: '/thank-you', name: 'Thank You' },
  { path: '/admin', name: 'Admin Gate' },
];

const VIEWPORTS = [
  { name: 'Desktop (1440x900)', width: 1440, height: 900, isMobile: false },
  { name: 'Mobile (390x844)', width: 390, height: 844, isMobile: true },
];

async function run() {
  console.log(`Starting Deep Performance & Lag Forensics on: ${BASE_URL}`);
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      // Disable QUIC if requested or leave enabled to test default browser behavior
    ],
  });

  const results = [];

  for (const vp of VIEWPORTS) {
    console.log(`\n========================================`);
    console.log(`Testing Viewport: ${vp.name}`);
    console.log(`========================================\n`);

    for (const route of ROUTES) {
      const url = `${BASE_URL}${route.path}`;
      process.stdout.write(`Testing [${vp.name}] ${route.path} (${route.name})... `);

      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.isMobile,
        hasTouch: vp.isMobile,
        userAgent: vp.isMobile
          ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
          : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      });

      const page = await context.newPage();

      const consoleMessages = [];
      const pageErrors = [];
      const failedRequests = [];
      const networkRequests = [];
      let hydrationWarning = false;
      let hydrationErrorDetails = null;

      page.on('console', (msg) => {
        const text = msg.text();
        const type = msg.type();
        consoleMessages.push({ type, text });
        if (text.includes('[app] hydration fell back to client render')) {
          hydrationWarning = true;
          hydrationErrorDetails = text;
        }
      });

      page.on('pageerror', (err) => {
        pageErrors.push(err.message);
      });

      page.on('requestfailed', (req) => {
        failedRequests.push({
          url: req.url(),
          failure: req.failure()?.errorText || 'Unknown failure',
        });
      });

      page.on('response', (res) => {
        try {
          networkRequests.push({
            url: res.url(),
            status: res.status(),
            type: res.request().resourceType(),
            timing: res.request().timing(),
            cache: res.headers()['x-ww-static-cache'] || res.headers()['cf-cache-status'] || 'none',
          });
        } catch (e) {}
      });

      const startTime = Date.now();
      let navigationError = null;

      try {
        const navResponse = await page.goto(url, {
          waitUntil: 'networkidle',
          timeout: 25000,
        });

        const docStatus = navResponse ? navResponse.status() : 0;
        const ttfb = navResponse ? navResponse.request().timing().responseStart : null;
        const totalNavTime = Date.now() - startTime;

        // Collect In-Page Web Vitals & Metrics
        const inPageMetrics = await page.evaluate(async () => {
          return new Promise((resolve) => {
            const metrics = {
              fcp: 0,
              lcp: 0,
              cls: 0,
              longTasks: [],
              totalBlockingTime: 0,
              domNodes: document.querySelectorAll('*').length,
              scrollWidth: document.documentElement.scrollWidth,
              innerWidth: window.innerWidth,
              hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
              jsHeap: performance.memory ? performance.memory.usedJSHeapSize : 0,
            };

            // Observer for Long Tasks
            try {
              const ltObserver = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                  metrics.longTasks.push({
                    startTime: Math.round(entry.startTime),
                    duration: Math.round(entry.duration),
                  });
                  if (entry.duration > 50) {
                    metrics.totalBlockingTime += (entry.duration - 50);
                  }
                }
              });
              ltObserver.observe({ type: 'longtask', buffered: true });
            } catch (e) {}

            // Observer for FCP
            try {
              const paintObserver = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                  if (entry.name === 'first-contentful-paint') {
                    metrics.fcp = Math.round(entry.startTime);
                  }
                }
              });
              paintObserver.observe({ type: 'paint', buffered: true });
            } catch (e) {}

            // Observer for LCP
            try {
              const lcpObserver = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                  metrics.lcp = Math.round(entry.startTime);
                }
              });
              lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });
            } catch (e) {}

            // Observer for CLS
            try {
              const clsObserver = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                  if (!entry.hadRecentInput) {
                    metrics.cls += entry.value;
                  }
                }
              });
              clsObserver.observe({ type: 'layout-shift', buffered: true });
            } catch (e) {}

            // Settle 600ms to collect buffered entries
            setTimeout(() => {
              metrics.totalBlockingTime = Math.round(metrics.totalBlockingTime);
              metrics.cls = Number(metrics.cls.toFixed(4));
              resolve(metrics);
            }, 600);
          });
        });

        // Test Scroll Performance & FPS
        const scrollPerf = await page.evaluate(async () => {
          return new Promise((resolve) => {
            const frameDurations = [];
            let lastTimestamp = performance.now();
            let scrolling = true;

            function frameStep(timestamp) {
              const delta = timestamp - lastTimestamp;
              lastTimestamp = timestamp;
              if (delta > 0 && delta < 500) {
                frameDurations.push(delta);
              }
              if (scrolling) {
                requestAnimationFrame(frameStep);
              }
            }
            requestAnimationFrame(frameStep);

            const scrollHeight = document.documentElement.scrollHeight;
            const viewportHeight = window.innerHeight;
            const distance = Math.max(0, scrollHeight - viewportHeight);
            const step = Math.max(40, distance / 25);
            let currentScroll = 0;

            const scrollInterval = setInterval(() => {
              currentScroll += step;
              window.scrollTo(0, currentScroll);
              if (currentScroll >= distance) {
                clearInterval(scrollInterval);
                // Now scroll back up
                const scrollUpInterval = setInterval(() => {
                  currentScroll -= (step * 2);
                  window.scrollTo(0, Math.max(0, currentScroll));
                  if (currentScroll <= 0) {
                    clearInterval(scrollUpInterval);
                    scrolling = false;
                    setTimeout(() => {
                      if (frameDurations.length === 0) {
                        return resolve({ avgFps: 60, minFps: 60, droppedFrames: 0 });
                      }
                      const avgDuration = frameDurations.reduce((a, b) => a + b, 0) / frameDurations.length;
                      const maxDuration = Math.max(...frameDurations);
                      const avgFps = Math.round(1000 / avgDuration);
                      const minFps = Math.round(1000 / maxDuration);
                      const droppedFrames = frameDurations.filter((d) => d > 33.3).length; // >30fps drop
                      const jankFrames = frameDurations.filter((d) => d > 50).length; // >50ms jank
                      resolve({ avgFps, minFps, droppedFrames, jankFrames, sampleFrames: frameDurations.length });
                    }, 100);
                  }
                }, 16);
              }
            }, 16);
          });
        });

        const slowRequests = networkRequests.filter((r) => r.timing && r.timing.responseEnd > 800);
        const totalTransferBytes = networkRequests.length;

        const record = {
          viewport: vp.name,
          route: route.path,
          name: route.name,
          status: docStatus,
          navTimeMs: totalNavTime,
          ttfbMs: ttfb ? Math.round(ttfb) : null,
          fcpMs: inPageMetrics.fcp,
          lcpMs: inPageMetrics.lcp,
          cls: inPageMetrics.cls,
          tbtMs: inPageMetrics.totalBlockingTime,
          longTasksCount: inPageMetrics.longTasks.length,
          domNodes: inPageMetrics.domNodes,
          hasHorizontalOverflow: inPageMetrics.hasHorizontalOverflow,
          overflowDelta: inPageMetrics.scrollWidth - inPageMetrics.innerWidth,
          avgScrollFps: scrollPerf.avgFps,
          minScrollFps: scrollPerf.minFps,
          droppedFrames: scrollPerf.droppedFrames,
          jankFrames: scrollPerf.jankFrames,
          hydrationWarning,
          hydrationErrorDetails,
          pageErrorsCount: pageErrors.length,
          pageErrors,
          failedRequestsCount: failedRequests.length,
          failedRequests,
          slowRequestsCount: slowRequests.length,
          totalRequests: networkRequests.length,
        };

        results.push(record);

        console.log(`OK (FCP: ${record.fcpMs}ms, LCP: ${record.lcpMs}ms, TBT: ${record.tbtMs}ms, Scroll FPS: ${record.avgScrollFps}, Hydration: ${hydrationWarning ? 'FALLBACK!' : 'CLEAN'})`);
      } catch (err) {
        navigationError = err.message;
        console.log(`FAILED! (${err.message})`);
        results.push({
          viewport: vp.name,
          route: route.path,
          name: route.name,
          error: navigationError,
        });
      } finally {
        await context.close();
      }
    }
  }

  await browser.close();

  // Save full JSON and summary CSV
  const jsonPath = path.join(OUTPUT_DIR, 'live-audit-results.json');
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2), 'utf-8');

  const csvRows = [
    'Viewport,Route,Name,Status,NavTime_ms,TTFB_ms,FCP_ms,LCP_ms,CLS,TBT_ms,LongTasks,AvgScrollFPS,MinScrollFPS,JankFrames,HydrationClean,PageErrors,FailedRequests,Overflow',
  ];

  for (const r of results) {
    if (r.error) {
      csvRows.push(`"${r.viewport}","${r.route}","${r.name}","ERROR: ${r.error}",,,,,,,,,,,,,`);
    } else {
      csvRows.push(
        `"${r.viewport}","${r.route}","${r.name}",${r.status},${r.navTimeMs},${r.ttfbMs},${r.fcpMs},${r.lcpMs},${r.cls},${r.tbtMs},${r.longTasksCount},${r.avgScrollFps},${r.minScrollFps},${r.jankFrames},${!r.hydrationWarning},${r.pageErrorsCount},${r.failedRequestsCount},${r.hasHorizontalOverflow ? `YES (+${r.overflowDelta}px)` : 'NO'}`
      );
    }
  }

  const csvPath = path.join(OUTPUT_DIR, 'live-audit-summary.csv');
  fs.writeFileSync(csvPath, csvRows.join('\n'), 'utf-8');

  console.log(`\nAudit complete! Reports written to:\n- ${jsonPath}\n- ${csvPath}\n`);
}

run().catch((err) => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
