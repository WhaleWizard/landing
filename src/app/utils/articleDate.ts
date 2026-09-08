import type { Article } from '../components/hooks/useArticlesApi';

/**
 * Дата статьи для читателя — из того же поля, что уходит в разметку для
 * поисковика.
 *
 * У статьи два поля даты: `publishedAt` (точная, ISO, её читает Google из
 * JSON-LD) и `date` (свободная строка из админки, её видел читатель). Они
 * разошлись: в разметке стояло 2026-05-01, а на странице — 23.04.2026, причём
 * у всех статей одинаково. Читатель и поисковик видели разные даты.
 *
 * Теперь показываем `publishedAt`, а свободная строка остаётся запасным
 * вариантом для старых записей, где точной даты нет.
 */
export function articleDisplayDate(article: Pick<Article, 'publishedAt' | 'date'>): string {
  const raw = String(article.publishedAt || '').trim();
  if (raw) {
    const parsed = new Date(raw.length <= 10 ? `${raw}T00:00:00Z` : raw);
    if (Number.isFinite(parsed.getTime())) {
      const day = String(parsed.getUTCDate()).padStart(2, '0');
      const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
      return `${day}.${month}.${parsed.getUTCFullYear()}`;
    }
  }
  return String(article.date || '').trim();
}
