const fs = require('fs');
let s = fs.readFileSync('src/app/utils/contentTypography.ts', 'utf8');
const target = `    void fontSet?.ready.then(() => {
      if (cancelled) return;
      fontRevision += 1;
      scheduleFit();
    }).catch(() => undefined);`;

const replacement = `    void fontSet?.ready.then(() => {
      if (cancelled) return;
      const isAnyFontPending = titleFontFamilies.size > 0
        && [...titleFontFamilies].some((family) => !document.fonts?.check?.(\`16px "\${family}"\`));
      if (measuredOnce && !isAnyFontPending) return;
      fontRevision += 1;
      scheduleFit();
    }).catch(() => undefined);`;

const normalizedS = s.replace(/\r\n/g, '\n');
if (!normalizedS.includes(target)) {
  console.error('Target not found in contentTypography.ts');
  process.exit(1);
}
const updated = normalizedS.replace(target, replacement);
fs.writeFileSync('src/app/utils/contentTypography.ts', updated.replace(/\n/g, '\r\n'), 'utf8');
console.log('Successfully patched contentTypography.ts');
