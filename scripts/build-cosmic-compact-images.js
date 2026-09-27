#!/usr/bin/env node
/**
 * Offline mobile variants of the six visible cosmic hero decorations.
 * Run: node scripts/build-cosmic-compact-images.js
 *
 * Widths cover the compact scene's CSS caps at DPR 3. Original desktop
 * assets remain untouched. Transparent edges retain lossless alpha.
 */
import { readFile, writeFile } from 'node:fs/promises';
import sharp from 'sharp';

const config = JSON.parse(await readFile(
  new URL('../src/app/data/cosmicCompactImages.json', import.meta.url), 'utf8',
));
const imageDirectory = new URL('../public/images/cosmic/', import.meta.url);
let originalBytes = 0;
let compactBytes = 0;

for (const [name, width] of Object.entries(config.widths)) {
  if (!/^(moon|shard)\d+$/.test(name) || !Number.isInteger(width) || width < 1) {
    throw new Error(`Invalid compact cosmic image: ${name} (${width})`);
  }
  const original = await readFile(new URL(`${name}.webp`, imageDirectory));
  const metadata = await sharp(original).metadata();
  if (!metadata.hasAlpha || !metadata.width || metadata.width < width) {
    throw new Error(`${name}: expected a larger source image with alpha`);
  }
  const { data, info } = await sharp(original)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: config.quality, alphaQuality: 100, effort: 6, smartSubsample: true })
    .toBuffer({ resolveWithObject: true });
  const compactMetadata = await sharp(data).metadata();
  if (!compactMetadata.hasAlpha || info.width !== width || data.length >= original.length) {
    throw new Error(`${name}: compact image must preserve alpha/width and reduce bytes`);
  }
  await writeFile(new URL(`${name}-compact.webp`, imageDirectory), data);
  originalBytes += original.length;
  compactBytes += data.length;
  console.log(`${name}: ${metadata.width}×${metadata.height} → ${info.width}×${info.height}, ${original.length} → ${data.length} bytes`);
}

console.log(`Total: ${originalBytes} → ${compactBytes} bytes; saved ${originalBytes - compactBytes} (${((1 - compactBytes / originalBytes) * 100).toFixed(1)}%)`);
