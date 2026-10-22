import { isCaseArticle } from './articleCategory';

/**
 * Сколько статей блог показывает за один шаг: первая «страница» — главная
 * карточка и ещё двадцать три, дальше по двадцать четыре на кнопку
 * «Показать ещё». Номер шага живёт в адресе (`?page=N`), поэтому ссылка
 * и кнопка «назад» возвращают к тому же месту списка.
 *
 * Тем же числом генератор ограничивает встроенный в /blog список: при
 * шестистах статьях полный список весил бы сотни килобайт в каждой
 * загрузке страницы, а первый экран показывает только первые двадцать
 * четыре. Остальное догружается в фоне кратким списком из API.
 */
export const BLOG_PAGE_SIZE = 24;

export function parseBlogPage(value: string | null | undefined): number {
  const page = Number.parseInt(String(value || ''), 10);
  return Number.isInteger(page) && page >= 1 && page <= 1000 ? page : 1;
}

type BlogListArticle = {
  id?: number | string | null;
  category?: string | null;
  publishedAt?: string;
  date?: string;
};

/** Дата статьи числом: сначала ISO, затем формат «дд.мм.гггг» из админки. */
export function blogArticleTimestamp(article: BlogListArticle): number {
  const iso = Date.parse(article.publishedAt || '');
  if (Number.isFinite(iso)) return iso;
  const match = String(article.date || '').match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return 0;
  return Date.UTC(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

/**
 * Порядок статей с одинаковой датой: по `id`, как их отдаёт `/api/articles`.
 * У встроенного в страницу списка `id` может не быть — тогда ноль, и
 * устойчивая сортировка сохраняет порядок источника (он тот же, по `id`).
 */
export function blogArticleOrder(article: BlogListArticle): number {
  const id = Number(article.id);
  return Number.isFinite(id) && id > 0 ? id : 0;
}

/** «Сначала новые» — порядок списка блога по умолчанию. */
export function compareBlogArticlesNewest(a: BlogListArticle, b: BlogListArticle): number {
  const difference = blogArticleTimestamp(b) - blogArticleTimestamp(a);
  if (difference !== 0) return difference;
  return blogArticleOrder(a) - blogArticleOrder(b);
}

/**
 * Что уезжает в `<script id="ww-article-seed">` на `/blog` и что сервер
 * рисует первым экраном: первые BLOG_PAGE_SIZE статей блога в том же порядке,
 * в каком их покажет BlogPage без параметров. Генератор обязан брать именно
 * эту функцию: при другом порядке или наборе живой список после загрузки
 * переставил бы карточки готовой разметки.
 */
export function selectBlogListSeed<T extends BlogListArticle>(articles: T[]): T[] {
  return articles
    .filter((article) => !isCaseArticle(article))
    .sort(compareBlogArticlesNewest)
    .slice(0, BLOG_PAGE_SIZE);
}
