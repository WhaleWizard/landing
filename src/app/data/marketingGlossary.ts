export interface MarketingGlossaryItem {
  id: string;
  term: string;
  abbreviation?: string;
  category: string;
  channel: string;
  definition: string;
  simple: string;
  formula?: string;
  seoHint: string;
}

type BaseMetric = Omit<MarketingGlossaryItem, 'id' | 'channel' | 'term'> & { termBase: string; category: string };

const channels = [
  { slug: 'google-ads', label: 'Google Ads' },
  { slug: 'meta-ads', label: 'Meta Ads' },
  { slug: 'seo', label: 'SEO' },
  { slug: 'aeo', label: 'AEO' },
  { slug: 'geo', label: 'GEO' },
  { slug: 'analytics', label: 'Analytics' },
  { slug: 'crm', label: 'CRM & Sales' },
  { slug: 'tiktok-ads', label: 'TikTok Ads' },
  { slug: 'email', label: 'Email Marketing' },
];

const baseMetrics: BaseMetric[] = [
  { termBase: 'CTR', abbreviation: 'CTR', category: 'Трафик', definition: 'Доля кликов от числа показов. Показывает, насколько объявление или сниппет попадает в запрос пользователя.', simple: 'Из 100 показов кликнули 8 раз → CTR = 8%.', formula: 'CTR = Clicks / Impressions × 100%', seoHint: 'Влияет на качество трафика и косвенно на эффективность аукциона.' },
  { termBase: 'CPC', abbreviation: 'CPC', category: 'Стоимость', definition: 'Средняя цена за клик по объявлению или ссылке.', simple: 'Потратили 100$, получили 50 кликов — средний клик стоит 2$.', formula: 'CPC = Spend / Clicks', seoHint: 'Снижение CPC без потери качества повышает окупаемость.' },
  { termBase: 'CPM', abbreviation: 'CPM', category: 'Стоимость', definition: 'Стоимость 1000 показов рекламы.', simple: 'Если CPM = 10$, то тысяча показов стоит 10$.', formula: 'CPM = Spend / Impressions × 1000', seoHint: 'Нужен для оценки цены охвата и медиадавления.' },
  { termBase: 'CPA', abbreviation: 'CPA', category: 'Конверсии', definition: 'Средняя стоимость целевого действия: лид, регистрация, заказ.', simple: 'Если получили 20 лидов на 400$, CPA = 20$.', formula: 'CPA = Spend / Conversions', seoHint: 'Один из главных KPI в перформанс-маркетинге.' },
  { termBase: 'CPL', abbreviation: 'CPL', category: 'Лиды', definition: 'Цена одного лида (заявки).', simple: 'Чем ниже CPL при нормальном качестве лида — тем лучше.', formula: 'CPL = Spend / Leads', seoHint: 'Сравнивайте CPL вместе с квалификацией лида, а не отдельно.' },
  { termBase: 'CR', abbreviation: 'CR', category: 'Конверсии', definition: 'Коэффициент конверсии: доля пользователей, выполнивших целевое действие.', simple: '1000 посетителей, 50 заявок → CR = 5%.', formula: 'CR = Conversions / Sessions × 100%', seoHint: 'Рост CR снижает цену лида и делает трафик выгоднее.' },
  { termBase: 'ROAS', abbreviation: 'ROAS', category: 'Выручка', definition: 'Возврат рекламных расходов: сколько выручки приносит 1 единица бюджета.', simple: 'Потратили 1000$, выручка 4000$ → ROAS = 4.0.', formula: 'ROAS = Revenue / Spend', seoHint: 'Ключевой KPI e-commerce и performance-кампаний.' },
  { termBase: 'ROI', abbreviation: 'ROI', category: 'Прибыль', definition: 'Окупаемость инвестиций с учетом прибыли, а не только выручки.', simple: 'Если после расходов остаётся плюс, ROI положительный.', formula: 'ROI = (Profit - Investment) / Investment × 100%', seoHint: 'Используйте для решений по масштабированию канала.' },
  { termBase: 'ROMI', abbreviation: 'ROMI', category: 'Прибыль', definition: 'Окупаемость именно маркетинговых инвестиций.', simple: 'Показывает, окупились ли маркетинговые усилия.', formula: 'ROMI = (Marketing Revenue - Marketing Cost) / Marketing Cost × 100%', seoHint: 'Полезен для сравнения разных каналов по бизнес-результату.' },
  { termBase: 'AOV', abbreviation: 'AOV', category: 'Выручка', definition: 'Средний чек за заказ.', simple: 'Увеличили допродажи — AOV вырос.', formula: 'AOV = Revenue / Orders', seoHint: 'Рост AOV часто улучшает unit-экономику быстрее, чем рост трафика.' },
  { termBase: 'LTV', abbreviation: 'LTV', category: 'Клиенты', definition: 'Пожизненная ценность клиента: сколько прибыли/выручки приносит клиент за весь срок.', simple: 'Если клиент возвращается и покупает повторно, LTV растёт.', formula: 'LTV = ARPU × Lifetime', seoHint: 'Сравнивайте LTV с CAC для оценки модели роста.' },
  { termBase: 'CAC', abbreviation: 'CAC', category: 'Клиенты', definition: 'Стоимость привлечения одного нового клиента.', simple: 'Важно считать вместе с LTV, иначе можно расти в убыток.', formula: 'CAC = Acquisition Spend / New Customers', seoHint: 'Если CAC стабильно ниже LTV — масштабирование безопаснее.' },
  { termBase: 'Bounce Rate', category: 'Поведение', definition: 'Доля сеансов без значимого взаимодействия (в современной аналитике трактуется по правилам engagement).', simple: 'Зашли и почти сразу ушли — это сигнал проблем с релевантностью.', seoHint: 'Улучшение посадочной и оффера снижает отказы.' },
  { termBase: 'Engagement Rate', abbreviation: 'ER', category: 'Поведение', definition: 'Доля вовлеченных сессий/пользователей или взаимодействий с контентом.', simple: 'Чем выше вовлеченность, тем больше шансов на конверсию.', seoHint: 'Критично для контента, соцсетей и AEO-сценариев.' },
  { termBase: 'Frequency', category: 'Охват', definition: 'Среднее число показов рекламы одному пользователю.', simple: 'Слишком высокая частота вызывает баннерную слепоту и рост цены.', formula: 'Frequency = Impressions / Reach', seoHint: 'Контролируйте частоту для защиты эффективности креатива.' },
  { termBase: 'Reach', category: 'Охват', definition: 'Количество уникальных пользователей, увидевших рекламу.', simple: 'Reach — это уникальные люди, а не все показы.', seoHint: 'Нужен для оценки масштаба и верхней части воронки.' },
  { termBase: 'Impression Share', abbreviation: 'IS', category: 'Аукцион', definition: 'Доля полученных показов от общего доступного инвентаря.', simple: 'Если IS низкий, вы упускаете спрос.', seoHint: 'Помогает понять, где теряются показы из-за рейтинга или бюджета.' },
  { termBase: 'Quality Score', abbreviation: 'QS', category: 'Аукцион', definition: 'Оценка качества объявления, релевантности и посадочной страницы.', simple: 'Более высокий QS обычно снижает стоимость клика.', seoHint: 'Оптимизируйте тексты, ключи и landing page одновременно.' },
  { termBase: 'CPQL', abbreviation: 'CPQL', category: 'Лиды', definition: 'Стоимость только квалифицированного лида.', simple: 'Лучше дорогой качественный лид, чем дешёвый нецелевой.', formula: 'CPQL = Spend / Qualified Leads', seoHint: 'В B2B это часто важнее обычного CPL.' },
  { termBase: 'SQL Rate', category: 'Воронка продаж', definition: 'Доля лидов, перешедших в стадию Sales Qualified Lead.', simple: 'Показывает, насколько маркетинг даёт реально рабочие заявки.', formula: 'SQL Rate = SQL / Leads × 100%', seoHint: 'Хорошая связь между маркетингом и отделом продаж.' },
  { termBase: 'MQL Rate', category: 'Воронка продаж', definition: 'Доля лидов, признанных маркетингом качественными (MQL).', simple: 'Фильтрует мусорные обращения на раннем этапе.', formula: 'MQL Rate = MQL / Leads × 100%', seoHint: 'Используйте единые критерии MQL в CRM.' },
  { termBase: 'Win Rate', category: 'Продажи', definition: 'Доля выигранных сделок от общего числа возможностей.', simple: 'Чем выше Win Rate, тем сильнее отдел продаж и качество входящих лидов.', formula: 'Win Rate = Won Deals / Opportunities × 100%', seoHint: 'Влияет на допустимый CAC и верхний предел CPL.' },
  { termBase: 'Payback Period', category: 'Финансы', definition: 'Срок возврата затрат на привлечение клиента.', simple: 'За сколько месяцев клиент окупает расходы на его привлечение.', seoHint: 'Критично для подписочных бизнесов и SaaS.' },
  { termBase: 'Attribution Window', category: 'Атрибуция', definition: 'Период, в течение которого конверсия приписывается источнику.', simple: 'Один и тот же лид может считаться по-разному в разных окнах.', seoHint: 'Выравнивайте окна атрибуции между платформами.' },
  { termBase: 'View-through Conversions', abbreviation: 'VTC', category: 'Атрибуция', definition: 'Конверсии после показа рекламы без клика.', simple: 'Человек увидел рекламу, не кликнул, но купил позже.', seoHint: 'Полезно для медийных и видеоформатов.' },
  { termBase: 'Assisted Conversions', category: 'Атрибуция', definition: 'Конверсии, где канал участвовал как вспомогательный шаг, но не был последним.', simple: 'Канал помогает продать, даже если закрытие произошло из другого источника.', seoHint: 'Нужно для честной оценки контентных и верхневоронечных каналов.' },
  { termBase: 'Share of Voice', abbreviation: 'SOV', category: 'Бренд', definition: 'Доля видимости бренда на рынке или в выдаче.', simple: 'Чем выше SOV, тем заметнее бренд относительно конкурентов.', seoHint: 'Полезен для долгосрочной конкурентной стратегии.' },
  { termBase: 'Branded Search Volume', category: 'Бренд', definition: 'Объем поисковых запросов с названием бренда.', simple: 'Рост брендового спроса часто сигнализирует об укреплении узнаваемости.', seoHint: 'Сильная метрика для оценки бренд-эффекта рекламы.' },
  { termBase: 'Session Duration', category: 'Поведение', definition: 'Средняя длительность сессии пользователя.', simple: 'Больше времени на сайте — чаще признак релевантного контента.', seoHint: 'Учитывайте вместе с глубиной и конверсией.' },
  { termBase: 'Pages per Session', category: 'Поведение', definition: 'Среднее число страниц за сессию.', simple: 'Показывает, насколько пользователь вовлекается в контент.', formula: 'Pages/Session = Pageviews / Sessions', seoHint: 'Важен для контентных и каталоговых сайтов.' },
  { termBase: 'Cart Abandonment Rate', category: 'E-commerce', definition: 'Доля пользователей, добавивших товар в корзину, но не завершивших покупку.', simple: 'Сигнал проблем с ценой, доставкой или UX checkout.', formula: 'CAR = (Carts - Purchases) / Carts × 100%', seoHint: 'Сильная точка роста через ремаркетинг и CRO.' },
  { termBase: 'Checkout Completion Rate', category: 'E-commerce', definition: 'Доля пользователей, завершивших оформление после начала checkout.', simple: 'Чем выше CCR, тем меньше потерь на последнем шаге.', formula: 'CCR = Orders / Checkout Starts × 100%', seoHint: 'Оптимизируйте форму, способы оплаты и скорость загрузки.' },
  { termBase: 'Refund Rate', category: 'E-commerce', definition: 'Доля заказов, которые были возвращены.', simple: 'Высокий refund rate съедает прибыль и искажает ROAS.', formula: 'Refund Rate = Refunds / Orders × 100%', seoHint: 'Оценивайте вместе с качеством трафика и точностью оффера.' },
  { termBase: 'Churn Rate', category: 'Retention', definition: 'Доля клиентов, прекративших использование продукта/подписки.', simple: 'Если отток высокий, нужно усиливать удержание, а не только привлечение.', formula: 'Churn = Lost Customers / Total Customers × 100%', seoHint: 'Критично для SaaS и подписочных бизнесов.' },
  { termBase: 'Retention Rate', category: 'Retention', definition: 'Доля клиентов, оставшихся активными за период.', simple: 'Чем выше retention, тем устойчивее рост компании.', formula: 'Retention = Retained Customers / Total Customers × 100%', seoHint: 'Повышение retention почти всегда улучшает LTV.' },
  { termBase: 'Net Revenue Retention', abbreviation: 'NRR', category: 'Retention', definition: 'Сохранение выручки от существующей клиентской базы с учетом расширений и оттока.', simple: 'NRR выше 100% означает, что база растёт даже без новых клиентов.', formula: 'NRR = (Start MRR + Expansion - Churn - Contraction) / Start MRR × 100%', seoHint: 'Главная метрика здоровья SaaS-модели.' },
  { termBase: 'Customer Satisfaction Score', abbreviation: 'CSAT', category: 'Клиенты', definition: 'Оценка удовлетворенности клиентов после взаимодействия.', simple: 'Понимаете, насколько клиент доволен сервисом или продуктом.', seoHint: 'Косвенно влияет на повторные покупки и LTV.' },
  { termBase: 'Net Promoter Score', abbreviation: 'NPS', category: 'Клиенты', definition: 'Индекс готовности клиентов рекомендовать бренд другим.', simple: 'Высокий NPS = сильная лояльность и органический рост.', seoHint: 'Поддерживает брендовый спрос и снижает CAC в долгую.' },
  { termBase: 'First Response Time', abbreviation: 'FRT', category: 'Продажи', definition: 'Среднее время первого ответа менеджера на обращение.', simple: 'Чем быстрее ответ, тем выше шанс закрыть лид в продажу.', seoHint: 'Одна из сильнейших метрик для повышения CR по лидам.' },
  { termBase: 'Lead-to-Call Rate', category: 'Продажи', definition: 'Доля лидов, с которыми состоялся звонок/контакт.', simple: 'Показывает дисциплину обработки заявок.', formula: 'Lead-to-Call = Contacted Leads / Leads × 100%', seoHint: 'Помогает выявлять потери после формы заявки.' },
  { termBase: 'Lead-to-Customer Rate', category: 'Продажи', definition: 'Доля лидов, ставших клиентами.', simple: 'Это реальный «выход в деньги» из входящего потока.', formula: 'L2C = New Customers / Leads × 100%', seoHint: 'Ключевая связка для расчета допустимого CPL.' },
  { termBase: 'Pipeline Velocity', category: 'Воронка продаж', definition: 'Скорость прохождения сделок по воронке.', simple: 'Чем выше скорость, тем быстрее маркетинг превращается в выручку.', seoHint: 'Ускорение цикла улучшает cash flow и окупаемость рекламы.' },
  { termBase: 'Average Sales Cycle', category: 'Воронка продаж', definition: 'Средняя длина цикла сделки от первого контакта до оплаты.', simple: 'Помогает планировать бюджет и ожидания по результатам.', seoHint: 'Не сравнивайте каналы без учета длины цикла сделки.' },
  { termBase: 'vCPM', abbreviation: 'vCPM', category: 'Медийка', definition: 'Стоимость 1000 видимых показов.', simple: 'Платите за показы, которые реально могли увидеть.', formula: 'vCPM = Spend / Viewable Impressions × 1000', seoHint: 'Важен при оценке качества медийных размещений.' },
  { termBase: 'Video Completion Rate', abbreviation: 'VCR', category: 'Видео', definition: 'Доля досмотров видео до конца.', simple: 'Если VCR высокий, креатив удерживает внимание.', formula: 'VCR = Completed Views / Video Starts × 100%', seoHint: 'Ключевая метрика для YouTube, Reels и Shorts.' },
  { termBase: 'Cost per View', abbreviation: 'CPV', category: 'Видео', definition: 'Цена одного просмотра видео по правилам платформы.', simple: 'Удобно сравнивать стоимость контакта через видео.', formula: 'CPV = Spend / Views', seoHint: 'Сравнивайте с вовлечением и последующими конверсиями.' },
  { termBase: 'Click-to-Message Rate', category: 'Мессенджеры', definition: 'Доля пользователей, начавших диалог после клика.', simple: 'Оценивает качество связки «объявление → чат».', formula: 'CTM = Chats Started / Clicks × 100%', seoHint: 'Полезно для WhatsApp/Telegram-лидогенерации.' },
  { termBase: 'Cost per Chat', abbreviation: 'CPCht', category: 'Мессенджеры', definition: 'Стоимость начатого чата.', simple: 'Показывает цену контакта в мессенджер-воронке.', formula: 'Cost per Chat = Spend / Chats Started', seoHint: 'Сравнивайте с качеством диалогов и продажами.' },
  { termBase: 'Organic Visibility', category: 'SEO', definition: 'Интегральная оценка видимости сайта в поисковой выдаче по целевому пулу запросов.', simple: 'Чем выше видимость, тем больше шанс получать органический трафик.', seoHint: 'Трекать по группам запросов, а не одной позиции.' },
  { termBase: 'Keyword Difficulty', abbreviation: 'KD', category: 'SEO', definition: 'Оценка конкурентности поискового запроса.', simple: 'Чем выше KD, тем сложнее выйти в топ быстро.', seoHint: 'Балансируйте сложные и низкоконкурентные кластеры.' },
  { termBase: 'Crawl Depth', category: 'Technical SEO', definition: 'Глубина страницы от главной в кликах.', simple: 'Слишком глубокие страницы хуже сканируются ботами.', seoHint: 'Держите важные страницы ближе к верхнему уровню.' },
  { termBase: 'Indexation Rate', category: 'Technical SEO', definition: 'Доля проиндексированных страниц от числа опубликованных/доступных для индексации.', simple: 'Если индексируется мало, контент теряет поисковый потенциал.', formula: 'Indexation Rate = Indexed Pages / Eligible Pages × 100%', seoHint: 'Следите за robots, canonical и статус-кодами.' },
  { termBase: 'Core Web Vitals Pass Rate', category: 'Technical SEO', definition: 'Доля URL, проходящих пороги CWV (LCP, INP, CLS).', simple: 'Быстрый и стабильный сайт лучше удерживает и ранжируется.', seoHint: 'Критично для SEO и UX одновременно.' },
  { termBase: 'SERP CTR', category: 'SEO', definition: 'CTR именно в органической поисковой выдаче.', simple: 'Показывает, насколько заголовок и сниппет кликабельны.', formula: 'SERP CTR = Organic Clicks / Organic Impressions × 100%', seoHint: 'Оптимизируйте title, description и намерение страницы.' },
  { termBase: 'Featured Snippet Share', category: 'AEO/SEO', definition: 'Доля запросов, где ваш сайт получил позицию featured snippet.', simple: 'Повышает видимость и доверие в выдаче.', seoHint: 'Используйте четкие определения, списки и структурированные ответы.' },
  { termBase: 'AI Citation Rate', category: 'AEO', definition: 'Доля ответов ИИ-систем, в которых ваш источник упоминается или цитируется.', simple: 'Показывает, насколько ваш контент заметен для AI-поиска.', formula: 'AI Citation Rate = AI Mentions / Tracked Prompts × 100%', seoHint: 'Ключевая метрика для Answer Engine Optimization.' },
  { termBase: 'Entity Coverage', category: 'AEO', definition: 'Насколько полно в контенте раскрыты сущности темы: термины, связи, контекст.', simple: 'Чем лучше покрытие темы, тем легче ИИ выбрать ваш материал источником.', seoHint: 'Стройте контент как знания, а не как набор ключевых слов.' },
  { termBase: 'Geo Precision Score', category: 'GEO', definition: 'Точность гео-таргетинга по фактическим данным о показах и конверсиях.', simple: 'Показывает, насколько реклама действительно попадает в нужные регионы.', seoHint: 'Снижает нецелевые расходы в локальных кампаниях.' },
  { termBase: 'Store Visit Lift', category: 'GEO', definition: 'Прирост офлайн-визитов в точки продаж под воздействием рекламы.', simple: 'Помогает доказать эффект digital на офлайн-точки.', seoHint: 'Важна для локального бизнеса и сетевого ритейла.' },
  { termBase: 'Local Pack Share', category: 'Local SEO', definition: 'Доля запросов, где компания попадает в локальный блок карт/компаний.', simple: 'Чем выше доля, тем больше локальных лидов без доплаты за клик.', seoHint: 'Оптимизируйте профиль компании, отзывы и NAP-данные.' },
  { termBase: 'Cost per Store Visit', abbreviation: 'CPSV', category: 'GEO', definition: 'Стоимость одного подтвержденного офлайн-визита.', simple: 'Показывает цену привлечения клиента в физическую точку.', formula: 'CPSV = Spend / Store Visits', seoHint: 'Полезно для оценки локальных performance-кампаний.' },
  { termBase: 'Data Freshness', category: 'Аналитика', definition: 'Насколько актуальны данные в отчетах по времени обновления.', simple: 'Старые данные = запоздалые решения.', seoHint: 'Особенно важно при оперативной оптимизации кампаний.' },
  { termBase: 'Tracking Coverage', category: 'Аналитика', definition: 'Доля ключевых событий воронки, которые реально трекаются.', simple: 'Нельзя улучшать то, что не измеряете.', formula: 'Coverage = Tracked Events / Required Events × 100%', seoHint: 'Базовая метрика зрелости аналитики.' },
  { termBase: 'Consent Opt-in Rate', category: 'Privacy', definition: 'Доля пользователей, давших согласие на аналитические/маркетинговые cookies.', simple: 'Низкий opt-in может искажать статистику и атрибуцию.', formula: 'Opt-in Rate = Consented Users / Total Users × 100%', seoHint: 'Критично для корректности данных в ЕС и других регулируемых рынках.' },
];

