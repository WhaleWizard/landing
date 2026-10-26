const fs = require('fs');

// Patch MetaAdsEditorialHero.tsx
const heroPath = 'src/app/components/service-heroes/MetaAdsEditorialHero.tsx';
let heroContent = fs.readFileSync(heroPath, 'utf8');

const heroTarget = `                  <img
                    src="/images/meta-proof/paper-stack-768.webp"
                    width="768"`;

const heroReplacement = `                  <img
                    src="/images/meta-proof/paper-stack-768.webp"
                    srcSet="/images/meta-proof/paper-stack-480.webp 480w, /images/meta-proof/paper-stack-768.webp 768w"
                    sizes="(max-width: 767px) 257px, 384px"
                    width="768"`;

// Normalize CRLF/LF for target search
if (heroContent.includes(heroTarget)) {
  heroContent = heroContent.replace(heroTarget, heroReplacement);
} else if (heroContent.includes(heroTarget.replace(/\n/g, '\r\n'))) {
  heroContent = heroContent.replace(heroTarget.replace(/\n/g, '\r\n'), heroReplacement.replace(/\n/g, '\r\n'));
} else {
  console.error('Could not find target in MetaAdsEditorialHero.tsx');
  process.exit(1);
}
fs.writeFileSync(heroPath, heroContent);
console.log('Updated MetaAdsEditorialHero.tsx');

// Patch scripts/generate-pages.js
const genPath = 'scripts/generate-pages.js';
let genContent = fs.readFileSync(genPath, 'utf8');

const genTarget = `  '/meta-ads': [
    { href: '/images/meta-proof/paper-stack-768.webp', priority: true },
    {
      href: '/images/meta-proof/ecommerce-photo.webp',
      imageSrcSet: '/images/meta-proof/ecommerce-photo-480.webp 480w, /images/meta-proof/ecommerce-photo-800.webp 800w, /images/meta-proof/ecommerce-photo.webp 1440w',
      imageSizes: '(max-width: 767px) 230px, 400px',
    },
  ],`;

const genReplacement = `  '/meta-ads': [
    {
      href: '/images/meta-proof/paper-stack-768.webp',
      imageSrcSet: '/images/meta-proof/paper-stack-480.webp 480w, /images/meta-proof/paper-stack-768.webp 768w',
      imageSizes: '(max-width: 767px) 257px, 384px',
      priority: true,
    },
    {
      href: '/images/meta-proof/ecommerce-photo.webp',
      imageSrcSet: '/images/meta-proof/ecommerce-photo-480.webp 480w, /images/meta-proof/ecommerce-photo-800.webp 800w, /images/meta-proof/ecommerce-photo.webp 1440w',
      imageSizes: '(max-width: 767px) 230px, 400px',
      media: '(min-width: 768px)',
    },
  ],`;

if (genContent.includes(genTarget)) {
  genContent = genContent.replace(genTarget, genReplacement);
} else if (genContent.includes(genTarget.replace(/\n/g, '\r\n'))) {
  genContent = genContent.replace(genTarget.replace(/\n/g, '\r\n'), genReplacement.replace(/\n/g, '\r\n'));
} else {
  console.error('Could not find target in scripts/generate-pages.js');
  process.exit(1);
}
fs.writeFileSync(genPath, genContent);
console.log('Updated scripts/generate-pages.js');
