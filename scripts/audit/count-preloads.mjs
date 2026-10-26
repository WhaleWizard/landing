import fs from 'node:fs';

const html = fs.readFileSync('dist/index.html', 'utf8');
const preloads = html.match(/<link[^>]+rel=["']modulepreload["'][^>]*>/g) || [];
console.log('Total modulepreloads on /:', preloads.length);
let totalBytes = 0;
for (const p of preloads) {
  const href = p.match(/href=["']([^"']+)["']/)?.[1];
  if (href) {
    const stat = fs.statSync(`dist${href}`);
    totalBytes += stat.size;
    console.log(`  ${href} (${(stat.size / 1024).toFixed(1)} KB)`);
  }
}
console.log(`Total JS preloaded in <head>: ${(totalBytes / 1024).toFixed(1)} KB`);
