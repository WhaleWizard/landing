const fs = require('fs');
const path = require('fs');

const css = fs.readFileSync('dist/assets/index-Ci-O52-t.css', 'utf8');
const fonts = css.match(/@font-face\s*\{[^}]+\}/g) || [];
console.log('Font-face count in index.css:', fonts.length);
fonts.forEach(f => {
  const family = f.match(/font-family:\s*([^;]+)/)?.[1];
  const url = f.match(/url\(['"]?([^'"]+)/)?.[1];
  const display = f.match(/font-display:\s*([^;]+)/)?.[1];
  console.log(family, '->', url, 'display:', display);
});
