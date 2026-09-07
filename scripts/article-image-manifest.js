import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT_DIR } from './config.js';

/**
 * Общие правила для оптимизированных картинок статей.
 *
 * Оригиналы обложек живут на внешних хостингах (ImgBB, R2) и весят по 1–2 МБ:
 * PNG прямо из генератора картинок, без сжатия и без размеров. Скрипт
 * `optimize-article-images.js` скачивает их на сборке и кладёт в
 * `public/images/articles/` в WebP нескольких ширин, а здесь — то, что нужно
 * и генератору страниц, и самому скрипту: адреса вариантов и выбор `src`.
 *
 * Та же логика для браузера повторена в `src/app/utils/articleImages.ts`:
 * оба потребителя читают один манифест, но SPA не может импортировать Node.
 */
export const ARTICLE_IMAGES_PUBLIC_PATH = '/images/articles';
export const ARTICLE_IMAGES_DIR = join(ROOT_DIR, 'public', 'images', 'articles');
export const ARTICLE_IMAGES_MANIFEST_PATH = join(ARTICLE_IMAGES_DIR, 'manifest.json');
export const ARTICLE_IMAGES_GENERATED_MODULE_PATH = join(
  ROOT_DIR,
  'src',
  'app',
  'data',
  'articleImageManifest.generated.ts',
);

/** Ширины вариантов; последняя — потолок, крупнее оригинала не масштабируем. */
export const ARTICLE_IMAGE_WIDTHS = [480, 768, 1200, 1600];

/** Ширина запасного `src` для браузеров без `srcset` и для предпросмотров. */
export const ARTICLE_IMAGE_FALLBACK_WIDTH = 1200;

/**
 * Атрибут `sizes` по месту показа. Значения выведены из настоящей вёрстки:
 * контейнер статьи — `max-w-5xl` с полями, витрина блога — половина
 * `max-w-7xl`, тело статьи — колонка 760px.
 */
export const ARTICLE_IMAGE_SIZES = {
  cover: '(max-width: 639px) calc(100vw - 32px), (max-width: 1023px) calc(100vw - 48px), 976px',
  content: '(max-width: 799px) calc(100vw - 32px), 760px',
};

export function variantPath(entry, width) {
  return `${ARTICLE_IMAGES_PUBLIC_PATH}/${entry.id}-${width}.webp`;
}

export function variantWidths(originalWidth) {
  const cap = Math.min(originalWidth, ARTICLE_IMAGE_WIDTHS[ARTICLE_IMAGE_WIDTHS.length - 1]);
  const widths = ARTICLE_IMAGE_WIDTHS.filter((width) => width < cap);
  widths.push(cap);
  return widths;
}

export function pickFallbackWidth(widths) {
  const candidates = widths.filter((width) => width <= ARTICLE_IMAGE_FALLBACK_WIDTH);
  return candidates.length > 0 ? candidates[candidates.length - 1] : widths[0];
}

export function buildSrcSet(entry) {
  return entry.widths.map((width) => `${variantPath(entry, width)} ${width}w`).join(', ');
}

export function resolveManifestImage(manifest, url) {
  const entry = manifest?.[url];
  if (!entry || !Array.isArray(entry.widths) || entry.widths.length === 0) return null;
  return {
    src: variantPath(entry, pickFallbackWidth(entry.widths)),
    srcSet: buildSrcSet(entry),
    width: entry.width,
    height: entry.height,
  };
}

export function readArticleImageManifest(pathname = ARTICLE_IMAGES_MANIFEST_PATH) {
  if (!existsSync(pathname)) return {};
  try {
    const payload = JSON.parse(readFileSync(pathname, 'utf8'));
    return payload && typeof payload === 'object' && payload.images && typeof payload.images === 'object'
      ? payload.images
      : {};
  } catch {
    return {};
  }
}

/** Внешние адреса картинок статьи: обложка и `<img>` внутри HTML. */
export function collectArticleImageUrls(articles) {
  const urls = new Set();
  const consider = (value) => {
    const url = String(value || '').trim();
    if (/^https?:\/\//i.test(url)) urls.add(url);
  };

  for (const article of articles) {
    if (!article || article.status === 'draft') continue;
    consider(article.image);
    const content = String(article.content || '');
    for (const match of content.matchAll(/<img\b[^>]*\bsrc=(["'])(.*?)\1/gi)) {
      consider(match[2].replace(/&amp;/g, '&'));
    }
  }

  return urls;
}
