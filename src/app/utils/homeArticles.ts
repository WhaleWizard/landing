import { isCaseArticle } from './articleCategory';

export const HOME_ARTICLES_LIMIT = 10;

type HomeArticleLike = {
  category?: string | null;
  featuredOrder?: number | null;
  publishedAt?: string;
  updatedAt?: string;
  date?: string;
};

// Та же цепочка, что у генератора страниц: точная дата публикации, затем
// свободная дата из админки, затем дата правки. Свободная дата бывает
// «апрель 2026 г.» — такая не разбирается и считается самой старой.
function sortTimestamp(article: HomeArticleLike): number {
  for (const value of [article.publishedAt, article.date, article.updatedAt]) {
    const raw = String(value || '').trim();
    if (!raw) continue;
    const direct = Date.parse(raw.length <= 10 ? `${raw}T00:00:00Z` : raw);
    if (Number.isFinite(direct)) return direct;
    const ddmmyyyy = raw.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
    if (ddmmyyyy) return Date.UTC(Number(ddmmyyyy[3]), Number(ddmmyyyy[2]) - 1, Number(ddmmyyyy[1]));
  }
  return 0;
}

export function isFeaturedArticle(article: HomeArticleLike): boolean {
  return Number.isInteger(article.featuredOrder) && Number(article.featuredOrder) > 0;
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
    .sort((a, b) => Number(a.featuredOrder) - Number(b.featuredOrder));

  const featuredSet = new Set(featured);
  const remaining = blog
    .filter((article) => !featuredSet.has(article))
    .sort((a, b) => sortTimestamp(b) - sortTimestamp(a));

  return [...featured, ...remaining].slice(0, limit);
}
