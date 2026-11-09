const launchPlan = '/blog/plan-zapuska-reklamy-na-30-dney-meta-ads-google-ads-pod-klyuch';
const conciergeCase = '/cases/prodvizhenie-premialnogo-konserzh-servisa-klienty-i-trafik-dlya-konserzh-servisa-cherez-targetirovannuyu-reklamu';
const searchAndPmax = '/blog/google-ads-v-2026-kak-svyazka-search-performance-max-daet-stabilnyy-roi';

export const serviceSearchContent = {
  'meta-ads': {
    title: 'Таргетированная реклама для онлайн-школ и экспертов',
    description: 'Если вы ищете таргетолога для онлайн-школы, начнём с формата продажи: вебинар, заявка на консультацию или прямая оплата. Перед запуском согласуем оффер, тестовый бюджет и какие статусы CRM покажут, что реклама приводит будущих учеников.',
    links: [
      { href: launchPlan, label: 'План запуска рекламы на 30\u00A0дней' },
      { href: conciergeCase, label: 'Кейс Meta Ads: как оценивать качество заявок по CRM' },
    ],
  },
  'meta-apps': {
    title: 'Что подготовить для продвижения приложения в Meta Ads',
    description: 'Чтобы оценить запуск рекламы iOS- или Android-приложения, пришлите ссылку на App Store или Google Play, целевые страны и действие, которое приносит ценность: регистрацию, первый заказ или подписку. После проверки событий и экономики приложения можно определить, какой тестовый бюджет имеет смысл.',
    links: [
      { href: '/roi-calculator/', label: 'Рассчитать точку безубыточности рекламы' },
      { href: '/consult/', label: 'Записаться на аудит текущих кампаний' },
    ],
  },
  'google-ads': {
    title: 'Что нужно для настройки Google Ads под ключ',
    description: 'На старте нужны ссылка на сайт, рынки, бюджет и цель: заявки, звонки или покупки. Поиск подходит там, где клиенты уже ищут услугу. Для интернет-магазина дополнительно проверяю фид и данные о покупках, прежде чем предлагать Shopping или Performance Max.',
    links: [
      { href: searchAndPmax, label: 'Как разделить задачи Поиска и Performance Max' },
      { href: '/calculator/', label: 'Прикинуть бюджет на тест Google Ads' },
    ],
  },
  consult: {
    title: 'Когда стоит заказать аудит рекламного кабинета',
    description: 'Аудит полезен, если выросла цена заявки, кабинеты и CRM показывают разные результаты или нужно проверить работу подрядчика. Подготовьте ссылку на посадочную, цель кампании и доступные отчёты. На встрече разберём причины и расставим приоритеты на ближайшие 30 дней.',
    links: [
      { href: '/blog/antikrizisnyy-kontrol-reklamy-chto-delat-kogda-cpa-rastet-kazhdyy-den', label: 'Что проверить, если растёт стоимость заявки' },
      { href: '/faq/', label: 'Ответы о бюджетах, сроках и аналитике' },
    ],
  },
} satisfies Record<string, {
  title: string;
  description: string;
  links: Array<{ href: string; label: string }>;
}>;
