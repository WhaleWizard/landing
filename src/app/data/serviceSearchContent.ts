const launchPlan = '/blog/plan-zapuska-reklamy-na-30-dney-meta-ads-google-ads-pod-klyuch';
const conciergeCase = '/cases/prodvizhenie-premialnogo-konserzh-servisa-klienty-i-trafik-dlya-konserzh-servisa-cherez-targetirovannuyu-reklamu';
const searchAndPmax = '/blog/google-ads-v-2026-kak-svyazka-search-performance-max-daet-stabilnyy-roi';

// Полоса полезных ссылок внизу страниц услуг (после формы заявки, перед подвалом).
// Короткий заголовок и две ссылки: блок нужен поиску как внутренняя перелинковка,
// а человеку не должен мешать. Перед короткими предлогами — неразрывный пробел.
export const serviceSearchContent = {
  'meta-ads': {
    title: 'Таргет для онлайн-школ и экспертов',
    links: [
      { href: launchPlan, label: 'План запуска на 30 дней' },
      { href: conciergeCase, label: 'Кейс: качество заявок по CRM' },
    ],
  },
  'meta-apps': {
    title: 'Реклама приложения: с чего начать',
    links: [
      { href: '/roi-calculator/', label: 'Калькулятор окупаемости' },
      { href: '/consult/', label: 'Аудит текущих кампаний' },
    ],
  },
  'google-ads': {
    title: 'Google Ads под ключ: с чего начать',
    links: [
      { href: searchAndPmax, label: 'Поиск или Performance Max' },
      { href: '/calculator/', label: 'Бюджет на тест Google Ads' },
    ],
  },
  consult: {
    title: 'Когда нужен аудит кабинета',
    links: [
      { href: '/blog/antikrizisnyy-kontrol-reklamy-chto-delat-kogda-cpa-rastet-kazhdyy-den', label: 'Почему растёт цена заявки' },
      { href: '/faq/', label: 'Ответы о бюджетах и сроках' },
    ],
  },
} satisfies Record<string, {
  title: string;
  links: Array<{ href: string; label: string }>;
}>;
