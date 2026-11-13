import { isCaseArticle } from './articleCategory';

export const HOME_ARTICLES_LIMIT = 10;

type HomeArticleLike = {
  category?: string | null;
  slug?: string;
  featuredOrder?: number | null;
  publishedAt?: string;
  updatedAt?: string;
  date?: string;
};

// Точная дата публикации, затем дата из карточки и дата правки.
// Для старых значений вроде «апрель 2026 г.» используем следующий источник.
function sortTimestamp(article: HomeArticleLike): number {
  for (const value of [article.publishedAt, article.date, article.updatedAt]) {
    const raw = String(value || '').trim();
    if (!raw) continue;
    const ddmmyyyy = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (ddmmyyyy) return Date.UTC(Number(ddmmyyyy[3]), Number(ddmmyyyy[2]) - 1, Number(ddmmyyyy[1]));
    const direct = Date.parse(raw.length <= 10 ? `${raw}T00:00:00Z` : raw);
    if (Number.isFinite(direct)) return direct;
  }
  return 0;
}

export function isFeaturedArticle(article: HomeArticleLike): boolean {
  return Number.isInteger(article.featuredOrder) && Number(article.featuredOrder) > 0;
}

function compareSlug(a: HomeArticleLike, b: HomeArticleLike): number {
  const left = a.slug ?? '';
  const right = b.slug ?? '';
  return left < right ? -1 : left > right ? 1 : 0;
}

/**
 * Что показывает блок «Статьи» на главной: сначала закреплённые владельцем
 * в его порядке (1..N), затем оставшиеся места до лимита (10 статей)
 * заполняются самыми свежими статьями блога по дате. Кейсы сюда не
 * попадают, у них своя витрина.
 *
 * Той же функцией пользуется генератор статических страниц: встроенный в
 * главную список и живой список из API обязаны совпадать, иначе карусель
 * дёргается после загрузки.
 */
export function selectHomeArticles<T extends HomeArticleLike>(articles: T[], limit = HOME_ARTICLES_LIMIT): T[] {
  const blog = articles.filter((article) => !isCaseArticle(article));
  const featured = blog
    .filter(isFeaturedArticle)
    .sort((a, b) => Number(a.featuredOrder) - Number(b.featuredOrder) || compareSlug(a, b));

  const featuredSet = new Set(featured);
  const remaining = blog
    .filter((article) => !featuredSet.has(article))
    .sort((a, b) => sortTimestamp(b) - sortTimestamp(a)
      || (Date.parse(b.updatedAt || '') || 0) - (Date.parse(a.updatedAt || '') || 0)
      || compareSlug(a, b));

  return [...featured, ...remaining].slice(0, limit);
}
