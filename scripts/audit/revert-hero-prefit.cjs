const fs = require('fs');

// 1. MetaAdsEditorialHero.tsx
let f1 = fs.readFileSync('src/app/components/service-heroes/MetaAdsEditorialHero.tsx', 'utf8');
const t1 = `data-ww-title-fit="2/0"\n                  data-ww-title-fit-min="18"\n                  `;
fs.writeFileSync('src/app/components/service-heroes/MetaAdsEditorialHero.tsx', f1.replace(t1, ''), 'utf8');

// 2. ConsultStudioHero.tsx
let f2 = fs.readFileSync('src/app/components/service-heroes/ConsultStudioHero.tsx', 'utf8');
const t2 = `data-ww-title-fit="2/0"\n                  data-ww-title-fit-min="17"\n                  `;
fs.writeFileSync('src/app/components/service-heroes/ConsultStudioHero.tsx', f2.replace(t2, ''), 'utf8');

// 3. Hero.tsx
let f3 = fs.readFileSync('src/app/components/Hero.tsx', 'utf8');
const t3 = `data-ww-title-fit="2/0"\n              data-ww-title-fit-min="14"\n              `;
fs.writeFileSync('src/app/components/Hero.tsx', f3.replace(t3, ''), 'utf8');

console.log('Successfully reverted data-ww-title-fit from the 3 heroes');
