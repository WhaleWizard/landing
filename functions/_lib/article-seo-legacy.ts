// Correct the exact titles shipped with the old snapshot. An edited CMS
// title always wins. Public reads and the prerender use the same mapping.
const corrections: Record<string, readonly [string, string]> = {
  'b2b-lidogeneratsiya-cherez-google-ads-i-meta-ads-kak-poluchat-sql-a-ne-prosto-lidy': [
    'B2B лидогенерация через Google Ads и Meta Ads: как получать SQL, а не',
    'B2B-лидогенерация в Google и Meta Ads: как получать целевые заявки',
  ],
  'analitika-i-atributsiya-v-2026-kak-perestat-sporit-o-lidah-i-schitat-pribyl': [
    'Аналитика и атрибуция в 2026: как перестать спорить о лидах и считать',
    'Аналитика рекламы: как связать заявки, продажи и прибыль',
  ],
  'antikrizisnyy-kontrol-reklamy-chto-delat-kogda-cpa-rastet-kazhdyy-den': [
    'Антикризисный контроль рекламы: что делать, когда CPA растет каждый де',
    'Растёт стоимость заявки: как найти причину в Meta и Google Ads',
  ],
  'lokalnyy-biznes-i-geo-reklama-v-2026-kak-privesti-klientov-v-tochku-prodazh': [
    'Локальный бизнес и GEO-реклама в 2026: как привести клиентов в точку п',
    'Геореклама для локального бизнеса: как привести клиентов в точку',
  ],
  'retargeting-v-2026-kak-rabotat-na-first-party-dannyh-bez-sliva-byudzheta': [
    'Ретаргетинг в 2026: как работать на first-party данных без слива бюдже',
    'Ретаргетинг на собственных данных: сегменты, окна и частота',
  ],
  'polnaya-voronka-prodazh-2026-meta-ads-google-ads-ot-pervogo-kasaniya-do-sdelki': [
    'Полная воронка продаж 2026: Meta Ads + Google Ads от первого касания д',
    'Воронка продаж в Meta и Google Ads: от знакомства до сделки',
  ],
  'google-ads-v-2026-kak-svyazka-search-performance-max-daet-stabilnyy-roi': [
    'Google Ads в 2026: как связка Search + Performance Max дает стабильный',
    'Поиск и Performance Max в Google Ads: как разделить задачи',
  ],
};

export function correctLegacyArticleSeo<T extends { slug: string; seoTitle?: string }>(article: T): T {
  const correction = Object.prototype.hasOwnProperty.call(corrections, article.slug)
    ? corrections[article.slug]
    : undefined;
  if (!correction || article.seoTitle?.trim() !== correction[0]) return article;
  return { ...article, seoTitle: correction[1] };
}
