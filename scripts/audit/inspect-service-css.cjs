const fs = require('fs');
const manifest = JSON.parse(fs.readFileSync('dist/.vite/manifest.json', 'utf8'));
const entry = manifest['src/app/pages/ServiceLandingPage.tsx'];
console.log('ServiceLandingPage css:', entry?.css);
console.log('ServiceLandingPage imports:', entry?.imports);
for (const imp of entry?.imports || []) {
  const item = manifest[imp];
  if (item?.css) console.log(`  import ${imp} has css:`, item.css);
}
