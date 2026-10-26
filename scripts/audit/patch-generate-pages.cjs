const fs = require('fs');
let s = fs.readFileSync('scripts/generate-pages.js', 'utf8');

const t1 = `    { href: '/images/cosmic/whale.webp', media: '(min-width: 901px)' },`;
const r1 = `    { href: '/images/cosmic/whale-compact.webp', media: '(max-width: 900px)' },\n    { href: '/images/cosmic/whale.webp', media: '(min-width: 901px)' },`;

const t2 = `    if ((!hasCyrillic && /[A-Za-z0-9]/u.test(text)) || subsets.length === 0 || (font.dir === 'hero' && /[A-Za-z0-9]/u.test(text))) subsets.push('latin');`;
const r2 = `    if (/[A-Za-z0-9\\s]/u.test(text) || subsets.length === 0 || (font.dir === 'hero' && /[A-Za-z0-9]/u.test(text))) subsets.push('latin');`;

const t3 = `fontPreloads: [...new Set(ROUTE_FONT_PRELOADS[page.route] ? ROUTE_FONT_PRELOADS[page.route] : resolveHeroFontPreloads(page.hero))],`;
const r3 = `fontPreloads: [...new Set([...(ROUTE_FONT_PRELOADS[page.route] || []), ...resolveHeroFontPreloads(page.hero)])],`;

const normalized = s.replace(/\r\n/g, '\n');
if (!normalized.includes(t1) || !normalized.includes(t2) || !normalized.includes(t3)) {
  console.error('Targets not found in generate-pages.js', { t1: normalized.includes(t1), t2: normalized.includes(t2), t3: normalized.includes(t3) });
  process.exit(1);
}

let patched = normalized.replace(t1, r1).replace(t2, r2).replace(t3, r3);
fs.writeFileSync('scripts/generate-pages.js', patched.replace(/\n/g, '\r\n'), 'utf8');
console.log('Successfully patched generate-pages.js');
