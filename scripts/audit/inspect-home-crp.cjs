const fs = require('fs');
const path = require('path');
const report = fs.readdirSync('.lighthouseci')
  .filter(f => f.endsWith('.json'))
  .map(f => `.lighthouseci/${f}`)
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

const data = JSON.parse(fs.readFileSync(report, 'utf8'));
const lcpAudit = data.audits['largest-contentful-paint-element'];
console.log('LCP details:', JSON.stringify(lcpAudit?.details, null, 2));

// Check render-blocking-resources
console.log('Render-blocking:', JSON.stringify(data.audits['render-blocking-resources']?.details?.items, null, 2));

// Check critical-request-chains
console.log('Critical chains:', JSON.stringify(data.audits['critical-request-chains']?.details, null, 2));
