const { chromium } = require('playwright');
const { execSync } = require('child_process');
const { startAuditServer } = require('../../scripts/mobile-audit-server.cjs');

async function main() {
  const port = 4555;
  const server = await startAuditServer(port);
  console.log(`[AuditServer] Running on port ${port}`);

  const browser = await chromium.launch({
    args: ['--remote-debugging-port=9222', '--no-sandbox'],
  });
  console.log('Playwright Chromium launched with remote debugging port 9222');

  const routes = ['/'];

  for (const route of routes) {
    console.log(`\n================ Testing ${route} ================`);
    
    // Desktop
    try {
      const out = execSync(`npx lighthouse http://localhost:${port}${route} --port=9222 --preset=desktop --output=json --only-categories=performance --quiet`, {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
      });
      const json = JSON.parse(out);
      const score = Math.round(json.categories.performance.score * 100);
      const fcp = json.audits['first-contentful-paint'].displayValue;
      const lcp = json.audits['largest-contentful-paint'].displayValue;
      const tbt = json.audits['total-blocking-time'].displayValue;
      const cls = json.audits['cumulative-layout-shift'].displayValue;
      console.log(`DESKTOP ${route} Score: ${score} | FCP: ${fcp} | LCP: ${lcp} | TBT: ${tbt} | CLS: ${cls}`);
    } catch (e) {
      console.error(`DESKTOP error on ${route}:`, e.message);
    }

    // Mobile
    try {
      const out = execSync(`npx lighthouse http://localhost:${port}${route} --port=9222 --output=json --only-categories=performance --quiet`, {
        encoding: 'utf8',
        maxBuffer: 50 * 1024 * 1024,
      });
      const json = JSON.parse(out);
      const score = Math.round(json.categories.performance.score * 100);
      const fcp = json.audits['first-contentful-paint'].displayValue;
      const lcp = json.audits['largest-contentful-paint'].displayValue;
      const tbt = json.audits['total-blocking-time'].displayValue;
      const cls = json.audits['cumulative-layout-shift'].displayValue;
      console.log(`MOBILE ${route} Score: ${score} | FCP: ${fcp} | LCP: ${lcp} | TBT: ${tbt} | CLS: ${cls}`);
    } catch (e) {
      console.error(`MOBILE error on ${route}:`, e.message);
    }
  }

  await browser.close();
  server.close();
}

main().catch(console.error);
