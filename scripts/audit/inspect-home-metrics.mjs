import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('audit/extreme-performance/lighthouse/post-fix/home_mobile.json', 'utf8'));

// Check metrics
console.log('Metrics audit:');
const metrics = data.audits['metrics']?.details?.items?.[0];
console.log(metrics);

// Check largest contentful paint element details
const lcpElement = data.audits['largest-contentful-paint-element'];
console.log('\nLCP Element:');
console.log(JSON.stringify(lcpElement.details, null, 2));
