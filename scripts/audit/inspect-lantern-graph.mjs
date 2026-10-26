import fs from 'node:fs';

const report = fs.readdirSync('.lighthouseci')
  .filter(f => f.endsWith('.json'))
  .map(f => `.lighthouseci/${f}`)
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

const data = JSON.parse(fs.readFileSync(report, 'utf8'));

// Check Lantern simulation or diagnostics
const diag = data.audits['diagnostics']?.details?.items?.[0];
console.log('Diagnostics:', diag);

// Check network requests in detail
const reqs = data.audits['network-requests']?.details?.items || [];
console.log('\n--- NETWORK REQUESTS ---');
for (const r of reqs) {
  console.log(`${r.url} | prio: ${r.priority} | size: ${r.transferSize} | start: ${r.networkRequestTime} | end: ${r.networkEndTime}`);
}
