const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

async function test() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 412, height: 823 },
    deviceScaleFactor: 1.75,
    isMobile: true,
  });

  // Start simple static server for dist
  const server = http.createServer((req, res) => {
    let filePath = path.join('dist', req.url.split('?')[0]);
    if (filePath.endsWith(path.sep) || fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    if (!fs.existsSync(filePath)) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    const mime = ext === '.html' ? 'text/html' : ext === '.css' ? 'text/css' : ext === '.js' ? 'application/javascript' : ext === '.webp' ? 'image/webp' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(fs.readFileSync(filePath));
  });

  await new Promise(r => server.listen(0, r));
  const port = server.address().port;

  await page.goto(`http://localhost:${port}/consult/`, { waitUntil: 'networkidle' });

  const elements = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('.cds-obj'));
    return imgs.map(img => {
      const rect = img.getBoundingClientRect();
      const style = window.getComputedStyle(img);
      return {
        className: img.className,
        src: img.currentSrc || img.src,
        width: rect.width,
        height: rect.height,
        top: rect.top,
        left: rect.left,
        area: rect.width * rect.height,
        opacity: style.opacity,
        display: style.display,
        visibility: style.visibility,
        animation: style.animation,
      };
    });
  });

  console.log('CDS elements:', JSON.stringify(elements, null, 2));

  await browser.close();
  server.close();
}

test().catch(e => console.error(e));
