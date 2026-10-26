const fs = require('fs');
const html = fs.readFileSync('dist/index.html', 'utf8');
console.log('Stylesheets in dist/index.html:', html.match(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi));
console.log('Preloads in dist/index.html:', html.match(/<link[^>]+rel=["']preload["'][^>]*>/gi));
