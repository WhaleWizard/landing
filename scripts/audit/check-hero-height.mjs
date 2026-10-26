import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const server = http.createServer((req, res) => {
  let reqPath = req.url.split('?')[0];
  if (reqPath === '/' || reqPath.endsWith('/')) reqPath += 'index.html';
  const filePath = path.join('dist', reqPath);
  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    const ext = path.extname(filePath);
    const mime = ext === '.html' ? 'text/html' : ext === '.css' ? 'text/css' : ext === '.js' ? 'application/javascript' : ext === '.webp' ? 'image/webp' : 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': mime });
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(54321, async () => {
  const browser = await chromium.launch();
  for (const [w, h] of [[360, 640], [390, 844], [412, 915]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h } });
    await page.goto('http://localhost:54321/');
    await page.waitForLoadState('networkidle');

    const heroRect = await page.$eval('#hero', el => el.getBoundingClientRect());
    const servicesRect = await page.$eval('#services', el => el.getBoundingClientRect());
    const servicesMounted = await page.$eval('#services', el => !el.querySelector('[data-home-placeholder]'));

    console.log(`Viewport ${w}x${h}:`);
    console.log(`  #hero bottom: ${heroRect.bottom}px (height: ${heroRect.height}px)`);
    console.log(`  #services top: ${servicesRect.top}px`);
    console.log(`  #services mounted on initial load: ${servicesMounted}`);
    await page.close();
  }
  await browser.close();
  server.close();
});
