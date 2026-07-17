import conciergeCover from '../../assets/cases/concierge-meta-ads.webp';
import ecommerceCover from '../../assets/cases/ecommerce-performance.webp';
import infoproductsCover from '../../assets/cases/infoproducts-performance.webp';
import b2cCover from '../../assets/cases/b2c-services-performance.webp';
import type { Article, CaseData } from '../components/hooks/useArticlesApi';
import { hasCustomCover } from '../utils/articleCover';

export type CaseCatalogMeta = {
  cover: string;
  coverAlt: string;
  niche: string;
  goals: string[];
  data: CaseData;
};

export const CASE_BACK_TARGETS: Record<string, { path: string; label: string }> = {
  'meta-apps': { path: '/meta-apps', label: 'Meta Apps' },
  'meta-ads': { path: '/meta-ads', label: 'Meta Ads' },
  'google-ads': { path: '/google-ads', label: 'Google Ads' },
  consult: { path: '/consult', label: 'Консультации' },
};

export const CASE_CATALOG_META: Record<string, CaseCatalogMeta> = {
  'keys-premium-concierge-meta-ads': {
    cover: conciergeCover,
    coverAlt: 'Стойка премиум-сервиса с сервисным звонком в фиолетовом свете',
    niche: 'Премиум-сервисы',
    goals: ['Лидогенерация', 'Квалификация'],
    data: {
      niche: 'Премиум-сервисы',
      sources: ['meta'],
      period: '4 года',
      budgetLabel: '$1 млн+',
      budgetValue: 1_000_000,
      leadsValue: 65_000,
      headline: '65 000+',
      headlineLabel: 'лидов',
      metrics: [
        { value: '65 000+', label: 'лидов' },
        { value: '$1 млн+', label: 'бюджет' },
        { value: '4 года', label: 'работы' },
      ],
      featured: true,
    },
  },
  'keys-ecommerce-google-shopping-meta': {
    cover: ecommerceCover,
    coverAlt: 'Тележка интернет-магазина на фоне графика роста',
    niche: 'E-commerce',
    goals: ['Продажи', 'Рост ROI'],
    data: {
      niche: 'E-commerce',
      sources: ['google', 'meta'],
      leadsValue: 30_000,
      roiValue: 210,
      headline: 'ROI 210%',
      headlineLabel: 'по маржинальной экономике',
      metrics: [
        { value: '120 000+', label: 'в корзину' },
        { value: '30 000+', label: 'покупок' },
        { value: 'ROI 210%', label: 'результат' },
      ],
    },
  },
  'keys-infobiznes-google-meta': {
    cover: infoproductsCover,
    coverAlt: 'Учебный интерфейс и аналитика инфопродукта в фиолетовом свете',
    niche: 'Инфопродукты',
    goals: ['Лидогенерация', 'Снижение CPL'],
    data: {
      niche: 'Инфопродукты',
      sources: ['meta', 'google'],
      budgetLabel: '$600k+',
      budgetValue: 600_000,
      roiValue: 180,
      headline: 'CPL до $5',
      headlineLabel: 'в целевых регионах',
      metrics: [
        { value: '$600k+', label: 'бюджет' },
        { value: 'до $5', label: 'CPL' },
        { value: 'ROI 180%', label: 'по оплатам' },
      ],
    },
  },
  'keys-b2c-uslugi-google-meta': {
    cover: b2cCover,
    coverAlt: 'Сеть аудиторий B2C-проектов на фоне графика роста',
    niche: 'B2C-услуги',
    goals: ['Лидогенерация', 'Рост ROI'],
    data: {
      niche: 'B2C-услуги',
      sources: ['meta', 'google'],
      roiValue: 300,
      headline: 'ROI до 300%',
      headlineLabel: 'в проектах с обработкой лидов',
      metrics: [
        { value: '50+', label: 'проектов' },
        { value: 'до $25', label: 'CPL' },
        { value: 'до 300%', label: 'ROI' },
      ],
    },
  },
};

