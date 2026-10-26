const fs = require('fs');
let s = fs.readFileSync('src/app/utils/firstScreen.ts', 'utf8');

const target = `export function hasGeneratedFirstScreen(pathname: string, locationKey: string): boolean {
  const generatedRoute = generatedFirstScreenRoute();
  return locationKey === initialEntryKey && generatedRoute !== null && generatedRoute === normalizeRoute(pathname);
}`;

const replacement = `export function isInitialEntry(locationKey: string): boolean {
  if (typeof window === 'undefined') return true;
  return locationKey === initialEntryKey;
}

export function hasGeneratedFirstScreen(pathname: string, locationKey: string): boolean {
  const generatedRoute = generatedFirstScreenRoute();
  return locationKey === initialEntryKey && generatedRoute !== null && generatedRoute === normalizeRoute(pathname);
}`;

const normalized = s.replace(/\r\n/g, '\n');
if (!normalized.includes(target)) {
  console.error('Target not found in firstScreen.ts');
  process.exit(1);
}
fs.writeFileSync('src/app/utils/firstScreen.ts', normalized.replace(target, replacement).replace(/\n/g, '\r\n'), 'utf8');
console.log('Successfully patched firstScreen.ts');
