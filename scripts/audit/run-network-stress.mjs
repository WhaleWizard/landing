import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { chromium } from 'playwright';

function startStaticServer(distDir, port = 4180) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let reqPath = req.url.split('?')[0];

      if (reqPath.startsWith('/api/')) {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      let filePath = path.join(distDir, reqPath);
      if (reqPath === '/' || reqPath.endsWith('/')) filePath = path.join(filePath, 'index.html');
      if (!fs.existsSync(filePath)) filePath = path.join(distDir, 'index.html');

      const ext = path.extname(filePath);
      const mimeTypes = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'text/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.woff2': 'font/woff2',
        '.webp': 'image/webp',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
      };

      const contentType = mimeTypes[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

      const content = fs.readFileSync(filePath);
      const acceptEncoding = req.headers['accept-encoding'] || '';

      // Compress text-based assets with gzip like Cloudflare edge
      if (
        acceptEncoding.includes('gzip') &&
        (ext === '.html' || ext === '.js' || ext === '.css' || ext === '.json' || ext === '.svg')
      ) {
        res.setHeader('Content-Encoding', 'gzip');
        const gzipped = zlib.gzipSync(content);
        res.setHeader('Content-Length', gzipped.length);
        res.end(gzipped);
      } else {
        res.setHeader('Content-Length', content.length);
        res.end(content);
      }
    });

    server.listen(port, () => resolve(server));
  });
}

const STRESS_SCENARIOS = [
  {
    id: 'SCENARIO-1',
    name: 'Low-End Android + Slow 4G',
    device: 'Class A (Moto G4)',
    viewport: { width: 360, height: 640 },
    dpr: 2,
    cpuThrottle: 4,
    network: {
      latency: 150,
      downloadBps: 200000, // 1.6 Mbps
      uploadBps: 93750,
      connectionType: 'cellular3g',
    },
    cache: 'cold',
  },
  {
    id: 'SCENARIO-2',
    name: 'Low-End Android + Very Slow Mobile (3G)',
    device: 'Class A (Moto G4)',
    viewport: { width: 360, height: 640 },
    dpr: 2,
    cpuThrottle: 6,
    network: {
      latency: 300,
      downloadBps: 50000, // 400 Kbps
      uploadBps: 25000,
      connectionType: 'cellular3g',
    },
    cache: 'cold',
  },
  {
    id: 'SCENARIO-3',
    name: 'Low-End Android + Severe Congestion',
    device: 'Class A (Moto G4)',
    viewport: { width: 360, height: 640 },
    dpr: 2,
    cpuThrottle: 4,
    network: {
      latency: 500,
      downloadBps: 25000, // 200 Kbps
      uploadBps: 12500,
      connectionType: 'cellular2g',
    },
    cache: 'cold',
  },
  {
    id: 'SCENARIO-4',
    name: 'Extreme Edge Case (Near Offline)',
    device: 'Class A (Moto G4)',
    viewport: { width: 360, height: 640 },
    dpr: 2,
    cpuThrottle: 6,
    network: {
      latency: 800,
      downloadBps: 12500, // 100 Kbps
      uploadBps: 6250,
      connectionType: 'cellular2g',
    },
    cache: 'cold',
  },
  {
    id: 'SCENARIO-5',
    name: 'Mid-Range Android + Moderate Mobile',
    device: 'Class B (Pixel 7)',
    viewport: { width: 412, height: 915 },
    dpr: 2.625,
    cpuThrottle: 2,
    network: {
      latency: 100,
      downloadBps: 375000, // 3 Mbps
      uploadBps: 125000,
      connectionType: 'cellular4g',
    },
    cache: 'cold',
  },
  {
    id: 'SCENARIO-6',
    name: 'Low-End Android + Warm Cache Navigation',
    device: 'Class A (Moto G4)',
    viewport: { width: 360, height: 640 },
    dpr: 2,
    cpuThrottle: 4,
    network: {
      latency: 150,
      downloadBps: 200000, // 1.6 Mbps
      uploadBps: 93750,
      connectionType: 'cellular3g',
    },
    cache: 'warm',
  },
];

const TARGET_ROUTES = [
  '/',
  '/meta-ads/',
  '/meta-apps/',
  '/google-ads/',
  '/consult/',
  '/blog/',
  '/cases/',
  '/faq/',
];

