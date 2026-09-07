import { ARTICLE_IMAGE_SIZES, resolveArticleImage } from './articleImages';

/**
 * Картинки внутри текста статьи.
 *
 * Известные адреса подменяются на готовые WebP-варианты с настоящими
 * размерами: без `width`/`height` каждая загрузившаяся фотография сдвигала
 * текст под собой, и на десктопе статьи получали CLS около 0,1. Пропорции
 * при этом прежние — атрибуты задают только форму места, а сам размер
 * по-прежнему определяет CSS из разметки статьи.
 *
 * Остальное без изменения размеров: далёкие CMS-изображения просто грузятся
 * позже и с низким приоритетом.
 */
export function optimizeArticleContentImages(doc: Document): void {
  for (const image of doc.body.querySelectorAll<HTMLImageElement>('img')) {
    const source = image.getAttribute('src') || '';
    const resolved = resolveArticleImage(source);
    if (resolved) {
      image.setAttribute('src', resolved.src);
      image.setAttribute('srcset', resolved.srcSet);
      image.setAttribute('sizes', ARTICLE_IMAGE_SIZES.content);
      if (!image.hasAttribute('width') && !image.hasAttribute('height')) {
        image.setAttribute('width', String(resolved.width));
        image.setAttribute('height', String(resolved.height));
      }
    }
    image.loading = 'lazy';
    image.decoding = 'async';
    image.fetchPriority = 'low';
  }
}
