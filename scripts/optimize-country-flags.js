import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const dir = 'public/images/country-flags';
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.svg'));

async function run() {
  console.log(`Converting ${files.length} SVG flags to 72x54 WebP...`);
  let totalSaved = 0;
  for (const file of files) {
    const code = path.basename(file, '.svg');
    const svgPath = path.join(dir, file);
    const webpPath = path.join(dir, `${code}.webp`);
    const svgStat = fs.statSync(svgPath);
    await sharp(svgPath)
      .resize(72, 54, { fit: 'fill' })
      .webp({ quality: 90 })
      .toFile(webpPath);
    const webpStat = fs.statSync(webpPath);
    totalSaved += (svgStat.size - webpStat.size);
  }
  console.log(`Done! Total saved: ${(totalSaved / (1024 * 1024)).toFixed(2)} MB`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
