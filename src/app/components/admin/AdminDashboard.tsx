import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, TrendingUp, Users, FileText, Activity } from 'lucide-react';
import { useArticles } from '../../context/ArticlesContext';

interface DayPoint { day: string; views?: number; uniques?: number }

interface StatsResponse {
  success: boolean;
  error?: string;
  viewsDaily: Array<{ day: string; views: number }>;
  uniquesDaily: Array<{ day: string; uniques: number }>;
  topPages: Array<{ page_path: string; views: number }>;
  totals: {
    views7: number; views7Prev: number;
    uniques7: number; uniques7Prev: number;
    leadsTotal: number; leadsNew: number; leads7: number;
  };
  recentLeads: Array<{ id: number; name: string; service: string; budget: string; status: string; created_at: string }>;
  capi: { outboxPending: number; sent24h: number; failed24h: number };
}

const LEAD_STATUS_LABELS: Record<string, { label: string; className: string }> = {
  new: { label: 'новая', className: 'bg-[var(--adm-primary)]/15 text-[var(--adm-primary)]' },
  in_progress: { label: 'в работе', className: 'bg-yellow-500/15 text-yellow-500' },
  closed: { label: 'закрыта', className: 'bg-green-500/15 text-green-500' },
};

function formatDelta(current: number, previous: number): { text: string; positive: boolean } | null {
  if (!previous) return current > 0 ? { text: 'новые данные', positive: true } : null;
  const delta = Math.round(((current - previous) / previous) * 100);
  return { text: `${delta >= 0 ? '+' : ''}${delta}% к прошлой неделе`, positive: delta >= 0 };
}

// Последние 14 дней с нулями для пропущенных дат — чтобы график не «рвался»
function buildSeries(points: DayPoint[], key: 'views' | 'uniques'): number[] {
  const byDay = new Map(points.map((p) => [p.day, Number(p[key] || 0)]));
  const series: number[] = [];
  for (let i = 13; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    series.push(byDay.get(d) || 0);
  }
  return series;
}

