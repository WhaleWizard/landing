const fs = require('fs');
const path = require('path');
const f = fs.readdirSync('.lighthouseci').find(x => x.startsWith('lhr-') && x.endsWith('.json'));
const d = JSON.parse(fs.readFileSync(path.join('.lighthouseci', f), 'utf8'));

const lcpAudit = d.audits['largest-contentful-paint'];
console.log('LCP Audit details:', JSON.stringify(lcpAudit, null, 2));

const lcpElement = d.audits['largest-contentful-paint-element'];
console.log('LCP Element details:', JSON.stringify(lcpElement, null, 2));
