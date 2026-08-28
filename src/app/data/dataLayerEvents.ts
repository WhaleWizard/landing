/**
 * Справочник событий dataLayer — то, что видит Google Tag Manager.
 *
 * Имена событий до этого жили только в коде: чтобы настроить триггер в GTM,
 * приходилось лезть в `consent/consent.ts`. Здесь они собраны с человеческими
 * описаниями и показываются в разделе «События» админки.
 *
 * ВАЖНО: описания здесь пишет человек, а имена сверяет `npm run test:datalayer`
 * — он читает настоящие отправки из `consent/consent.ts` и падает, если
 * справочник разошёлся с кодом. Без этой сверки документация тихо устаревает и
 * начинает врать, а врущая документация хуже отсутствующей.
 *
 * Поэтому: добавили событие в consent.ts — добавьте его и сюда.
 */

/** Какое согласие нужно, чтобы событие вообще дошло до GTM. */
export type DataLayerConsent = 'analytics' | 'marketing';

export interface DataLayerParam {
  readonly name: string;
  readonly description: string;
  /** Параметр приходит не всегда — зависит от страницы или действия. */
  readonly optional?: boolean;
}

export interface DataLayerEventDoc {
  /** Значение ключа `event` — именно его указывают в триггере GTM. */
  readonly event: string;
  readonly title: string;
  /** Что событие означает по смыслу. */
  readonly meaning: string;
  /** В какой момент срабатывает. */
  readonly firesWhen: string;
  readonly consent: DataLayerConsent;
  readonly params: readonly DataLayerParam[];
  /** Где в коде вызывается — чтобы можно было проверить на живом сайте. */
  readonly where: readonly string[];
  /** Одноимённое событие в Meta Pixel, если есть. */
  readonly metaPixel?: string;
  /** Дублируется ли серверным Meta CAPI (общий event_id, дедупликация). */
  readonly metaServer?: boolean;
  /** Что уходит в GA4 напрямую через gtag, помимо dataLayer. */
  readonly ga4?: string;
  /** Что уходит в Яндекс.Метрику напрямую. */
  readonly metrika?: string;
  readonly note?: string;
}

/** Параметры страницы, общие почти для всех событий. */
const PAGE_PARAMS: readonly DataLayerParam[] = [
  { name: 'page_path', description: 'Адрес страницы без домена, например /meta-ads' },
  { name: 'page_location', description: 'Полный адрес страницы' },
];

/** Описание товара/услуги в терминах Meta — общее для контентных событий. */
const CONTENT_PARAMS: readonly DataLayerParam[] = [
  { name: 'content_name', description: 'Заголовок страницы' },
  { name: 'content_category', description: 'Категория: услуга, статья блога, кейс' },
  { name: 'content_type', description: 'Тип: service, article, page' },
  { name: 'content_ids', description: 'Идентификаторы содержимого списком' },
  { name: 'service', description: 'Название услуги', optional: true },
  { name: 'service_slug', description: 'Короткий код услуги', optional: true },
];

const EVENT_ID: DataLayerParam = {
  name: 'event_id',
  description: 'Общий ключ с Meta: по нему пиксель и сервер считаются одним событием, а не двумя',
};

