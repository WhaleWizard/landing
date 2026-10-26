import fs from 'node:fs';
import path from 'node:path';

const file = fs.readdirSync('dist/assets').find(f => f.startsWith('index-') && f.endsWith('.css'));
const css = fs.readFileSync(path.join('dist/assets', file), 'utf8');

console.log('Total length:', css.length);

// Check size of @layer properties
const propertiesMatch = css.match(/@layer properties\{[\s\S]*?\}\}/);
if (propertiesMatch) {
  console.log('@layer properties size:', propertiesMatch[0].length);
}

// Check size of @layer theme
const themeMatch = css.match(/@layer theme\{[\s\S]*?\}\}/);
if (themeMatch) {
  console.log('@layer theme size:', themeMatch[0].length);
}

// Check size of keyframes
const allKeyframes = css.match(/@keyframes [^{]+\{(?:[^{}]*\{[^{}]*\})*\}/g) || [];
let kfSize = allKeyframes.reduce((a, b) => a + b.length, 0);
console.log('Keyframes total size:', kfSize, 'count:', allKeyframes.length);

// What else?
// Let's count utilities
console.log('Utilities / rules estimate size:', css.length - (propertiesMatch?.[0].length || 0) - kfSize);
