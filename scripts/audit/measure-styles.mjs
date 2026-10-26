import fs from 'node:fs';

const files = [
  'src/styles/fonts.css',
  'src/styles/tailwind.css',
  'src/styles/theme.css',
  'src/styles/blog-readable.css',
  'src/styles/whale-brand.css',
  'src/styles/index.css'
];

for (const f of files) {
  const content = fs.readFileSync(f, 'utf8');
  console.log(`${f}: ${content.length} chars, ${content.split('\n').length} lines`);
}
