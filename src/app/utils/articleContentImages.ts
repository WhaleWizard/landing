/** Без изменения размеров/пропорций снижает приоритет далёких CMS-изображений. */
export function optimizeArticleContentImages(doc: Document): void {
  for (const image of doc.body.querySelectorAll<HTMLImageElement>('img')) {
    image.loading = 'lazy';
    image.decoding = 'async';
    image.fetchPriority = 'low';
  }
}
