/**
 * Разделы блога — один справочник на фильтр блога, редактор и импорт.
 *
 * Раньше у статей было двенадцать случайных категорий («GEO», «Запуск»,
 * «Стратегии»), а фильтр угадывал тему по ключевым словам. При шестистах
 * статьях так ничего не найти, поэтому разделов восемь (одобрено владельцем
 * в `docs/SEO_PROGRAM.md`, вопрос 5), и у каждой статьи ровно один раздел.
 *
 * `label` — полное название словами клиента: оно хранится в поле
 * `category` новой статьи и уходит в `articleSection` разметки. `short` —
 * подпись на плитке фильтра и на карточке, где полное название не
 * помещается в строку.
 *
 * Кейсы — восьмой раздел, но живут на своём адресе `/cases`, и принадлежность
 * к ним по-прежнему определяет только `isCaseArticle()` (категория «Кейсы»).
 * Старые категории сопоставлены с разделами в `legacyCategories`, поэтому
 * тринадцать нынешних статей находятся в фильтре без правки в базе.
 */

export const CASES_SECTION_LABEL = 'Кейсы';

export interface BlogSection {
  /** Значение `?topic=` в адресе блога. */
  id: string;
  label: string;
  short: string;
  description: string;
  /** Категории старых статей, которые относятся к разделу. */
  legacyCategories: string[];
  /**
   * Слова для статей с незнакомой категорией: ищутся только в заголовке и
   * описании. Теги не смотрим — у старых статей они одинаковые у всех.
   */
  tokens: string[];
}

// Порядок — порядок плиток в фильтре: на телефоне видно первые три.
export const BLOG_SECTIONS: BlogSection[] = [
  {
    id: 'meta',
    label: 'Реклама в Instagram и Facebook',
    short: 'Instagram и Facebook',
    description: 'Запуск, креативы, аудитории',
    legacyCategories: ['Meta Ads', 'Ретаргетинг'],
    tokens: ['instagram', 'инстаграм', 'facebook', 'фейсбук', 'meta ads', 'таргет', 'ретаргет'],
  },
  {
    id: 'apps',
    label: 'Приложения',
    short: 'Приложения',
    description: 'Установки и окупаемость',
    legacyCategories: ['Mobile Apps', 'Meta Apps'],
    tokens: ['приложени', 'app install', 'mobile app'],
  },
  {
    id: 'google',
    label: 'Google Ads',
    short: 'Google Ads',
    description: 'Поиск, PMax и YouTube',
    legacyCategories: [],
    tokens: ['google ads', 'гугл', 'performance max', 'pmax', 'youtube', 'контекстн'],
  },
  {
    id: 'niches',
    label: 'Ниши',
    short: 'Ниши',
    description: 'Инфобиз, онлайн-школы, B2B',
    legacyCategories: ['E-commerce', 'B2B', 'GEO', 'Инфобизнес'],
    tokens: ['инфобиз', 'онлайн-школ', 'e-commerce', 'интернет-магазин', 'b2b', 'локальн'],
  },
  {
    id: 'money',
    label: 'Деньги и окупаемость',
    short: 'Окупаемость',
    description: 'Бюджет, цена заявки, ROMI',
    legacyCategories: ['Оптимизация', 'Стратегии', 'Запуск', 'Google + Meta'],
    tokens: ['бюджет', 'окупаем', 'рентабельн', 'romi', 'roas', 'масштабир', 'цена заявки', 'цена лида'],
  },
  {
    id: 'analytics',
    label: 'Аналитика и трекинг',
    short: 'Аналитика',
    description: 'Пиксель, CAPI, атрибуция',
    legacyCategories: ['Аналитика', 'Reporting', 'CRM'],
    tokens: ['аналитик', 'атрибуц', 'capi', 'пиксел', 'utm', 'сквозн'],
  },
  {
    id: 'contractor',
    label: 'Как выбрать подрядчика',
    short: 'Выбор подрядчика',
    description: 'Как выбрать и проверить',
    legacyCategories: [],
    tokens: ['подрядчик', 'выбрать таргетолог', 'агентств', 'фрилансер'],
  },
];

/** Старые адреса фильтра `?topic=`, которые больше не существуют. */
const TOPIC_ALIASES: Record<string, string> = { growth: 'money' };

export function normalizeTopicId(value: string | null | undefined): string {
  const id = String(value || '').trim();
  return TOPIC_ALIASES[id] || id;
}

const normalize = (value: string) => value.trim().toLowerCase();

const BY_CATEGORY = new Map<string, BlogSection>();
for (const section of BLOG_SECTIONS) {
  BY_CATEGORY.set(normalize(section.label), section);
  for (const legacy of section.legacyCategories) BY_CATEGORY.set(normalize(legacy), section);
}

/** Раздел по категории — точное совпадение с названием или старой категорией. */
export function sectionForCategory(category: string | null | undefined): BlogSection | null {
  return BY_CATEGORY.get(normalize(String(category || ''))) ?? null;
}

type SectionSource = { category?: string | null; title?: string | null; description?: string | null };

/**
 * Раздел статьи. Сначала категория, затем слова в заголовке и описании.
 * Кейсы и статьи, которые никуда не подошли, возвращают `null`: фильтр
 * покажет такую категорию отдельной плиткой, и статья не потеряется.
 */
export function sectionOfArticle(article: SectionSource): BlogSection | null {
  if (normalize(String(article.category || '')) === normalize(CASES_SECTION_LABEL)) return null;
  const byCategory = sectionForCategory(article.category);
  if (byCategory) return byCategory;
  const haystack = `${article.title || ''} ${article.description || ''}`.toLowerCase();
  return BLOG_SECTIONS.find((section) => section.tokens.some((token) => haystack.includes(token))) ?? null;
}

/**
 * Подпись категории на карточке. Для нового раздела — короткое название,
 * иначе полное не помещается; старые категории показываются как были.
 */
export function categoryDisplayLabel(category: string | null | undefined): string {
  const value = String(category || '').trim();
  const section = BLOG_SECTIONS.find((item) => normalize(item.label) === normalize(value));
  return section ? section.short : value;
}

/** Разрешённые значения категории для редактора и импорта. */
export const ARTICLE_CATEGORY_VALUES: string[] = [...BLOG_SECTIONS.map((section) => section.label), CASES_SECTION_LABEL];
