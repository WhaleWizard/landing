import fs from 'node:fs';

const report = fs.readdirSync('.lighthouseci')
  .filter(f => f.endsWith('.json'))
  .map(f => `.lighthouseci/${f}`)
  .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs)[0];

const data = JSON.parse(fs.readFileSync(report, 'utf8'));

// Check user timings, navigation timings, and main thread events
const fcpAudit = data.audits['first-contentful-paint'];
console.log('FCP Details:', fcpAudit.details);

// Check audits for byte efficiency
const unusedCss = data.audits['unused-css-rules'];
if (unusedCss) {
  console.log('\n--- UNUSED CSS RULES ---');
  console.log('Wasted Bytes:', unusedCss.details?.overallSavingsBytes);
  console.log('Wasted Ms:', unusedCss.details?.overallSavingsMs);
  for (const item of unusedCss.details?.items || []) {
    console.log(`${item.url.split('/').pop()} | total: ${item.totalBytes} B | wasted: ${item.wastedBytes} B (${item.wastedPercent.toFixed(1)}%)`);
  }
}

const unusedJs = data.audits['unused-javascript'];
if (unusedJs) {
  console.log('\n--- UNUSED JAVASCRIPT ---');
  console.log('Wasted Bytes:', unusedJs.details?.overallSavingsBytes);
  for (const item of unusedJs.details?.items || []) {
    console.log(`${item.url.split('/').pop()} | total: ${item.totalBytes} B | wasted: ${item.wastedBytes} B (${item.wastedPercent.toFixed(1)}%)`);
  }
}
