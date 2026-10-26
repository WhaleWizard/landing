import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const htmlPath = 'dist/cookie-policy/index.html';
const backupPath = 'dist/cookie-policy/index.html.bak';

const originalHtml = fs.readFileSync(htmlPath, 'utf8');
fs.writeFileSync(backupPath, originalHtml, 'utf8');

const cssMatch = originalHtml.match(/<link[^>]+rel=["']stylesheet["'][^>]+href=["'](\/assets\/index-[^"']+\.css)["'][^>]*>/i);
if (!cssMatch) {
  console.log('No global css link found in HTML');
  process.exit(1);
}

const cssFile = path.join('dist', cssMatch[1].slice(1));
const cssContent = fs.readFileSync(cssFile, 'utf8');
console.log(`Inlining CSS: ${cssFile} (${cssContent.length} bytes)...`);

const inlinedHtml = originalHtml.replace(cssMatch[0], `<style>${cssContent}</style>`);
fs.writeFileSync(htmlPath, inlinedHtml, 'utf8');

console.log('Running LHCI on /cookie-policy/ with inlined CSS...');
if (fs.existsSync('.lighthouseci')) {
  for (const f of fs.readdirSync('.lighthouseci')) {
    if (f.endsWith('.json') || f.endsWith('.html')) {
      try { fs.unlinkSync(path.join('.lighthouseci', f)); } catch {}
    }
  }
}

try {
  execSync('npx lhci collect --no-lighthouserc --staticDistDir=dist --url="http://localhost/cookie-policy/" --numberOfRuns=1', { stdio: 'inherit' });
} finally {
  // restore backup
  fs.writeFileSync(htmlPath, originalHtml, 'utf8');
  fs.unlinkSync(backupPath);
  console.log('Restored original HTML.');
}
