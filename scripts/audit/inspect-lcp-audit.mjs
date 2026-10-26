import fs from 'node:fs';
import path from 'node:path';

const file = 'audit/extreme-performance/lighthouse/post-fix/home_mobile.json';
if (fs.existsSync(file)) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(JSON.stringify(data.audits['largest-contentful-paint-element'], null, 2));
}
