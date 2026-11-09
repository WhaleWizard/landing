const links = {
  meta: { href: '/meta-ads/', label: 'Настройка и ведение рекламы в Instagram и Facebook' },
  google: { href: '/google-ads/', label: 'Настройка и ведение контекстной рекламы Google Ads' },
  consult: { href: '/consult/', label: 'Заказать аудит рекламного кабинета' },
} as const;

const relatedBySlug = new Map<string, keyof typeof links>([
  ['kak-meta-ads-i-google-ads-sozdayut-effektivnuyu-voronku-prodazh', 'consult'],
  ['plan-zapuska-reklamy-na-30-dney-meta-ads-google-ads-pod-klyuch', 'consult'],
  ['b2b-lidogeneratsiya-cherez-google-ads-i-meta-ads-kak-poluchat-sql-a-ne-prosto-lidy', 'google'],
  ['analitika-i-atributsiya-v-2026-kak-perestat-sporit-o-lidah-i-schitat-pribyl', 'consult'],
  ['antikrizisnyy-kontrol-reklamy-chto-delat-kogda-cpa-rastet-kazhdyy-den', 'consult'],
  ['lokalnyy-biznes-i-geo-reklama-v-2026-kak-privesti-klientov-v-tochku-prodazh', 'google'],
  ['masshtabirovanie-e-commerce-v-meta-i-google-bez-poteri-rentabelnosti', 'google'],
  ['retargeting-v-2026-kak-rabotat-na-first-party-dannyh-bez-sliva-byudzheta', 'meta'],
  ['polnaya-voronka-prodazh-2026-meta-ads-google-ads-ot-pervogo-kasaniya-do-sdelki', 'consult'],
  ['google-ads-v-2026-kak-svyazka-search-performance-max-daet-stabilnyy-roi', 'google'],
  ['kak-snizit-cpa-v-meta-ads-v-2026-rabochaya-sistema-a-ne-magiya', 'meta'],
  ['prodvizhenie-premialnogo-konserzh-servisa-klienty-i-trafik-dlya-konserzh-servisa-cherez-targetirovannuyu-reklamu', 'meta'],
  ['trafik-dlya-premialnyh-nish-i-lyuks-segmenta-2-goda-raboty-i-260k-reklamnogo-byudzheta', 'meta'],
]);

export function getArticleServiceLink(slug: string) {
  const key = relatedBySlug.get(slug);
  return key ? links[key] : undefined;
}
