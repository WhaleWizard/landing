const fs = require('fs');
let s = fs.readFileSync('scripts/generate-pages.js', 'utf8');

const t = `  title: [
    'margin:0',
    'max-width:760px',
    'font-size:clamp(34px,7vw,68px)',
    'line-height:.96',
    'letter-spacing:-.055em',
    'font-weight:850',
  ].join(';'),`;

const r = `  title: [
    'margin:0',
    'max-width:760px',
    'font-size:clamp(40px,9.8vw,68px)',
    'line-height:1.14',
    'letter-spacing:-.045em',
    'font-weight:850',
  ].join(';'),`;

const normalized = s.replace(/\r\n/g, '\n');
if (!normalized.includes(t)) {
  console.error('Target not found in generate-pages.js');
  process.exit(1);
}

const patched = normalized.replace(t, r);
fs.writeFileSync('scripts/generate-pages.js', patched.replace(/\n/g, '\r\n'), 'utf8');
console.log('Successfully patched title styles in scripts/generate-pages.js');
