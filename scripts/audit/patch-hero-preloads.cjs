const fs = require('fs');
let s = fs.readFileSync('scripts/generate-pages.js', 'utf8');

const t1 = `  '/': [
    {
      href: '/images/cosmic/whale.webp',
      imageSrcSet: '/images/cosmic/whale-compact.webp 700w, /images/cosmic/whale.webp 1195w',
      imageSizes: '(max-width: 900px) 430px, 1195px',
      priority: true,
    },`;

const r1 = `  '/': [
    {
      href: '/images/cosmic/whale.webp',
      imageSrcSet: '/images/cosmic/whale-compact.webp 768w, /images/cosmic/whale.webp 1195w',
      imageSizes: '(max-width: 900px) 430px, 1195px',
      priority: true,
    },`;

const t2 = `    // Предметы сцены рисует React после загрузки чанка хиро; без preload
    // браузер узнавал о них на 6–7-й секунде холодной загрузки, а ноутбук —
    // самый крупный объект первого экрана телефона, то есть его LCP.
    { href: '/images/consult-proof/scene/laptop.webp' },
    { href: '/images/consult-proof/scene/notebook.webp', media: '(min-width: 1024px)' },`;

const r2 = `    // Предметы сцены рисует React после загрузки чанка хиро; без preload
    // браузер узнавал о них на 6–7-й секунде холодной загрузки, а ноутбук и
    // блокнот — ключевые визуальные объекты первого экрана.
    {
      href: '/images/consult-proof/scene/laptop.webp',
      imageSrcSet: '/images/consult-proof/scene/laptop-mobile.webp 480w, /images/consult-proof/scene/laptop.webp 720w',
      imageSizes: '(max-width: 1023px) 240px, 720px',
      priority: true,
    },
    {
      href: '/images/consult-proof/scene/notebook.webp',
      imageSrcSet: '/images/consult-proof/scene/notebook-mobile.webp 400w, /images/consult-proof/scene/notebook.webp 700w',
      imageSizes: '(max-width: 1023px) 210px, 700px',
      priority: true,
    },`;

const normalized = s.replace(/\r\n/g, '\n');
if (!normalized.includes(t1) || !normalized.includes(t2)) {
  console.error('Target not found in generate-pages.js', { t1: normalized.includes(t1), t2: normalized.includes(t2) });
  process.exit(1);
}

const patched = normalized.replace(t1, r1).replace(t2, r2);
fs.writeFileSync('scripts/generate-pages.js', patched.replace(/\n/g, '\r\n'), 'utf8');
console.log('Successfully patched hero preloads in generate-pages.js');
