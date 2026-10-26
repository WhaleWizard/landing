const fs = require('fs');

let gen = fs.readFileSync('scripts/generate-pages.js', 'utf8');
const target = "if (/[A-Za-z0-9\\s]/u.test(text) || subsets.length === 0 || (font.dir === 'hero' && /[A-Za-z0-9]/u.test(text))) subsets.push('latin');";
const replacement = "if (/[A-Za-z0-9]/u.test(text) || subsets.length === 0) subsets.push('latin');";

if (gen.includes(target)) {
  gen = gen.replace(target, replacement);
  fs.writeFileSync('scripts/generate-pages.js', gen, 'utf8');
  console.log('Successfully replaced line 1064');
} else {
  console.log('Target not found in generate-pages.js');
}
