const fs = require('fs');

// Patch consult-desk-scene.css
let css = fs.readFileSync('src/styles/consult-desk-scene.css', 'utf8');
const cssTarget = `  .cds-laptop   { left: 44%;  top: 6%;    width: 47%; }`;
const cssReplacement = `  .cds-obj      { opacity: 1; animation: none; }\n  .cds-laptop   { left: 44%;  top: 6%;    width: 47%; }`;

const normCss = css.replace(/\r\n/g, '\n');
if (!normCss.includes(cssTarget)) {
  console.error('cssTarget not found');
  process.exit(1);
}
fs.writeFileSync('src/styles/consult-desk-scene.css', normCss.replace(cssTarget, cssReplacement).replace(/\n/g, '\r\n'), 'utf8');
console.log('Successfully patched consult-desk-scene.css');

// Patch ConsultDeskScene.tsx
let tsx = fs.readFileSync('src/app/components/service-heroes/ConsultDeskScene.tsx', 'utf8');
const tsxTarget = `    const planes: [HTMLElement, number, number][] = [];`;
const tsxReplacement = `    if (compact) {\n      build();\n      return;\n    }\n\n    const planes: [HTMLElement, number, number][] = [];`;

const normTsx = tsx.replace(/\r\n/g, '\n');
if (!normTsx.includes(tsxTarget)) {
  console.error('tsxTarget not found');
  process.exit(1);
}
fs.writeFileSync('src/app/components/service-heroes/ConsultDeskScene.tsx', normTsx.replace(tsxTarget, tsxReplacement).replace(/\n/g, '\r\n'), 'utf8');
console.log('Successfully patched ConsultDeskScene.tsx');
