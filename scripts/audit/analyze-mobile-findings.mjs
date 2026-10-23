import fs from 'node:fs';

const findings = JSON.parse(fs.readFileSync('audit/visual/measurements/mobile_stress_findings.json', 'utf8'));

console.log('=== ELEMENT_OVERFLOW ANALYSIS ===');
const overflows = findings.filter((f) => f.type === 'ELEMENT_OVERFLOW');
overflows.forEach((o) => {
  console.log(`[${o.route}][${o.viewport}] <${o.tag}> right: ${o.rect.right}px (width: ${o.rect.width}px): "${o.text}"`);
  console.log(`   class: ${o.className}`);
});

console.log(`\nTotal overflows: ${overflows.length}`);

console.log('\n=== SMALL_TAP_TARGET ANALYSIS (Sample) ===');
const tapTargets = findings.filter((f) => f.type === 'SMALL_TAP_TARGET');
const tapMap = {};
tapTargets.forEach((t) => {
  const key = `<${t.tag}> "${t.text}" (${t.rect.width}x${t.rect.height}) [class: ${t.className}] on ${t.route}`;
  tapMap[key] = (tapMap[key] || 0) + 1;
});

Object.entries(tapMap).slice(0, 30).forEach(([k, c]) => {
  console.log(`(x${c}) ${k}`);
});
