const fs = require('fs');
const html = fs.readFileSync('dist/cookie-policy/index.html', 'utf8');
console.log('Contains ww-static-shell?', html.includes('ww-static-shell'));
const rootIdx = html.indexOf('<div id="root">');
const scriptIdx = html.indexOf('<script', rootIdx);
console.log('Inside #root:');
console.log(html.substring(rootIdx, Math.min(rootIdx + 1200, scriptIdx)));
