const fs = require('fs');

let code = fs.readFileSync('src/app/components/service-heroes/ConsultDeskScene.tsx', 'utf8');

// 1. Remove aria-hidden="true" from the root .cds element
code = code.replace(
  '<div className="cds" ref={rootRef} aria-hidden="true">',
  '<div className="cds" ref={rootRef}>'
);

// 2. Set loading="lazy" and fetchpriority="low" for secondary pieces, and remove aria-hidden="true" from main pieces
code = code.replace(
  '          loading="eager"\r\n' +
  "          fetchpriority={p.file === 'laptop' || p.file === 'notebook' ? 'high' : 'auto'}\r\n" +
  '          decoding="async"\r\n' +
  '          aria-hidden="true"',
  "          loading={p.file === 'laptop' || p.file === 'notebook' ? 'eager' : 'lazy'}\r\n" +
  "          fetchpriority={p.file === 'laptop' || p.file === 'notebook' ? 'high' : 'low'}\r\n" +
  '          decoding="async"'
);

// Also handle LF if present
code = code.replace(
  '          loading="eager"\n' +
  "          fetchpriority={p.file === 'laptop' || p.file === 'notebook' ? 'high' : 'auto'}\n" +
  '          decoding="async"\n' +
  '          aria-hidden="true"',
  "          loading={p.file === 'laptop' || p.file === 'notebook' ? 'eager' : 'lazy'}\n" +
  "          fetchpriority={p.file === 'laptop' || p.file === 'notebook' ? 'high' : 'low'}\n" +
  '          decoding="async"'
);

fs.writeFileSync('src/app/components/service-heroes/ConsultDeskScene.tsx', code, 'utf8');
console.log('Successfully updated ConsultDeskScene.tsx for proper LCP identification');
