import fs from 'node:fs';
import path from 'node:path';

const dir = 'audit/extreme-performance/lighthouse/post-fix';
if (fs.existsSync(dir)) {
  for (const file of fs.readdirSync(dir).filter(f => f.endsWith('.json'))) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    const route = file.replace('_mobile.json', '');
    const lcpAudit = data.audits['largest-contentful-paint-element'];
    const item = lcpAudit?.details?.items?.[0];
    const node = item?.node;
    console.log(`Route: ${route}`);
    console.log(`  LCP Time: ${Math.round(data.audits['largest-contentful-paint']?.numericValue || 0)}ms`);
    console.log(`  Selector: ${node?.selector}`);
    console.log(`  Snippet: ${node?.snippet}`);
  }
}
