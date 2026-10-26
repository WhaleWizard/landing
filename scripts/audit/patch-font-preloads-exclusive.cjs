const fs = require('fs');

let gen = fs.readFileSync('scripts/generate-pages.js', 'utf8');

const target = "fontPreloads: [...new Set([...(ROUTE_FONT_PRELOADS[page.route] || []), ...resolveHeroFontPreloads(page.hero)])],";
const replacement = "fontPreloads: ROUTE_FONT_PRELOADS[page.route] || resolveHeroFontPreloads(page.hero),";

if (gen.includes(target)) {
  gen = gen.replace(target, replacement);
  fs.writeFileSync('scripts/generate-pages.js', gen, 'utf8');
  console.log('Successfully updated fontPreloads to prioritize ROUTE_FONT_PRELOADS');
} else {
  console.error('Target not found in generate-pages.js');
}
