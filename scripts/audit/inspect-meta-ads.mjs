import fs from 'node:fs';

const file = 'audit/extreme-performance/lighthouse/post-fix/meta-ads_mobile.json';
if (fs.existsSync(file)) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log('Score:', Math.round(data.categories.performance.score * 100));
  console.log('FCP:', data.audits['first-contentful-paint']?.numericValue);
  console.log('LCP:', data.audits['largest-contentful-paint']?.numericValue);
  console.log('TBT:', data.audits['total-blocking-time']?.numericValue);
  console.log('CLS:', data.audits['cumulative-layout-shift']?.numericValue);
  
  const lcpElem = data.audits['largest-contentful-paint-element'];
  console.log('\nLCP Element:');
  console.log(lcpElem?.details?.items?.[0]?.items?.[0]?.node);

  const lcpPhases = data.audits['lcp-phases-insight'];
  console.log('\nLCP Phases:');
  console.log(lcpPhases?.details?.items?.[0]?.items);
}
