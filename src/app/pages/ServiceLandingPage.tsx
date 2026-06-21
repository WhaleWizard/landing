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

const Services = lazy(() => import('../components/Services'));
const Cases = lazy(() => import('../components/Cases'));
const CallToAction = lazy(() => import('../components/CallToAction'));
const Testimonials = lazy(() => import('../components/Testimonials'));
const Footer = lazy(() => import('../components/Footer'));

type ServiceType = 'meta-ads' | 'google-ads' | 'consult' | 'meta-apps';

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
  concierge: 'https://i.ibb.co/vCrb62rL/photo-2026-04-11-00-20-15.jpg',
  ecommerce: 'https://i.ibb.co/YBwdT5rQ/photo-2026-04-11-00-20-59.jpg',
  info: 'https://i.ibb.co/F4q65TQk/photo-2026-04-11-00-20-39.jpg',
  b2c: 'https://i.ibb.co/TqBqwSGB/photo-2026-04-11-00-21-23.jpg',
};

const pageConfigs: Record<ServiceType, Omit<ServiceLandingPageProps, 'service' | 'theme'>> = {
  'meta-ads': {
    seo: {
      title: 'Платный трафик из Meta Ads (Facebook/Instagram)',
      description: 'Стабильные заявки из Facebook и Instagram без слива бюджета. Настрою Meta Ads по системе: оффер, креативы, Pixel, CAPI и оптимизация лидов.',
      url: '/meta-ads',
    },
    hero: {
      badge: 'Meta Ads для бизнеса',
      titlePrefix: 'Приведу заявки',
      titleAccent: 'через Facebook & Instagram',
      paragraphs: [
        'Запускаю и масштабирую Meta Ads для заявок, продаж и понятной окупаемости — без фокуса на пустые клики.',
        'Фокус на системе: оффер, креативы, аудитории, Pixel, Conversions API, ретаргетинг и оптимизация по качеству лидов.',
        'Беру на себя стратегию, креативные тесты, аналитику и ежедневную оптимизацию кампаний.',
      ],
      primaryButton: 'Получить аудит Meta Ads',
      secondaryButton: 'Кейсы Meta Ads',
      stats: [
        { value: '65к+', label: 'лидов из Meta' },
        { value: '$1M+', label: 'Meta Ads spend' },
        { value: '4 года', label: 'ведения проекта' },
      ],
    },
    services: {
      badge: 'Что входит в Meta Ads',
      titlePrefix: 'Система привлечения',
      titleAccent: 'из Meta',
      description: 'Стратегия, креативы, Pixel/CAPI, ретаргетинг и масштабирование рабочих связок.',
      cards: [
        {
          icon: Target,
          title: 'Стратегия и оффер',
          description: 'Разбираю аудиторию, боли, конкурентов и формирую рекламные гипотезы под Instagram и Facebook.',
          features: ['Кастдев', 'Оффер', 'Аудитории', 'Медиаплан'],
          gradient: 'from-primary to-accent',
        },
        {
          icon: Zap,
          title: 'Креативы и тесты',
          description: 'Собираю систему креативных тестов для Reels, Stories, Feed и лид-форм, чтобы находить рабочие связки.',
          features: ['UGC-подход', 'Reels/Stories', 'A/B тесты', 'Связки'],
          gradient: 'from-accent to-secondary',
        },
        {
          icon: BarChart3,
          title: 'Pixel и Conversions API',
          description: 'Настраиваю события, передачу лидов и серверные сигналы, чтобы алгоритмы Meta обучались на реальных конверсиях.',
          features: ['Meta Pixel', 'CAPI', 'Events', 'UTM'],
          gradient: 'from-secondary to-primary',
        },
        {
          icon: TrendingUp,
          title: 'Оптимизация и масштаб',
          description: 'Отсекаю слабые гипотезы, усиливаю рабочие кампании и масштабирую бюджет без резких просадок по CPL/CPA.',
          features: ['CPL/CPA', 'Retargeting', 'Lookalike', 'Scaling'],
          gradient: 'from-primary via-accent to-secondary',
        },
      ],
      detailed: {
        title: 'Как я запускаю Meta Ads',
        button: 'Получить аудит Meta Ads',
        sections: [
          {
            title: '1. АУДИТ И СТРАТЕГИЯ',
            icon: Target,
            text: 'Разбираю нишу, оффер, текущую воронку, рекламный кабинет и точки потери бюджета.\n\n• Анализирую аудитории и конкурентов\n• Проверяю посадочную страницу и форму заявки\n• Определяю допустимый CPL/CPA\n• Формирую карту гипотез для первых тестов\n\n💡 Результат: понятный план запуска или перезапуска Meta Ads без хаотичных тестов.',
          },
          {
            title: '2. АНАЛИТИКА И СИГНАЛЫ',
            icon: BarChart3,
            text: 'Готовлю инфраструктуру, чтобы Meta видела не только клики, но и реальные действия пользователей.\n\n• Проверяю Meta Pixel и события\n• Настраиваю Conversions API\n• Размечаю UTM и цели\n• Синхронизирую лиды с CRM/формой\n\n💡 Результат: рекламный алгоритм получает качественные сигналы для оптимизации.',
          },
          {
            title: '3. КРЕАТИВЫ И ЗАПУСК',
            icon: Zap,
            text: 'Тестирую разные углы коммуникации и форматы под Instagram/Facebook placements.\n\n• Reels, Stories, Feed, лид-формы\n• Упаковка болей и выгод\n• Тестирование визуалов и текстов\n• Разделение холодной и тёплой аудитории\n\n💡 Результат: находим связки, которые дают заявки по приемлемой цене.',
          },
          {
            title: '4. ОПТИМИЗАЦИЯ И МАСШТАБ',
            icon: TrendingUp,
            text: 'Управляю бюджетом, качеством лидов и стабильностью результатов.\n\n• Отключаю слабые объявления и аудитории\n• Масштабирую рабочие кампании\n• Контролирую частоту и выгорание креативов\n• Поддерживаю ретаргетинг и Lookalike\n\n💡 Результат: Meta Ads становится управляемым каналом заявок.',
          },
        ],
      },
    },
    cases: {
      badge: 'Meta Ads кейсы',
      titlePrefix: 'Результаты через',
      titleAccent: 'Facebook & Instagram',
      description: 'Подборка кейсов, где ключевую роль сыграли Meta Ads, креативы, ретаргетинг и оптимизация качества лидов.',
      items: [
        {
          title: 'Premium Concierge Service',
          category: 'Meta Ads',
          description: 'Системная лидогенерация для премиум-консьерж сервиса с фокусом на качество обращения и конверсию в диалог.',
          image: CASE_IMAGES.concierge,
          stats: [
            { label: 'Срок работы', value: '4 года' },
            { label: 'Лиды', value: '65к+' },
            { label: 'Ad Spend', value: '$1 Млн+' },
          ],
        },
        {
          title: 'Инфобизнес',
          category: 'Meta Ads',
          description: 'Продвижение инфопродуктов через креативные связки, широкие аудитории и ретаргетинг по русскоязычной аудитории.',
          image: CASE_IMAGES.info,
          stats: [
            { label: 'Ad Spend', value: '$600к+' },
            { label: 'CPL', value: 'до $5' },
            { label: 'ROI', value: '180%' },
          ],
        },
        {
          title: 'B2C услуги',
          category: 'Meta Ads',
          description: 'Запуск рекламных кампаний для услуг с упором на оффер, лид-формы, ретаргетинг и контроль качества заявок.',
          image: CASE_IMAGES.b2c,
          stats: [
            { label: 'Проектов', value: '50+' },
            { label: 'CPL', value: 'до $25' },
            { label: 'ROI', value: 'до 300%' },
          ],
        },
        {
          title: 'E-commerce social traffic',
          category: 'Meta Ads',
          description: 'Продажи и возврат аудитории через Instagram/Facebook креативы, динамический ретаргетинг и тестирование офферов.',
          image: CASE_IMAGES.ecommerce,
          stats: [
            { label: 'Покупки', value: '30к+' },
            { label: 'Add to cart', value: '120к+' },
            { label: 'ROI', value: '210%' },
          ],
        },
      ],
    },
    cta: {
      badge: 'Meta Ads аудит',
      title: 'Хотите понять, где Meta сливает бюджет?',
      description: 'Оставьте заявку — разберу кабинет, креативы, события и дам план оптимизации.',
      button: 'Получить аудит Meta Ads',
    },
    contact: {
      badge: 'Бесплатно',
      titlePrefix: 'Получите бесплатный',
      titleAccent: 'аудит Meta Ads',
      description: 'Разберу вашу рекламу в Facebook/Instagram и покажу, какие связки, события и креативы стоит усилить в первую очередь.',
      bullets: [
        'Анализ структуры рекламного кабинета',
        'Оценка креативов, офферов и аудиторий',
        'Проверка Pixel, событий и Conversions API',
        'План оптимизации CPL/CPA и качества лидов',
      ],
    },
  },
  'google-ads': {
    seo: {
      title: 'Контекстная реклама Google Ads',
      description: 'Настрою Google Ads, который приносит клиентов из горячего спроса. Search, Shopping, Performance Max, YouTube, аналитика и оптимизация CPA/ROAS.',
      url: '/google-ads',
    },
    hero: {
      badge: 'Google Ads для горячего спроса',
      titlePrefix: 'Приведу клиентов',
      titleAccent: 'из Google Ads',
      paragraphs: [
        'Настраиваю Search, Shopping, Performance Max и YouTube так, чтобы реклама приводила заявки и продажи.',
        'Фокус на структуре кампаний, семантике, минус-словах, конверсиях и понятной экономике CPA/ROAS.',
        'Подходит бизнесам, где уже есть спрос: услуги, e-commerce, локальные проекты, B2B и ниши с поисковыми запросами.',
      ],
      primaryButton: 'Получить аудит Google Ads',
      secondaryButton: 'Кейсы Google Ads',
      stats: [
        { value: '120к+', label: 'добавлений в корзину' },
        { value: '30к+', label: 'покупок' },
        { value: '210%', label: 'ROI в e-commerce' },
      ],
    },
    services: {
      badge: 'Что входит в Google Ads',
      titlePrefix: 'Система привлечения',
      titleAccent: 'из Google',
      description: 'Search, Shopping, Performance Max, YouTube и аналитика — с контролем запросов, конверсий и окупаемости.',
      cards: [
        {
          icon: Search,
          title: 'Search и семантика',
          description: 'Собираю структуру поисковых кампаний под горячий спрос, намерение пользователя и экономику заявки.',
          features: ['Search Ads', 'Ключевые слова', 'Минус-слова', 'RSA'],
          gradient: 'from-primary to-accent',
        },
        {
          icon: ShoppingCart,
          title: 'Shopping и Performance Max',
          description: 'Настраиваю товарные кампании, фиды и PMax так, чтобы масштабирование не превращалось в чёрный ящик.',
          features: ['Shopping', 'PMax', 'Merchant Center', 'Feed'],
          gradient: 'from-accent to-secondary',
        },
        {
          icon: BarChart3,
          title: 'GA4, GTM и конверсии',
          description: 'Выстраиваю аналитику, которая показывает реальные заявки, покупки, стоимость привлечения и окупаемость.',
          features: ['GA4', 'GTM', 'Enhanced Conversions', 'UTM'],
          gradient: 'from-secondary to-primary',
        },
        {
          icon: TrendingUp,
          title: 'Оптимизация CPA/ROAS',
          description: 'Убираю нерелевантные запросы, усиливаю прибыльные кампании и контролирую качество трафика.',
          features: ['CPA', 'ROAS', 'Quality Score', 'Ремаркетинг'],
          gradient: 'from-primary via-accent to-secondary',
        },
      ],
      detailed: {
        title: 'Как я веду Google Ads',
        button: 'Получить аудит Google Ads',
        sections: [
          {
            title: '1. СПРОС И СТРУКТУРА',
            icon: Search,
            text: 'Начинаю с анализа спроса, экономики и текущей структуры аккаунта.\n\n• Собираю семантику по намерению пользователя\n• Разделяю брендовый, горячий и холодный спрос\n• Проверяю посадочные страницы\n• Рассчитываю целевой CPA/ROAS\n\n💡 Результат: кампании строятся вокруг спроса и прибыли, а не вокруг случайных ключей.',
          },
          {
            title: '2. АНАЛИТИКА И КОНВЕРСИИ',
            icon: BarChart3,
            text: 'Настраиваю основу для корректной оптимизации Google Ads.\n\n• GA4 и Google Tag Manager\n• Импорт конверсий в Google Ads\n• Enhanced Conversions\n• UTM-метки и события заявки/покупки\n\n💡 Результат: видно, какие кампании реально приносят клиентов и продажи.',
          },
          {
            title: '3. ЗАПУСК КАМПАНИЙ',
            icon: Zap,
            text: 'Запускаю кампании под разные уровни спроса и форматы Google.\n\n• Search по горячим запросам\n• Shopping и Performance Max для e-commerce\n• YouTube для прогрева\n• Ремаркетинг для возврата пользователей\n\n💡 Результат: Google Ads закрывает как горячий спрос, так и масштабирование.',
          },
          {
            title: '4. ОПТИМИЗАЦИЯ БЮДЖЕТА',
            icon: TrendingUp,
            text: 'Постоянно чищу трафик и перераспределяю бюджет в прибыльные сегменты.\n\n• Минус-слова и поисковые запросы\n• Корректировки ставок и стратегий\n• Анализ Quality Score и объявлений\n• Контроль CPA, ROAS и качества лидов\n\n💡 Результат: бюджет работает на заявки/покупки, а не на нерелевантные клики.',
          },
        ],
      },
    },
    cases: {
      badge: 'Google Ads кейсы',
      titlePrefix: 'Результаты через',
      titleAccent: 'Google Ads',
      description: 'Кейсы, где ключевую роль сыграли поиск, Shopping, Performance Max, аналитика и оптимизация окупаемости.',
      items: [
        {
          title: 'E-commerce Google Ads',
          category: 'Google Search + Shopping',
          description: 'Продвижение интернет-магазина через поисковые кампании, Shopping и Performance Max с контролем покупок и ROI.',
          image: CASE_IMAGES.ecommerce,
          stats: [
            { label: 'Add to cart', value: '120к+' },
            { label: 'Покупки', value: '30к+' },
            { label: 'ROI', value: '210%' },
          ],
        },
        {
          title: 'B2C услуги из поиска',
          category: 'Google Search',
          description: 'Лидогенерация для услуг через горячие поисковые запросы, чистку семантики и оптимизацию стоимости заявки.',
          image: CASE_IMAGES.b2c,
          stats: [
            { label: 'Проектов', value: '50+' },
            { label: 'CPL', value: 'до $25' },
            { label: 'ROI', value: 'до 300%' },
          ],
        },
        {
          title: 'Инфопродукт: спрос и ремаркетинг',
          category: 'Google Ads',
          description: 'Сбор горячего спроса, прогрев аудитории и возврат пользователей через Google Ads и аналитику событий.',
          image: CASE_IMAGES.info,
          stats: [
            { label: 'Ad Spend', value: '$600к+' },
            { label: 'CPL', value: 'до $5' },
            { label: 'ROI', value: '180%' },
          ],
        },
        {
          title: 'Premium Service Search',
          category: 'Google Search',
          description: 'Работа с дорогой услугой через точную семантику, минус-слова и контроль качества обращений.',
          image: CASE_IMAGES.concierge,
          stats: [
            { label: 'Срок', value: '4 года' },
            { label: 'Лиды', value: '65к+' },
            { label: 'Бюджет', value: '$1М+' },
          ],
        },
      ],
    },
    cta: {
      badge: 'Google Ads аудит',
      title: 'Клики есть, а заявок или продаж мало?',
      description: 'Проверю кампании, запросы, аналитику и покажу, где Google Ads теряет бюджет.',
      button: 'Получить аудит Google Ads',
    },
    contact: {
      badge: 'Бесплатно',
      titlePrefix: 'Получите бесплатный',
      titleAccent: 'аудит Google Ads',
      description: 'Разберу ваши кампании, поисковые запросы, конверсии и покажу, как снизить потери бюджета.',
      bullets: [
        'Анализ структуры Search, Shopping и PMax',
        'Проверка запросов, минус-слов и объявлений',
        'Аудит GA4/GTM и импортов конверсий',
        'План оптимизации CPA, ROAS и качества трафика',
      ],
    },
  },
  'meta-apps': {
    seo: {
      title: 'Трафик для приложений из Meta Ads (Facebook/Instagram)',
      description: 'Привлекаю установки и целевые события в приложениях через Meta Ads: App Events, MMP/SKAN, креативы и масштабирование.',
      url: '/meta-apps',
    },
    hero: {
      badge: 'Meta Ads для приложений',
      titlePrefix: 'Приведу пользователей',
      titleAccent: 'в мобильное приложение',
      paragraphs: [
        'Запускаю Meta Ads для установок, регистраций, trial, покупок и подписок — с фокусом на post-install события.',
        'Фокус не на дешёвых install, а на качестве пользователей, MMP/SKAN, mobile-креативах и KPI приложения.',
        'Подходит приложениям, где важны CPI, CPA, ROAS, retention, LTV и прозрачная связь рекламы с app funnel.',
      ],
      primaryButton: 'Получить app growth-разбор',
      secondaryButton: 'Кейсы по app traffic',
      stats: [
        { value: 'MMP', label: 'события и атрибуция' },
        { value: 'CPI/CPA', label: 'контроль KPI' },
        { value: 'SKAN', label: 'учёт iOS-сигналов' },
      ],
    },
    services: {
      badge: 'Что входит в app growth',
      titlePrefix: 'Meta Ads для',
      titleAccent: 'мобильных приложений',
      description: 'App Events, MMP/SKAN, mobile-креативы и масштабирование по целевым событиям приложения.',
      cards: [
        {
          icon: Target,
          title: 'App funnel и KPI',
          description: 'Разбираю путь пользователя от установки до целевого события и фиксирую KPI для оптимизации кампаний.',
          features: ['Install', 'Registration', 'Trial/Purchase', 'LTV'],
          gradient: 'from-primary to-accent',
        },
        {
          icon: BarChart3,
          title: 'MMP, SKAN и события',
          description: 'Проверяю передачу событий, атрибуцию и сигналы, которые нужны Meta для оптимизации под качество.',
          features: ['MMP', 'SKAN', 'App Events', 'Deep Links'],
          gradient: 'from-accent to-secondary',
        },
        {
          icon: Zap,
          title: 'Mobile-креативы',
          description: 'Строю креативные гипотезы под Reels, Stories и app placements с фокусом на install и post-install события.',
          features: ['UGC', 'Demo video', 'Hooks', 'Placements'],
          gradient: 'from-secondary to-primary',
        },
        {
          icon: TrendingUp,
          title: 'Масштабирование событий',
          description: 'Оптимизирую кампании не только по CPI, но и по регистрациям, покупкам, подпискам и другим app events.',
          features: ['CPI', 'CPA', 'ROAS', 'Retention'],
          gradient: 'from-primary via-accent to-secondary',
        },
      ],
      detailed: {
        title: 'Как я привлекаю трафик в приложения',
        button: 'Получить app growth-разбор',
        sections: [
          {
            title: '1. APP FUNNEL И ЭКОНОМИКА',
            icon: Target,
            text: 'Разбираю приложение как воронку, а не просто как ссылку на установку.\n\n• Install → registration → trial/purchase/event\n• Целевые CPI, CPA, ROAS, LTV\n• Гео, аудитории и ограничения\n• Узкие места onboarding и paywall\n\n💡 Результат: понятно, какое событие покупать и по какой цене.',
          },
          {
            title: '2. АТРИБУЦИЯ И СОБЫТИЯ',
            icon: BarChart3,
            text: 'Проверяю, достаточно ли данных получает Meta для обучения кампаний.\n\n• MMP и Meta SDK\n• App Events и value-события\n• SKAN для iOS\n• Deep links и UTM-логика\n\n💡 Результат: реклама оптимизируется на реальные действия в приложении.',
          },
          {
            title: '3. КРЕАТИВЫ ДЛЯ MOBILE',
            icon: Zap,
            text: 'Создаю тестовую матрицу креативов под мобильное потребление.\n\n• Быстрые hooks в первые секунды\n• UGC и demo-сценарии\n• Варианты под Reels/Stories\n• Тесты pain/value/feature angles\n\n💡 Результат: креативы объясняют ценность приложения до установки.',
          },
          {
            title: '4. ОПТИМИЗАЦИЯ ПО KPI',
            icon: TrendingUp,
            text: 'Масштабирую не дешёвые установки, а качественных пользователей.\n\n• Анализ CPI и post-install CPA\n• Оптимизация по событиям\n• Обновление креативов до выгорания\n• Масштабирование связок по гео и аудиториям\n\n💡 Результат: user acquisition становится управляемой системой роста приложения.',
          },
        ],
      },
    },
    cases: {
      badge: 'App growth кейсы',
      titlePrefix: 'Подход к росту',
      titleAccent: 'мобильных приложений',
      description: 'Фокус на app funnel: установки, регистрации, покупки, подписки, атрибуция и оптимизация post-install событий.',
      items: [
        {
          title: 'Subscription App Funnel',
          category: 'Meta App Events',
          description: 'Оптимизация трафика не только по install, а по trial и subscription событиям с контролем качества пользователей.',
          image: CASE_IMAGES.info,
          stats: [
            { label: 'KPI', value: 'CPA' },
            { label: 'Событие', value: 'Trial' },
            { label: 'Фокус', value: 'LTV' },
          ],
        },
        {
          title: 'E-commerce App Traffic',
          category: 'Meta App Install',
          description: 'Привлечение пользователей в приложение магазина с оптимизацией по first purchase и возврату аудитории.',
          image: CASE_IMAGES.ecommerce,
          stats: [
            { label: 'Цель', value: 'Purchase' },
            { label: 'Канал', value: 'Meta' },
            { label: 'Формат', value: 'Reels' },
          ],
        },
        {
          title: 'Lead App Onboarding',
          category: 'Meta App Events',
          description: 'Настройка событий регистрации и заявки внутри приложения, чтобы кампании обучались на качественных действиях.',
          image: CASE_IMAGES.b2c,
          stats: [
            { label: 'Цель', value: 'Sign up' },
            { label: 'Сигнал', value: 'Event' },
            { label: 'Трекинг', value: 'MMP' },
          ],
        },
        {
          title: 'Retargeting для app users',
          category: 'Meta Retargeting',
          description: 'Возврат пользователей, которые установили приложение, но не дошли до ключевого события или покупки.',
          image: CASE_IMAGES.concierge,
          stats: [
            { label: 'Цель', value: 'Return' },
            { label: 'Аудит.', value: 'Warm' },
            { label: 'Фокус', value: 'ROAS' },
          ],
        },
      ],
    },
    cta: {
      badge: 'App Growth',
      title: 'Установки есть, а целевых событий мало?',
      description: 'Проверю app funnel, события, MMP/SKAN и креативы, чтобы найти точки роста.',
      button: 'Получить app growth-разбор',
    },
    contact: {
      badge: 'App Growth',
      titlePrefix: 'Получите стратегию',
      titleAccent: 'роста приложения',
      description: 'Разберу ваш app funnel и покажу, как получать качественные установки и целевые события из Facebook и Instagram.',
      bullets: [
        'Аудит App Install и App Event кампаний',
        'Проверка MMP/SKAN, событий и атрибуции',
        'Креативная стратегия под mobile placements',
        'План масштабирования по CPI, CPA, ROAS или LTV',
      ],
    },
  },
  consult: {
    seo: {
      title: 'Консультация для таргетологов',
      description: 'Личная консультация для таргетологов: позиционирование, упаковка услуг, поиск клиентов, оффер, продажи и план роста дохода.',
      url: '/consult',
    },
    hero: {
      badge: 'Личная консультация',
      titlePrefix: 'Помогу таргетологу',
      titleAccent: 'собрать систему роста',
      paragraphs: [
        'Разберу позиционирование, портфолио, оффер, поиск клиентов и продажи — без воды и общих советов.',
        'В конце — конкретный план: что исправить в упаковке, где искать клиентов и как продавать услуги дороже.',
        'Подходит новичкам и практикующим таргетологам, которые хотят стабильнее получать клиентов и выйти на понятный доход.',
      ],
      primaryButton: 'Записаться на консультацию',
      secondaryButton: 'Что разбираем',
      stats: [
        { value: '60–90', label: 'минут разбора' },
        { value: '30 дней', label: 'план действий' },
        { value: '$1000+', label: 'ориентир роста' },
      ],
    },
    services: {
      badge: 'Что разбираем',
      titlePrefix: 'Консультация для',
      titleAccent: 'таргетолога',
      description: 'Позиционирование, упаковка, оффер, поиск клиентов, продажи и личный план роста.',
      cards: [
        {
          icon: Users,
          title: 'Позиционирование',
          description: 'Помогаю понять, кому вы продаёте услуги, чем отличаетесь и как звучать сильнее на рынке.',
          features: ['Ниша', 'ЦА', 'УТП', 'Экспертность'],
          gradient: 'from-primary to-accent',
        },
        {
          icon: Briefcase,
          title: 'Упаковка услуг',
          description: 'Разбираем портфолио, кейсы, профили, коммерческое предложение и форматы ваших пакетов.',
          features: ['Портфолио', 'Кейсы', 'Пакеты', 'Прайс'],
          gradient: 'from-accent to-secondary',
        },
        {
          icon: Target,
          title: 'Поиск клиентов',
          description: 'Собираем практичную систему лидогенерации для специалиста: где искать клиентов и что им писать.',
          features: ['Outreach', 'Контент', 'Нетворк', 'Воронка'],
          gradient: 'from-secondary to-primary',
        },
        {
          icon: TrendingUp,
          title: 'Продажи и рост дохода',
          description: 'Разбираем диалоги, скрипты, возражения и план, как переходить к более дорогим проектам.',
          features: ['Скрипты', 'Созвоны', 'Возражения', 'Upsell'],
          gradient: 'from-primary via-accent to-secondary',
        },
      ],
      detailed: {
        title: 'Как проходит консультация',
        button: 'Записаться на консультацию',
        sections: [
          {
            title: '1. ДИАГНОСТИКА СИТУАЦИИ',
            icon: Target,
            text: 'Сначала разбираю, где вы сейчас и что именно мешает росту.\n\n• Опыт и текущие проекты\n• Как ищете клиентов\n• Как упакованы услуги\n• Где теряются заявки и продажи\n\n💡 Результат: видим главные ограничения, а не пытаемся чинить всё сразу.',
          },
          {
            title: '2. УПАКОВКА И ОФФЕР',
            icon: Briefcase,
            text: 'Смотрим, как вы презентуете себя и свои услуги.\n\n• Позиционирование\n• Кейсы и портфолио\n• Описание услуги и результат\n• Цены, пакеты и формат предложения\n\n💡 Результат: оффер становится понятнее и сильнее для потенциального клиента.',
          },
          {
            title: '3. КАНАЛЫ ПОИСКА КЛИЕНТОВ',
            icon: Users,
            text: 'Собираем систему, откуда брать новые диалоги и заявки.\n\n• Личные сообщения и outreach\n• Контент и экспертность\n• Партнёрства и рекомендации\n• Список гипотез на ближайшие недели\n\n💡 Результат: появляется понятный план регулярного поиска клиентов.',
          },
          {
            title: '4. ПЛАН НА 30 ДНЕЙ',
            icon: TrendingUp,
            text: 'Фиксируем конкретные действия после консультации.\n\n• Что исправить в первую очередь\n• Какие материалы подготовить\n• Сколько касаний делать\n• Как отслеживать прогресс\n\n💡 Результат: после разбора у вас есть пошаговый план, а не просто вдохновение.',
          },
        ],
      },
    },
    cases: {
      badge: 'Форматы разборов',
      titlePrefix: 'Что можно разобрать',
      titleAccent: 'на консультации',
      description: 'Консультация адаптируется под вашу ситуацию: от упаковки и поиска клиентов до продаж и стратегии роста.',
      items: [
        {
          title: 'Упаковка специалиста',
          category: 'Позиционирование',
          description: 'Разбор ниши, профиля, портфолио и формулировки оффера, чтобы клиент быстрее понимал вашу ценность.',
          image: CASE_IMAGES.b2c,
          stats: [
            { label: 'Фокус', value: 'УТП' },
            { label: 'Формат', value: 'Разбор' },
            { label: 'План', value: '30 дней' },
          ],
        },
        {
          title: 'Поиск первых клиентов',
          category: 'Lead generation',
          description: 'Собираем список каналов, сообщений и действий, которые помогут получать больше целевых диалогов.',
          image: CASE_IMAGES.concierge,
          stats: [
            { label: 'Каналы', value: '3–5' },
            { label: 'Цель', value: 'Диалоги' },
            { label: 'Темп', value: 'Ежедневно' },
          ],
        },
        {
          title: 'Рост чека',
          category: 'Продажи услуг',
          description: 'Разбор пакетов, цены, аргументации и перехода от дешёвых задач к проектам с понятной ценностью.',
          image: CASE_IMAGES.ecommerce,
          stats: [
            { label: 'Фокус', value: 'Чек' },
            { label: 'Инструм.', value: 'Пакеты' },
            { label: 'Цель', value: 'Рост' },
          ],
        },
        {
          title: 'Системный план развития',
          category: 'Стратегия',
          description: 'Формируем приоритеты на ближайший месяц: упаковка, контент, outreach, продажи и контроль результатов.',
          image: CASE_IMAGES.info,
          stats: [
            { label: 'Период', value: '30 дней' },
            { label: 'Шаги', value: 'План' },
            { label: 'Фокус', value: 'Система' },
          ],
        },
      ],
    },
    cta: {
      badge: 'Личный разбор',
      title: 'Не понимаете, что мешает росту?',
      description: 'Запишитесь на консультацию — разберём вашу ситуацию и соберём план действий.',
      button: 'Записаться на консультацию',
    },
    contact: {
      badge: 'Личная консультация',
      titlePrefix: 'Запишитесь на',
      titleAccent: 'консультацию',
      description: '60–90 минут личной работы над вашей упаковкой, поиском клиентов, продажами и планом роста.',
      bullets: [
        'Разбор позиционирования и текущей упаковки',
        'Анализ портфолио, кейсов и оффера',
        'Стратегия поиска клиентов и первых касаний',
        'План действий на ближайшие 30 дней',
      ],
    },
  },
};

