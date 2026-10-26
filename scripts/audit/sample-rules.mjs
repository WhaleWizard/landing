import fs from 'node:fs';
import path from 'node:path';

const file = fs.readdirSync('dist/assets').find(f => f.startsWith('index-') && f.endsWith('.css'));
const css = fs.readFileSync(path.join('dist/assets', file), 'utf8');

// Match all selectors
const rules = css.match(/[^{}]+(?=\{[^{}]+\})/g) || [];
console.log('Total rules count:', rules.length);

// Sample 40 rules across the file
for (let i = 0; i < 40; i++) {
  const idx = Math.floor((i / 40) * rules.length);
  console.log(`[${idx}] ${rules[idx].trim().slice(0, 80)}`);
}