export const FALLBACK_CASE_ARTICLES: Array<Pick<Article, 'id' | 'slug' | 'title' | 'category' | 'readTime' | 'date' | 'description' | 'image'> & { caseData: CaseData }> = [
  {
    id: -31,
    slug: 'keys-premium-concierge-meta-ads',
    title: 'Кейс: 4 года лидогенерации для премиум-консьерж сервиса через Meta Ads',
    category: 'Кейсы',
    readTime: '9 мин',
    date: '08.07.2026',
    description: 'Долгосрочный проект в Meta Ads: 65 000+ лидов, бюджет $1 млн+, фокус на качестве обращений, а не на дешёвой цене заявки.',
    image: conciergeCover,
    caseData: CASE_CATALOG_META['keys-premium-concierge-meta-ads'].data,
  },
  {
    id: -32,
    slug: 'keys-ecommerce-google-shopping-meta',
    title: 'Кейс: e-commerce в связке Google Ads + Shopping + Meta Ads с ROI 210%',
    category: 'Кейсы',
    readTime: '10 мин',
    date: '08.07.2026',
    description: 'Продвижение интернет-магазина в связке Google Search + Shopping + Meta Ads: 120 000+ добавлений в корзину, 30 000+ покупок, ROI 210%.',
    image: ecommerceCover,
    caseData: CASE_CATALOG_META['keys-ecommerce-google-shopping-meta'].data,
  },
  {
    id: -33,
    slug: 'keys-infobiznes-google-meta',
    title: 'Кейс: инфопродукты на русскоязычную аудиторию — $600k бюджета, CPL до $5',
    category: 'Кейсы',
    readTime: '9 мин',
    date: '08.07.2026',
    description: 'Продвижение инфопродуктов на русскоязычную аудиторию по всему миру: $600k+ бюджета, CPL до $5, ROI 180% на связке Meta и Google.',
    image: infoproductsCover,
    caseData: CASE_CATALOG_META['keys-infobiznes-google-meta'].data,
  },
  {
    id: -34,
    slug: 'keys-b2c-uslugi-google-meta',
    title: 'Кейс: 50+ проектов в B2C-услугах — CPL до $25 и ROI до 300%',
    category: 'Кейсы',
    readTime: '8 мин',
    date: '08.07.2026',
    description: 'Сводный кейс по 50+ проектам в сфере услуг: салоны, клиники, фитнес, обучение. CPL до $25 и ROI до 300% за счёт повторяемой системы.',
    image: b2cCover,
    caseData: CASE_CATALOG_META['keys-b2c-uslugi-google-meta'].data,
  },
];

export function getCaseCatalogMeta(slug?: string): CaseCatalogMeta | undefined {
  return slug ? CASE_CATALOG_META[slug] : undefined;
}

export function getCaseDisplayTitle(title = ''): string {
  return title.replace(/^Кейс:\s*/i, '').trim();
}

export function getMergedCaseData(article: Pick<Article, 'slug' | 'caseData'>): CaseData {
  // The catalog seed is only a legacy fallback. Once the CMS stores caseData,
  // even an explicit empty array/object must win so deleted claims cannot return.
  if (article.caseData !== undefined) return article.caseData;
  return getCaseCatalogMeta(article.slug)?.data || {};
}

export function getCaseGoals(article: Pick<Article, 'slug' | 'tags'>): string[] {
  const tags = (article.tags || []).map((tag) => tag.toLowerCase());
  const goals: string[] = [];
  if (tags.some((tag) => tag.includes('лид') || tag.includes('воронк'))) goals.push('Лидогенерация');
  if (tags.some((tag) => tag.includes('квалиф') || tag.includes('качеств'))) goals.push('Квалификация');
  if (tags.some((tag) => tag.includes('продаж') || tag.includes('e-commerce'))) goals.push('Продажи');
  if (tags.some((tag) => tag.includes('roi') || tag.includes('roas'))) goals.push('Рост ROI');
  if (tags.some((tag) => tag.includes('cpl'))) goals.push('Снижение CPL');
  if (goals.length) return goals;
  return getCaseCatalogMeta(article.slug)?.goals || [];
}

export function getCaseCover(article: Pick<Article, 'slug' | 'image'>): string {
  if (hasCustomCover(article.image)) return article.image;
  return getCaseCatalogMeta(article.slug)?.cover || article.image;
}

export function getCaseCoverAlt(article: Pick<Article, 'slug' | 'title' | 'image'>): string {
  if (hasCustomCover(article.image)) return `Обложка кейса: ${getCaseDisplayTitle(article.title)}`;
  return getCaseCatalogMeta(article.slug)?.coverAlt || `Обложка кейса: ${getCaseDisplayTitle(article.title)}`;
}
