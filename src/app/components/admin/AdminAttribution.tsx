import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3, Eye, Filter, Info, RefreshCw, ShieldCheck,
  Target, Trophy, UserCheck, Users,
} from 'lucide-react';

type DimensionKey = 'page' | 'service' | 'utm' | 'form_id' | 'form_variant';

interface DimensionRow {
  key: string;
  views: number | null;
  visitors: number | null;
  leads: number;
  submissions: number | null;
  qualified: number | null;
  unqualified: number | null;
  won: number | null;
}

interface DimensionResult {
  key: DimensionKey;
  label: string;
  supported: boolean;
  reason: string | null;
  rows: DimensionRow[];
}

interface AttributionResponse {
  success: boolean;
  error?: string;
  code?: string;
  checkedAt?: string;
  days?: number;
  summary?: {
    visitors: number | null;
    views: number | null;
    leads: number | null;
    submissions: number | null;
    qualified: number | null;
    unqualified: number | null;
    won: number | null;
  };
  dimensions?: DimensionResult[];
  coverage?: {
    tables: { leads: boolean; pageStats: boolean; visitors: boolean };
    qualityAvailable: boolean;
    wonAvailable: boolean;
    wonSource: string | null;
    submissionsAvailable: boolean;
    leadFields: {
      pagePath: boolean;
      utm: boolean;
      formId: boolean;
      formVariant: boolean;
      marketingConsent: boolean;
    };
    leadRates: { pagePath: number | null; utm: number | null; marketingConsent: number | null };
    model: string;
  };
  limitations?: string[];
}

function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toLocaleString('ru-RU');
}

function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;
}

function formatDate(value: string | undefined): string {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('ru-RU');
}

function MetricCard({ icon, title, value, detail, unavailable = false }: {
  icon: React.ReactNode;
  title: string;
  value: number | null | undefined;
  detail: string;
  unavailable?: boolean;
}) {
  return (
    <div className="admin-panel p-4">
      <div className="flex items-center gap-2 text-sm text-[var(--adm-fg)]/58">{icon}<span>{title}</span></div>
      <div className={`mt-2 text-2xl font-semibold tracking-tight tabular-nums ${unavailable ? 'text-[var(--adm-fg)]/35' : ''}`}>
        {formatNumber(value)}
      </div>
      <p className="mt-1 text-sm leading-relaxed text-[var(--adm-fg)]/50">{detail}</p>
    </div>
  );
}

