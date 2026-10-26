import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('audit/extreme-performance/lighthouse/post-fix/home_mobile.json', 'utf8'));

console.log('lcp-phases-insight:');
console.log(JSON.stringify(data.audits['lcp-phases-insight'], null, 2));

console.log('\nlcp-discovery-insight:');
console.log(JSON.stringify(data.audits['lcp-discovery-insight'], null, 2));
