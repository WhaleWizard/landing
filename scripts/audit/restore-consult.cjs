const fs = require('fs');

let s = fs.readFileSync('scripts/generate-pages.js', 'utf8');
let normalized = s.replace(/\r\n/g, '\n');

// 1. Restore all routes to DEFERRED_BOOTSTRAP_ROUTES
const t1 = `const DEFERRED_BOOTSTRAP_ROUTES = new Set([
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

const r1 = `const DEFERRED_BOOTSTRAP_ROUTES = new Set([
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

// 2. Restore priority: true on desk-v-800
const t2 = `    {
      href: '/images/consult-proof/desk-v-800.webp',
      media: '(max-width: 1023px)',
      imageSrcSet: '/images/consult-proof/desk-v-800.webp 2x, /images/consult-proof/desk-v.webp 3x',
    },`;

const r2 = `    {
      href: '/images/consult-proof/desk-v-800.webp',
      priority: true,
      media: '(max-width: 1023px)',
      imageSrcSet: '/images/consult-proof/desk-v-800.webp 2x, /images/consult-proof/desk-v.webp 3x',
    },`;

normalized = normalized.replace(t1, r1).replace(t2, r2);
fs.writeFileSync('scripts/generate-pages.js', normalized.replace(/\n/g, '\r\n'), 'utf8');
console.log('Restored DEFERRED_BOOTSTRAP_ROUTES and desk-v priority');
