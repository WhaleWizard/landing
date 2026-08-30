import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { useLocation, useNavigate, useNavigationType } from 'react-router';
import { ArrowRight, ChevronDown, Search, Sparkles } from 'lucide-react';
import Navbar from '../components/Navbar';
import PageNav from '../components/PageNav';
import SEO from '../components/SEO';
import { trackFaqOpen } from '../consent/consent';
import { glossaryTermById } from '../data/marketingGlossary';
import useFaqContent from '../hooks/useFaqContent';
import { preferredScrollBehavior } from '../utils/motionPreference';

const Footer = lazy(() => import('../components/Footer'));

export const FAQ_CATEGORIES = ['Старт', 'Бюджет', 'Аналитика', 'Приложения', 'Результат', 'Процесс', 'Консультация'] as const;
export type FaqCategory = (typeof FAQ_CATEGORIES)[number];

export interface FaqItem {
  id: string;
  question: string;
  answer: string;
  details: string[];
  category: FaqCategory;
  relatedTermIds?: string[];
  sourceIds?: string[];
  reviewedAt?: string;
}

type FaqSeed = Omit<FaqItem, 'id'>;

export const FAQ_SEO = {
  title: 'Вопросы о рекламе, аналитике и продвижении приложений',
  description: 'Понятные ответы о Google Ads, Meta Ads, аналитике, бюджетах, запуске рекламы и продвижении мобильных приложений.',
  h1: 'Ответы на вопросы о рекламе и аналитике',
  lead: 'О бюджетах, сроках, данных, качестве лидов и продвижении приложений — без обещаний, которые нельзя проверить.',
} as const;

