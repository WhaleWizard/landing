import fs from 'node:fs';

const html = fs.readFileSync('dist/meta-ads/index.html', 'utf8');
const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1] || '';

// Print links and preloads in order
const links = head.match(/<(?:link|script)[^>]+>/g) || [];
for (const l of links) {
  console.log(l);
}
