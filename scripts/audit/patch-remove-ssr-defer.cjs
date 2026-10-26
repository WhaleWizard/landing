const fs = require('fs');
let s = fs.readFileSync('scripts/generate-pages.js', 'utf8');

const t = `const DEFERRED_BOOTSTRAP_ROUTES = new Set([
  '/',
  '/meta-ads',
  '/meta-apps',
  '/google-ads',
  '/consult',
  '/marketing-glossary',
  '/calculator',
  '/roi-calculator',
  '/faq',
  '/cases',
  '/blog',
  '/privacy-policy',
  '/offer',
  '/cookie-policy',
  '/thank-you',
]);`;

const r = `const DEFERRED_BOOTSTRAP_ROUTES = new Set([
  '/marketing-glossary',
  '/calculator',
  '/roi-calculator',
  '/faq',
  '/cases',
  '/blog',
  '/privacy-policy',
  '/offer',
  '/cookie-policy',
  '/thank-you',
]);`;

const normalized = s.replace(/\r\n/g, '\n');
if (!normalized.includes(t)) {
  console.error('Target not found in generate-pages.js');
  process.exit(1);
}

const patched = normalized.replace(t, r);
fs.writeFileSync('scripts/generate-pages.js', patched.replace(/\n/g, '\r\n'), 'utf8');
console.log('Successfully removed SSR hero routes from DEFERRED_BOOTSTRAP_ROUTES');
