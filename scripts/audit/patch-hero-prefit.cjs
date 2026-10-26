const fs = require('fs');

// 1. MetaAdsEditorialHero.tsx
let f1 = fs.readFileSync('src/app/components/service-heroes/MetaAdsEditorialHero.tsx', 'utf8');
const t1 = `<h1
                  ref={titleRef}
                  id="meta-editorial-title"
                  className={\`meta-editorial-hero__title \${managedTitleClasses(content.typography, 'hero')}\`}`;
const r1 = `<h1
                  ref={titleRef}
                  id="meta-editorial-title"
                  data-ww-title-fit="2/0"
                  data-ww-title-fit-min="18"
                  className={\`meta-editorial-hero__title \${managedTitleClasses(content.typography, 'hero')}\`}`;
const norm1 = f1.replace(/\r\n/g, '\n');
if (!norm1.includes(t1)) {
  console.error('Target 1 not found in MetaAdsEditorialHero.tsx');
  process.exit(1);
}
fs.writeFileSync('src/app/components/service-heroes/MetaAdsEditorialHero.tsx', norm1.replace(t1, r1).replace(/\n/g, '\r\n'), 'utf8');
console.log('Patched MetaAdsEditorialHero.tsx');

// 2. ConsultStudioHero.tsx
let f2 = fs.readFileSync('src/app/components/service-heroes/ConsultStudioHero.tsx', 'utf8');
const t2 = `<h1
                  ref={titleRef}
                  id="consult-studio-title"
                  className={\`consult-studio-hero__title \${managedTitleClasses(content.typography, 'hero')}\`}`;
const r2 = `<h1
                  ref={titleRef}
                  id="consult-studio-title"
                  data-ww-title-fit="2/0"
                  data-ww-title-fit-min="17"
                  className={\`consult-studio-hero__title \${managedTitleClasses(content.typography, 'hero')}\`}`;
const norm2 = f2.replace(/\r\n/g, '\n');
if (!norm2.includes(t2)) {
  console.error('Target 2 not found in ConsultStudioHero.tsx');
  process.exit(1);
}
fs.writeFileSync('src/app/components/service-heroes/ConsultStudioHero.tsx', norm2.replace(t2, r2).replace(/\n/g, '\r\n'), 'utf8');
console.log('Patched ConsultStudioHero.tsx');

// 3. Hero.tsx
let f3 = fs.readFileSync('src/app/components/Hero.tsx', 'utf8');
const t3 = `<h1
              ref={titleRef}
              aria-label={content.titleLines.filter((line) => line.tone !== 'supporting').map((line) => line.text).join(' ')}`;
const r3 = `<h1
              ref={titleRef}
              data-ww-title-fit="2/0"
              data-ww-title-fit-min="14"
              aria-label={content.titleLines.filter((line) => line.tone !== 'supporting').map((line) => line.text).join(' ')}`;
const norm3 = f3.replace(/\r\n/g, '\n');
if (!norm3.includes(t3)) {
  console.error('Target 3 not found in Hero.tsx');
  process.exit(1);
}
fs.writeFileSync('src/app/components/Hero.tsx', norm3.replace(t3, r3).replace(/\n/g, '\r\n'), 'utf8');
console.log('Patched Hero.tsx');
