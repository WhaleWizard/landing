import fs from 'node:fs';

const report = fs.readdirSync('.lighthouseci')
  .filter(f => f.endsWith('.json'))
  .map(f => `.lighthouseci/${f}`)
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

const data = JSON.parse(fs.readFileSync(report, 'utf8'));

console.log('URL:', data.requestedUrl || data.finalDisplayedUrl);
console.log('Total Score:', Math.round(data.categories.performance.score * 100));

const audits = [
  'first-contentful-paint',
  'speed-index',
  'largest-contentful-paint',
  'total-blocking-time',
  'cumulative-layout-shift'
];

for (const a of audits) {
  const item = data.audits[a];
  console.log(`${item.title}:`);
  console.log(`  displayValue: ${item.displayValue}`);
  console.log(`  numericValue: ${item.numericValue.toFixed(1)}`);
  console.log(`  score: ${item.score} (weight: ${data.categories.performance.auditRefs.find(r => r.id === a)?.weight})`);
}
