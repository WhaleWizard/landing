import fs from 'node:fs';

const report = fs.readdirSync('.lighthouseci').filter(f => f.endsWith('.json')).map(f => '.lighthouseci/' + f).sort((a,b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];
const data = JSON.parse(fs.readFileSync(report, 'utf8'));

console.log('LCP Element:');
console.log(data.audits['largest-contentful-paint-element']?.details?.items?.[0]?.items?.[0]?.node);

const reqs = data.audits['network-requests']?.details?.items || [];
console.log('\n--- NETWORK REQUESTS ---');
for (const r of reqs.slice(0, 20)) {
  console.log(`${r.url.split('/').pop()} | ${r.priority} | ${r.transferSize} B | start: ${Math.round(r.networkRequestTime - reqs[0].networkRequestTime)}ms | end: ${Math.round(r.networkEndTime - reqs[0].networkRequestTime)}ms`);
}
