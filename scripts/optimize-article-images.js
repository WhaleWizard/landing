#!/usr/bin/env node
/**
 * Оптимизация картинок статей и кейсов на сборке.
 *
 * Обложки статей загружены в CMS ссылками на ImgBB — PNG по 1,3–2 МБ каждая,
 * а фотографии кейсов лежат в R2 по 0,3–0,8 МБ без размеров. Страница статьи
 * на телефоне ждала такую обложку 11–17 секунд, а список блога тянул их
 * десяток. Менять адреса в самой CMS не нужно: скрипт скачивает оригиналы,
 * пережимает их в WebP четырёх ширин в `public/images/articles/` и пишет
 * манифест «исходный адрес → варианты». Сайт подставляет варианты на лету,
 * а неизвестный адрес (новая статья до следующей сборки) показывается как есть.
 *
 * Правила осторожности:
 * — файлы коммитятся: повторная сборка ничего не скачивает заново;
 * — без `sharp` или без сети скрипт предупреждает и выходит нулём — сборка
 *   продолжается с тем, что уже лежит в репозитории;
 * — черновики не обрабатываются, чтобы не тащить в репозиторий чужое.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUILD_ARTICLES_PATH, LOCAL_ARTICLES_PATH, PUBLIC_SEED_PATH } from './config.js';
import {
  ARTICLE_IMAGES_DIR,
  ARTICLE_IMAGES_GENERATED_MODULE_PATH,
  ARTICLE_IMAGES_MANIFEST_PATH,
  collectArticleImageUrls,
  readArticleImageManifest,
  variantWidths,
} from './article-image-manifest.js';

const WEBP_QUALITY = 80;
const DOWNLOAD_TIMEOUT_MS = 30_000;
const DOWNLOAD_RETRIES = 2;
const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

function readArticles(pathname) {
  if (!existsSync(pathname)) return null;
  try {
    const payload = JSON.parse(readFileSync(pathname, 'utf8'));
    const articles = Array.isArray(payload) ? payload : payload?.articles;
    return Array.isArray(articles) ? articles : null;
  } catch {
    return null;
  }
}

function loadArticles() {
  return readArticles(BUILD_ARTICLES_PATH)
    || readArticles(LOCAL_ARTICLES_PATH)
    || readArticles(PUBLIC_SEED_PATH)
    || [];
}

export function imageId(url) {
  return createHash('sha1').update(url).digest('hex').slice(0, 12);
}

function variantFile(entry, width) {
  return join(ARTICLE_IMAGES_DIR, `${entry.id}-${width}.webp`);
}

function isEntryComplete(entry) {
  return Boolean(entry)
    && typeof entry.id === 'string'
    && Array.isArray(entry.widths)
    && entry.widths.length > 0
    && entry.widths.every((width) => existsSync(variantFile(entry, width)));
}

async function download(url) {
  let lastError;
  for (let attempt = 0; attempt <= DOWNLOAD_RETRIES; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
        headers: { 'User-Agent': 'WhaleWizardImageOptimizer/1.0 (+https://www.whalewzrd.com)' },
        redirect: 'follow',
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const type = String(response.headers.get('content-type') || '');
      if (!type.startsWith('image/')) throw new Error(`not an image: ${type || 'unknown type'}`);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length === 0) throw new Error('empty body');
      if (buffer.length > MAX_SOURCE_BYTES) throw new Error(`source too large: ${buffer.length} bytes`);
      return buffer;
    } catch (error) {
      lastError = error;
      if (attempt < DOWNLOAD_RETRIES) await new Promise((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function processImage(sharp, url, buffer) {
  const image = sharp(buffer, { failOn: 'none', animated: false });
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error('unable to read dimensions');

  // Фото с телефона хранят поворот в EXIF: без учёта ориентации ширина и
  // высота меняются местами, и место под картинку резервируется не той формы.
  const rotated = typeof metadata.orientation === 'number' && metadata.orientation >= 5;
  const width = rotated ? metadata.height : metadata.width;
  const height = rotated ? metadata.width : metadata.height;
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

export const ARTICLE_IMAGE_MANIFEST: Readonly<Record<string, ArticleImageManifestEntry>> = {
${entries}
};
`;
}

function pruneUnusedFiles(images) {
  if (!existsSync(ARTICLE_IMAGES_DIR)) return 0;
  const keep = new Set();
  for (const entry of Object.values(images)) {
    for (const width of entry.widths) keep.add(`${entry.id}-${width}.webp`);
  }
  let removed = 0;
  for (const file of readdirSync(ARTICLE_IMAGES_DIR)) {
    if (!file.endsWith('.webp') || keep.has(file)) continue;
    unlinkSync(join(ARTICLE_IMAGES_DIR, file));
    removed += 1;
  }
  return removed;
}

export async function optimizeArticleImages({ log = console } = {}) {
  const articles = loadArticles();
  const urls = collectArticleImageUrls(articles);
  const previous = readArticleImageManifest();
  const images = {};
  let reused = 0;
  let generated = 0;
  let failed = 0;

  let sharp = null;
  try {
    sharp = (await import('sharp')).default;
  } catch (error) {
    log.warn(`[article-images] sharp недоступен (${error?.message || error}); используем уже собранные картинки`);
  }

  for (const url of urls) {
    const existing = previous[url];
    if (isEntryComplete(existing)) {
      images[url] = existing;
      reused += 1;
      continue;
    }
    if (!sharp) {
      failed += 1;
      continue;
    }
    try {
      const buffer = await download(url);
      images[url] = await processImage(sharp, url, buffer);
      generated += 1;
      const largest = images[url].widths[images[url].widths.length - 1];
      log.info(`[article-images] ${url} → ${images[url].id} (${images[url].width}×${images[url].height}, до ${largest}px)`);
    } catch (error) {
      failed += 1;
      log.warn(`[article-images] пропущено ${url}: ${error?.message || error}`);
      // Старый неполный вариант лучше, чем никакого: страница покажет то, что есть.
      if (existing && Array.isArray(existing.widths)) images[url] = existing;
    }
  }

  const removed = sharp ? pruneUnusedFiles(images) : 0;
  mkdirSync(ARTICLE_IMAGES_DIR, { recursive: true });
  writeFileSync(ARTICLE_IMAGES_MANIFEST_PATH, serializeManifest(images), 'utf8');
  writeFileSync(ARTICLE_IMAGES_GENERATED_MODULE_PATH, serializeGeneratedModule(images), 'utf8');

  log.info(`[article-images] адресов: ${urls.size}, готовых: ${reused}, собрано: ${generated}, пропущено: ${failed}, удалено файлов: ${removed}`);
  return { total: urls.size, reused, generated, failed, removed, images };
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isDirectRun) {
  optimizeArticleImages().catch((error) => {
    // Картинки не должны останавливать выкладку сайта: без них страницы
    // работают на оригиналах, как раньше.
    console.warn(`[article-images] ошибка оптимизации: ${error?.message || error}`);
    process.exit(0);
  });
}
