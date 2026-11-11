import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Inbox, Info, Pencil, RefreshCw, TrendingUp } from 'lucide-react';
import { AdminBlank, AdminSectionSkeleton } from './AdminFeedback';
import { formatNumber, formatPercent } from './AttributionCharts';
import type { Article } from '../hooks/useArticlesApi';

interface PageRow {
  slug: string;
  views: number | null;
  leads: number | null;
  conversion: number | null;
}

interface StatsResponse {
  success?: boolean;
  error?: string;
  days?: number;
  pages?: PageRow[];
  coverage?: { pageStats: boolean; leads: boolean; consent: boolean };
  notes?: string[];
}

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
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const activeRequest = useRef(null as AbortController | null);

  const load = useCallback(async () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/content-stats?days=90&timezone_offset=${new Date().getTimezoneOffset()}`, {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null) as StatsResponse | null;
      if (controller.signal.aborted) return;
      if (!response.ok || !payload?.success) {
        setError(payload?.error || 'Не удалось загрузить статистику публикаций');
        return;
      }
      setData(payload);
    } catch {
      if (!controller.signal.aborted) setError('Не удалось загрузить статистику публикаций');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [password]);

  useEffect(() => {
    void load();
    return () => activeRequest.current?.abort();
  }, [load]);

  const rows = useMemo(() => {
    const bySlug = new Map(articles.map((article) => [article.slug, article]));
    return (data?.pages || []).flatMap((stats) => {
      const article = bySlug.get(stats.slug);
      return article && ((stats.views ?? 0) > 0 || (stats.leads ?? 0) > 0) ? [{ article, ...stats }] : [];
    });
  }, [articles, data]);

  const totals = useMemo(() => rows.reduce<{ views: number | null; leads: number | null }>(
    (accumulator, row) => ({
      views: row.views === null ? accumulator.views : (accumulator.views ?? 0) + row.views,
      leads: row.leads === null ? accumulator.leads : (accumulator.leads ?? 0) + row.leads,
    }),
    { views: null, leads: null },
  ), [rows]);

  const shown = expanded ? rows : rows.slice(0, 5);
  const coverage = data?.coverage;
  const missing = [
    coverage && !coverage.pageStats && 'просмотры',
    coverage && !coverage.leads && 'заявки',
    coverage && (!coverage.consent || !coverage.pageStats) && 'конверсия',
  ].filter(Boolean);

  return (
    <section className="admin-panel adm-card content-perf" aria-label="Статистика публикаций" aria-busy={loading}>
      <header className="adm-card__head adm-card__head--row">
        <div>
          <h3 className="admin-card-title"><TrendingUp aria-hidden="true" /> Статистика публикаций</h3>
          <p className="admin-hint">Просмотры, заявки и конверсия за последние {data?.days ?? 90} дней.</p>
        </div>
        <button type="button" className="admin-button admin-button--quiet admin-button--compact" aria-label="Обновить статистику публикаций" title="Обновить статистику публикаций" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" />
        </button>
      </header>

      {error && (
        <div className="admin-notice admin-notice--danger" role="alert">
          {error}{data ? ' Показаны последние загруженные данные.' : ''}
        </div>
      )}
      {missing.length > 0 && (
        <div className="admin-notice admin-notice--warning" role="status">
          Недоступны показатели из базы: {missing.join(', ')}.
        </div>
      )}
      {loading && !data && <AdminSectionSkeleton tiles={0} rows={2} />}
      {data && (rows.length === 0 ? (
        <AdminBlank inline title="Данных по публикациям пока нет" text="Здесь появятся просмотры и заявки со страниц текущих публикаций." />
      ) : (
        <>
          <div className="content-perf__totals">
            <span><Eye aria-hidden="true" /> Просмотры {formatNumber(totals.views)}</span>
            <span><Inbox aria-hidden="true" /> Заявки {formatNumber(totals.leads)}</span>
          </div>
          <ul className="content-perf__list">
            {shown.map((row) => (
              <li key={row.slug}>
                <button type="button" onClick={() => onOpen(row.article)} title={`Открыть в редакторе «${row.article.title || row.slug}»`}>
                  <span className="content-perf__title">{row.article.title || row.slug}</span>
                  <span className="content-perf__numbers">
                    <span title="Просмотры с маркетинговым согласием"><Eye aria-hidden="true" /> {formatNumber(row.views)}</span>
                    <span title="Все заявки со страницы" className={(row.leads ?? 0) > 0 ? 'is-good' : ''}>
                      <Inbox aria-hidden="true" /> {formatNumber(row.leads)}
                    </span>
                    <span title="Конверсия по просмотрам и заявкам с согласием">{formatPercent(row.conversion)}</span>
                  </span>
                  <Pencil aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
          {rows.length > 5 && (
            <button type="button" className="admin-button admin-button--quiet" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>
              {expanded ? 'Свернуть' : `Показать все ${rows.length}`}
            </button>
          )}
          {rows.some((row) => row.views === null || row.conversion === null || row.leads === null) && (
            <p className="content-perf__note">
              <Info aria-hidden="true" /> Прочерк означает, что данных для показателя недостаточно.
            </p>
          )}
          {(data.notes || []).map((note) => (
            <p className="content-perf__note" key={note}><Info aria-hidden="true" /> {note}</p>
          ))}
        </>
      ))}
    </section>
  );
}
