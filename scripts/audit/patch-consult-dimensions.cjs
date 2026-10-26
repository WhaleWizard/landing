const fs = require('fs');

// 1. Patch ConsultDeskScene.tsx
let cds = fs.readFileSync('src/app/components/service-heroes/ConsultDeskScene.tsx', 'utf8');

const dimConst = `const PIECE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  laptop: { width: 720, height: 693 },
  notebook: { width: 700, height: 582 },
  obj1: { width: 320, height: 265 },
  obj3: { width: 320, height: 297 },
  paper1: { width: 260, height: 258 },
  paper2: { width: 254, height: 233 },
  paper3: { width: 260, height: 270 },
  paper4: { width: 260, height: 170 },
};\n\n`;

const targetLayer = `function Layer({ items }: { items: Piece[] }) {
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
          loading="eager"
          fetchpriority={p.file === 'laptop' || p.file === 'notebook' ? 'high' : 'auto'}
          decoding="async"
          aria-hidden="true"
        />
      ))}
    </>
  );
}`;

const replaceLayer = `function Layer({ items }: { items: Piece[] }) {
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
          width={PIECE_DIMENSIONS[p.file]?.width}
          height={PIECE_DIMENSIONS[p.file]?.height}
          alt=""
          loading="eager"
          fetchpriority={p.file === 'laptop' || p.file === 'notebook' ? 'high' : 'auto'}
          decoding="async"
          aria-hidden="true"
        />
      ))}
    </>
  );
}`;

let normalizedCds = cds.replace(/\r\n/g, '\n');
if (!normalizedCds.includes('const PIECE_DIMENSIONS')) {
  normalizedCds = normalizedCds.replace('function Layer', dimConst + 'function Layer');
}
normalizedCds = normalizedCds.replace(targetLayer, replaceLayer);
fs.writeFileSync('src/app/components/service-heroes/ConsultDeskScene.tsx', normalizedCds.replace(/\n/g, '\r\n'), 'utf8');

// 2. Patch consult-desk-scene.css to add height: auto on .cds-obj
let css = fs.readFileSync('src/styles/consult-desk-scene.css', 'utf8');
let normalizedCss = css.replace(/\r\n/g, '\n');
const tCss = `.cds-obj {
  position: absolute;
  display: block;`;
const rCss = `.cds-obj {
  position: absolute;
  display: block;
  height: auto;`;
normalizedCss = normalizedCss.replace(tCss, rCss);
fs.writeFileSync('src/styles/consult-desk-scene.css', normalizedCss.replace(/\n/g, '\r\n'), 'utf8');

// 3. Patch scripts/generate-pages.js: remove priority: true from desk-v-800 so laptop-mobile is prioritized
let gp = fs.readFileSync('scripts/generate-pages.js', 'utf8');
let normalizedGp = gp.replace(/\r\n/g, '\n');
const tGp = `    {
      href: '/images/consult-proof/desk-v-800.webp',
      priority: true,
      media: '(max-width: 1023px)',
      imageSrcSet: '/images/consult-proof/desk-v-800.webp 2x, /images/consult-proof/desk-v.webp 3x',
    },`;
const rGp = `    {
      href: '/images/consult-proof/desk-v-800.webp',
      media: '(max-width: 1023px)',
      imageSrcSet: '/images/consult-proof/desk-v-800.webp 2x, /images/consult-proof/desk-v.webp 3x',
    },`;
normalizedGp = normalizedGp.replace(tGp, rGp);
fs.writeFileSync('scripts/generate-pages.js', normalizedGp.replace(/\n/g, '\r\n'), 'utf8');

console.log('Successfully applied consult image dimensions and priority updates');
