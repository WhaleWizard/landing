import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { chromium } from 'playwright';

function startStaticServer(distDir, port = 4173) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let reqPath = req.url.split('?')[0];
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
        '.jpg': 'image/jpeg',
      };
      res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
      res.end(fs.readFileSync(filePath));
    });

    server.listen(port, () => resolve(server));
  });
}

const TARGET_ROUTES = [
  '/',
  '/meta-ads/',
  '/meta-apps/',
  '/google-ads/',
  '/consult/',
];

async function collectTraces() {
  console.log('[collect-traces] Starting Chrome Performance Trace Capture...');
  const server = await startStaticServer('dist', 4173);
  const outDir = 'audit/forensic-v7/traces';
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: ['--enable-precise-memory-info', '--disable-extensions'],
  });

  const traceSummaries = [];

  for (const route of TARGET_ROUTES) {
    console.log(`\n--> Tracing route: ${route}`);
    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    });

    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);

    // Apply 4x CPU throttle for standard mobile emulation
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      latency: 150, // 150ms RTT
      downloadThroughput: (1.6 * 1024 * 1024) / 8, // 1.6 Mbps
      uploadThroughput: (750 * 1024) / 8, // 750 Kbps
      connectionType: 'cellular4g',
    });

    const safeName = route.replace(/\//g, '_').replace(/^_/, '').replace(/_$/, '') || 'home';
    const tracePath = path.join(outDir, `${safeName}_trace.json`);

    await cdp.send('Tracing.start', {
      traceConfig: {
        includedCategories: [
          'devtools.timeline',
          'v8.execute',
          'disabled-by-default-devtools.timeline',
          'blink.user_timing',
        ],
      },
    });

    const requests = [];
    page.on('request', (req) => {
      requests.push({
        url: req.url(),
        resourceType: req.resourceType(),
        startTime: Date.now(),
      });
    });

    const startTime = Date.now();
    await page.goto(`http://localhost:4173${route}`, { waitUntil: 'load', timeout: 30000 });

    // Wait 2.5s for post-load settling
    await page.waitForTimeout(2500);

    const traceDataChunks = [];
    cdp.on('Tracing.dataCollected', (data) => {
      traceDataChunks.push(...data.value);
    });

    const traceCompletePromise = new Promise((resolve) => {
      cdp.on('Tracing.tracingComplete', resolve);
    });

    await cdp.send('Tracing.end');
    await traceCompletePromise;

    fs.writeFileSync(tracePath, JSON.stringify(traceDataChunks), 'utf8');

    // Extract performance entries from browser page
    const perfData = await page.evaluate(() => {
      const paintEntries = performance.getEntriesByType('paint');
      const navEntries = performance.getEntriesByType('navigation');
      const nav = navEntries[0] || {};
      
      let fcp = 0;
      for (const entry of paintEntries) {
        if (entry.name === 'first-contentful-paint') fcp = entry.startTime;
      }

      return {
        fcp: Math.round(fcp),
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0),
        loadComplete: Math.round(nav.loadEventEnd || 0),
        responseStart: Math.round(nav.responseStart || 0),
      };
    });

    console.log(`Trace captured: ${tracePath} (${traceDataChunks.length} trace events)`);
    console.log(`Performance marks: FCP = ${perfData.fcp}ms, ResponseStart = ${perfData.responseStart}ms, DOMContentLoaded = ${perfData.domContentLoaded}ms`);

    traceSummaries.push({
      route,
      safeName,
      tracePath,
      totalEvents: traceDataChunks.length,
      ...perfData,
    });

    await context.close();
  }

  await browser.close();
  server.close();

  fs.writeFileSync(
    path.join(outDir, 'trace_summary.json'),
    JSON.stringify(traceSummaries, null, 2),
    'utf8'
  );
  console.log('\n[collect-traces] All traces captured successfully.');
}

collectTraces().catch((err) => {
  console.error(err);
  process.exit(1);
});
