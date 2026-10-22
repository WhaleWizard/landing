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
    if (raw.length <= 10 && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [year, month, day] = raw.split('-');
      return `${day}.${month}.${year}`;
    }
    const parsed = new Date(raw);
    if (Number.isFinite(parsed.getTime())) {
      try {
        return new Intl.DateTimeFormat('ru-RU', {
          timeZone: 'Asia/Tashkent',
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }).format(parsed);
      } catch {
        const day = String(parsed.getUTCDate()).padStart(2, '0');
        const month = String(parsed.getUTCMonth() + 1).padStart(2, '0');
        return `${day}.${month}.${parsed.getUTCFullYear()}`;
      }
    }
  }
  return String(article.date || '').trim();
}
