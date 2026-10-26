const fs = require('fs');
const f = fs.readdirSync('.lighthouseci').find(x => x.endsWith('.json'));
const data = JSON.parse(fs.readFileSync('.lighthouseci/' + f, 'utf8'));
console.log('render-blocking:', JSON.stringify(data.audits['render-blocking-resources']?.details?.items, null, 2));
const html = fs.readFileSync('dist/meta-ads/index.html', 'utf8');
const stylesheets = html.match(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi);
console.log('head stylesheets:', stylesheets);
const preloads = html.match(/<link[^>]+rel=["']preload["'][^>]*>/gi);
console.log('head preloads:', preloads);
