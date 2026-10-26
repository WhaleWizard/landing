const fs = require('fs');
let s = fs.readFileSync('src/styles/index.css', 'utf8');

const target = `html[data-ww-prehydrate] :is(.ww-ambient-motion, .cosmic-stage *) {
  animation-play-state: paused;
}`;

const replacement = `html[data-ww-prehydrate] :is(.ww-ambient-motion, .cosmic-stage *:not(.cosmic-sky)) {
  animation-play-state: paused;
}`;

const normalized = s.replace(/\r\n/g, '\n');
if (!normalized.includes(target)) {
  console.error('Target not found in index.css');
  process.exit(1);
}
fs.writeFileSync('src/styles/index.css', normalized.replace(target, replacement).replace(/\n/g, '\r\n'), 'utf8');
console.log('Successfully patched index.css');
