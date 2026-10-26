const fs = require('fs');

// 1. Remove prata-latin from ROUTE_FONT_PRELOADS in scripts/generate-pages.js
let genCode = fs.readFileSync('scripts/generate-pages.js', 'utf8');
genCode = genCode.replace(
  "  '/meta-ads': [\r\n    '/fonts/hero/prata-400-normal-cyrillic.woff2',\r\n    '/fonts/hero/prata-400-normal-latin.woff2',\r\n  ],",
  "  '/meta-ads': [\r\n    '/fonts/hero/prata-400-normal-cyrillic.woff2',\r\n  ],"
);
// Also handle LF if present
genCode = genCode.replace(
  "  '/meta-ads': [\n    '/fonts/hero/prata-400-normal-cyrillic.woff2',\n    '/fonts/hero/prata-400-normal-latin.woff2',\n  ],",
  "  '/meta-ads': [\n    '/fonts/hero/prata-400-normal-cyrillic.woff2',\n  ],"
);
fs.writeFileSync('scripts/generate-pages.js', genCode, 'utf8');
console.log('1. Updated scripts/generate-pages.js font preloads for /meta-ads');

// 2. Set loading="lazy" and fetchpriority="low" on meta-proof__photo in MetaAdsEditorialHero.tsx
// to prevent bandwidth contention with the LCP image (paper-stack).
let heroCode = fs.readFileSync('src/app/components/service-heroes/MetaAdsEditorialHero.tsx', 'utf8');
heroCode = heroCode.replace(
  '                    <img\r\n' +
  '                      src={item.image}\r\n' +
  '                      srcSet={item.imageSrcSet}\r\n' +
  '                      sizes="(max-width: 767px) 230px, 400px"\r\n' +
  '                      width={item.width}\r\n' +
  '                      height={item.height}\r\n' +
  '                      alt={item.alt}\r\n' +
  "                      loading={index === 0 ? 'eager' : 'lazy'}\r\n" +
  '                      decoding="async"\r\n' +
  "                      fetchpriority={index === 0 ? 'auto' : 'low'}\r\n" +
  '                      className="meta-proof__photo"\r\n' +
  '                    />',
  '                    <img\r\n' +
  '                      src={item.image}\r\n' +
  '                      srcSet={item.imageSrcSet}\r\n' +
  '                      sizes="(max-width: 767px) 230px, 400px"\r\n' +
  '                      width={item.width}\r\n' +
  '                      height={item.height}\r\n' +
  '                      alt={item.alt}\r\n' +
  "                      loading=\"lazy\"\r\n" +
  '                      decoding="async"\r\n' +
  "                      fetchpriority=\"low\"\r\n" +
  '                      className="meta-proof__photo"\r\n' +
  '                    />'
);
fs.writeFileSync('src/app/components/service-heroes/MetaAdsEditorialHero.tsx', heroCode, 'utf8');
console.log('2. Updated MetaAdsEditorialHero.tsx photo loading');
