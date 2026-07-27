import { lazy, Suspense, useEffect, type CSSProperties, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { BarChart3, Briefcase, CheckCircle2, Search, ShoppingCart, Sparkles, Target, TrendingUp, Users, Zap } from 'lucide-react';
import Navbar from '../components/Navbar';
import Hero, { type HeroContent } from '../components/Hero';
import LandingForm from '../components/LandingForm';
import SEO from '../components/SEO';
import type { ServicesContent } from '../components/Services';
import type { CasesContent } from '../components/Cases';
import type { CallToActionContent } from '../components/CallToAction';
import type { TestimonialsContent } from '../components/Testimonials';
import useServiceContent from '../hooks/useServiceContent';
import { managedBodyClasses, managedTitleClasses, type ContentTypography } from '../utils/contentTypography';

const Services = lazy(() => import('../components/Services'));
const Cases = lazy(() => import('../components/Cases'));
const CallToAction = lazy(() => import('../components/CallToAction'));
const Testimonials = lazy(() => import('../components/Testimonials'));
const Footer = lazy(() => import('../components/Footer'));

export type ServiceType = 'meta-ads' | 'google-ads' | 'consult' | 'meta-apps';

type LandingTheme = {
  primary: string;
  accent: string;
  secondary: string;
  orbFrom: string;
  orbTo: string;
  badgeClassName: string;
  sparkleClassName: string;
  labelClassName: string;
  titleGradientClassName: string;
  checkGradientClassName: string;
  shadowClassName: string;
};

type ServiceLandingPageProps = {
  service: ServiceType;
  seo: {
    title: string;
    description: string;
    url: string;
  };
  hero: HeroContent;
  services: ServicesContent;
  cases: CasesContent;
  cta: CallToActionContent;
  contact: {
    badge: string;
    titlePrefix: string;
    titleAccent: string;
    description: string;
    bullets: string[];
    typography?: ContentTypography;
  };
  theme: LandingTheme;
};

const themes: Record<ServiceType, LandingTheme> = {
  'meta-ads': {
    // Mirrored 1:1 from meta-apps by request.
    primary: '#4F7DFF',
    accent: '#B04DFF',
    secondary: '#FF7AB6',
    orbFrom: 'rgba(79, 125, 255, 0.22)',
    orbTo: 'rgba(255, 122, 182, 0.18)',
    badgeClassName: 'bg-[#4F7DFF]/10 border-[#4F7DFF]/20',
    sparkleClassName: 'text-[#4F7DFF]',
    labelClassName: 'text-[#4F7DFF]',
    titleGradientClassName: 'from-[#4F7DFF] via-[#B04DFF] to-[#FF7AB6]',
    checkGradientClassName: 'from-[#4F7DFF] to-[#B04DFF]',
    shadowClassName: 'shadow-[#4F7DFF]/20',
  },
  'google-ads': {
    primary: '#4285F4',
    accent: '#34A853',
    secondary: '#FBBC04',
    orbFrom: 'rgba(66, 133, 244, 0.22)',
    orbTo: 'rgba(52, 168, 83, 0.2)',
    badgeClassName: 'bg-[#4285F4]/10 border-[#4285F4]/20',
    sparkleClassName: 'text-[#4285F4]',
    labelClassName: 'text-[#4285F4]',
    titleGradientClassName: 'from-[#4285F4] via-[#34A853] to-[#FBBC04]',
    checkGradientClassName: 'from-[#4285F4] to-[#34A853]',
    shadowClassName: 'shadow-[#4285F4]/20',
  },
  'meta-apps': {
    primary: '#4F7DFF',
    accent: '#B04DFF',
    secondary: '#FF7AB6',
    orbFrom: 'rgba(79, 125, 255, 0.22)',
    orbTo: 'rgba(255, 122, 182, 0.18)',
    badgeClassName: 'bg-[#4F7DFF]/10 border-[#4F7DFF]/20',
    sparkleClassName: 'text-[#4F7DFF]',
    labelClassName: 'text-[#4F7DFF]',
    titleGradientClassName: 'from-[#4F7DFF] via-[#B04DFF] to-[#FF7AB6]',
    checkGradientClassName: 'from-[#4F7DFF] to-[#B04DFF]',
    shadowClassName: 'shadow-[#4F7DFF]/20',
  },
  consult: {
    primary: '#8B5CF6',
    accent: '#6366F1',
    secondary: '#3B82F6',
    orbFrom: 'rgba(139, 92, 246, 0.22)',
    orbTo: 'rgba(59, 130, 246, 0.2)',
    badgeClassName: 'bg-primary/10 border-primary/20',
    sparkleClassName: 'text-primary',
    labelClassName: 'text-primary',
    titleGradientClassName: 'from-primary via-accent to-secondary',
    checkGradientClassName: 'from-primary to-accent',
    shadowClassName: 'shadow-primary/20',
  },
};

const CASE_IMAGES = {
  concierge: '/images/case-concierge.jpg',
  ecommerce: '/images/case-ecommerce.jpg',
  info: '/images/case-infobusiness.jpg',
  b2c: '/images/case-b2c.jpg',
};

export const META_APPS_TESTIMONIAL_CONTENT: TestimonialsContent = {
  badge: 'Отзывы о работе',
  titlePrefix: 'Клиенты ценят',
  titleAccent: 'понятные решения по цифрам',
  description: 'В отзывах чаще всего повторяются три вещи: погружаюсь в продукт, быстро реагирую на изменения и объясняю, что происходит с рекламой и бюджетом.',
};

export const pageConfigs: Record<ServiceType, Omit<ServiceLandingPageProps, 'service' | 'theme'>> = {
  'meta-ads': {
    seo: {
      title: 'Настройка Meta Ads для заявок и продаж',
      description: 'Запуск и ведение рекламы в Facebook и Instagram: оффер, креативы, Meta Pixel, Conversions API и передача статусов лидов из CRM.',
      url: '/meta-ads',
    },
    hero: {
      badge: 'Meta Ads для заявок и продаж',
      titlePrefix: 'Реклама в Meta:',
      titleAccent: 'клиенты, а не просто лиды',
      titleLines: [
        { text: 'Реклама в Meta:' },
        { text: 'клиенты, а не просто лиды', tone: 'accent' },
        { text: 'Instagram и Facebook — с оптимизацией на продажи', tone: 'supporting' },
      ],
      paragraphs: [
        'Настраиваю и веду таргет в Instagram и Facebook: оффер, креативы, аудитории, ретаргетинг. Первые заявки — уже в период теста.',
        'Подключаю Pixel, CAPI и продажи из CRM, чтобы Meta училась на покупателях, а бюджет уходил в кампании, которые приводят клиентов.',
      ],
      primaryButton: 'Разобрать рекламу',
      secondaryButton: 'Частые ситуации',
      stats: [
        { value: 'Pixel', label: 'что делают люди на сайте' },
        { value: 'CAPI', label: 'продажи уходят в Meta' },
        { value: 'CRM', label: 'видно, кто купил' },
      ],
    },
    services: {
      badge: 'Что входит в работу',
      titlePrefix: 'От оффера и креативов',
      titleAccent: 'до данных о продажах',
      description: 'Собираю рекламу как одну систему: оффер, креатив, посадочную, события и обратную связь из CRM. Каждая часть должна помогать получить не просто лид, а клиента.',
      cards: [
        {
          icon: Target,
          title: 'Оффер и план тестов',
          description: 'Проверяю, понятно ли человеку, что вы предлагаете и почему стоит оставить заявку. На этой основе собираю гипотезы по сегментам, офферу и посадочной.',
          features: ['Оффер', 'Сегменты', 'Посадочная', 'План тестов'],
          gradient: 'from-primary to-accent',
        },
        {
          icon: Zap,
          title: 'Креативы и подача',
          description: 'Готовлю сценарии для Reels, Stories и ленты. У каждого материала одна задача: показать пользу, снять конкретное возражение или привести к следующему шагу.',
          features: ['Сценарии', 'Видео и статика', 'Reels / Stories', 'Разбор тестов'],
          gradient: 'from-accent to-secondary',
        },
        {
          icon: BarChart3,
          title: 'Pixel, CAPI и CRM',
          description: 'Проверяю, что браузерные и серверные события не дублируются. При наличии CRM возвращаю статусы заявок, чтобы видеть, какие кампании приводят клиентов.',
          features: ['Meta Pixel', 'Conversions API', 'Дедупликация', 'Статусы лидов'],
          gradient: 'from-secondary to-primary',
        },
        {
          icon: TrendingUp,
          title: 'Запуск и управление',
          description: 'Сравниваю кампании не только по CPL. Бюджет получает то, что приводит квалифицированные заявки, клиентов или покупки.',
          features: ['Advantage+', 'Бюджет', 'Качество лидов', 'Отчёт и решения'],
          gradient: 'from-primary via-accent to-secondary',
        },
      ],
      detailed: {
        title: 'Как строится работа',
        button: 'Обсудить задачу',
        sections: [
          {
            title: '1. ЦЕЛЬ И ДИАГНОСТИКА',
            icon: Target,
            text: 'Сначала фиксируем бизнес-результат: квалифицированная заявка, запись или продажа. Проверяю кабинет, посадочную, события и данные CRM.\n\n• Где теряется конверсия\n• Как считается допустимая стоимость результата\n• Какие ограничения есть по географии и продукту\n• Какие гипотезы проверяем первыми\n\nПосле разбора остаются целевые метрики и понятный план первого теста.',
          },
          {
            title: '2. СОБЫТИЯ И ОБРАТНАЯ СВЯЗЬ',
            icon: BarChart3,
            text: 'Проверяю, что Meta получает нужные события и не считает одно действие дважды.\n\n• Meta Pixel и Conversions API\n• Общий event_id и дедупликация\n• UTM и источник в CRM\n• Статусы квалификации и продажи — если система и согласия это позволяют\n\nФиксирую карту событий и список исправлений для аналитики.',
          },
          {
            title: '3. КРЕАТИВЫ И ЗАПУСК',
            icon: Zap,
            text: 'Собираю несколько разных рекламных подач, а не десятки случайных объявлений.\n\n• Польза продукта и ключевое возражение\n• Вертикальные версии для Reels и Stories\n• Лента, формы или сообщения — по задаче\n• Отдельная гипотеза и метрика для каждого теста\n\nТак у каждого креатива есть понятная роль и критерий решения.',
          },
          {
            title: '4. РЕШЕНИЯ ПО ДАННЫМ',
            icon: TrendingUp,
            text: 'Не меняю кампании ради активности. Жду достаточный объём данных и принимаю решение по стоимости и качеству результата.\n\n• Что остановить\n• Что оставить и доработать\n• Какой новый тест запустить\n• Когда бюджет можно увеличивать\n\nВ отчёте показываю выводы, принятое решение и следующий шаг.',
          },
        ],
      },
    },
    cases: {
      badge: 'С чем чаще всего приходят',
      titlePrefix: 'Где теряется результат',
      titleAccent: 'в Meta Ads',
      description: 'Лиды могут быть дорогими, не доходить до продаж, расходиться с аналитикой или перестать расти в объёме. Для каждой причины нужна своя проверка — универсальной «оптимизации кабинета» здесь нет.',
      items: [
        {
          title: 'Лиды есть, продаж мало',
          category: 'Услуги и B2B',
          description: 'Возвращаем из CRM статусы квалификации и продажи, чтобы видеть не только CPL, но и стоимость клиента.',
          image: CASE_IMAGES.concierge,
          stats: [
            { label: 'Заявка', value: 'CPL' },
            { label: 'Качество', value: 'CRM' },
            { label: 'Клиент', value: 'CAC' },
          ],
        },
        {
          title: 'Лиды слишком дорогие',
          category: 'Лидогенерация',
          description: 'Проверяем оффер, креатив, форму и посадочную по цепочке, чтобы понять, где именно теряется конверсия.',
          image: CASE_IMAGES.info,
          stats: [
            { label: 'Объявление', value: 'CTR' },
            { label: 'Страница', value: 'CR' },
            { label: 'Заявка', value: 'CPL' },
          ],
        },
        {
          title: 'Продажи есть, экономика не сходится',
          category: 'E-commerce',
          description: 'Проверяем Purchase, сумму покупки, CAPI, каталог и маржу. Оптимизируем кампании по продажам или выручке, когда данных уже достаточно.',
          image: CASE_IMAGES.ecommerce,
          stats: [
            { label: 'Покупка', value: 'CPA' },
            { label: 'Выручка', value: 'ROAS' },
            { label: 'Экономика', value: 'Маржа' },
          ],
        },
        {
          title: 'Кампании упёрлись в объём',
          category: 'Масштабирование',
          description: 'Добавляем новые креативные направления и увеличиваем бюджет поэтапно — с контролем цены и качества результата.',
          image: CASE_IMAGES.b2c,
          stats: [
            { label: 'Расход', value: 'Бюджет' },
            { label: 'Результат', value: 'CPA' },
            { label: 'Показы', value: 'Частота' },
          ],
        },
      ],
    },
    cta: {
      badge: 'Разбор Meta Ads',
      title: 'Где ваша реклама теряет деньги?',
      description: 'Разберу кампании, события и путь заявки до продажи. Скажу, что исправить сразу, что проверить тестом, а что пока не трогать.',
      button: 'Запросить разбор',
    },
    contact: {
      badge: 'Первичный разбор',
      titlePrefix: 'Разберём вашу рекламу',
      titleAccent: 'по цифрам',
      description: 'Оставьте ссылку на сайт, контакты и диапазон бюджета. Посмотрю кабинет и кампании, если реклама уже идёт, и отвечу, что бы я исправил в первую очередь.',
      bullets: [
        'Какая цена заявки сходится с экономикой',
        'Что происходит с заявкой после формы',
        'Какие данные о продажах получает Meta',
        'Какой тест запустить первым',
      ],
    },
  },
  'google-ads': {
    seo: {
      title: 'Настройка и ведение Google Ads — Search, Shopping, PMax',
      description: 'Настройка и ведение Google Ads для услуг и e-commerce: Search, Shopping, Performance Max, аналитика конверсий и оптимизация по CPA или ценности продаж.',
      url: '/google-ads',
    },
    hero: {
      badge: 'Настройка и ведение Google Ads',
      titlePrefix: 'Реклама в Google:',
      titleAccent: 'клиенты, которые уже ищут вас',
      paragraphs: [
        'Настраиваю Search, Shopping и Performance Max под запросы, по которым покупают, — без мусорных кликов и бюджета, потраченного впустую.',
        'Перед стартом считаю спрос и допустимую цену заявки: если для нормального теста их не хватает, скажу заранее. Конверсии настраиваю так, чтобы Google видел продажи, а не просто клики.',
      ],
      primaryButton: 'Оценить спрос',
      secondaryButton: 'Типовые задачи',
      stats: [
        { value: 'Search', label: 'клиенты из поиска' },
        { value: 'PMax', label: 'товары и охват' },
        { value: 'CRM', label: 'продажи видны Google' },
      ],
    },
    services: {
      badge: 'Что входит в работу',
      titlePrefix: 'Что именно я',
      titleAccent: 'настраиваю и веду',
      description: 'Формат кампаний выбираю после проверки спроса и данных. Search, Shopping и PMax не обязаны запускаться одновременно.',
      cards: [
        {
          icon: Search,
          title: 'Поиск по намерению',
          description: 'Разделяю брендовый и небрендовый спрос, группирую запросы по намерению и исключаю нерелевантные показы по фактическим данным.',
          features: ['Структура спроса', 'Объявления', 'Минус-слова', 'Посадочные'],
          gradient: 'from-primary to-accent',
        },
        {
          icon: ShoppingCart,
          title: 'Shopping и PMax',
          description: 'Настраиваю Merchant Center, товарный фид и группы активов. Контролирую цели, брендовый трафик и исключения в PMax.',
          features: ['Merchant Center', 'Товарный фид', 'Группы активов', 'Контроль бренда'],
          gradient: 'from-accent to-secondary',
        },
        {
          icon: BarChart3,
          title: 'Конверсии и данные',
          description: 'Проверяю Google tag, GTM и GA4, убираю дубли целей, подключаю Enhanced Conversions и, если возможно, статусы из CRM.',
          features: ['Google tag', 'GA4 / GTM', 'Enhanced Conversions', 'CRM-статусы'],
          gradient: 'from-secondary to-primary',
        },
        {
          icon: TrendingUp,
          title: 'Стратегия ставок по задаче',
          description: 'Если конверсии равноценны, выбираю стратегию по целевой CPA. Если покупки различаются по ценности и выручка передаётся корректно — оптимизацию по ценности и ROAS.',
          features: ['Smart Bidding', 'CPA / ROAS', 'Ценность', 'Эксперименты'],
          gradient: 'from-primary via-accent to-secondary',
        },
      ],
      detailed: {
        title: 'Как строится работа',
        button: 'Обсудить задачу',
        sections: [
          {
            title: '1. СПРОС И ЭКОНОМИКА',
            icon: Search,
            text: 'Сначала выясняю, что для бизнеса считается хорошим результатом и сколько за него допустимо платить.\n\n• Оцениваю объём и характер поискового спроса\n• Сверяю средний чек, маржу и конверсию отдела продаж\n• Разделяю брендовый и небрендовый спрос\n• Проверяю страницы, на которые пойдёт трафик\n\nПосле этого понятно, что тестировать, каким бюджетом и по какой метрике принимать решение.',
          },
          {
            title: '2. ИЗМЕРЕНИЕ',
            icon: BarChart3,
            text: 'До запуска автоматических ставок проверяю, какие сигналы попадут в аккаунт.\n\n• Настраиваю Google tag, GTM и GA4\n• Убираю дубли и второстепенные события из основных целей\n• Подключаю Enhanced Conversions\n• При возможности передаю из CRM квалифицированные лиды или продажи\n\nGoogle должен видеть не любое действие на сайте, а то, что действительно связано с выручкой.',
          },
          {
            title: '3. ЗАПУСК',
            icon: Zap,
            text: 'Запускаю не набор форматов, а понятную структуру под задачу.\n\n• Search — когда спрос уже сформирован\n• Shopping и PMax — для товаров, когда готовы фид и данные о покупках\n• PMax для лидогенерации — только после настройки конверсий и передачи качества лидов из CRM\n• YouTube или Demand Gen — отдельным тестом, если нужно создавать спрос\n\nУ каждого типа кампаний есть своя роль и отдельный критерий оценки.',
          },
          {
            title: '4. ВЕДЕНИЕ И РОСТ',
            icon: TrendingUp,
            text: 'Ведение — это не ежедневное дёрганье ставок. Изменения делаю, когда накопились данные и прошёл нужный цикл конверсии.\n\n• Проверяю поисковые запросы, объявления и страницы\n• Слежу за ограничениями бюджета и стратегией ставок\n• Сравниваю стоимость, качество лидов и ценность продаж\n• Подтверждённые сегменты усиливаю, новые гипотезы тестирую отдельно\n\nВ отчёте объясняю, что изменилось, почему и какое решение принято.',
          },
        ],
      },
    },
    cases: {
      badge: 'Когда я полезен',
      titlePrefix: 'Типовые задачи в',
      titleAccent: 'Google Ads',
      description: 'Четыре ситуации, для которых нужен разный набор кампаний, данных и критериев оценки.',
      items: [
        {
          title: 'Search для услуг',
          category: 'Поиск + CRM',
          description: 'Собираю запросы по намерению, исключаю нецелевой спрос и возвращаю в Google информацию о качестве обращений.',
          image: CASE_IMAGES.b2c,
          stats: [
            { label: 'Спрос', value: 'Search' },
            { label: 'Качество', value: 'CRM' },
            { label: 'Результат', value: 'CPA' },
          ],
        },
        {
          title: 'Shopping и PMax',
          category: 'E-commerce',
          description: 'Привожу в порядок Merchant Center и фид, передаю ценность покупок и разделяю товары по марже и задаче.',
          image: CASE_IMAGES.ecommerce,
          stats: [
            { label: 'Основа', value: 'Фид' },
            { label: 'Данные', value: 'Value' },
            { label: 'Выручка', value: 'ROAS' },
          ],
        },
        {
          title: 'B2B с длинной сделкой',
          category: 'Поиск + CRM',
          description: 'Связываю рекламу с этапами CRM и оцениваю не отправки формы, а квалифицированные лиды, встречи и сделки.',
          image: CASE_IMAGES.concierge,
          stats: [
            { label: 'Обращение', value: 'Лид' },
            { label: 'Квалификация', value: 'SQL' },
            { label: 'Продажа', value: 'CRM' },
          ],
        },
        {
          title: 'Аудит аккаунта',
          category: 'Диагностика',
          description: 'Проверяю цели, запросы, структуру, брендовый трафик и бюджет. Исправления расставляю по влиянию и риску.',
          image: CASE_IMAGES.info,
          stats: [
            { label: 'Измерение', value: 'Цели' },
            { label: 'Трафик', value: 'Запросы' },
            { label: 'Расход', value: 'Бюджет' },
          ],
        },
      ],
    },
    cta: {
      badge: 'Предварительный разбор',
      title: 'Запуск с нуля или порядок в текущем аккаунте?',
      description: 'Посмотрю сайт, спрос и цифры. Отвечу, какой формат Google Ads проверить первым и что подготовить до старта.',
      button: 'Обсудить задачу',
    },
    contact: {
      badge: 'Предварительный разбор',
      titlePrefix: 'Проверим спрос',
      titleAccent: 'по вашей нише',
      description: 'Оставьте сайт и контакты. Посмотрю, сколько людей ищут ваш продукт и что стоит клик, и отвечу, с чего бы я начал. Для аудита аккаунта хватит доступа на просмотр.',
      bullets: [
        'Есть ли спрос и что стоит клик в нише',
        'Какие кампании уместны на старте',
        'Что поправить в аналитике до запуска',
        'Какой бюджет нужен на первый тест',
      ],
    },
  },
  'meta-apps': {
    seo: {
      title: 'Реклама мобильных приложений в Meta Ads',
      description: 'Продвижение iOS- и Android-приложений: события после установки, Meta SDK, MMP, Conversions API, креативы и оптимизация по целевому действию.',
      url: '/meta-apps',
    },
    hero: {
      badge: 'Meta Ads для iOS и Android',
      titlePrefix: 'Реклама приложений в Meta:',
      titleAccent: 'качественные установки',
      titleLines: [
        { text: 'Реклама приложений в Meta:' },
        { text: 'качественные установки', tone: 'accent' },
        { text: 'и оптимизация на покупки, донаты и подписки', tone: 'supporting' },
      ],
      paragraphs: [
        'Привожу пользователей, которые не просто ставят приложение, а регистрируются, покупают и оформляют подписки. Когда данных достаточно — оптимизирую кампании прямо на продажи и донаты.',
        'Для этого проверяю SDK, MMP и CAPI: Meta должна видеть события после установки и учиться на платящих пользователях, а не на случайных инсталлах.',
      ],
      primaryButton: 'Разобрать приложение',
      secondaryButton: 'Сценарии продвижения',
      stats: [
        { value: 'SDK', label: 'действия в приложении' },
        { value: 'MMP', label: 'источник установки' },
        { value: 'CAPI', label: 'покупки с сервера' },
      ],
    },
    services: {
      badge: 'Что настраиваю',
      titlePrefix: 'От установки',
      titleAccent: 'до ценного события',
      description: 'Выстраиваю кампанию вокруг триала, заказа, покупки или подписки — того действия, которое приносит продукту деньги. Если данных мало, начинаю с более частого события и перехожу к оплатам, когда данных уже достаточно.',
      cards: [
        {
          icon: Target,
          title: 'События и экономика',
          description: 'Считаю допустимую стоимость целевого действия и выбираю цель для старта — регистрацию, триал, покупку или подписку.',
          features: ['Установка', 'Регистрация', 'Триал / покупка', 'Доход'],
          gradient: 'from-primary to-accent',
        },
        {
          icon: BarChart3,
          title: 'SDK, MMP и CAPI',
          description: 'Сверяю Meta SDK, MMP и CAPI: какие события дошли, где появились дубли и что потерялось. Если нужна доработка, даю разработчику карту событий и конкретное ТЗ.',
          features: ['Meta SDK', 'MMP', 'Conversions API', 'Дедупликация'],
          gradient: 'from-accent to-secondary',
        },
        {
          icon: Zap,
          title: 'Креативы с продуктом',
          description: 'Строю креатив вокруг реального сценария в приложении: один экран, одна ситуация, один понятный результат. Отдельно готовлю версии под Reels и Stories.',
          features: ['Демо продукта', 'UGC-сценарии', 'Reels / Stories', 'Варианты оффера'],
          gradient: 'from-secondary to-primary',
        },
        {
          icon: TrendingUp,
          title: 'Кампании и рост',
          description: 'Смотрю не только на CPI: сравниваю цену установки со стоимостью регистрации, покупки или подписки. Бюджет увеличиваю, когда эти действия укладываются в экономику продукта.',
          features: ['CPI', 'CPA', 'ROAS / LTV', 'Гео и бюджет'],
          gradient: 'from-primary via-accent to-secondary',
        },
      ],
      detailed: {
        title: 'Как строится продвижение',
        button: 'Разобрать приложение',
        sections: [
          {
            title: '1. ЦЕЛЬ И ЭКОНОМИКА',
            icon: Target,
            text: 'Определяем, какое действие в приложении связано с ценностью для бизнеса и сколько оно может стоить.\n\n• Модель монетизации: подписка, заказ, покупка или заявка\n• Путь от установки до целевого действия\n• География и ограничения категории\n• Достаточно ли событий для выбранной оптимизации\n\nФиксируем основное событие, промежуточные шаги и рамку допустимой стоимости.',
          },
          {
            title: '2. ПЕРЕДАЧА СОБЫТИЙ',
            icon: BarChart3,
            text: 'Проверяю, как события попадают в Meta и где появляются расхождения или дубли.\n\n• Meta SDK, MMP или Conversions API\n• Связка приложения с набором данных Meta\n• Проверка дублей между источниками\n• ATT и ограничения атрибуции на iOS\n\nЕсли нужна доработка приложения, даю разработчику ТЗ с картой событий и найденными пробелами.',
          },
          {
            title: '3. КРЕАТИВЫ И ЗАПУСК',
            icon: Zap,
            text: 'Креатив начинается с конкретной ситуации: что человек сделает в приложении и какой результат получит.\n\n• Настоящие экраны и демонстрация продукта\n• Один понятный сценарий на один ролик\n• Версии для Reels и Stories\n• Разные офферы без вводящих в заблуждение обещаний\n\nДля первого теста у каждого материала есть своя гипотеза и метрика.',
          },
          {
            title: '4. ОПТИМИЗАЦИЯ И БЮДЖЕТ',
            icon: TrendingUp,
            text: 'Смотрю на воронку целиком: установку, активацию, целевое действие и ценность пользователя.\n\n• CPI и стоимость целевого действия\n• Покупки или подписки\n• ROAS, удержание и LTV — если их можно надёжно рассчитать по продуктовым данным\n• Разрезы по креативам и географии\n\nПо этим данным решаю, что остановить, что проверить дальше и где можно увеличивать бюджет.',
          },
        ],
      },
    },
    cases: {
      badge: 'Сценарии продвижения',
      titlePrefix: 'Оптимизация зависит',
      titleAccent: 'от модели приложения',
      description: 'Это не клиентские кейсы и не прогноз результата. Ниже — четыре типовые воронки, для каждой нужны свои события и критерии эффективности.',
      items: [
        {
          title: 'Приложение с подпиской',
          category: 'Триал и подписка',
          description: 'Сначала оптимизируемся на триал, затем — на первую оплату, когда таких событий уже достаточно.',
          image: CASE_IMAGES.info,
          stats: [
            { label: 'Установка', value: 'CPI' },
            { label: 'Триал', value: 'CPA' },
            { label: 'Подписка', value: 'CAC' },
          ],
        },
        {
          title: 'Доставка или маркетплейс',
          category: 'Первый заказ',
          description: 'Отделяем первый заказ от повторного и считаем стоимость привлечения по экономике заказа, а не по переходу в стор.',
          image: CASE_IMAGES.ecommerce,
          stats: [
            { label: 'Установка', value: 'CPI' },
            { label: 'Первый заказ', value: 'CPA' },
            { label: 'Повтор', value: 'LTV' },
          ],
        },
        {
          title: 'Мобильная игра',
          category: 'Активация и покупки',
          description: 'Связываем рекламу с прохождением онбординга и первой покупкой, а в креативах показываем реальный игровой процесс.',
          image: CASE_IMAGES.b2c,
          stats: [
            { label: 'Установка', value: 'CPI' },
            { label: 'Активация', value: 'CPA' },
            { label: 'Покупки', value: 'ROAS' },
          ],
        },
        {
          title: 'Сервис в приложении',
          category: 'Заявка или запись',
          description: 'Оптимизируемся на запись, заявку или оплату. Если сделка закрывается позже, возвращаем её статус в Meta.',
          image: CASE_IMAGES.concierge,
          stats: [
            { label: 'Установка', value: 'CPI' },
            { label: 'Заявка', value: 'CPL' },
            { label: 'Клиент', value: 'CAC' },
          ],
        },
      ],
    },
    cta: {
      badge: 'Разбор приложения',
      title: 'На какое событие уже можно оптимизироваться?',
      description: 'Посмотрю воронку, события и текущие кампании. Отвечу, чего не хватает для оптимизации по оплатам и где теряются данные.',
      button: 'Разобрать приложение',
    },
    contact: {
      badge: 'Первичный разбор',
      titlePrefix: 'Покажите приложение —',
      titleAccent: 'разберём воронку',
      description: 'Оставьте ссылку на App Store или Google Play и контакты. Посмотрю воронку и отвечу, с какого события стоит начать и чего не хватает для оптимизации по оплатам.',
      bullets: [
        'Установка, регистрация, триал, покупка',
        'SDK, MMP, CAPI — что доходит до Meta',
        'Креативы и карточка в сторе',
        'Сколько может стоить пользователь',
      ],
    },
  },
  consult: {
    seo: {
      title: 'Консультация по рекламе: аудит кабинета и разбор для таргетологов',
      description: 'Консультация один на один за $70: аудит рекламного кабинета Meta и Google для бизнеса, помощь тем, кто ведёт рекламу сам, и разбор оффера и кейсов для таргетологов.',
      url: '/consult',
    },
    hero: {
      badge: 'Консультация один на один',
      titlePrefix: 'Консультация по рекламе:',
      titleAccent: 'для бизнеса и таргетологов',
      paragraphs: [
        'Бизнесу и тем, кто ведёт рекламу сам, — разбор кабинета: где утекает бюджет, что с данными и что чинить первым. Таргетологам — оффер, кейсы и продажа своих услуг.',
        'Формат простой: до созвона присылаете один главный вопрос, после — конкретные правки и план на 30 дней. Стоимость — $70. Если задача за одну встречу не решается, скажу до оплаты.',
      ],
      primaryButton: 'Записаться на разбор',
      secondaryButton: 'С чем можно прийти',
      stats: [
        { value: '$70', label: 'встреча 60–90 минут' },
        { value: '1', label: 'главный запрос' },
        { value: '30 дней', label: 'план действий' },
      ],
    },
    services: {
      badge: 'Темы разбора',
      titlePrefix: 'С чем можно прийти',
      titleAccent: 'на консультацию',
      description: 'Выбираем одну основную задачу и разбираем её глубоко — неважно, свой это бизнес, своя реклама или свои клиенты.',
      cards: [
        {
          icon: Target,
          title: 'Аудит рекламного кабинета',
          description: 'Для бизнеса. Смотрим кампании, события и бюджет: где деньги тратятся впустую, что с данными и что менять в первую очередь.',
          features: ['Кампании', 'Pixel и CAPI', 'Бюджет', 'Приоритеты'],
          gradient: 'from-primary to-accent',
        },
        {
          icon: TrendingUp,
          title: 'Ведёте рекламу сами',
          description: 'Проверим настройки, аудитории и креативы, разберём, почему дорожает результат, и соберём план тестов — чтобы не жечь бюджет вслепую.',
          features: ['Настройки', 'Креативы', 'Тесты', 'План'],
          gradient: 'from-accent to-secondary',
        },
        {
          icon: Briefcase,
          title: 'Проверка подрядчика',
          description: 'Непонятно, что делает ваш таргетолог? Посмотрю кабинет и отчёты и скажу честно: всё в порядке — или что именно спросить и поменять.',
          features: ['Кабинет', 'Отчёты', 'Вопросы', 'Выводы'],
          gradient: 'from-secondary to-primary',
        },
        {
          icon: Users,
          title: 'Таргетологам: оффер и клиенты',
          description: 'Правим оффер, кейсы и переписку на ваших материалах: как показать ценность, назвать цену и взять следующий проект.',
          features: ['Оффер', 'Кейсы', 'Цена', 'Переговоры'],
          gradient: 'from-primary via-accent to-secondary',
        },
      ],
      detailed: {
        title: 'Как проходит разбор',
        button: 'Описать запрос',
        sections: [
          {
            title: '1. ДО СОЗВОНА',
            icon: Target,
            text: 'Вы присылаете один главный вопрос и материалы, на которых видна проблема: доступ к кабинету на просмотр, отчёт подрядчика, профиль или кейс.\n\nТак встреча начинается с вашей реальной ситуации, а не с долгого сбора вводных.',
          },
          {
            title: '2. НАХОДИМ УЗКОЕ МЕСТО',
            icon: Briefcase,
            text: 'Смотрим не «всё сразу», а конкретный этап: настройки и данные, креативы, оффер или переговоры.\n\nОтделяем главную причину от второстепенных и выбираем, что реально исправить за одну встречу.',
          },
          {
            title: '3. ПРАВИМ НА ПРИМЕРАХ',
            icon: Users,
            text: 'Разбираем ваши кампании, отчёты или материалы и правим прямо по ходу: что отключить, что перезапустить, как переформулировать.\n\nВы уходите с конкретными правками, а не с набором общих советов.',
          },
          {
            title: '4. СЛЕДУЮЩИЕ ШАГИ',
            icon: TrendingUp,
            text: 'В конце — приоритеты на 30 дней: что изменить, что проверить и по каким цифрам оценивать прогресс.\n\nПлан реалистичный по объёму и привязан к одному главному запросу.',
          },
        ],
      },
    },
    cases: {
      badge: 'Кому подойдёт',
      titlePrefix: 'Разбор полезен, если',
      titleAccent: 'вы упёрлись в одну задачу',
      description: 'Это рабочая встреча, а не курс и не наставничество. Готовых баз клиентов и гарантий дохода здесь нет — есть конкретные правки.',
      items: [
        {
          title: 'Бюджет уходит, продаж мало',
          category: 'Для бизнеса',
          description: 'Реклама крутится, отчёты приходят, а заявок или продаж не прибавляется — и непонятно, где именно теряются деньги.',
          image: CASE_IMAGES.ecommerce,
          stats: [
            { label: 'Материал', value: 'Кабинет' },
            { label: 'Фокус', value: 'Бюджет' },
            { label: 'Итог', value: 'Приоритеты' },
          ],
        },
        {
          title: 'Не понимаю, что делает подрядчик',
          category: 'Для бизнеса',
          description: 'Таргетолог присылает цифры, но что за ними стоит — неясно. Нужен независимый взгляд без обвинений и без продажи «переделать всё».',
          image: CASE_IMAGES.concierge,
          stats: [
            { label: 'Материал', value: 'Отчёты' },
            { label: 'Фокус', value: 'Проверка' },
            { label: 'Итог', value: 'Выводы' },
          ],
        },
        {
          title: 'Оффер звучит как у всех',
          category: 'Таргетологам',
          description: 'Опыт уже есть, но потенциальному клиенту непонятно, кому вы помогаете и за какой результат он платит.',
          image: CASE_IMAGES.b2c,
          stats: [
            { label: 'Материал', value: 'Профиль' },
            { label: 'Фокус', value: 'Оффер' },
            { label: 'Итог', value: 'Правки' },
          ],
        },
        {
          title: 'Сложно назвать цену',
          category: 'Таргетологам',
          description: 'Диалог идёт нормально, но трудно определить объём работы, аргументировать стоимость и договориться о следующем шаге.',
          image: CASE_IMAGES.info,
          stats: [
            { label: 'Материал', value: 'Диалог' },
            { label: 'Фокус', value: 'Цена' },
            { label: 'Итог', value: 'След. шаг' },
          ],
        },
      ],
    },
    cta: {
      badge: 'Личный разбор',
      title: 'Есть конкретный вопрос по рекламе или клиентам?',
      description: 'Коротко опишите ситуацию. Отвечу, решается ли она за одну встречу за $70 и какие материалы подготовить.',
      button: 'Описать запрос',
    },
    contact: {
      badge: 'Запись на разбор',
      titlePrefix: 'Опишите, где',
      titleAccent: 'вы застряли',
      description: 'Подойдёт и бизнесу, и специалистам. Чем конкретнее вводные, тем полезнее встреча; если запрос не помещается в один созвон — предупрежу заранее.',
      bullets: [
        'Ссылка на кабинет, сайт или профиль',
        'Один главный вопрос',
        'Что уже пробовали и что получилось',
        'Отчёт подрядчика или переписка, если вопрос о них',
      ],
    },
  },
};

function SectionSkeleton({ height = 'min-h-[180px]' }: { height?: string }) {
  return <div className={`w-full ${height}`} aria-hidden="true" />;
}

/*
 * Пока секция за пределами экрана, браузер не верстает её содержимое и берёт
 * высоту из containIntrinsicSize. Общая заглушка в 720px не совпадала ни с
 * одной реальной секцией: на десктопе они занимают 1585 / 1728 / 371 / 1124 /
 * 430 px. Из-за этого при прокрутке высота документа скакала с 5537 до 7174 px
 * — ползунок прыгал, а контент уезжал из-под пальца.
 *
 * Ключевое слово auto заставляет браузер запомнить фактическую высоту после
 * первой отрисовки и дальше использовать её; число рядом — только запасное
 * значение до этого момента. Поэтому оно должно быть близко к правде.
 */
function DeferredSection({
  children,
  height = 'min-h-[180px]',
  intrinsicHeight,
}: {
  children: ReactNode;
  height?: string;
  intrinsicHeight: number;
}) {
  return (
    <section style={{ contentVisibility: 'auto', containIntrinsicSize: `auto 1px auto ${intrinsicHeight}px` }}>
      <Suspense fallback={<SectionSkeleton height={height} />}>{children}</Suspense>
    </section>
  );
}

function ContactSection({ service, contact, theme }: Pick<ServiceLandingPageProps, 'service' | 'contact' | 'theme'>) {
  return (
    <section id="contact" className="relative py-16 md:py-24 overflow-hidden">
      <div
        className="absolute top-0 left-1/4 w-80 h-80 md:w-96 md:h-96 rounded-full blur-[128px] animate-pulse pointer-events-none"
        style={{ backgroundColor: theme.orbFrom }}
      />
      <div
        className="absolute bottom-0 right-1/4 w-80 h-80 md:w-96 md:h-96 rounded-full blur-[128px] animate-pulse pointer-events-none"
        style={{ backgroundColor: theme.orbTo, animationDelay: '1s' }}
      />
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent opacity-60`} />

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-start">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-60px', amount: 0.2 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="text-center lg:text-left"
          >
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border mb-6 backdrop-blur-sm ${theme.badgeClassName}`}>
              <Sparkles className={`w-4 h-4 ${theme.sparkleClassName}`} />
              <span className={`text-sm font-semibold ${theme.labelClassName}`}>{contact.badge}</span>
            </div>

            <h2 className={`text-balance text-3xl md:text-4xl lg:text-[44px] font-bold mb-6 leading-tight tracking-[-0.02em] ${managedTitleClasses(contact.typography, 'contact')}`}>
              {contact.titlePrefix}{' '}
              <span className={`bg-gradient-to-r ${theme.titleGradientClassName} bg-clip-text text-transparent`}>
                {contact.titleAccent}
              </span>
            </h2>

            <p className={`text-muted-foreground text-base md:text-lg mb-8 max-w-lg mx-auto lg:mx-0 text-pretty leading-relaxed ${managedBodyClasses(contact.typography)}`}>
              {contact.description}
            </p>

            <div className="space-y-4 max-w-md mx-auto lg:mx-0">
              {contact.bullets.map((item, i) => (
                <motion.div
                  key={item}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08, duration: 0.35 }}
                  className="flex items-center gap-3 text-left"
                >
                  <div className={`w-6 h-6 rounded-full bg-gradient-to-r ${theme.checkGradientClassName} flex items-center justify-center shrink-0 shadow-lg ${theme.shadowClassName}`}>
                    <CheckCircle2 className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-foreground">{item}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, margin: '-60px', amount: 0.2 }}
            transition={{ duration: 0.45, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
          >
            <LandingForm service={service} />
          </motion.div>
        </div>
      </div>
    </section>
  );
}

export function ServiceLandingPage({ service }: { service: ServiceType }) {
  const config = useServiceContent(service, pageConfigs[service]);
  const theme = themes[service];
  const cssVars = {
    '--primary': theme.primary,
    '--accent': theme.accent,
    '--secondary': theme.secondary,
    '--ring': theme.primary,
  } as CSSProperties;

  useEffect(() => {
    const root = document.documentElement;
    const previous = {
      primary: root.style.getPropertyValue('--primary'),
      accent: root.style.getPropertyValue('--accent'),
      secondary: root.style.getPropertyValue('--secondary'),
      ring: root.style.getPropertyValue('--ring'),
    };

    root.style.setProperty('--primary', theme.primary);
    root.style.setProperty('--accent', theme.accent);
    root.style.setProperty('--secondary', theme.secondary);
    root.style.setProperty('--ring', theme.primary);

    return () => {
      const restore = (name: string, value: string) => {
        if (value) root.style.setProperty(name, value);
        else root.style.removeProperty(name);
      };

      restore('--primary', previous.primary);
      restore('--accent', previous.accent);
      restore('--secondary', previous.secondary);
      restore('--ring', previous.ring);
    };
  }, [theme]);

  return (
    <main className="marketing-typography min-h-screen bg-background text-foreground overflow-x-hidden" style={cssVars}>
      <SEO {...config.seo} />
      <Navbar variant="service" />
      <Hero
        content={config.hero}
        visual={service === 'meta-apps' ? 'meta-apps' : service === 'consult' ? 'portrait' : 'default'}
      />

      {/* Числа — компромисс между широким экраном и телефоном: секции с
          колонками на узком экране складываются и меняют высоту вдвое
          (подвал: 440 против 1070, кейсы: 1730 против 1050). Промах в любую
          сторону одинаково двигает документ, поэтому берём середину. */}
      <DeferredSection intrinsicHeight={1330}><Services content={config.services} /></DeferredSection>
      <DeferredSection intrinsicHeight={1390}><Cases content={config.cases} moreHref={`/cases?from=${service}`} /></DeferredSection>
      <DeferredSection intrinsicHeight={390}><CallToAction content={config.cta} /></DeferredSection>
      <DeferredSection intrinsicHeight={1120}>
        <Testimonials content={service === 'meta-apps' ? META_APPS_TESTIMONIAL_CONTENT : undefined} />
      </DeferredSection>
      <ContactSection service={service} contact={config.contact} theme={theme} />
      <DeferredSection height="min-h-[160px]" intrinsicHeight={750}><Footer /></DeferredSection>
    </main>
  );
}
