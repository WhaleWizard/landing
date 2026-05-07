import fs from 'node:fs/promises';
import path from 'node:path';

const imageDir = path.resolve('public/images');
const iconDir = path.resolve('public/icons');
const videoDir = path.resolve('public/videos');

const requiredImages = ['meta.jpg', 'google.svg', 'consult.svg'];
const requiredVideos = ['meta-hero.mp4', 'google-hero.mp4', 'consult-hero.mp4'];

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function reportFolder(folder, expectedFiles) {
  for (const name of expectedFiles) {
    const fullPath = path.join(folder, name);
    const exists = await fileExists(fullPath);
    console.log(`${exists ? '✅' : '⚠️'} ${name} ${exists ? 'found' : 'missing'}`);
  }
}

async function run() {
  await ensureDir(imageDir);
  await ensureDir(iconDir);
  await ensureDir(videoDir);

  console.log('Media folders are ready:');
  console.log(`- ${imageDir}`);
  console.log(`- ${iconDir}`);
  console.log(`- ${videoDir}`);

  console.log('\nRequired hero images:');
  await reportFolder(imageDir, requiredImages);

  console.log('\nRequired hero videos (one unique file per page):');
  await reportFolder(videoDir, requiredVideos);

  console.log('\nUpload files manually to these folders. UI will auto-pick page-specific video first, then image fallback.');
}

run().catch((error) => {
  console.error('Media preparation failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
