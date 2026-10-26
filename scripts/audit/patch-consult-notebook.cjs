const fs = require('fs');
let s = fs.readFileSync('src/app/components/service-heroes/ConsultDeskScene.tsx', 'utf8');

const t = `function Layer({ items }: { items: Piece[] }) {
  return (
    <>
      {items.map((p) => (
        <img
          key={p.file}
          className={\`cds-obj \${p.cls}\`}
          src={\`/images/consult-proof/scene/\${p.file}.webp\`}
          srcSet={p.file === 'laptop' ? '/images/consult-proof/scene/laptop-mobile.webp 480w, /images/consult-proof/scene/laptop.webp 720w' : undefined}
          sizes={p.file === 'laptop' ? '(max-width: 1023px) 240px, 720px' : undefined}
          alt=""
          loading={p.file === 'laptop' ? 'eager' : 'lazy'}
          fetchpriority={p.file === 'laptop' ? 'high' : 'low'}
          decoding="async"
          aria-hidden="true"
        />
      ))}
    </>
  );
}`;

const r = `function Layer({ items }: { items: Piece[] }) {
  return (
    <>
      {items.map((p) => (
        <img
          key={p.file}
          className={\`cds-obj \${p.cls}\`}
          src={\`/images/consult-proof/scene/\${p.file}.webp\`}
          srcSet={
            p.file === 'laptop'
              ? '/images/consult-proof/scene/laptop-mobile.webp 480w, /images/consult-proof/scene/laptop.webp 720w'
              : p.file === 'notebook'
              ? '/images/consult-proof/scene/notebook-mobile.webp 400w, /images/consult-proof/scene/notebook.webp 700w'
              : undefined
          }
          sizes={
            p.file === 'laptop'
              ? '(max-width: 1023px) 240px, 720px'
              : p.file === 'notebook'
              ? '(max-width: 1023px) 210px, 700px'
              : undefined
          }
          alt=""
          loading={p.file === 'laptop' || p.file === 'notebook' ? 'eager' : 'lazy'}
          fetchpriority={p.file === 'laptop' || p.file === 'notebook' ? 'high' : 'low'}
          decoding="async"
          aria-hidden="true"
        />
      ))}
    </>
  );
}`;

const normalized = s.replace(/\r\n/g, '\n');
if (!normalized.includes(t)) {
  console.error('Target not found in ConsultDeskScene.tsx');
  process.exit(1);
}

const patched = normalized.replace(t, r);
fs.writeFileSync('src/app/components/service-heroes/ConsultDeskScene.tsx', patched.replace(/\n/g, '\r\n'), 'utf8');
console.log('Successfully patched ConsultDeskScene.tsx');
