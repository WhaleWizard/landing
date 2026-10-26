import fs from 'node:fs';

const reportPath = fs.readdirSync('.lighthouseci')
  .filter(f => f.endsWith('.json'))
  .map(f => `.lighthouseci/${f}`)
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

console.log('Report URL:', data.requestedUrl || data.finalDisplayedUrl);
console.log('Performance Score:', Math.round(data.categories.performance.score * 100));

const crp = data.audits['critical-request-chains'];
if (crp) {
  console.log('\n--- CRITICAL REQUEST CHAINS ---');
  console.log(JSON.stringify(crp.details, null, 2));
}

const renderBlocking = data.audits['render-blocking-resources'];
if (renderBlocking) {
  console.log('\n--- RENDER BLOCKING RESOURCES ---');
  console.log(renderBlocking.details?.items);
}

const serverResp = data.audits['server-response-time'];
if (serverResp) {
  console.log('\n--- SERVER RESPONSE TIME ---');
  console.log(serverResp.numericValue, 'ms');
}