const faqSeeds: FaqSeed[] = [
  {
    category: 'Старт',
    question: 'Что нужно подготовить перед запуском рекламы?',
    answer: 'Достаточно описать продукт, аудиторию, географию, экономику сделки и текущую точку.',
    details: [
      'Для оценки нужны средний чек, маржа или допустимая стоимость клиента — хотя бы ориентиры.',
      'Если реклама уже работала, пригодятся доступы к кабинетам, аналитике и история прошлых кампаний.',
      'Офферы, кейсы и материалы разберём вместе: идеальная упаковка до первого разговора не нужна.',
    ],
  },
  {
    category: 'Старт',
    question: 'Что выбрать: Google Ads или Meta Ads?',
    answer: 'Google Ads чаще используют для работы с существующим спросом, а Meta помогает находить и прогревать аудиторию через оффер и креативы.',
    details: [
      'Если продукт активно ищут, сначала проверяем поисковые кампании Google.',
      'Если решение выбирают визуально или спрос нужно сформировать, чаще подходит Meta.',
      'Иногда разумнее связка каналов, но распылять небольшой тестовый бюджет между ними не стоит.',
    ],
  },
  {
    category: 'Старт',
    question: 'Для каких проектов подходит работа с вами?',
    answer: 'Для услуг, e-commerce, B2B и приложений, где можно связать рекламу с заявкой, продажей или ценным действием.',
    details: [
      'Особенно полезна работа, когда важна не только цена лида, но и его качество после передачи в продажи.',
      'До старта я проверяю, есть ли достаточный спрос, понятный оффер и реалистичная экономика.',
      'Если реклама пока не лучший следующий шаг, скажу об этом и предложу, что подготовить сначала.',
    ],
  },
  {
    category: 'Старт',
    question: 'Можно ли запускать рекламу, если сайт ещё слабый?',
    answer: 'Можно, но сначала нужно понять, мешает ли сайт конверсии и можно ли исправить критичные места без полной переделки.',
    details: [
      'Проверяем мобильную версию, скорость, ясность оффера, формы и доверие к странице.',
      'Иногда достаточно поправить первый экран и путь до заявки; иногда выгоднее отложить трафик и доработать посадочную.',
      'Для некоторых задач альтернативой может быть лид-форма Meta или диалог в мессенджере.',
    ],
  },
  {
    category: 'Бюджет',
    question: 'Как определить бюджет на первый тест?',
    answer: 'Бюджет считают от ожидаемой цены целевого действия и объёма данных, достаточного для решения.',
    details: [
      'Один универсальный минимум для всех ниш был бы выдумкой: аукцион, география и цена продукта сильно различаются.',
      'Сначала оцениваем спрос и допустимую стоимость клиента, затем выбираем срок и границы теста.',
      'Если бюджета недостаточно для честной проверки гипотезы, лучше сузить задачу, а не запускать всё сразу.',
    ],
  },
  {
    category: 'Бюджет',
    question: 'Рекламный бюджет входит в стоимость работы?',
    answer: 'Нет. Бюджет оплачивается рекламной платформе, а работа по настройке и ведению — отдельно.',
    details: [
      'До старта фиксируем объём работ: каналы, географии, аналитика, количество кампаний и формат отчётности.',
      'Бюджет остаётся в вашем рекламном кабинете и расходуется прозрачно.',
      'Любое расширение задач согласовываем заранее — без неожиданных доплат после начала работы.',
    ],
  },
  {
    category: 'Бюджет',
    question: 'Какие дополнительные расходы могут понадобиться?',
    answer: 'Иногда отдельно оплачиваются креативы, коллтрекинг, CRM-интеграции, MMP или доработка сайта.',
    details: [
      'Нужные инструменты зависят от воронки: большинству проектов не требуется весь набор сразу.',
      'Каждый сторонний сервис или дополнительная работа обсуждаются до подключения.',
      'Я объясняю, зачем нужен каждый расход и можно ли обойтись более простым вариантом.',
    ],
  },
  {
    category: 'Бюджет',
    question: 'Когда можно увеличивать рекламный бюджет?',
    answer: 'Когда результат подтверждён не одним удачным днём, а серией конверсий приемлемого качества.',
    details: [
      'Смотрим не только CPL или CPA, но и квалификацию лидов, продажи, маржу и ограничения команды.',
      'Бюджет увеличивается поэтапно, чтобы увидеть момент, когда дополнительный объём становится дороже.',
      'Параллельно расширяем аудитории, запросы и креативы, а не просто повышаем дневной лимит.',
    ],
  },
  {
    category: 'Результат',
    question: 'Когда появятся первые выводы по рекламе?',
    answer: 'Первые сигналы видны после запуска, но срок для решения зависит от объёма трафика и длины сделки.',
    details: [
      'Для простой покупки данных обычно накапливается быстрее, чем для дорогой B2B-сделки.',
      'В начале проверяем корректность трафика, событий и форм; затем — стоимость и качество конверсий.',
      'Заранее договариваемся, по каким данным тест продолжаем, меняем или останавливаем.',
    ],
  },
  {
    category: 'Результат',
    question: 'Можно ли гарантировать конкретный CPL, ROAS или число продаж?',
    answer: 'Нет: результат зависит не только от настройки рекламы, но и от продукта, цены, сайта, спроса и работы отдела продаж.',
    details: [
      'До старта можно оценить диапазон и риски, но выдавать прогноз за гарантию нечестно.',
      'Я отвечаю за корректную настройку, прозрачные данные, регулярные тесты и понятные решения.',
      'Фактические ориентиры уточняются по мере накопления данных именно вашего проекта.',
    ],
  },
  {
    category: 'Результат',
    question: 'Что делать, если заявки есть, а продаж мало?',
    answer: 'Нужно понять, где теряется продажа: в обещании рекламы, форме, качестве лида, скорости ответа или самом процессе продажи.',
    details: [
      'Разделяем обращения на целевые и нецелевые и возвращаем этот сигнал в рекламные системы.',
      'Сверяем объявления с реальным предложением, чтобы не получать дешёвые, но бесполезные заявки.',
      'Смотрим конверсию от лида до контакта, квалификации и оплаты, чтобы найти конкретный этап потери.',
    ],
  },
  {
    category: 'Результат',
    question: 'По каким показателям оценивается эффективность?',
    answer: 'Главная метрика выбирается по бизнес-модели: стоимость квалифицированного лида, клиента, покупки или выручка с учётом маржи.',
    details: [
      'CTR, CPC и CPM помогают диагностировать кампанию, но сами по себе не доказывают прибыль.',
      'Для e-commerce важны покупки, средний чек, ROAS и валовая прибыль; для лидогенерации — качество и конверсия в продажу.',
      'Набор KPI фиксируется до запуска, чтобы не выбирать удобную цифру задним числом.',
    ],
  },
  {
    category: 'Аналитика',
    question: 'Какую аналитику вы настраиваете?',
    answer: 'Настраиваю события сайта или приложения, рекламные пиксели, GA4/GTM и, когда это нужно, передачу ключевых этапов из CRM.',
    details: [
      'Сначала составляем карту событий: что пользователь сделал и какое действие действительно ценно для бизнеса.',
      'Проверяем UTM-метки, дубли событий, валюту, выручку и соответствие данных между системами.',
      'Кампании оптимизируются на события, которым можно доверять, а не просто на самый частый клик.',
    ],
  },
  {
    category: 'Аналитика',
    question: 'Зачем для сайта использовать Meta Pixel и Conversions API вместе?',
    answer: 'Pixel передаёт события из браузера, а Conversions API — с сервера или CRM. Одно и то же событие можно отправить обоими способами без двойного учёта.',
    details: [
      'Для дедупликации у браузерной и серверной версий должны совпадать название события и event_id.',
      'CAPI не отменяет согласие пользователя и не является способом обойти ограничения приватности.',
      'Перед запуском проверяем качество сопоставления и диагностику событий в Meta Events Manager.',
    ],
  },
  {
    category: 'Аналитика',
    question: 'Можно ли оптимизировать рекламу по качеству лидов из CRM?',
    answer: 'Да, если CRM хранит статусы и их можно корректно связать с рекламным кликом или заявкой.',
    details: [
      'В платформу можно возвращать квалифицированный лид, сделку или покупку вместо одной отправки формы.',
      'Важно заранее договориться, что именно считается качественным лидом и кто обновляет статусы.',
      'Чистота CRM здесь важнее сложного дашборда: ошибочные статусы обучают алгоритм не тому результату.',
    ],
  },
  {
    category: 'Аналитика',
    question: 'Как учитывать звонки, переписку и офлайн-продажи?',
    answer: 'Через коллтрекинг, CRM и импорт офлайн-конверсий — если эти источники можно надёжно сопоставить с рекламой.',
    details: [
      'Для звонков сохраняется источник и результат разговора, для чатов — начало диалога и дальнейший статус.',
      'Офлайн-события передаются только при наличии достаточных идентификаторов и корректных настроек согласия.',
      'Если точное сопоставление невозможно, это честно отмечается в отчёте, а не маскируется модельной цифрой.',
    ],
  },
  {
    category: 'Аналитика',
    question: 'Кому принадлежат рекламные кабинеты, данные и доступы?',
    answer: 'Кабинеты, история, платёжные данные и накопленные аудитории должны оставаться под контролем владельца бизнеса.',
    details: [
      'По возможности активы создаются на стороне клиента, а я подключаюсь по роли с минимально необходимыми правами.',
      'В отчёте видны расход, ключевые результаты, изменения и следующий план действий.',
      'После завершения работы доступ подрядчика можно отозвать без потери истории, настроек и собственности на активы.',
    ],
  },
  {
    category: 'Процесс',
    question: 'Как проходит запуск и дальнейшее ведение?',
    answer: 'Сначала фиксируем цель и аналитику, затем запускаем кампании, проверяем качество результата и только после этого масштабируем.',
    details: [
      'Перед запуском согласовываем оффер, KPI, бюджетные рамки и события, по которым принимаются решения.',
      'После старта сначала исключаем технические ошибки, затем сравниваем аудитории, запросы и креативы.',
      'Каждая заметная правка должна отвечать на конкретный вопрос, а не создавать активность ради отчёта.',
    ],
  },
  {
    category: 'Процесс',
    question: 'Кто готовит тексты, баннеры и видео?',
    answer: 'Я готовлю гипотезы, офферы и технические задания на креативы. Дизайн, съёмку и монтаж согласовываем отдельно под ресурсы проекта.',
    details: [
      'Если у вас есть дизайнер или продакшен, я ставлю задачу с форматами, идеей и критериями теста.',
      'Если команды нет, заранее определяем, какие материалы можно собрать из имеющихся и что заказать отдельно.',
      'Креативы планируются сериями, чтобы тестировать смысл и подачу, а не случайные картинки.',
    ],
  },
  {
    category: 'Процесс',
    question: 'Как устроена коммуникация по проекту?',
    answer: 'Рабочие вопросы решаем в согласованном мессенджере, а результаты и решения фиксируем письменно.',
    details: [
      'Срочные вопросы по остановке кампаний или расходам отделяются от плановых гипотез.',
      'Периодичность созвонов и отчётов зависит от этапа проекта и фиксируется на старте.',
      'Вместо длинного списка действий вы получаете вывод: что произошло, почему и что делаем дальше.',
    ],
  },
  {
    category: 'Приложения',
    question: 'Что нужно для запуска рекламы мобильного приложения?',
    answer: 'Нужны опубликованное приложение, доступы к Meta Business и рекламному аккаунту, карта ключевых событий и рабочий способ передачи их в Meta — через Meta SDK, интегрированный MMP или Conversions API для серверных событий.',
    details: [
      'Связываем правильные iOS- и Android-карточки, Meta App ID и рекламные активы.',
      'Проверяем install или first open, регистрацию, trial, подписку и Purchase с фактическими value и currency.',
      'До расходов тестируем путь через store, deep и deferred deep links, privacy-сценарии и диагностику Meta Events Manager.',
    ],
    relatedTermIds: ['meta-app-promotion-objective', 'meta-sdk', 'mobile-measurement-partner', 'meta-conversions-api-app-events'],
    sourceIds: ['meta-advantage-apps', 'meta-capi', 'meta-app-events'],
    reviewedAt: '2026-07-30',
  },
  {
    category: 'Приложения',
    question: 'На что лучше оптимизировать кампанию приложения?',
    answer: 'На наиболее близкое к выручке событие, которое корректно размечено, доступно для оптимизации и набирает достаточно сигнала. Универсального порога событий нет.',
    details: [
      'Если глубокое событие редкое, начинаем с установки, регистрации или trial и заранее определяем условие перехода.',
      'Событие должно отражать реальное действие: регистрацию нельзя называть Purchase ради удобной оптимизации.',
      'Value optimization требует фактических value и currency; результат оцениваем по зрелым когортам, а не только по CPI.',
    ],
    relatedTermIds: ['meta-app-event-optimization', 'meta-value-optimization', 'standard-app-event', 'cohort-analysis'],
    sourceIds: ['meta-app-ads', 'meta-blueprint-app-events'],
    reviewedAt: '2026-07-30',
  },
  {
    category: 'Приложения',
    question: 'Как ограничения iOS влияют на рекламу приложений?',
    answer: 'ATT ограничивает cross-app tracking и доступ к IDFA, а AdAttributionKit, SKAdNetwork и Meta AEM дают агрегированное privacy-preserving измерение. Это разные слои, их нельзя смешивать.',
    details: [
      'Отказ ATT не отключает всё измерение: Apple attribution frameworks работают независимо от ATT-статуса.',
      'Apple сейчас рекомендует AdAttributionKit, а SKAdNetwork остаётся совместимым App Store-слоем.',
      'Задержки, privacy tiers и моделирование закономерно дают расхождения между Meta, MMP и App Store Connect.',
    ],
    relatedTermIds: ['app-tracking-transparency', 'adattributionkit', 'skadnetwork', 'meta-aem-app-events'],
    sourceIds: ['apple-att', 'apple-adattributionkit', 'apple-skan', 'meta-blueprint-app-events'],
    reviewedAt: '2026-07-30',
  },
  {
    category: 'Приложения',
    question: 'Нужен ли приложению MMP?',
    answer: 'Не всегда. MMP оправдан при нескольких сетях и платформах, единой атрибуции и когортах, postbacks, deep linking или контроле фрода; он не становится автоматически единственным источником истины.',
    details: [
      'Для небольшого одноканального теста может хватить Meta SDK и корректной продуктовой аналитики.',
      'При сочетании MMP, SDK и CAPI нужен один владелец события, точный mapping и дедупликация.',
      'Сравниваем определения и окна атрибуции, а не требуем полного равенства всех отчётов.',
    ],
    relatedTermIds: ['mobile-measurement-partner', 'postback', 'app-event-mapping', 'app-event-deduplication'],
    sourceIds: ['meta-advantage-apps', 'google-app-conversions'],
    reviewedAt: '2026-07-30',
  },
  {
    category: 'Приложения',
    question: 'Meta SDK, MMP и Conversions API — что выбрать?',
    answer: 'Это разные слои: SDK фиксирует действия на устройстве, MMP связывает установки и события с рекламными источниками, а CAPI передаёт доверенные серверные app events. Они могут сосуществовать.',
    details: [
      'Выбираем минимальную архитектуру, которая покрывает измерение, оптимизацию и нужные рекламные сети.',
      'При нескольких источниках нужна единая карта событий и дедупликация одного реального действия.',
      'Ни один из инструментов не обходит ATT, согласие пользователя или правила Meta, Apple и Google.',
    ],
    relatedTermIds: ['meta-sdk', 'mobile-measurement-partner', 'meta-conversions-api-app-events', 'app-event-deduplication'],
    sourceIds: ['meta-capi', 'meta-app-events'],
    reviewedAt: '2026-07-30',
  },
  {
    category: 'Приложения',
    question: 'Что такое ATT и нужен ли он для SKAdNetwork или AdAttributionKit?',
    answer: 'ATT нужен для cross-company tracking и доступа к IDFA. Privacy-preserving attribution frameworks Apple работают независимо от ATT-статуса.',
    details: [
      'ATT — системное разрешение iOS, а не синоним cookie-баннера, GDPR-consent или любого продуктового измерения.',
      'Deferred linking через общую межкомпанейскую идентичность может требовать ATT — это нужно проверить у провайдера.',
      'После отказа нельзя подменять IDFA fingerprinting или альтернативным общим идентификатором.',
    ],
    relatedTermIds: ['app-tracking-transparency', 'idfa', 'adattributionkit', 'skadnetwork'],
    sourceIds: ['apple-att', 'apple-adattributionkit', 'apple-skan'],
    reviewedAt: '2026-07-30',
  },
  {
    category: 'Приложения',
    question: 'Чем установка отличается от first open и регистрации?',
    answer: 'Загрузка или установка, первый зарегистрированный запуск и продуктовая регистрация — разные этапы воронки; их нельзя складывать как новых пользователей.',
    details: [
      'Загрузка из store может не завершиться запуском приложения.',
      'First open подтверждает первый запуск, но ещё не активацию и не ценность пользователя.',
      'Регистрация, trial, подписка и покупка — отдельные post-install events с собственными правилами.',
    ],
    relatedTermIds: ['app-install', 'first-open', 'post-install-event', 'app-activation'],
    sourceIds: ['google-app-conversions', 'meta-app-events'],
    reviewedAt: '2026-07-30',
  },
  {
    category: 'Приложения',
    question: 'Почему Meta, MMP и App Store Connect показывают разные цифры?',
    answer: 'Потому что системы используют разные окна и правила атрибуции, click/view credit, часовые пояса, reinstall-логику, privacy thresholds, задержки postback и моделирование.',
    details: [
      'Сначала сравниваем одно событие, дату события, timezone и одинаковое окно атрибуции.',
      'Raw SKAN postbacks, перераспределённые отчёты и modeled reporting не обязаны совпадать точно.',
      'Ошибки интеграции исправляем, но не придумываем одну «правильную» цифру без общей методики.',
    ],
    relatedTermIds: ['attribution-window', 'postback', 'skan-postback', 'modeled-conversion'],
    sourceIds: ['apple-skan', 'meta-blueprint-app-events'],
    reviewedAt: '2026-07-30',
  },
  {
    category: 'Приложения',
    question: 'Нужны ли deep links и deferred deep links?',
    answer: 'Deep link ведёт установленного пользователя к нужному экрану, а deferred deep link пытается сохранить назначение через установку. Они уменьшают трение, но требуют разработки и тестирования.',
    details: [
      'Проверяем installed, not installed, первый запуск, авторизованное и неавторизованное состояния и безопасный fallback.',
      'Для обычных HTTPS-ссылок предпочитаем Universal Links на iOS и Android App Links.',
      'Privacy-модель third-party deferred linking может влиять на необходимость ATT.',
    ],
    relatedTermIds: ['deep-link', 'deferred-deep-link', 'universal-link', 'android-app-link'],
    sourceIds: ['meta-app-deep-linking', 'apple-universal-links', 'android-app-links'],
    reviewedAt: '2026-07-30',
  },
  {
    category: 'Приложения',
    question: 'Как проверить события приложения до запуска рекламы?',
    answer: 'Используем event matrix и тестируем обе ОС: trigger, источник, event name, event_id, value, currency, consent state и ожидаемое число событий.',
    details: [
      'Проверяем release build, реальный store-путь, Meta Events Manager и доступные raw logs MMP.',
      'После дедупликации одно реальное действие должно давать одно итоговое событие.',
      'Не передаём запрещённые чувствительные данные и отдельно проверяем поведение при разных privacy-статусах.',
    ],
    relatedTermIds: ['app-event-mapping', 'app-event-deduplication', 'meta-events-manager', 'tracking-coverage'],
    sourceIds: ['meta-app-events', 'meta-capi'],
    reviewedAt: '2026-07-30',
  },
  {
    category: 'Консультация',
    question: 'В каких случаях консультация полезнее полноценного ведения?',
    answer: 'Когда таргетологу нужно разобрать один конкретный вопрос по офферу, кейсам, поиску клиентов или продаже проекта.',
    details: [
      'Подходит для разбора позиционирования, портфолио, первого сообщения, переписки с клиентом или аргументации цены.',
      'Если вопрос требует внедрения, после разговора будет понятно, какой объём работы действительно нужен.',
      'Если задач много, до созвона выбираем одну главную, чтобы не получить поверхностный разговор обо всём.',
    ],
  },
  {
    category: 'Консультация',
    question: 'Как проходит консультация?',
    answer: 'До встречи вы присылаете контекст и материалы, на созвоне разбираем задачу, после — фиксируем выводы и следующие шаги.',
    details: [
      'Обычно достаточно 60–90 минут, если вопрос заранее сформулирован и доступны нужные данные.',
      'Разбор опирается на ваш проект: реальные объявления, страницы, цифры или рабочие материалы.',
      'Общие лекции и шаблонные презентации не занимают время встречи.',
    ],
  },
  {
    category: 'Консультация',
    question: 'Что останется после консультации?',
    answer: 'Понятное решение по главному вопросу и список действий в приоритетном порядке.',
    details: [
      'Фиксируем, что сделать сейчас, что проверить позже и от чего пока отказаться.',
      'Для каждого шага указываем ожидаемый результат или способ проверки.',
      'Если нужны дополнительные специалисты или инструменты, это будет отмечено отдельно.',
    ],
  },
];

