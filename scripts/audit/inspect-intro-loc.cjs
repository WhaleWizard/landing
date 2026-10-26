const fs = require('fs');
const html = fs.readFileSync('dist/cookie-policy/index.html', 'utf8');
const rootIdx = html.indexOf('<div id="root">');
const shellIdx = html.indexOf('id="ww-static-shell"');
const introIdx = html.indexOf('legal-intro');
console.log('rootIdx:', rootIdx);
console.log('introIdx:', introIdx);
console.log('shellIdx:', shellIdx);
console.log('Is inside #root?', introIdx > rootIdx && introIdx < shellIdx);