export const DATALAYER_EVENTS: readonly DataLayerEventDoc[] = [
  {
    event: 'virtual_pageview',
    title: 'Просмотр страницы',
    meaning: 'Посетитель открыл страницу. Сайт — одностраничное приложение, поэтому переходы внутри него не перезагружают браузер, и обычный счётчик просмотров их бы не заметил.',
    firesWhen: 'При каждом открытии страницы и при каждом переходе внутри сайта.',
    consent: 'analytics',
    params: [EVENT_ID, ...PAGE_PARAMS],
    where: ['components/cookie/CookieConsentManager.tsx'],
    ga4: 'page_view',
    metrika: 'hit',
    note: 'Повторное срабатывание на том же адресе в течение 1,2 секунды подавляется — иначе один переход считался бы дважды.',
  },
  {
    event: 'view_content',
    title: 'Просмотр содержимого',
    meaning: 'Посетитель открыл страницу, имеющую ценность для рекламы: лендинг услуги, статью или кейс.',
    firesWhen: 'При открытии значимой страницы. Служебные адреса — админка, юридические страницы — исключены.',
    consent: 'marketing',
    params: [EVENT_ID, ...CONTENT_PARAMS, ...PAGE_PARAMS],
    where: ['components/cookie/CookieConsentManager.tsx'],
    metaPixel: 'ViewContent',
    metaServer: true,
  },
  {
    event: 'lead_form_view',
    title: 'Форма попала на экран',
    meaning: 'Посетитель доскроллил до формы заявки — то есть дошёл до места, где принимается решение.',
    firesWhen: 'Когда форма впервые появляется в поле зрения. Один раз на страницу.',
    consent: 'marketing',
    params: [
      EVENT_ID,
      { name: 'form_id', description: 'Какая форма: service_landing_form' },
      { name: 'form_step', description: 'Ступень воронки формы: view' },
      ...CONTENT_PARAMS,
      ...PAGE_PARAMS,
    ],
    where: ['components/ContactForm.tsx', 'components/LandingForm.tsx'],
    metaPixel: 'LeadFormView',
    metaServer: true,
  },
  {
    event: 'form_start',
    title: 'Начало заполнения',
    meaning: 'Посетитель тронул форму — ввёл первый символ. Самый ранний сигнал реального интереса.',
    firesWhen: 'При первом взаимодействии с любым полем формы.',
    consent: 'marketing',
    params: [
      EVENT_ID,
      { name: 'form_id', description: 'Какая форма: service_landing_form' },
      { name: 'form_step', description: 'Ступень воронки формы: first_interaction' },
      ...CONTENT_PARAMS,
      ...PAGE_PARAMS,
    ],
    where: ['components/ContactForm.tsx', 'components/LandingForm.tsx'],
    metaPixel: 'FormStart',
    metaServer: true,
  },
  {
    event: 'engaged_view',
    title: 'Вовлечённый просмотр',
    meaning: 'Посетитель не пролистал страницу мимо, а действительно её смотрел. Отделяет случайный клик по объявлению от настоящего интереса.',
    firesWhen: 'По любому из трёх признаков: десять секунд на странице, прокрутка до половины, показ формы. Каждый признак — один раз на страницу.',
    consent: 'marketing',
    params: [
      EVENT_ID,
      { name: 'engagement_type', description: 'Что именно засчитано: time_10s, scroll_50 или form_view' },
      ...CONTENT_PARAMS,
      ...PAGE_PARAMS,
    ],
    where: ['components/ContactForm.tsx', 'components/LandingForm.tsx'],
    metaPixel: 'EngagedView',
    metaServer: true,
    note: 'Отложенный отсчёт десяти секунд отменяется при уходе со страницы — иначе он засчитался бы следующей.',
  },
  {
    event: 'contact',
    title: 'Клик по контакту',
    meaning: 'Посетитель решил написать напрямую, минуя форму: нажал на телеграм, вотсап, почту или телефон.',
    firesWhen: 'При клике по контактной ссылке в подвале, в боковой панели соцсетей или на странице благодарности.',
    consent: 'marketing',
    params: [
      EVENT_ID,
      { name: 'contact_channel', description: 'Канал: telegram, whatsapp, email, phone, social' },
      { name: 'placement', description: 'Место на странице, откуда нажали' },
      ...CONTENT_PARAMS,
      ...PAGE_PARAMS,
    ],
    where: ['components/Footer.tsx', 'components/SocialBar.tsx', 'pages/ThankYou.tsx'],
    metaPixel: 'Contact',
    metaServer: true,
  },
  {
    event: 'lead_submitted',
    title: 'Заявка отправлена',
    meaning: 'Главная конверсия: посетитель оставил заявку.',
    firesWhen: 'Сразу после успешной отправки формы.',
    consent: 'analytics',
    params: [EVENT_ID, { name: 'данные заявки', description: 'Услуга, форма, вариант формы, способ связи, страница' }],
    where: ['components/ContactForm.tsx', 'components/LandingForm.tsx'],
    metaPixel: 'Lead',
    metaServer: true,
    ga4: 'generate_lead',
    metrika: 'lead',
    note: 'В dataLayer уходит при согласии на аналитику, а в Meta — только при отдельном согласии на маркетинг.',
  },
  {
    event: 'form_submit',
    title: 'Отправка формы',
    meaning: 'То же действие, что и «Заявка отправлена», но под именем, которое ждут стандартные отчёты GA4.',
    firesWhen: 'Одновременно с lead_submitted, сразу следом.',
    consent: 'analytics',
    params: [EVENT_ID, { name: 'данные заявки', description: 'Те же параметры, что у lead_submitted' }],
    where: ['components/ContactForm.tsx', 'components/LandingForm.tsx'],
    ga4: 'form_submit',
    metrika: 'form_submit',
    note: 'Считать конверсии нужно по одному из двух, иначе каждая заявка удвоится.',
  },
  {
    event: 'thank_you_page_view',
    title: 'Страница благодарности',
    meaning: 'Посетитель дошёл до экрана «спасибо» — подтверждение, что отправка действительно завершилась.',
    firesWhen: 'При открытии страницы благодарности.',
    consent: 'analytics',
    params: [],
    where: ['pages/ThankYou.tsx'],
    ga4: 'thank_you_page_view',
    metrika: 'thank_you_page_view',
  },
  {
    event: 'faq_open',
    title: 'Открыт вопрос в FAQ',
    meaning: 'Посетитель раскрыл ответ на вопрос. Показывает, что именно людям неясно.',
    firesWhen: 'При раскрытии любого вопроса на странице частых вопросов.',
    consent: 'analytics',
    params: [{ name: 'faq_question', description: 'Текст раскрытого вопроса' }],
    where: ['pages/FAQPage.tsx'],
    ga4: 'faq_open',
    metrika: 'faq_open',
  },
  {
    event: 'case_filter',
    title: 'Фильтр кейсов',
    meaning: 'Посетитель ищет кейс под свою задачу: фильтрует по нише, источнику трафика или результату.',
    firesWhen: 'При выборе любого фильтра в подборщике кейсов.',
    consent: 'analytics',
    params: [
      { name: 'filter_kind', description: 'Тип фильтра: niche, source или result' },
      { name: 'filter_value', description: 'Выбранное значение', optional: true },
    ],
    where: ['pages/CasesPage.tsx'],
    metaPixel: 'CaseFilter',
    note: 'Значение фильтра передаётся только из заранее разрешённого списка — произвольный текст из адреса страницы в аналитику не попадает.',
  },
];
