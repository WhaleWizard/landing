import fs from 'node:fs';

const reportPath = fs.readdirSync('.lighthouseci')
  .filter(f => f.endsWith('.json'))
  .map(f => `.lighthouseci/${f}`)
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

const data = JSON.parse(fs.readFileSync(reportPath, 'utf8'));

console.log('Report:', reportPath);
console.log('Score:', Math.round(data.categories.performance.score * 100));
console.log('FCP:', data.audits['first-contentful-paint'].numericValue);
console.log('LCP:', data.audits['largest-contentful-paint'].numericValue);
console.log('TBT:', data.audits['total-blocking-time'].numericValue);

const reqs = data.audits['network-requests']?.details?.items || [];
console.log('\n--- NETWORK REQUESTS SORTED BY SIZE ---');
const sortedBySize = [...reqs].sort((a, b) => b.transferSize - a.transferSize);
for (const r of sortedBySize.slice(0, 15)) {
  console.log(`${(r.transferSize / 1024).toFixed(1)} KB | ${r.priority} | ${r.mimeType} | ${r.url.split('/').pop()}`);
}

console.log('\n--- NETWORK REQUESTS BEFORE FCP (simulated 3000ms) ---');
for (const r of reqs.slice(0, 20)) {
  console.log(`${r.url.split('/').pop()} | ${(r.transferSize/1024).toFixed(1)}KB | start: ${Math.round(r.networkRequestTime - reqs[0].networkRequestTime)}ms | end: ${Math.round(r.networkEndTime - reqs[0].networkRequestTime)}ms`);
}
