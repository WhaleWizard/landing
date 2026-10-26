const fs = require('fs');

// 1. In data/site-content.local.json, remove "font": "inter" from titleLines[0] of service:meta-ads
const content = JSON.parse(fs.readFileSync('data/site-content.local.json', 'utf8'));
if (content.sections?.['service:meta-ads']?.hero?.titleLines?.[0]?.font === 'inter') {
  delete content.sections['service:meta-ads'].hero.titleLines[0].font;
  fs.writeFileSync('data/site-content.local.json', JSON.stringify(content, null, 2) + '\n', 'utf8');
  console.log('1. Removed erroneous font: "inter" from meta-ads titleLines[0] in site-content.local.json');
}

// 2. In scripts/generate-pages.js, ensure ROUTE_FONT_PRELOADS['/meta-ads'] has both cyrillic and latin Prata
let gen = fs.readFileSync('scripts/generate-pages.js', 'utf8');
const target = "  '/meta-ads': [\r\n    '/fonts/hero/prata-400-normal-cyrillic.woff2',\r\n  ],";
const replacement = "  '/meta-ads': [\r\n    '/fonts/hero/prata-400-normal-cyrillic.woff2',\r\n    '/fonts/hero/prata-400-normal-latin.woff2',\r\n  ],";

if (gen.includes(target)) {
  gen = gen.replace(target, replacement);
  fs.writeFileSync('scripts/generate-pages.js', gen, 'utf8');
  console.log('2. Restored prata-latin to ROUTE_FONT_PRELOADS in generate-pages.js');
} else {
  const targetLF = "  '/meta-ads': [\n    '/fonts/hero/prata-400-normal-cyrillic.woff2',\n  ],";
  const replacementLF = "  '/meta-ads': [\n    '/fonts/hero/prata-400-normal-cyrillic.woff2',\n    '/fonts/hero/prata-400-normal-latin.woff2',\n  ],";
  if (gen.includes(targetLF)) {
    gen = gen.replace(targetLF, replacementLF);
    fs.writeFileSync('scripts/generate-pages.js', gen, 'utf8');
    console.log('2. Restored prata-latin to ROUTE_FONT_PRELOADS in generate-pages.js (LF)');
  }
}
