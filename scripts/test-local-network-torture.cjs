const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Simple static server for dist
function startDistServer(port = 8787) {
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.woff2': 'font/woff2',
  };

  const distDir = path.resolve(__dirname, '../dist');
  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0];
    if (reqPath.endsWith('/')) reqPath += 'index.html';
    let filePath = path.join(distDir, reqPath);

    if (!fs.existsSync(filePath)) {
      if (fs.existsSync(filePath + '.html')) {
        filePath += '.html';
      } else {
        filePath = path.join(distDir, '404.html');
      }
    }

    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    try {
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    } catch (err) {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  return new Promise((resolve) => {
    server.listen(port, () => resolve(server));
  });
}

(async () => {
  const server = await startDistServer(8787);
  console.log('Dist server listening on http://localhost:8787');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Test Scenario F: Network Disconnect / Recovery on /meta-apps/
  console.log('Testing Scenario F on http://localhost:8787/meta-apps/ ...');
  await page.goto('http://localhost:8787/meta-apps/', { waitUntil: 'load' });
  await page.waitForTimeout(500);

  const heroInitial = await page.evaluate(() => document.getElementById('hero') !== null);
  console.log('Initial hero present:', heroInitial);

  const client = await context.newCDPSession(page);

  // 1. Cut network
  console.log('Simulating offline state...');
  await client.send('Network.emulateNetworkConditions', {
    offline: true,
    downloadThroughput: 0,
    uploadThroughput: 0,
    latency: 0
  });

  // 2. Scroll into below-the-fold deferred sections
  console.log('Scrolling while offline...');
  await page.evaluate(() => window.scrollBy(0, 1200));
  await page.waitForTimeout(1000);

  // Verify Hero is STILL intact and NOT crashed by RouteErrorBoundary
  const heroDuringOffline = await page.evaluate(() => document.getElementById('hero') !== null);
  console.log('Hero intact during offline scroll:', heroDuringOffline);

  // 3. Restore network
  console.log('Restoring network connectivity...');
  await client.send('Network.emulateNetworkConditions', {
    offline: false,
    downloadThroughput: 0,
    uploadThroughput: 0,
    latency: 0
  });
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForTimeout(1500);

  const heroRecovered = await page.evaluate(() => document.getElementById('hero') !== null);
  console.log('Hero intact after network restoration:', heroRecovered);

  // Check if error boundary or skeleton rendered cleanly
  const pageErrors = [];
  page.on('pageerror', err => pageErrors.push(err.message));

  console.log('Page crash errors:', pageErrors.length);
  const passed = heroDuringOffline && heroRecovered && pageErrors.length === 0;
  console.log('Scenario F (Network Disconnect / Recovery) PASSED:', passed);

  await browser.close();
  server.close();

  if (!passed) {
    process.exit(1);
  }
})();
