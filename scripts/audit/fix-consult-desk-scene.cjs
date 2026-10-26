const fs = require('fs');
let s = fs.readFileSync('src/app/components/service-heroes/ConsultDeskScene.tsx', 'utf8');

const target1 = `    if (compact) {
      build();
      return;
    }

    const planes: [HTMLElement, number, number][] = [];`;

const replacement1 = `    const planes: [HTMLElement, number, number][] = [];`;

const target2 = `    build();

    const visibility = typeof IntersectionObserver === 'undefined'`;

const replacement2 = `    build();

    if (compact) {
      paint(0);
      return () => {
        observer?.disconnect();
        if (!observer) window.removeEventListener('resize', handleWindowResize);
      };
    }

    const visibility = typeof IntersectionObserver === 'undefined'`;

const normalized = s.replace(/\r\n/g, '\n');
if (!normalized.includes(target1) || !normalized.includes(target2)) {
  console.error('Targets not found', { t1: normalized.includes(target1), t2: normalized.includes(target2) });
  process.exit(1);
}

let patched = normalized.replace(target1, replacement1).replace(target2, replacement2);
fs.writeFileSync('src/app/components/service-heroes/ConsultDeskScene.tsx', patched.replace(/\n/g, '\r\n'), 'utf8');
console.log('Successfully fixed ConsultDeskScene.tsx');
