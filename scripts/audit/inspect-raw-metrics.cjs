const fs = require('fs');
const path = require('path');
const report = fs.readdirSync('.lighthouseci')
  .filter(f => f.endsWith('.json'))
  .map(f => `.lighthouseci/${f}`)
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

const data = JSON.parse(fs.readFileSync(report, 'utf8'));
console.log('Observed FCP:', data.audits['first-contentful-paint']?.details?.items || data.audits['first-contentful-paint']?.numericValue);
console.log('FCP audit:', {
  score: data.audits['first-contentful-paint'].score,
  numericValue: data.audits['first-contentful-paint'].numericValue,
});
console.log('LCP audit:', {
  score: data.audits['largest-contentful-paint'].score,
  numericValue: data.audits['largest-contentful-paint'].numericValue,
});
console.log('Metrics audit:', JSON.stringify(data.audits['metrics']?.details?.items?.[0], null, 2));
