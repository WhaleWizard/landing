import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Eye, Inbox, Info, RefreshCw, TrendingUp } from 'lucide-react';
import { AdminBlank } from './AdminFeedback';
import { formatNumber, formatPercent } from './AttributionCharts';
import type { Article } from '../hooks/useArticlesApi';

interface PageRow {
  path: string;
  views: number;
  leads: number;
  conversion: number | null;
}

interface StatsResponse {
  success?: boolean;
  error?: string;
  code?: string;
  days?: number;
  pages?: PageRow[];
  coverage?: { pageStats: boolean; leads: boolean };
  notes?: string[];
}

const CASES_CATEGORY = 'Кейсы';

function articlePath(article: Article): string {
  return `${article.category === CASES_CATEGORY ? '/cases' : '/blog'}/${article.slug}`;
}

/**
 * Окупаемость публикаций: сколько трафика и заявок принесла каждая статья.
 * Числа уже были в базе, но лежали в разных местах и никогда не сводились.
 */
export default function ContentPerformance({
  password,
  articles,
  onOpen,
}: {
  password: string;
  articles: Article[];
  onOpen: (article: Article) => void;
}) {
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/content-stats?days=90', {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as StatsResponse | null;
      setData(payload);
    } catch {
      setData({ success: false, error: 'Не удалось загрузить статистику публикаций' });
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => { void load(); }, [load]);

  const rows = useMemo(() => {
    const byPath = new Map((data?.pages || []).map((page) => [page.path, page]));
    return articles
      .map((article) => {
        const stats = byPath.get(articlePath(article));
        return {
          article,
          views: stats?.views || 0,
          leads: stats?.leads || 0,
          conversion: stats?.conversion ?? null,
        };
      })
      .filter((row) => row.views > 0 || row.leads > 0)
      .sort((a, b) => b.leads - a.leads || b.views - a.views);
  }, [articles, data]);

  const totals = useMemo(() => rows.reduce(
    (accumulator, row) => ({ views: accumulator.views + row.views, leads: accumulator.leads + row.leads }),
    { views: 0, leads: 0 },
  ), [rows]);

  if (loading && !data) return null;
  if (data && !data.success) return null;

  const shown = expanded ? rows : rows.slice(0, 5);

  return (
    <section className="admin-panel adm-card content-perf" aria-label="Окупаемость публикаций">
      <header className="adm-card__head adm-card__head--row">
        <div>
          <h3 className="admin-card-title"><TrendingUp aria-hidden="true" /> Что приносит заявки</h3>
          <p className="admin-hint">Публикации за последние {data?.days || 90} дней: просмотры, заявки и конверсия.</p>
        </div>
        <button type="button" className="admin-button admin-button--quiet admin-button--compact" aria-label="Обновить статистику публикаций" title="Обновить статистику публикаций" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" />
        </button>
      </header>

      {rows.length === 0 ? (
        <AdminBlank
          inline
          title="Данных по публикациям пока нет"
          text="Статистика появится, когда на статьи пойдёт трафик. Заявка засчитывается материалу, если человек оставил её именно с этой страницы."
        />
      ) : (
        <>
          <div className="content-perf__totals">
            <span><Eye aria-hidden="true" /> {formatNumber(totals.views)} просмотров</span>
            <span><Inbox aria-hidden="true" /> {formatNumber(totals.leads)} заявок с публикаций</span>
          </div>

          <ul className="content-perf__list">
            {shown.map((row) => (
              <li key={row.article.slug}>
                <button type="button" onClick={() => onOpen(row.article)} title={`Открыть «${row.article.title}»`}>
                  <span className="content-perf__title">{row.article.title || row.article.slug}</span>
                  <span className="content-perf__numbers">
                    <span title="Просмотры"><Eye aria-hidden="true" /> {formatNumber(row.views)}</span>
                    <span title="Заявки со страницы" className={row.leads > 0 ? 'is-good' : ''}>
                      <Inbox aria-hidden="true" /> {formatNumber(row.leads)}
                    </span>
                    <span title="Конверсия из просмотра в заявку">{formatPercent(row.conversion)}</span>
                  </span>
                  <ArrowUpRight aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>

          {rows.length > 5 && (
            <button type="button" className="admin-button admin-button--quiet" onClick={() => setExpanded((value) => !value)}>
              {expanded ? 'Свернуть' : `Показать все ${rows.length}`}
            </button>
          )}

          <p className="content-perf__note">
            <Info aria-hidden="true" />
            Свежая статья выглядит скромнее старой просто из-за возраста: период у всех одинаковый.
          </p>
        </>
      )}
    </section>
  );
}
