import fs from 'node:fs';

const content = JSON.parse(fs.readFileSync('data/site-content.local.json', 'utf8'));
console.log('meta-ads hero in site-content.local.json:');
console.log(content.sections['service:meta-ads']?.hero);
