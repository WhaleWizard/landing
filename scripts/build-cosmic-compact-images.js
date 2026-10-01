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

/*
 * Фон неба — без прозрачности и сжимается с потерями: на телефоне сцена
 * занимает не больше 900 CSS px в ширину, а исходные 2048 px нужны только
 * широкому экрану. Для iPhone с DPR 3 ширины 1400 px хватает: небо — мягкий
 * градиент без мелких деталей, и лёгкое масштабирование на нём не читается.
 * Именно эта картинка — LCP главной на телефоне, поэтому её вес важнее всего.
 */
for (const [name, options] of Object.entries(config.backgrounds || {})) {
  const original = await readFile(new URL(`${name}.webp`, imageDirectory));
  const metadata = await sharp(original).metadata();
  if (!metadata.width || metadata.width < options.width) throw new Error(`${name}: source is narrower than ${options.width}`);
  const { data, info } = await sharp(original)
    .resize({ width: options.width, withoutEnlargement: true })
    .webp({ quality: options.quality, effort: 6, smartSubsample: true })
    .toBuffer({ resolveWithObject: true });
  if (info.width !== options.width || data.length >= original.length) {
    throw new Error(`${name}: compact background must keep the requested width and reduce bytes`);
  }
  await writeFile(new URL(`${name}-compact.webp`, imageDirectory), data);
  originalBytes += original.length;
  compactBytes += data.length;
  console.log(`${name}: ${metadata.width}×${metadata.height} → ${info.width}×${info.height}, ${original.length} → ${data.length} bytes`);
}

console.log(`Total: ${originalBytes} → ${compactBytes} bytes; saved ${originalBytes - compactBytes} (${((1 - compactBytes / originalBytes) * 100).toFixed(1)}%)`);