async function executeStressTest() {
  const port = 4180;
  const server = await startStaticServer('dist', port);
  console.log(`[stress-test] Static test server running on port ${port}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
  });

  const results = [];

  try {
    for (const scenario of STRESS_SCENARIOS) {
      console.log(`\n============================================================`);
      console.log(`=== STRESS SCENARIO: ${scenario.name.toUpperCase()} ===`);
      console.log(`============================================================`);

      for (const route of TARGET_ROUTES) {
        process.stdout.write(`Testing ${route.padEnd(16)}... `);

        const context = await browser.newContext({
          viewport: scenario.viewport,
          deviceScaleFactor: scenario.dpr,
          isMobile: true,
          hasTouch: true,
        });

        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);

        // Apply CPU throttling
        if (scenario.cpuThrottle > 1) {
          await cdp.send('Emulation.setCPUThrottlingRate', { rate: scenario.cpuThrottle });
        }

        // Apply Network throttling
        if (scenario.network) {
          await cdp.send('Network.emulateNetworkConditions', {
            offline: false,
            latency: scenario.network.latency,
            downloadThroughput: scenario.network.downloadBps,
            uploadThroughput: scenario.network.uploadBps,
            connectionType: scenario.network.connectionType,
          });
        }

        await cdp.send('Performance.enable');

        const consoleLogs = [];
        page.on('console', (msg) => {
          if (msg.type() === 'error' || msg.type() === 'warn') {
            consoleLogs.push({ type: msg.type(), text: msg.text() });
          }
        });

        const networkStats = {
          totalBytes: 0,
          jsBytes: 0,
          cssBytes: 0,
          fontBytes: 0,
          imgBytes: 0,
          failedRequests: 0,
        };

        page.on('requestfailed', () => {
          networkStats.failedRequests++;
        });

        page.on('response', (res) => {
          try {
            const len = parseInt(res.headers()['content-length'] || '0', 10);
            networkStats.totalBytes += len;
            const u = res.url();
            if (u.endsWith('.js')) networkStats.jsBytes += len;
            else if (u.endsWith('.css')) networkStats.cssBytes += len;
            else if (u.endsWith('.woff2')) networkStats.fontBytes += len;
            else if (/\.(webp|png|jpg|jpeg|svg)$/.test(u)) networkStats.imgBytes += len;
          } catch {}
        });

        // Add Init Script for in-browser metrics
        await page.addInitScript(() => {
          window.__perfMetrics = {
            fcp: null,
            lcp: null,
            lcpElement: null,
            cls: 0,
            longTasks: [],
            headingTime: null,
            ctaTime: null,
          };

          new PerformanceObserver((list) => {
            for (const entry of list.getEntriesByName('first-contentful-paint')) {
              window.__perfMetrics.fcp = entry.startTime;
            }
          }).observe({ type: 'paint', buffered: true });

          new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const last = entries[entries.length - 1];
            if (last) {
              window.__perfMetrics.lcp = last.startTime;
              window.__perfMetrics.lcpElement = last.element?.tagName || null;
            }
          }).observe({ type: 'largest-contentful-paint', buffered: true });

          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (!entry.hadRecentInput) window.__perfMetrics.cls += entry.value;
            }
          }).observe({ type: 'layout-shift', buffered: true });

          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              window.__perfMetrics.longTasks.push({
                startTime: entry.startTime,
                duration: entry.duration,
              });
            }
          }).observe({ type: 'longtask', buffered: true });
        });

        // Handle Warm Cache scenario: visit once, then reload/navigate
        const targetUrl = `http://localhost:${port}${route}`;

        if (scenario.cache === 'warm') {
          await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
          // Second visit measures warm cache
        }

        const navStart = Date.now();
        let navigationError = null;

        try {
          await page.goto(targetUrl, { waitUntil: 'load', timeout: 90000 });
        } catch (err) {
          navigationError = err.message;
        }

        // Wait a small settlement window for RAF and layout
        await page.waitForTimeout(1000);

        // Check if Hero heading is visible
        const headingVisible = await page.evaluate(() => {
          const h1 = document.querySelector('h1');
          if (!h1) return false;
          const rect = h1.getBoundingClientRect();
          const style = window.getComputedStyle(h1);
          return rect.height > 0 && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0;
        });

        // Check if CTA button is visible and clickable
        const ctaUsable = await page.evaluate(() => {
          const cta = document.querySelector('a[href*="#contact"], a[href*="#cases"], button[data-slot="button"]');
          if (!cta) return false;
          const rect = cta.getBoundingClientRect();
          const style = window.getComputedStyle(cta);
          return rect.height > 0 && style.visibility !== 'hidden' && style.pointerEvents !== 'none';
        });

        const inPageMetrics = await page.evaluate(() => {
          const m = window.__perfMetrics || {};
          const fcp = m.fcp || 0;
          const tbt = (m.longTasks || [])
            .filter((t) => t.startTime >= fcp)
            .reduce((acc, t) => acc + Math.max(0, t.duration - 50), 0);

          return {
            fcp: m.fcp ? Math.round(m.fcp) : null,
            lcp: m.lcp ? Math.round(m.lcp) : null,
            lcpElement: m.lcpElement || null,
            cls: Number((m.cls || 0).toFixed(4)),
            tbt: Math.round(tbt),
            longTasksTotalDuration: Math.round((m.longTasks || []).reduce((acc, t) => acc + t.duration, 0)),
            longTaskCount: (m.longTasks || []).length,
          };
        });

        const navTimings = await page.evaluate(() => {
          const nav = performance.getEntriesByType('navigation')[0];
          return {
            ttfb: nav ? Math.round(nav.responseStart - nav.requestStart) : null,
            domInteractive: nav ? Math.round(nav.domInteractive) : null,
          };
        });

        const hydrationFailures = consoleLogs.filter(
          (l) =>
            l.text.includes('hydration fell back to client render') ||
            l.text.includes('Hydration failed') ||
            l.text.includes('did not match')
        );

        const record = {
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          route,
          device: scenario.device,
          network: `${scenario.network.downloadBps / 125}k / ${scenario.network.latency}ms`,
          cpuThrottle: `${scenario.cpuThrottle}x`,
          cache: scenario.cache,
          ttfb: navTimings.ttfb,
          fcp: inPageMetrics.fcp,
          lcp: inPageMetrics.lcp,
          tbt: inPageMetrics.tbt,
          cls: inPageMetrics.cls,
          lcpElement: inPageMetrics.lcpElement,
          headingVisible: headingVisible ? 'YES' : 'NO',
          ctaUsable: ctaUsable ? 'YES' : 'NO',
          failedRequests: networkStats.failedRequests,
          totalKb: Math.round(networkStats.totalBytes / 1024),
          hydrationOk: hydrationFailures.length === 0 ? 'PASS' : 'FAIL',
          error: navigationError ? 'TIMEOUT' : 'NONE',
        };

        results.push(record);
        console.log(`FCP: ${record.fcp}ms | LCP: ${record.lcp}ms | Heading: ${record.headingVisible} | CTA: ${record.ctaUsable} | Total: ${record.totalKb}KB | Hydr: ${record.hydrationOk}`);

        await context.close();
      }
    }

    // Save Stress Test Results CSV
    let csv = 'ScenarioId,ScenarioName,Route,Device,Network,CPUThrottle,Cache,TTFB_ms,FCP_ms,LCP_ms,TBT_ms,CLS,LCPElement,HeadingVisible,CTAUsable,FailedRequests,TotalKB,HydrationStatus,Error\n';
    for (const r of results) {
      csv += `${r.scenarioId},"${r.scenarioName}",${r.route},"${r.device}","${r.network}",${r.cpuThrottle},${r.cache},${r.ttfb},${r.fcp},${r.lcp},${r.tbt},${r.cls},"${r.lcpElement || ''}",${r.headingVisible},${r.ctaUsable},${r.failedRequests},${r.totalKb},${r.hydrationOk},${r.error}\n`;
    }
    fs.writeFileSync('audit/extreme-performance/27_STRESS_TEST_RESULTS.csv', csv, 'utf8');

    console.log('\n[stress-test] Completed! Results written to audit/extreme-performance/27_STRESS_TEST_RESULTS.csv');
  } finally {
    await browser.close();
    server.close();
  }
}

executeStressTest().catch((err) => {
  console.error('[stress-test] Fatal error:', err);
  process.exit(1);
});