const FAQ_ID_BY_QUESTION: Record<string, string> = {
  'Что нужно подготовить перед запуском рекламы?': 'prepare-before-launch',
  'Что выбрать: Google Ads или Meta Ads?': 'choose-google-or-meta',
  'Для каких проектов подходит работа с вами?': 'project-fit',
  'Можно ли запускать рекламу, если сайт ещё слабый?': 'weak-site-before-ads',
  'Как определить бюджет на первый тест?': 'first-test-budget',
  'Рекламный бюджет входит в стоимость работы?': 'media-budget-separate',
  'Какие дополнительные расходы могут понадобиться?': 'additional-costs',
  'Когда можно увеличивать рекламный бюджет?': 'scale-media-budget',
  'Когда появятся первые выводы по рекламе?': 'first-conclusions',
  'Можно ли гарантировать конкретный CPL, ROAS или число продаж?': 'no-performance-guarantees',
  'Что делать, если заявки есть, а продаж мало?': 'leads-without-sales',
  'По каким показателям оценивается эффективность?': 'performance-kpis',
  'Какую аналитику вы настраиваете?': 'analytics-setup',
  'Зачем для сайта использовать Meta Pixel и Conversions API вместе?': 'website-pixel-and-capi',
  'Можно ли оптимизировать рекламу по качеству лидов из CRM?': 'crm-lead-quality',
  'Как учитывать звонки, переписку и офлайн-продажи?': 'calls-chats-offline-sales',
  'Кому принадлежат рекламные кабинеты, данные и доступы?': 'asset-ownership',
  'Как проходит запуск и дальнейшее ведение?': 'launch-and-management-process',
  'Кто готовит тексты, баннеры и видео?': 'creative-production',
  'Как устроена коммуникация по проекту?': 'project-communication',
  'Что нужно для запуска рекламы мобильного приложения?': 'app-launch-requirements',
  'На что лучше оптимизировать кампанию приложения?': 'app-optimization-event',
  'Как ограничения iOS влияют на рекламу приложений?': 'ios-app-measurement',
  'Нужен ли приложению MMP?': 'app-mmp',
  'Meta SDK, MMP и Conversions API — что выбрать?': 'app-measurement-stack',
  'Что такое ATT и нужен ли он для SKAdNetwork или AdAttributionKit?': 'app-att-skan-adattributionkit',
  'Чем установка отличается от first open и регистрации?': 'app-install-first-open-registration',
  'Почему Meta, MMP и App Store Connect показывают разные цифры?': 'app-reporting-differences',
  'Нужны ли deep links и deferred deep links?': 'app-deep-links',
  'Как проверить события приложения до запуска рекламы?': 'app-event-testing',
  'В каких случаях консультация полезнее полноценного ведения?': 'consultation-vs-management',
  'Как проходит консультация?': 'consultation-process',
  'Что останется после консультации?': 'consultation-deliverables',
};

