/**
 * Адреса статей и кейсов, которые сменили слаг.
 *
 * В опубликованных статьях остаются ссылки на прежний адрес (DA-150): две
 * статьи вели на кейс премиум-сегмента по старому слагу и получали 404.
 * Текст статьи живёт в базе, и править его — дело владельца; пока ссылка не
 * исправлена, старый адрес отвечает постоянным переходом на новый — и на
 * сервере (301), и внутри сайта. Список общий для сервера и браузера.
 *
 * Добавлять сюда пару «старый → новый» при каждом переименовании
 * опубликованного материала.
 */
export const RENAMED_ARTICLE_SLUGS: Readonly<Record<string, string>> = {
  'trafik-dlya-premialnyh-nish-i-lyuks-segmenta-kak-poluchat-zayavki-s-chekom-ot-10000':
    'trafik-dlya-premialnyh-nish-i-lyuks-segmenta-2-goda-raboty-i-260k-reklamnogo-byudzheta',
};

export function renamedArticleSlug(slug: string | undefined | null): string | null {
  if (!slug) return null;
  return Object.prototype.hasOwnProperty.call(RENAMED_ARTICLE_SLUGS, slug) ? RENAMED_ARTICLE_SLUGS[slug] : null;
}
