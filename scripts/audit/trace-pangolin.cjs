const fs = require('fs');

// Let's run generate-pages logic on meta-ads
const contentFile = fs.readFileSync('scripts/generate-pages.js', 'utf8');
const fontLibraryMatch = contentFile.match(/const FONT_LIBRARY = (\[[\s\S]*?\]);/);
const FONT_LIBRARY = eval(fontLibraryMatch[1]);
const FONT_LIBRARY_BY_ID = new Map(FONT_LIBRARY.map((font) => [font.id, font]));

console.log('Font library size:', FONT_LIBRARY.length);
// Check published content
const pub = fs.existsSync('data/site-content.build.json') ? JSON.parse(fs.readFileSync('data/site-content.build.json', 'utf8')) : {};
console.log('Published content keys:', Object.keys(pub));
console.log('service:meta-ads in pub:', pub['service:meta-ads']);