const standaloneTerms: MarketingGlossaryItem[] = [
  { id: 'standalone-kpi', term: 'KPI', abbreviation: 'KPI', category: 'Базовые термины', channel: 'Marketing', definition: 'Ключевой показатель эффективности, по которому оценивается достижение цели.', simple: 'Это главная цифра, которая показывает, идём ли мы к результату.', seoHint: 'KPI должны быть конкретными, измеримыми и привязанными к бизнес-цели.' },
  { id: 'standalone-north-star', term: 'North Star Metric', abbreviation: 'NSM', category: 'Базовые термины', channel: 'Marketing', definition: 'Основная метрика продукта/бизнеса, отражающая долгосрочную ценность для клиента.', simple: 'Одна «звезда», на которую ориентируется вся команда.', seoHint: 'Хорошо работает как фокус для приоритизации гипотез роста.' },
  { id: 'standalone-unit-economics', term: 'Unit-экономика', category: 'Финансы', channel: 'Marketing', definition: 'Экономика одной единицы бизнеса: клиента, заказа, подписки.', simple: 'Показывает, зарабатываете ли вы на каждой продаже.', seoHint: 'Без положительной unit-экономики масштабирование опасно.' },
  { id: 'standalone-sem', term: 'SEM', abbreviation: 'SEM', category: 'Search Marketing', channel: 'Marketing', definition: 'Search Engine Marketing — маркетинг в поисковых системах, включая SEO и платный поиск.', simple: 'Продвижение через поисковики: бесплатно (SEO) и платно (PPC).', seoHint: 'Интеграция SEO + PPC ускоряет покрытие спроса.' },
  { id: 'standalone-smm', term: 'SMM', abbreviation: 'SMM', category: 'Social', channel: 'Marketing', definition: 'Social Media Marketing — продвижение бренда и продаж через соцсети.', simple: 'Работа с контентом, охватом и вовлечением в социальных сетях.', seoHint: 'Поддерживает спрос бренда и влияет на многоканальную атрибуцию.' },
  { id: 'standalone-cro', term: 'CRO', abbreviation: 'CRO', category: 'Оптимизация', channel: 'Marketing', definition: 'Conversion Rate Optimization — системное повышение конверсии сайта/воронки.', simple: 'Делаем сайт понятнее, чтобы больше людей оставляли заявку или покупали.', seoHint: 'Один из самых выгодных рычагов роста при существующем трафике.' },
  { id: 'standalone-utm', term: 'UTM-метки', category: 'Аналитика', channel: 'Marketing', definition: 'Параметры в URL для точного определения источника, кампании и креатива.', simple: 'Помогают понять, какая реклама привела человека.', seoHint: 'Стандартизируйте naming convention для чистых отчетов.' },
  { id: 'standalone-schema', term: 'Schema Markup', category: 'SEO', channel: 'SEO', definition: 'Структурированные данные, помогающие поисковикам лучше понять содержание страницы.', simple: 'Специальная разметка, чтобы поисковик видел структуру контента.', seoHint: 'Важно для rich results и AEO-видимости.' },
  { id: 'standalone-eeat', term: 'E-E-A-T', abbreviation: 'E-E-A-T', category: 'SEO', channel: 'SEO', definition: 'Experience, Expertise, Authoritativeness, Trustworthiness — сигналы качества контента.', simple: 'Опыт, экспертность, авторитет и доверие автора/бренда.', seoHint: 'Ключевой принцип для YMYL и экспертных ниш.' },
  { id: 'standalone-geo', term: 'GEO', abbreviation: 'GEO', category: 'Новые подходы', channel: 'GEO', definition: 'Generative Engine Optimization — оптимизация контента для генеративных поисковых движков.', simple: 'Делаем контент, который ИИ-системы чаще используют в ответах.', seoHint: 'Фокус на точности, структуре и цитируемости источников.' },
  { id: 'standalone-aeo', term: 'AEO', abbreviation: 'AEO', category: 'Новые подходы', channel: 'AEO', definition: 'Answer Engine Optimization — оптимизация контента под прямые ответы в поиске и ИИ.', simple: 'Пишем так, чтобы на вопрос пользователя был ясный и быстрый ответ.', seoHint: 'Нужны четкие определения, FAQ-блоки и доказательная фактура.' },
  { id: 'standalone-llms', term: 'LLMs.txt', category: 'AEO', channel: 'AEO', definition: 'Файл с информацией для LLM-агентов о структуре и важных страницах сайта.', simple: 'Карта сайта специально для ИИ-ассистентов и агентов.', seoHint: 'Упрощает discovery ключевого контента для AI-систем.' },
];

const generated = channels.flatMap((channel) =>
  baseMetrics.map((metric, index) => ({
    id: `${channel.slug}-${index + 1}`,
    term: `${channel.label}: ${metric.termBase}`,
    abbreviation: metric.abbreviation,
    category: metric.category,
    channel: channel.label,
    definition: metric.definition,
    simple: metric.simple,
    formula: metric.formula,
    seoHint: metric.seoHint,
  }))
);

export const marketingGlossary: MarketingGlossaryItem[] = [...standaloneTerms, ...generated];

export const glossaryStats = {
  totalTerms: marketingGlossary.length,
  channels: Array.from(new Set(marketingGlossary.map((item) => item.channel))).length,
  categories: Array.from(new Set(marketingGlossary.map((item) => item.category))).length,
};