const fallbackFaqId = (question: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < question.length; index += 1) {
    hash ^= question.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `legacy-${(hash >>> 0).toString(36)}`;
};

export const faqs: FaqItem[] = faqSeeds.map((item) => ({
  ...item,
  id: FAQ_ID_BY_QUESTION[item.question] || fallbackFaqId(item.question),
}));

export default function FAQPage() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | FaqCategory>('all');
  const defaultSeo = useMemo(() => ({
    title: FAQ_SEO.title,
    description: FAQ_SEO.description,
  }), []);
  const faqContent = useFaqContent(faqs, defaultSeo);
  const liveFaqs = useMemo(() => faqContent.items.map((item) => ({
    ...item,
    id: item.id || fallbackFaqId(item.question),
    details: Array.isArray(item.details) ? item.details : [],
  })), [faqContent.items]);

  const filteredFaqs = useMemo(() => {
    const q = query.trim().toLowerCase();
    return liveFaqs.filter((item) => {
      if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
      if (!q) return true;
      return [
        item.question,
        item.answer,
        item.details.join(' '),
        item.category,
        ...(item.relatedTermIds || []),
      ].join(' ').toLowerCase().includes(q);
    });
  }, [liveFaqs, query, selectedCategory]);

  const groupedFaqs = useMemo(() => FAQ_CATEGORIES
    .map((category) => ({
      category,
      items: filteredFaqs.filter((item) => item.category === category),
    }))
    .filter((group) => group.items.length > 0), [filteredFaqs]);

  const faqSchema = useMemo(
    () => ({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: liveFaqs.map((item) => ({
        '@type': 'Question',
        '@id': `https://www.whalewzrd.com/faq/#faq-${item.id}`,
        name: item.question,
        acceptedAnswer: {
          '@type': 'Answer',
          text: `${item.answer} ${item.details.join(' ')}`,
        },
      })),
    }),
    [liveFaqs],
  );

  useEffect(() => {
    let script = document.getElementById('ld-faq-page') as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = 'ld-faq-page';
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }
    script.textContent = JSON.stringify(faqSchema);
    return () => script?.remove();
  }, [faqSchema]);

  useEffect(() => {
    const rawHash = location.hash.slice(1);
    if (!rawHash.startsWith('faq-')) return;
    const faqId = rawHash.slice('faq-'.length);
    if (!liveFaqs.some((item) => item.id === faqId)) return;

    setSelectedCategory('all');
    setQuery('');
    const shouldAlignHash = navigationType !== 'POP' || location.key === 'default';
    const timer = window.setTimeout(() => {
      const disclosure = document.getElementById(`faq-${faqId}`) as HTMLDetailsElement | null;
      if (!disclosure) return;
      disclosure.open = true;
      if (shouldAlignHash) {
        disclosure.scrollIntoView({ block: 'start', behavior: preferredScrollBehavior() });
      }
    }, 80);
    return () => window.clearTimeout(timer);
  }, [liveFaqs, location.hash, location.key, navigationType]);

  const replaceFaqHash = (faqId?: string) => {
    const nextUrl = `${window.location.pathname}${window.location.search}${faqId ? `#faq-${faqId}` : ''}`;
    window.history.replaceState(window.history.state, '', nextUrl);
  };

  const resetFilters = () => {
    setQuery('');
    setSelectedCategory('all');
  };

  return (
    <>
      <Navbar variant="content" />
      <SEO
        title={faqContent.seo.title}
        description={faqContent.seo.description}
        url="/faq"
      />

      <section className="marketing-typography min-h-screen bg-background px-4 pb-16 pt-24 sm:px-6 md:pb-24 md:pt-32">
        <div className="max-w-5xl mx-auto">
          <PageNav
            crumbs={[
              { label: 'Главная', to: '/' },
              { label: 'FAQ' },
            ]}
            className="mb-8"
          />
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-10"
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-4">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-xs md:text-sm text-primary font-semibold">FAQ</span>
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-pretty">
              Ответы на вопросы о рекламе и{' '}
              <span className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent">
                аналитике
              </span>
            </h1>
            <p className="text-muted-foreground mt-4 max-w-3xl mx-auto text-pretty">
              {FAQ_SEO.lead}
            </p>
          </motion.div>

          <div className="mb-7 rounded-2xl border border-border bg-card/30 p-3 sm:p-4">
            <div className="relative">
              <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Найти вопрос: бюджет, CAPI, ATT, приложение…"
                aria-label="Поиск по вопросам"
                className="min-h-11 w-full rounded-xl border border-border bg-background/70 py-3 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div
              className="mt-3 flex w-full min-w-0 max-w-full gap-2 overflow-x-auto overscroll-x-contain pb-2 scroll-px-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden after:block after:h-px after:w-3 after:shrink-0 after:content-['']"
              aria-label="Категории FAQ"
            >
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                aria-pressed={selectedCategory === 'all'}
                className={`min-h-11 whitespace-nowrap rounded-lg border px-3 py-2 text-sm transition-colors ${
                  selectedCategory === 'all'
                    ? 'border-primary bg-primary/15 text-primary'
                    : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                Все вопросы
              </button>
              {FAQ_CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  aria-pressed={selectedCategory === category}
                  className={`min-h-11 whitespace-nowrap rounded-lg border px-3 py-2 text-sm transition-colors ${
                    selectedCategory === category
                      ? 'border-primary bg-primary/15 text-primary'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {category}
                  <span className="ml-1.5 text-xs opacity-70">
                    {liveFaqs.filter((item) => item.category === category).length}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-9">
            {groupedFaqs.map((group) => (
              <section key={group.category} aria-labelledby={`faq-category-${group.category}`}>
                <div className="mb-3 flex items-end justify-between gap-4">
                  <h2 id={`faq-category-${group.category}`} className="text-xl md:text-2xl font-semibold">
                    {group.category}
                  </h2>
                  <span className="text-sm text-muted-foreground tabular-nums">{group.items.length}</span>
                </div>
                <div className="grid gap-3">
                  {group.items.map((faq) => (
                    <details
                      key={faq.id}
                      id={`faq-${faq.id}`}
                      className="group scroll-mt-24 rounded-2xl border border-border bg-card/40 transition-colors open:border-primary/40 open:bg-card/60"
                      onToggle={(event) => {
                        const disclosure = event.currentTarget;
                        if (disclosure.open) replaceFaqHash(faq.id);
                        else if (window.location.hash === `#faq-${faq.id}`) replaceFaqHash();
                      }}
                    >
                      <summary
                        className="flex min-h-11 cursor-pointer list-none items-start justify-between gap-4 rounded-2xl p-4 marker:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 sm:p-5 [&::-webkit-details-marker]:hidden"
                        onClick={(event) => {
                          const disclosure = event.currentTarget.parentElement as HTMLDetailsElement;
                          if (!disclosure.open) trackFaqOpen(faq.question);
                        }}
                      >
                        <span className="min-w-0">
                          <span className="block text-base md:text-lg font-semibold text-pretty break-words">
                            {faq.question}
                          </span>
                          <span className="mt-2 block text-sm text-muted-foreground text-pretty break-words">
                            {faq.answer}
                          </span>
                        </span>
                        <ChevronDown
                          className="mt-1 h-5 w-5 shrink-0 text-primary transition-transform duration-200 group-open:rotate-180"
                          aria-hidden="true"
                        />
                      </summary>

                      <div className="px-4 pb-5 sm:px-5">
                        <div className="min-w-0 space-y-3 border-t border-border/60 pt-4 text-sm text-muted-foreground leading-relaxed">
                          {faq.details.map((point, pointIndex) => (
                            <div key={`${faq.id}-detail-${pointIndex + 1}`} className="pl-4 border-l-2 border-primary/30 text-pretty break-words">
                              {point}
                            </div>
                          ))}
                        </div>

                        {faq.relatedTermIds?.length ? (
                          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border/60 pt-4 text-xs">
                            <span className="text-muted-foreground">Термины:</span>
                            {faq.relatedTermIds.map((termId) => (
                              <a
                                key={termId}
                                href={`/marketing-glossary/#term-${termId}`}
                                className="rounded-md border border-border px-2 py-1 text-primary hover:border-primary/50"
                              >
                                {glossaryTermById[termId]?.abbreviation || glossaryTermById[termId]?.term || termId}
                              </a>
                            ))}
                          </div>
                        ) : null}

                        <a
                          href={`#faq-${faq.id}`}
                          onClick={() => replaceFaqHash(faq.id)}
                          className="mt-3 inline-flex min-h-10 items-center text-xs text-muted-foreground hover:text-primary"
                          aria-label={`Постоянная ссылка на вопрос: ${faq.question}`}
                        >
                          Постоянная ссылка
                        </a>
                      </div>
                    </details>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {filteredFaqs.length === 0 && (
            <div className="rounded-2xl border border-border bg-card/30 px-5 py-10 text-center text-muted-foreground text-pretty">
              <p>По вашему запросу ничего не найдено. Попробуйте сформулировать короче или убрать категорию.</p>
              <button type="button" onClick={resetFilters} className="mt-4 min-h-11 text-primary hover:underline">
                Показать все вопросы
              </button>
            </div>
          )}

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="mt-12"
          >
            <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/10 via-accent/5 to-secondary/10 p-6 md:p-8 text-center">
              <h3 className="text-xl md:text-2xl font-bold text-pretty">Не нашли вопрос про свой проект?</h3>
              <p className="text-muted-foreground mt-2 mb-5 text-pretty">
                Коротко расскажите о проекте — подскажу, с чего разумнее начать и какие данные понадобятся.
              </p>
              <button
                onClick={() => {
                  // Переход с хешем вместо «перейти на главную и через 80 мс
                  // поискать форму»: чанк главной за это время может не
                  // успеть загрузиться, и человек оставался наверху главной.
                  navigate('/#contact');
                }}
                className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-primary to-accent px-6 py-3 text-white font-semibold hover:opacity-95 transition-opacity"
              >
                Обсудить проект
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
            </div>
          </motion.div>
        </div>
      </section>
      <Suspense fallback={null}>
        <Footer />
      </Suspense>
    </>
  );
}