function SectionSkeleton({ height = 'min-h-[180px]' }: { height?: string }) {
  return <div className={`w-full ${height}`} aria-hidden="true" />;
}

function DeferredSection({
  children,
  height = 'min-h-[180px]',
}: {
  children: ReactNode;
  height?: string;
}) {
  return (
    <section style={{ contentVisibility: 'auto', containIntrinsicSize: '1px 720px' }}>
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
        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
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

            <h2 className="text-balance text-3xl md:text-4xl lg:text-[44px] font-bold mb-6 leading-tight tracking-[-0.02em]">
              {contact.titlePrefix}{' '}
              <span className={`bg-gradient-to-r ${theme.titleGradientClassName} bg-clip-text text-transparent`}>
                {contact.titleAccent}
              </span>
            </h2>

            <p className="text-muted-foreground text-base md:text-lg mb-8 max-w-lg mx-auto lg:mx-0 text-pretty leading-relaxed">
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
  const config = pageConfigs[service];
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
    <main className="min-h-screen bg-background text-foreground overflow-x-hidden" style={cssVars}>
      <SEO {...config.seo} />
      <Navbar variant="service" />
      <Hero content={config.hero} />

      <DeferredSection><Services content={config.services} /></DeferredSection>
      <DeferredSection><Cases content={config.cases} /></DeferredSection>
      <DeferredSection><CallToAction content={config.cta} /></DeferredSection>
      <DeferredSection><Testimonials /></DeferredSection>
      <ContactSection service={service} contact={config.contact} theme={theme} />
      <DeferredSection height="min-h-[160px]"><Footer /></DeferredSection>
    </main>
  );
}
