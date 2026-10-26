import fs from 'node:fs';

const file = 'audit/extreme-performance/lighthouse/post-fix/home_mobile.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const reqs = data.audits['network-requests']?.details?.items || [];
const skyReq = reqs.find(r => r.url.includes('sky'));
console.log('Sky Request:', skyReq);

const fcp = data.audits['first-contentful-paint']?.numericValue;
console.log('FCP:', fcp);
const lcp = data.audits['largest-contentful-paint']?.numericValue;
console.log('LCP:', lcp);
