import { ARTICLE_IMAGE_MANIFEST, type ArticleImageManifestEntry } from '../data/articleImageManifest.generated';

/**
 * Готовые варианты картинок статей.
 *
 * Обложки в CMS заданы ссылками на внешний хостинг и весят по 1–2 МБ; сборка
 * (`scripts/optimize-article-images.js`) пережимает их в WebP нескольких
 * ширин и записывает соответствие «исходный адрес → варианты». Здесь адрес
 * из статьи подменяется на эти варианты. Неизвестный адрес — например,
 * у материала, опубликованного после последней сборки, — остаётся как есть:
 * страница показывает оригинал, просто медленнее.
 *
 * Правила ширин и запасного `src` повторяют `scripts/article-image-manifest.js`.
 */
const PUBLIC_PATH = '/images/articles';
const FALLBACK_WIDTH = 1200;

export type ResolvedArticleImage = {
  src: string;
  srcSet: string;
  width: number;
  height: number;
};

/**
 * `sizes` по месту показа — выведены из настоящей вёрстки, а не подобраны.
 * Ошибка здесь не ломает картинку, но заставляет телефон качать лишнее.
 */
export const ARTICLE_IMAGE_SIZES = {
  /** Обложка на странице статьи: контейнер max-w-5xl с полями. */
  cover: '(max-width: 639px) calc(100vw - 32px), (max-width: 1023px) calc(100vw - 48px), 976px',
  /** Рекомендуемая статья в блоге: половина max-w-7xl на десктопе. */
  featured: '(max-width: 767px) calc(100vw - 32px), (max-width: 1279px) 51vw, 628px',
  /** Миниатюры списка блога: 88px до 640px, дальше 136px. */
  thumbnail: '(max-width: 639px) 88px, 136px',
  /** Карточки карусели на главной: 280 / 320 / 360px. */
  carousel: '(max-width: 639px) 280px, (max-width: 767px) 320px, 360px',
  /** Картинки в тексте статьи: колонка 760px. */
  content: '(max-width: 799px) calc(100vw - 32px), 760px',
  /** Обложка кейса в шапке и на витрине. */
  caseCover: '(max-width: 767px) calc(100vw - 32px), (max-width: 1279px) 45vw, 560px',
  /** Похожие кейсы под статьёй. */
  caseRelated: '(max-width: 767px) calc(100vw - 32px), 300px',
} as const;

export type ArticleImageSizes = (typeof ARTICLE_IMAGE_SIZES)[keyof typeof ARTICLE_IMAGE_SIZES];

function variantPath(entry: ArticleImageManifestEntry, width: number): string {
  return `${PUBLIC_PATH}/${entry.id}-${width}.webp`;
}

function pickFallbackWidth(widths: number[]): number {
  const candidates = widths.filter((width) => width <= FALLBACK_WIDTH);
  return candidates.length > 0 ? candidates[candidates.length - 1] : widths[0];
}

export function resolveArticleImage(url: string | null | undefined): ResolvedArticleImage | null {
  const key = String(url || '').trim();
  const entry = key ? ARTICLE_IMAGE_MANIFEST[key] : undefined;
  if (!entry || !Array.isArray(entry.widths) || entry.widths.length === 0) return null;
  return {
    src: variantPath(entry, pickFallbackWidth(entry.widths)),
    srcSet: entry.widths.map((width) => `${variantPath(entry, width)} ${width}w`).join(', '),
    width: entry.width,
    height: entry.height,
  };
}

export type ArticleImageAttributes = {
  src: string;
  srcSet?: string;
  sizes?: string;
  width?: number;
  height?: number;
};

/**
 * Атрибуты `<img>` для картинки статьи. Для известного адреса — варианты с
 * размерами, для любого другого — исходный `src` без изменений.
 */
export function articleImageAttributes(url: string, sizes: ArticleImageSizes | string): ArticleImageAttributes {
  const resolved = resolveArticleImage(url);
  if (!resolved) return { src: url };
  return {
    src: resolved.src,
    srcSet: resolved.srcSet,
    sizes,
    width: resolved.width,
    height: resolved.height,
  };
}
