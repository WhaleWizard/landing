const fs = require('fs');

let code = fs.readFileSync('src/app/pages/BlogPage.tsx', 'utf8');

// Replace eager <img> on featured article with DeferredImage
code = code.replace(
  '<img\r\n' +
  '                          {...(hasCustomCover(featuredArticle.image)\r\n' +
  '                            ? articleImageAttributes(featuredArticle.image, ARTICLE_IMAGE_SIZES.featured)\r\n' +
  '                            : { src: \'/images/brand/whale-wizard.webp\' })}\r\n' +
  '                          alt=""\r\n' +
  '                          loading="eager"\r\n' +
  '                          decoding="async"\r\n' +
  '                          fetchpriority="high"',
  '<DeferredImage\r\n' +
  '                          {...(hasCustomCover(featuredArticle.image)\r\n' +
  '                            ? articleImageAttributes(featuredArticle.image, ARTICLE_IMAGE_SIZES.featured)\r\n' +
  '                            : { src: \'/images/brand/whale-wizard.webp\' })}\r\n' +
  '                          alt=""\r\n' +
  '                          loading="lazy"\r\n' +
  '                          decoding="async"\r\n' +
  '                          rootMargin="120px 0px"'
);

fs.writeFileSync('src/app/pages/BlogPage.tsx', code, 'utf8');
console.log('Successfully updated BlogPage.tsx to use DeferredImage');
