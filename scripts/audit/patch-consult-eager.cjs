const fs = require('fs');
let s = fs.readFileSync('src/app/components/service-heroes/ConsultDeskScene.tsx', 'utf8');

const t = `          loading={p.file === 'laptop' || p.file === 'notebook' ? 'eager' : 'lazy'}
          fetchpriority={p.file === 'laptop' || p.file === 'notebook' ? 'high' : 'low'}`;

const r = `          loading="eager"
          fetchpriority={p.file === 'laptop' || p.file === 'notebook' ? 'high' : 'auto'}`;

const normalized = s.replace(/\r\n/g, '\n');
if (!normalized.includes(t)) {
  console.error('Target not found in ConsultDeskScene.tsx');
  process.exit(1);
}

const patched = normalized.replace(t, r);
fs.writeFileSync('src/app/components/service-heroes/ConsultDeskScene.tsx', patched.replace(/\n/g, '\r\n'), 'utf8');
console.log('Successfully restored eager loading on ConsultDeskScene.tsx');
