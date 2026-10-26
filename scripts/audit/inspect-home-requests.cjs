const fs = require('fs');
const path = require('path');
const report = fs.readdirSync('.lighthouseci')
  .filter(f => f.endsWith('.json'))
  .map(f => `.lighthouseci/${f}`)
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

const data = JSON.parse(fs.readFileSync(report, 'utf8'));
const reqs = data.audits['network-requests']?.details?.items || [];
console.log('Total requests:', reqs.length);
reqs.slice(0, 25).forEach(r => {
  const name = r.url.split('/').pop() || r.url;
  console.log(`${name.padEnd(35)} | prio: ${r.priority.padEnd(8)} | size: ${String(r.transferSize).padStart(6)} B | start: ${r.networkRequestTime.toFixed(1)}ms | end: ${r.networkEndTime.toFixed(1)}ms`);
});
