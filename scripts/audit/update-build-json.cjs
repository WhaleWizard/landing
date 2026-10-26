const fs = require('fs');

let s = fs.readFileSync('data/site-content.build.json', 'utf8');
s = s.replace(/"font": "pangolin"/g, '"font": "prata"');
fs.writeFileSync('data/site-content.build.json', s, 'utf8');
console.log('Updated site-content.build.json to prata');
