import fs from 'node:fs';

let html = fs.readFileSync('dist/index.html', 'utf8');

const globalCssMatch = html.match(/<link rel="stylesheet" crossorigin href="\/assets\/index-[^"]+\.css">/);
const cosmicCssMatch = html.match(/<link rel="stylesheet" crossorigin href="\/assets\/cosmic-hero-[^"]+\.css" \/>/);
const heroTitleCssMatch = html.match(/<link rel="stylesheet" crossorigin href="\/assets\/HeroTitleEffect-[^"]+\.css" \/>/);

const skyCompactPreload = html.match(/<link rel="preload" as="image" href="\/images\/cosmic\/sky-compact\.webp"[^>]*\/>/);
const skyPreload = html.match(/<link rel="preload" as="image" href="\/images\/cosmic\/sky\.webp"[^>]*\/>/);
const whalePreload = html.match(/<link rel="preload" as="image" href="\/images\/cosmic\/whale\.webp"[^>]*\/>/);

if (!globalCssMatch || !cosmicCssMatch || !heroTitleCssMatch || !skyCompactPreload) {
  console.error('Failed to match elements:', {
    global: !!globalCssMatch,
    cosmic: !!cosmicCssMatch,
    title: !!heroTitleCssMatch,
    sky: !!skyCompactPreload
  });
  process.exit(1);
}

// Remove from old spots
html = html.replace(globalCssMatch[0], '');
html = html.replace(cosmicCssMatch[0], '');
html = html.replace(heroTitleCssMatch[0], '');
html = html.replace(skyCompactPreload[0], '');
if (skyPreload) html = html.replace(skyPreload[0], '');
if (whalePreload) html = html.replace(whalePreload[0], '');

// Group critical CSS and image preloads
const criticalBlock = [
  globalCssMatch[0],
  cosmicCssMatch[0],
  heroTitleCssMatch[0],
  skyCompactPreload[0],
  skyPreload ? skyPreload[0] : '',
  whalePreload ? whalePreload[0] : ''
].filter(Boolean).join('\n    ');

// Insert right before <style>html, body
html = html.replace('<style>html, body', `${criticalBlock}\n    <style>html, body`);

fs.writeFileSync('dist/index.html', html, 'utf8');
console.log('Reordered dist/index.html successfully');
