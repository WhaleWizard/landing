const fs = require('fs');

let content = fs.readFileSync('data/site-content.local.json', 'utf8');
content = content.replace(/"font": "pangolin"/, '"font": "prata"');
fs.writeFileSync('data/site-content.local.json', content, 'utf8');

let gen = fs.readFileSync('scripts/generate-pages.js', 'utf8');
if (!gen.includes("'/meta-ads': [")) {
  gen = gen.replace(/const ROUTE_FONT_PRELOADS = \{\r?\n\s*'\/consult': \[\r?\n\s*\/\/ All Commissioner weights use the same variable font bytes\.\r?\n\s*'\/fonts\/hero\/commissioner-400-normal-cyrillic\.woff2',\r?\n\s*\],/, `const ROUTE_FONT_PRELOADS = {
  '/consult': [
    // All Commissioner weights use the same variable font bytes.
    '/fonts/hero/commissioner-400-normal-cyrillic.woff2',
  ],
  '/meta-ads': [
    '/fonts/hero/prata-400-normal-cyrillic.woff2',
    '/fonts/hero/prata-400-normal-latin.woff2',
  ],`);
  fs.writeFileSync('scripts/generate-pages.js', gen, 'utf8');
}
console.log('Harmonized font on meta-ads to Prata');
