import fs from 'node:fs';

const data = JSON.parse(fs.readFileSync('audit/visual/measurements/deep_inspection_results.json', 'utf8'));

console.log('=== HEADING ORPHANS BY ROUTE ===');
const byRoute = {};
data.orphans.forEach((o) => {
  byRoute[o.route] = byRoute[o.route] || [];
  byRoute[o.route].push(o);
});

for (const [r, list] of Object.entries(byRoute)) {
  console.log(`\nRoute: ${r} (${list.length} occurrences):`);
  list.forEach((item) => {
    console.log(`  [${item.viewport}][${item.tag}] "${item.lines.join(' / ')}" (orphan: "${item.orphanedWord}")`);
  });
}

console.log('\n=== CARD ALIGNMENT ISSUES ===');
data.cardAlignmentIssues.forEach((c) => {
  console.log(`[${c.route}][${c.viewport}] diff: ${c.diff}px`);
  c.cards.forEach((card) => {
    console.log(`    - ${card.height}px: ${card.text.slice(0, 40).replace(/\n/g, ' ')}`);
  });
});
