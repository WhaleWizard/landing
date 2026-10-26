import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('audit/extreme-performance/lighthouse/post-fix/home_mobile.json', 'utf8'));

// Check audits for lcp
for (const [key, audit] of Object.entries(data.audits)) {
  if (key.includes('paint') || key.includes('lcp')) {
    console.log(key, '->', audit.numericValue, audit.displayValue);
  }
}
