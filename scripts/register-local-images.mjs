import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import {
  ARTICLE_IMAGES_DIR,
  ARTICLE_IMAGES_GENERATED_MODULE_PATH,
  ARTICLE_IMAGES_MANIFEST_PATH,
  readArticleImageManifest,
  variantWidths,
} from './article-image-manifest.js';
import { imageId } from './optimize-article-images.js';

const WEBP_QUALITY = 80;

function variantFile(entry, width) {
  return join(ARTICLE_IMAGES_DIR, `${entry.id}-${width}.webp`);
}

async function processLocalImage(url, sourcePath) {
  const buffer = readFileSync(sourcePath);
  const image = sharp(buffer, { failOn: 'none', animated: false });
  const metadata = await image.metadata();
  const width = metadata.width;
  const height = metadata.height;
  const widths = variantWidths(width);
  const entry = { id: imageId(url), width, height, widths, sourceBytes: buffer.length };

  mkdirSync(ARTICLE_IMAGES_DIR, { recursive: true });
  for (const targetWidth of widths) {
    await sharp(buffer, { failOn: 'none', animated: false })
      .rotate()
      .resize({ width: targetWidth, withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY, effort: 5, smartSubsample: true })
      .toFile(variantFile(entry, targetWidth));
  }
  return entry;
}

function serializeManifest(images) {
  const ordered = Object.fromEntries(Object.keys(images).sort().map((url) => [url, images[url]]));
  return `${JSON.stringify({ version: 1, images: ordered }, null, 2)}\n`;
}

function serializeGeneratedModule(images) {
  const entries = Object.keys(images)
    .sort()
    .map((url) => {
      const { id, width, height, widths } = images[url];
      return `  ${JSON.stringify(url)}: { id: ${JSON.stringify(id)}, width: ${width}, height: ${height}, widths: [${widths.join(', ')}] },`;
    })
    .join('\n');

  return `// Сгенерировано scripts/optimize-article-images.js — не править руками.
// Исходный адрес картинки статьи → готовые WebP-варианты в /images/articles/.
export type ArticleImageManifestEntry = {
  id: string;
  width: number;
  height: number;
  widths: number[];
};

export const ARTICLE_IMAGE_MANIFEST: Record<string, ArticleImageManifestEntry> = {
${entries}
};
`;
}

async function run() {
  const images = { ...readArticleImageManifest() };

  const item1Url = 'https://whalewzrd.com/images/articles/meta-ads-infobiz-funnel.jpg';
  const item1File = 'C:/Users/Asus/.gemini/antigravity/brain/94b038fa-3316-49cf-aeed-465a7057edc6/meta_ads_infobiz_funnel_png_1794575815344.jpg';
  images[item1Url] = await processLocalImage(item1Url, item1File);
  console.log(`✓ Image 1 processed: ${images[item1Url].id} (${images[item1Url].width}x${images[item1Url].height})`);

  const item2Url = 'https://whalewzrd.com/images/articles/mobile-app-user-acquisition.jpg';
  const item2File = 'C:/Users/Asus/.gemini/antigravity/brain/94b038fa-3316-49cf-aeed-465a7057edc6/mobile_app_user_acquisition_png_1794575834315.jpg';
  images[item2Url] = await processLocalImage(item2Url, item2File);
  console.log(`✓ Image 2 processed: ${images[item2Url].id} (${images[item2Url].width}x${images[item2Url].height})`);

  writeFileSync(ARTICLE_IMAGES_MANIFEST_PATH, serializeManifest(images), 'utf8');
  writeFileSync(ARTICLE_IMAGES_GENERATED_MODULE_PATH, serializeGeneratedModule(images), 'utf8');
  console.log('✓ Manifest and generated module updated.');
}

run();
