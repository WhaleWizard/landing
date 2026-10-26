const fs = require('fs');
const html = fs.readFileSync('dist/meta-ads/index.html', 'utf8');
console.log('Font preloads:', html.match(/<link[^>]+as=["']font["'][^>]*>/g));
