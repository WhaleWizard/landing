import fs from 'node:fs';
import path from 'node:path';

const glob = fs.readdirSync('dist/assets').filter(f => f.startsWith('index-') && f.endsWith('.css'));
if (!glob.length) {
  console.log('No index-*.css found');
  process.exit(1);
}

const css = fs.readFileSync(path.join('dist/assets', glob[0]), 'utf8');
console.log('Total index CSS size:', css.length, 'bytes');

// Check for base64
const base64Matches = css.match(/url\(['"]?data:[^)]+['"]?\)/g) || [];
console.log('Base64 URLs count:', base64Matches.length);
let b64Total = 0;
for (const m of base64Matches) {
  b64Total += m.length;
}
console.log('Base64 total size:', b64Total, 'bytes');

// Check for font-face
const fontFaces = css.match(/@font-face\s*\{[^}]+\}/g) || [];
console.log('@font-face count:', fontFaces.length);
let fontFaceTotal = 0;
for (const f of fontFaces) fontFaceTotal += f.length;
console.log('@font-face total size:', fontFaceTotal, 'bytes');

// Check for keyframes
const keyframes = css.match(/@keyframes\s+[^{]+\{(?:[^{}]*\{[^{}]*\})*\}/g) || [];
console.log('@keyframes count:', keyframes.length);

console.log('Sample classes (first 300 chars):', css.slice(0, 300));
console.log('Sample classes (last 300 chars):', css.slice(-300));