function Sparkline({ values, stroke }: { values: number[]; stroke: string }) {
  const max = Math.max(...values, 1);
  const points = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${20 - (v / max) * 16 - 2}`)
    .join(' ');
  return (
    <svg className="mt-2 h-5 w-full" viewBox="0 0 100 20" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function StatCard({ icon, label, value, delta, spark, sparkColor }: {
  icon: React.ReactNode; label: string; value: string;
  delta?: { text: string; positive: boolean } | null;
  spark?: number[]; sparkColor?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--adm-border)] bg-[var(--adm-card)] p-4">
      <div className="flex items-center gap-2 text-xs text-[var(--adm-fg)]/60">{icon}{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      {delta && (
        <div className={`mt-0.5 text-xs ${delta.positive ? 'text-green-500' : 'text-[var(--adm-danger)]'}`}>{delta.text}</div>
      )}
      {spark && <Sparkline values={spark} stroke={sparkColor || 'var(--adm-primary)'} />}
    </div>
  );
}

export default function AdminDashboard({ password }: { password: string }) {
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const { articles } = useArticles();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/stats', {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await res.json().catch(() => null) as StatsResponse | null;
      if (!res.ok || !payload?.success) {
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }
      setStats(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить статистику');
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => { void load(); }, [load]);

  // Путь /blog/slug или /cases/slug превращаем в заголовок статьи
  const pageTitle = useCallback((path: string): string => {
    const match = path.match(/^\/(blog|cases)\/(.+)$/);
    if (match) {
      const article = articles.find((a) => a.slug === match[2]);
      if (article) return article.title;
    }
    return path === '/' ? 'Главная' : path;
  }, [articles]);

  const viewsSeries = useMemo(() => buildSeries(stats?.viewsDaily || [], 'views'), [stats]);
  const uniquesSeries = useMemo(() => buildSeries(stats?.uniquesDaily || [], 'uniques'), [stats]);

  if (loading) return <div className="p-6 text-sm text-[var(--adm-fg)]/60">Загрузка статистики…</div>;

  if (error || !stats) {
    return (
      <div className="rounded-2xl border border-[var(--adm-border)] bg-[var(--adm-card)] p-6 space-y-3">
        <p className="text-sm text-[var(--adm-fg)]/75">{error || 'Статистика недоступна'}</p>
        <p className="text-xs text-[var(--adm-fg)]/55">
          Дашборд работает на продакшене после применения миграции 0008 (см. docs/ADMIN_SETUP_V2.md).
          В локальной разработке базы D1 нет — это нормально.
        </p>
        <button onClick={() => void load()} className="inline-flex items-center gap-2 rounded-lg border border-[var(--adm-border)] px-3 py-1.5 text-xs hover:bg-[var(--adm-muted)]/50">
          <RefreshCw className="h-3.5 w-3.5" /> Повторить
        </button>
      </div>
    );
  }

  const capiOk = stats.capi.failed24h === 0 && stats.capi.outboxPending === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[var(--adm-fg)]/90">Дашборд · последние 7 дней</h2>
        <button onClick={() => void load()} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--adm-border)] px-3 py-1.5 text-xs text-[var(--adm-fg)]/70 hover:bg-[var(--adm-muted)]/50">
          <RefreshCw className="h-3.5 w-3.5" /> Обновить
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          icon={<Users className="h-3.5 w-3.5" />}
          label="Уникальные посетители"
          value={stats.totals.uniques7.toLocaleString('ru-RU')}
          delta={formatDelta(stats.totals.uniques7, stats.totals.uniques7Prev)}
          spark={uniquesSeries}
        />
        <StatCard
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="Просмотры страниц"
          value={stats.totals.views7.toLocaleString('ru-RU')}
          delta={formatDelta(stats.totals.views7, stats.totals.views7Prev)}
          spark={viewsSeries}
          sparkColor="var(--adm-primary-strong)"
        />
        <StatCard
          icon={<FileText className="h-3.5 w-3.5" />}
          label="Заявки за 7 дней"
          value={String(stats.totals.leads7)}
          delta={stats.totals.leadsNew > 0 ? { text: `${stats.totals.leadsNew} ждут ответа`, positive: false } : { text: 'все обработаны', positive: true }}
        />
        <StatCard
          icon={<Activity className="h-3.5 w-3.5" />}
          label="Meta CAPI за сутки"
          value={capiOk ? '✓ ок' : '! внимание'}
          delta={{
            text: `${stats.capi.sent24h} отправлено · ${stats.capi.failed24h} ошибок · ${stats.capi.outboxPending} в очереди`,
            positive: capiOk,
          }}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--adm-border)] bg-[var(--adm-card)] p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--adm-fg)]/55">Топ страниц за 7 дней</h3>
          {stats.topPages.length === 0 && <p className="text-sm text-[var(--adm-fg)]/60">Пока нет данных — статистика начнёт собираться после деплоя.</p>}
          <div className="space-y-1">
            {stats.topPages.map((page) => (
              <div key={page.page_path} className="flex items-center justify-between gap-3 border-t border-[var(--adm-border)]/50 py-1.5 text-sm first:border-t-0">
                <span className="min-w-0 truncate" title={page.page_path}>{pageTitle(page.page_path)}</span>
                <span className="shrink-0 tabular-nums text-[var(--adm-fg)]/60">{page.views.toLocaleString('ru-RU')}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--adm-border)] bg-[var(--adm-card)] p-4">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--adm-fg)]/55">Последние заявки</h3>
          {stats.recentLeads.length === 0 && <p className="text-sm text-[var(--adm-fg)]/60">Заявок пока нет.</p>}
          <div className="space-y-1">
            {stats.recentLeads.map((lead) => {
              const status = LEAD_STATUS_LABELS[lead.status] || LEAD_STATUS_LABELS.new;
              return (
                <div key={lead.id} className="flex items-center justify-between gap-3 border-t border-[var(--adm-border)]/50 py-1.5 text-sm first:border-t-0">
                  <span className="min-w-0 truncate">
                    {lead.name || 'Без имени'}
                    <span className="text-[var(--adm-fg)]/50">{lead.service ? ` · ${lead.service}` : ''}{lead.budget ? ` · ${lead.budget}` : ''}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${status.className}`}>{status.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="text-xs text-[var(--adm-fg)]/45">
        Уникальные посетители считаются по обезличенному отпечатку дня (без cookies), личные данные не сохраняются.
      </p>
    </div>
  );
}
