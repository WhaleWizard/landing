import fs from 'node:fs';
import path from 'node:path';

const manifest = JSON.parse(fs.readFileSync('dist/.vite/manifest.json', 'utf8'));

// Find CookiePolicy entry
const cpEntry = Object.entries(manifest).find(([k, v]) => k.includes('CookiePolicy.tsx'));
console.log('CookiePolicy entry:', cpEntry?.[0]);

function traceMotion(key, visited = new Set()) {
  if (visited.has(key)) return false;
  visited.add(key);
  const item = manifest[key];
  if (!item) return false;
  if (item.file.includes('motion')) {
    console.log('Found motion import from:', key);
    return true;
  }
  for (const imp of item.imports || []) {
    if (traceMotion(imp, visited)) {
      console.log('  <- imported by', key);
      return true;
    }
  }
  return false;
}

traceMotion(cpEntry[0]);