export default function AdminAttribution({ password }: { password: string }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AttributionResponse | null>(null);
  const [selected, setSelected] = useState<DimensionKey>('page');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/attribution?days=${days}`, {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as AttributionResponse | null;
      if (requestId !== requestSequence.current) return;
      if (!response.ok || !payload?.success) {
        setData(payload);
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      setData(payload);
      setSelected((currentKey) => {
        const current = payload.dimensions?.find((dimension) => dimension.key === currentKey);
        if (current?.supported) return currentKey;
        return payload.dimensions?.find((dimension) => dimension.supported)?.key || currentKey;
      });
    } catch (err) {
      if (requestId !== requestSequence.current) return;
      setError(err instanceof Error ? err.message : 'Не удалось построить атрибуцию');
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [days, password]);

  useEffect(() => { void load(); }, [load]);

  const active = useMemo(
    () => data?.dimensions?.find((dimension) => dimension.key === selected),
    [data, selected],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-[var(--adm-primary)]" />
            <h2 className="text-lg font-semibold tracking-tight">Воронка и атрибуция</h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--adm-fg)]/58">
            Только показатели, которые можно подтвердить текущей схемой D1. Расходы, доход и окупаемость не подставляются без источника данных.
          </p>
          {data?.checkedAt && <p className="admin-meta mt-1">Обновлено: {formatDate(data.checkedAt)}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex min-h-10 items-center gap-2 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-card)] px-3 text-sm">
            <Filter className="h-4 w-4 text-[var(--adm-fg)]/50" />
            <span className="sr-only">Период</span>
            <select
              aria-label="Период атрибуции"
              value={days}
              disabled={loading}
              onChange={(event) => {
                setData(null);
                setDays(Number(event.target.value));
              }}
              className="admin-inline-select font-semibold outline-none"
            >
              <option value={7}>7 дней</option>
              <option value={30}>30 дней</option>
              <option value={90}>90 дней</option>
            </select>
          </label>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="admin-button admin-button--secondary"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Считаю…' : 'Обновить'}
          </button>
        </div>
      </div>

      {loading && !data && !error && (
        <div className="admin-panel p-6 text-sm text-[var(--adm-fg)]/60" role="status" aria-live="polite">
          Строю подтверждённую воронку…
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/8 p-4 text-sm leading-relaxed" role="alert">
          <p className="font-semibold">Данные этого окружения недоступны</p>
          <p className="mt-1 text-[var(--adm-fg)]/65">{error}</p>
          {data?.code === 'D1_NOT_BOUND' && <p className="mt-1 text-[var(--adm-fg)]/50">Проверьте этот раздел на production, где подключён Cloudflare D1.</p>}
        </div>
      )}

      {data?.success && data.summary && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard
              icon={<Users className="h-4 w-4" />}
              title="Дневные уникальные"
              value={data.summary.visitors}
              detail="Сумма уникальных за каждый день; один человек в разные дни может учитываться повторно."
              unavailable={data.summary.visitors === null}
            />
            <MetricCard
              icon={<Eye className="h-4 w-4" />}
              title="Просмотры"
              value={data.summary.views}
              detail="Агрегированные просмотры страниц."
              unavailable={data.summary.views === null}
            />
            <MetricCard
              icon={<UserCheck className="h-4 w-4" />}
              title="Лиды"
              value={data.summary.leads}
              detail={data.summary.submissions === null
                ? 'Уникальные записи leads.'
                : `${formatNumber(data.summary.submissions)} накопленных отправок у этих контактов.`}
              unavailable={data.summary.leads === null}
            />
            <MetricCard
              icon={<Target className="h-4 w-4" />}
              title="Квалифицированы"
              value={data.summary.qualified}
              detail={data.summary.unqualified === null ? 'Оценка качества недоступна.' : `${formatNumber(data.summary.unqualified)} отмечены нецелевыми.`}
              unavailable={data.summary.qualified === null}
            />
            <MetricCard
              icon={<Trophy className="h-4 w-4" />}
              title="Выиграно"
              value={data.summary.won}
              detail={data.coverage?.wonAvailable
                ? `Текущий этап среди лидов периода · ${data.coverage.wonSource}.`
                : 'Нет однозначного этапа сделки — число не вычисляется.'}
              unavailable={data.summary.won === null}
            />
          </div>

          <section className="admin-panel p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">Разрез данных</h3>
                <p className="mt-0.5 text-sm text-[var(--adm-fg)]/50">Период: последние {data.days} дней, UTC.</p>
              </div>
              <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-[var(--adm-muted)]/45 p-1" role="group" aria-label="Разрез атрибуции">
                {data.dimensions?.map((dimension) => (
                  <button
                    key={dimension.key}
                    type="button"
                    onClick={() => setSelected(dimension.key)}
                    disabled={!dimension.supported}
                    title={dimension.supported ? undefined : dimension.reason || undefined}
                    className={`min-h-9 shrink-0 rounded-lg px-3 text-sm font-semibold transition-colors ${
                      selected === dimension.key
                        ? 'bg-[var(--adm-card)] text-[var(--adm-primary)] shadow-sm'
                        : 'text-[var(--adm-fg)]/55 hover:text-[var(--adm-fg)] disabled:cursor-not-allowed disabled:opacity-35'
                    }`}
                  >
                    {dimension.label}
                  </button>
                ))}
              </div>
            </div>

            {active?.reason && (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-[var(--adm-muted)]/42 p-3 text-sm leading-relaxed text-[var(--adm-fg)]/58">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--adm-primary)]" /> {active.reason}
              </div>
            )}

            <div className="mt-3 overflow-x-auto" role="region" aria-label="Таблица атрибуции" tabIndex={0}>
              <table className="w-full min-w-[780px] text-left text-sm">
                <caption className="sr-only">Атрибуция по выбранному разрезу за последние {data.days} дней</caption>
                <thead className="text-[var(--adm-fg)]/50">
                  <tr className="border-b border-[var(--adm-border)]">
                    <th scope="col" className="px-2 py-2 font-medium">{active?.label || 'Разрез'}</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Просмотры</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Лиды</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Отправки</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Целевые</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Нецелевые</th>
                    <th scope="col" className="px-2 py-2 text-right font-medium">Выиграно</th>
                  </tr>
                </thead>
                <tbody>
                  {active?.rows.map((row) => (
                    <tr key={row.key} className="border-b border-[var(--adm-border)]/55 last:border-0">
                      <td className="max-w-[300px] px-2 py-2.5 font-medium" title={row.key}>
                        <span className="block truncate">{row.key}</span>
                      </td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{formatNumber(row.views)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{formatNumber(row.leads)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{formatNumber(row.submissions)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-green-500">{formatNumber(row.qualified)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums text-[var(--adm-danger)]">{formatNumber(row.unqualified)}</td>
                      <td className="px-2 py-2.5 text-right tabular-nums">{formatNumber(row.won)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {active?.supported && active.rows.length === 0 && (
                <p className="py-5 text-sm text-[var(--adm-fg)]/50">За выбранный период данных нет.</p>
              )}
            </div>
          </section>

          <div className="grid gap-3 lg:grid-cols-[.8fr_1.2fr]">
            <section className="admin-panel p-4 sm:p-5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[var(--adm-primary)]" />
                <h3 className="text-base font-semibold">Покрытие лидов</h3>
              </div>
              <div className="mt-3 space-y-3">
                {[
                  ['Страница входа', data.coverage?.leadRates.pagePath],
                  ['UTM-метки', data.coverage?.leadRates.utm],
                  ['Маркетинговое согласие', data.coverage?.leadRates.marketingConsent],
                ].map(([label, value]) => (
                  <div key={String(label)}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-[var(--adm-fg)]/60">{label}</span>
                      <span className="font-semibold tabular-nums">{formatPercent(value as number | null)}</span>
                    </div>
                    <div
                      className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--adm-muted)]"
                      role="progressbar"
                      aria-label={String(label)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={value === null || value === undefined ? undefined : Math.round(Number(value))}
                      aria-valuetext={value === null || value === undefined ? 'Недоступно' : formatPercent(value as number)}
                    >
                      <div
                        className="h-full rounded-full bg-[var(--adm-primary)]"
                        style={{ width: `${Math.min(Math.max(Number(value || 0), 0), 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm leading-relaxed text-[var(--adm-fg)]/48">«—» означает, что нужного поля нет в схеме, а не нулевой результат.</p>
            </section>

            <section className="rounded-2xl border border-[var(--adm-border)] bg-[var(--adm-muted)]/24 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--adm-primary)]" />
                <div>
                  <h3 className="text-base font-semibold">Ограничения расчёта</h3>
                  <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-[var(--adm-fg)]/58">
                    {data.limitations?.map((item) => <li key={item}>• {item}</li>)}
                  </ul>
                </div>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
