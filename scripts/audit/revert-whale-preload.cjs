const fs = require('fs');
let s = fs.readFileSync('scripts/generate-pages.js', 'utf8');

const target = `    { href: '/images/cosmic/whale-compact.webp', media: '(max-width: 900px)' },\n    { href: '/images/cosmic/whale.webp', media: '(min-width: 901px)' },`;
const replacement = `    { href: '/images/cosmic/whale.webp', media: '(min-width: 901px)' },`;

const normalized = s.replace(/\r\n/g, '\n');
if (!normalized.includes(target)) {
  console.error('Target not found in generate-pages.js');
  process.exit(1);
}
fs.writeFileSync('scripts/generate-pages.js', normalized.replace(target, replacement).replace(/\n/g, '\r\n'), 'utf8');
console.log('Successfully reverted whale preload in generate-pages.js');
