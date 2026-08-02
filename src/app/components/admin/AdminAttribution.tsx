import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownUp, BarChart3, Coins, Download, Eye, Filter, Info, RefreshCw,
  Search, ShieldCheck, Target, TrendingUp, Trophy, UserCheck, Users, Wallet, X,
} from 'lucide-react';
import { AdminSelect } from './AdminUI';
import AdminAdSpend from './AdminAdSpend';
import { AdminBlank, AdminSectionSkeleton } from './AdminFeedback';
import {
  CountUpValue, DeltaBadge, FunnelChart, StatTile, TrendGroup,
  formatMoney, formatNumber, formatPercent,
  type FunnelStep, type SeriesPoint,
} from './AttributionCharts';

type DimensionKey = 'page' | 'source' | 'campaign' | 'utm' | 'service' | 'country' | 'device' | 'form_id' | 'form_variant';

interface DimensionRow {
  key: string;
  views: number | null;
  visitors: number | null;
  leads: number;
  conversion: number | null;
  submissions: number | null;
  qualified: number | null;
  unqualified: number | null;
  won: number | null;
  revenue: number | null;
  spend: number | null;
  cpl: number | null;
  cpq: number | null;
  romi: number | null;
}

interface DimensionResult {
  key: DimensionKey;
  label: string;
  supported: boolean;
  reason: string | null;
  hasViews: boolean;
  hasSpend: boolean;
  rows: DimensionRow[];
}

interface PeriodTotals {
  visitors: number | null;
  views: number | null;
  leads: number | null;
  submissions: number | null;
  qualified: number | null;
  unqualified: number | null;
  won: number | null;
  revenue: number | null;
  spend: number | null;
}

interface AttributionResponse {
  success: boolean;
  error?: string;
  code?: string;
  checkedAt?: string;
  days?: number;
  currency?: string | null;
  summary?: PeriodTotals;
  previous?: PeriodTotals;
  series?: SeriesPoint[];
  cohorts?: Array<{ week: string; leads: number; qualified: number | null; won: number | null; conversion: number | null }>;
  dimensions?: DimensionResult[];
  coverage?: {
    tables: { leads: boolean; pageStats: boolean; visitors: boolean; spend: boolean };
    qualityAvailable: boolean;
    wonAvailable: boolean;
    wonSource: string | null;
    submissionsAvailable: boolean;
    revenueAvailable: boolean;
    spendAvailable: boolean;
    leadFields: Record<string, boolean>;
    leadRates: { pagePath: number | null; utm: number | null; marketingConsent: number | null };
    model: string;
  };
  limitations?: string[];
}

type SortKey = keyof Omit<DimensionRow, 'key'> | 'key';
type SortDirection = 'asc' | 'desc';

interface ColumnSpec {
  key: SortKey;
  label: string;
  title?: string;
  numeric: boolean;
  format: (row: DimensionRow, currency: string | null) => string;
  visible: (dimension: DimensionResult) => boolean;
  tone?: (row: DimensionRow) => string;
}

const COLUMNS: ColumnSpec[] = [
  { key: 'key', label: 'Значение', numeric: false, format: (row) => row.key, visible: () => true },
  { key: 'views', label: 'Просмотры', numeric: true, format: (row) => formatNumber(row.views), visible: (dimension) => dimension.hasViews },
  { key: 'leads', label: 'Лиды', numeric: true, format: (row) => formatNumber(row.leads), visible: () => true },
  {
    key: 'conversion', label: 'CR', title: 'Конверсия из просмотра в заявку', numeric: true,
    format: (row) => formatPercent(row.conversion), visible: (dimension) => dimension.hasViews,
  },
  {
    key: 'qualified', label: 'Целевые', numeric: true, format: (row) => formatNumber(row.qualified),
    visible: (dimension) => dimension.rows.some((row) => row.qualified !== null), tone: () => 'is-good',
  },
  {
    key: 'unqualified', label: 'Нецелевые', numeric: true, format: (row) => formatNumber(row.unqualified),
    visible: (dimension) => dimension.rows.some((row) => row.unqualified !== null), tone: () => 'is-bad',
  },
  {
    key: 'won', label: 'Выиграно', numeric: true, format: (row) => formatNumber(row.won),
    visible: (dimension) => dimension.rows.some((row) => row.won !== null),
  },
  {
    key: 'spend', label: 'Расход', numeric: true, format: (row, currency) => formatMoney(row.spend, currency),
    visible: (dimension) => dimension.hasSpend,
  },
  {
    key: 'cpl', label: 'Цена лида', title: 'Расход, делённый на число заявок', numeric: true,
    format: (row, currency) => formatMoney(row.cpl, currency), visible: (dimension) => dimension.hasSpend,
  },
  {
    key: 'cpq', label: 'Цена целевого', title: 'Расход, делённый на число целевых заявок', numeric: true,
    format: (row, currency) => formatMoney(row.cpq, currency), visible: (dimension) => dimension.hasSpend,
  },
  {
    key: 'revenue', label: 'Выручка', numeric: true, format: (row, currency) => formatMoney(row.revenue, currency),
    visible: (dimension) => dimension.rows.some((row) => row.revenue !== null && row.revenue > 0),
  },
  {
    key: 'romi', label: 'ROMI', title: 'Окупаемость: (выручка − расход) ÷ расход', numeric: true,
    format: (row) => formatPercent(row.romi), visible: (dimension) => dimension.hasSpend,
    tone: (row) => (row.romi === null ? '' : row.romi >= 0 ? 'is-good' : 'is-bad'),
  },
  {
    key: 'submissions', label: 'Отправки', title: 'Накопленный счётчик повторных заявок у этих контактов', numeric: true,
    format: (row) => formatNumber(row.submissions), visible: (dimension) => dimension.rows.some((row) => row.submissions !== null),
  },
];

function formatDate(value: string | undefined): string {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('ru-RU');
}

function compareRows(a: DimensionRow, b: DimensionRow, key: SortKey, direction: SortDirection): number {
  const factor = direction === 'asc' ? 1 : -1;
  if (key === 'key') return a.key.localeCompare(b.key, 'ru') * factor;
  const left = a[key];
  const right = b[key];
  // «—» (нет данных) всегда внизу — иначе сортировка по цене лида
  // выносила бы наверх строки, где расход просто не заведён.
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return (Number(left) - Number(right)) * factor;
}

function toCsv(dimension: DimensionResult, rows: DimensionRow[], currency: string | null): string {
  const columns = COLUMNS.filter((column) => column.visible(dimension));
  const escape = (value: string) => (/[";\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const header = columns.map((column) => escape(column.label)).join(';');
  const body = rows.map((row) => columns.map((column) => escape(column.format(row, currency).replace(/ /g, ' '))).join(';'));
  return [header, ...body].join('\n');
}

export default function AdminAttribution({ password }: { password: string }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<AttributionResponse | null>(null);
  const [selected, setSelected] = useState<DimensionKey>('page');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('leads');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [showAll, setShowAll] = useState(false);
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

  const currency = data?.currency || null;
  const summary = data?.summary;
  const previous = data?.previous;
  const coverage = data?.coverage;

  const columns = useMemo(() => (active ? COLUMNS.filter((column) => column.visible(active)) : []), [active]);

  const visibleRows = useMemo(() => {
    if (!active) return [];
    const normalized = query.trim().toLowerCase();
    const filtered = normalized ? active.rows.filter((row) => row.key.toLowerCase().includes(normalized)) : active.rows;
    return [...filtered].sort((a, b) => compareRows(a, b, sortKey, sortDirection));
  }, [active, query, sortDirection, sortKey]);

  const shownRows = showAll ? visibleRows : visibleRows.slice(0, 12);

  const funnelSteps: FunnelStep[] = useMemo(() => {
    if (!summary) return [];
    return [
      {
        key: 'visitors',
        label: 'Уникальные посетители',
        value: summary.visitors,
        hint: 'Сумма уникальных за каждый день периода.',
      },
      {
        key: 'leads',
        label: 'Заявки',
        value: summary.leads,
        hint: 'Дедуплицированные контакты, оставившие заявку.',
      },
      {
        key: 'qualified',
        label: 'Целевые',
        value: summary.qualified,
        hint: coverage?.qualityAvailable ? 'Отмечены целевыми в CRM.' : 'Оценка качества недоступна в текущей схеме.',
        transitionNote: 'качество лидов не размечено',
      },
      {
        key: 'won',
        label: 'Выиграно',
        value: summary.won,
        hint: coverage?.wonAvailable ? `Текущий этап сделки · ${coverage.wonSource}.` : 'Нет однозначного этапа сделки.',
        transitionNote: 'этап сделки не определяется',
      },
    ];
  }, [coverage, summary]);

  const cpl = summary && summary.spend !== null && summary.leads ? summary.spend / summary.leads : null;
  const cpq = summary && summary.spend !== null && summary.qualified ? summary.spend / summary.qualified : null;
  const previousCpl = previous && previous.spend !== null && previous.leads ? previous.spend / previous.leads : null;
  const romi = summary && summary.spend !== null && summary.spend > 0 && summary.revenue !== null
    ? ((summary.revenue - summary.spend) / summary.spend) * 100
    : null;

  const exportCsv = () => {
    if (!active) return;
    const csv = toCsv(active, visibleRows, currency);
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `voronka-${active.key}-${days}d.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(key);
    setSortDirection(key === 'key' ? 'asc' : 'desc');
  };

  return (
    <div className="admin-stack admin-stack--lg adm-attribution">
      <div className="admin-section-header">
        <div>
          <p className="admin-eyebrow">Аналитика</p>
          <h2 className="admin-title"><BarChart3 aria-hidden="true" /> Воронка и атрибуция</h2>
          <p className="admin-subtitle">
            Только показатели, которые подтверждаются данными. Деньги считаются по введённым расходам и суммам выигранных сделок — ничего не подставляется «примерно».
          </p>
          {data?.checkedAt && <p className="admin-meta">Обновлено: {formatDate(data.checkedAt)}</p>}
        </div>
        <div className="adm-attribution__controls">
          <div className="adm-attribution__period">
            <Filter aria-hidden="true" />
            <AdminSelect
              ariaLabel="Период атрибуции"
              value={String(days)}
              disabled={loading}
              compact
              options={[
                { value: '7', label: '7 дней' },
                { value: '30', label: '30 дней' },
                { value: '90', label: '90 дней' },
              ]}
              onValueChange={(value) => {
                setData(null);
                setDays(Number(value));
              }}
            />
          </div>
          <button type="button" onClick={() => void load()} disabled={loading} className="admin-button">
            <RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" />
            {loading ? 'Считаю…' : 'Обновить'}
          </button>
        </div>
      </div>

      {loading && !data && !error && <AdminSectionSkeleton tiles={5} rows={3} />}

      {error && (
        <div className="admin-notice admin-notice--warning" role="alert">
          <strong>Данные этого окружения недоступны</strong>
          <p>{error}</p>
          {data?.code === 'D1_NOT_BOUND' && <p>Проверьте этот раздел на production, где подключён Cloudflare D1.</p>}
        </div>
      )}

      {data?.success && summary && (
        <>
          <div className="adm-tiles">
            <StatTile
              icon={<Users aria-hidden="true" />}
              title="Уникальные"
              value={<CountUpValue value={summary.visitors} />}
              detail="Сумма уникальных за каждый день периода."
              delta={<DeltaBadge current={summary.visitors} previous={previous?.visitors} label="Уникальные" />}
              tone={summary.visitors === null ? 'muted' : 'default'}
            />
            <StatTile
              icon={<Eye aria-hidden="true" />}
              title="Просмотры"
              value={<CountUpValue value={summary.views} />}
              detail="Агрегированные просмотры страниц."
              delta={<DeltaBadge current={summary.views} previous={previous?.views} label="Просмотры" />}
              tone={summary.views === null ? 'muted' : 'default'}
            />
            <StatTile
              icon={<UserCheck aria-hidden="true" />}
              title="Заявки"
              value={<CountUpValue value={summary.leads} />}
              detail={summary.submissions === null
                ? 'Уникальные контакты в leads.'
                : `${formatNumber(summary.submissions)} накопленных отправок у этих контактов.`}
              delta={<DeltaBadge current={summary.leads} previous={previous?.leads} label="Заявки" />}
              tone={summary.leads === null ? 'muted' : 'default'}
            />
            <StatTile
              icon={<Target aria-hidden="true" />}
              title="Целевые"
              value={<CountUpValue value={summary.qualified} />}
              detail={summary.unqualified === null
                ? 'Оценка качества недоступна.'
                : `${formatNumber(summary.unqualified)} отмечены нецелевыми.`}
              delta={<DeltaBadge current={summary.qualified} previous={previous?.qualified} label="Целевые" />}
              tone={summary.qualified === null ? 'muted' : 'default'}
            />
            <StatTile
              icon={<Trophy aria-hidden="true" />}
              title="Выиграно"
              value={<CountUpValue value={summary.won} />}
              detail={coverage?.wonAvailable
                ? `Текущий этап среди лидов периода · ${coverage.wonSource}.`
                : 'Нет однозначного этапа сделки — число не вычисляется.'}
              delta={<DeltaBadge current={summary.won} previous={previous?.won} label="Выиграно" />}
              tone={summary.won === null ? 'muted' : 'default'}
            />
          </div>

          {coverage?.spendAvailable ? (
            <div className="adm-tiles adm-tiles--money">
              <StatTile
                icon={<Wallet aria-hidden="true" />}
                title="Расход"
                value={formatMoney(summary.spend, currency)}
                detail="Сумма введённых вручную рекламных расходов за период."
                delta={<DeltaBadge current={summary.spend} previous={previous?.spend} invert label="Расход" />}
              />
              <StatTile
                icon={<Coins aria-hidden="true" />}
                title="Цена лида"
                value={formatMoney(cpl, currency)}
                detail="Расход, делённый на число заявок периода."
                delta={<DeltaBadge current={cpl} previous={previousCpl} invert label="Цена лида" />}
              />
              <StatTile
                icon={<Target aria-hidden="true" />}
                title="Цена целевого"
                value={formatMoney(cpq, currency)}
                detail="Расход, делённый на число целевых заявок."
              />
              <StatTile
                icon={<TrendingUp aria-hidden="true" />}
                title="Выручка"
                value={formatMoney(summary.revenue, currency)}
                detail={`Сумма выигранных сделок в ${currency || 'основной валюте'}.`}
                delta={<DeltaBadge current={summary.revenue} previous={previous?.revenue} label="Выручка" />}
              />
              <StatTile
                icon={<BarChart3 aria-hidden="true" />}
                title="ROMI"
                value={formatPercent(romi)}
                detail="Окупаемость рекламы: (выручка − расход) ÷ расход."
              />
            </div>
          ) : (
            <div className="admin-notice" role="status">
              <strong>Цена лида и окупаемость пока не считаются.</strong>
              <p>В системе нет рекламных расходов, а выдумывать их нельзя. Заполни их в блоке «Рекламные расходы» ниже — все денежные показатели появятся сами.</p>
            </div>
          )}

          <div className="adm-attribution__charts">
            <section className="admin-panel adm-card">
              <header className="adm-card__head">
                <h3 className="admin-card-title">Путь до сделки</h3>
                <p className="admin-hint">Где именно теряются люди. Самый слабый переход помечен.</p>
              </header>
              <FunnelChart steps={funnelSteps} />
            </section>

            <section className="admin-panel adm-card">
              <header className="adm-card__head">
                <h3 className="admin-card-title">Динамика по дням</h3>
                <p className="admin-hint">Наведи курсор или пройди стрелками — покажет значение конкретного дня.</p>
              </header>
              <TrendGroup
                points={data.series || []}
                series={[
                  { key: 'views', label: 'Просмотры', slot: 5 },
                  { key: 'leads', label: 'Заявки', slot: 1 },
                  { key: 'qualified', label: 'Целевые заявки', slot: 2 },
                ]}
              />
            </section>
          </div>

          {(data.cohorts || []).length > 1 && (
            <section className="admin-panel adm-card">
              <header className="adm-card__head">
                <h3 className="admin-card-title">Когорты по неделям</h3>
                <p className="admin-hint">
                  Заявки сгруппированы по неделе прихода. Свежая неделя всегда выглядит хуже старой — сделкам по ней ещё не хватило времени закрыться.
                </p>
              </header>
              <ul className="cohorts">
                {(data.cohorts || []).map((cohort) => {
                  const max = Math.max(...(data.cohorts || []).map((item) => item.leads), 1);
                  return (
                    <li key={cohort.week}>
                      <span className="cohorts__week">{new Date(`${cohort.week}T00:00:00Z`).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', timeZone: 'UTC' })}</span>
                      <span className="cohorts__track">
                        <span className="cohorts__leads" style={{ width: `${(cohort.leads / max) * 100}%` }} />
                        {cohort.won !== null && cohort.won > 0 && (
                          <span className="cohorts__won" style={{ width: `${(cohort.won / max) * 100}%` }} />
                        )}
                      </span>
                      <span className="cohorts__numbers">
                        <span title="Заявок за неделю">{formatNumber(cohort.leads)}</span>
                        <span title="Целевых">{formatNumber(cohort.qualified)}</span>
                        <span title="Дошло до сделки" className={cohort.won ? 'is-good' : ''}>{formatNumber(cohort.won)}</span>
                        <span title="Доля дошедших до сделки">{formatPercent(cohort.conversion)}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="cohorts__legend">
                <span><i className="is-leads" aria-hidden="true" /> заявки</span>
                <span><i className="is-won" aria-hidden="true" /> дошли до сделки</span>
              </p>
            </section>
          )}

          <section className="admin-panel adm-card">
            <header className="adm-card__head adm-card__head--row">
              <div>
                <h3 className="admin-card-title">Разрез данных</h3>
                <p className="admin-hint">Период: последние {data.days} дней, UTC.</p>
              </div>
              <div className="adm-dimension-tabs" role="group" aria-label="Разрез атрибуции">
                {data.dimensions?.map((dimension) => (
                  <button
                    key={dimension.key}
                    type="button"
                    onClick={() => { setSelected(dimension.key); setShowAll(false); }}
                    disabled={!dimension.supported}
                    aria-pressed={selected === dimension.key}
                    title={dimension.supported ? undefined : dimension.reason || undefined}
                    className={selected === dimension.key ? 'is-active' : ''}
                  >
                    {dimension.label}
                  </button>
                ))}
              </div>
            </header>

            {active?.reason && (
              <p className="adm-card__note"><Info aria-hidden="true" /> {active.reason}</p>
            )}

            <div className="adm-table-toolbar">
              <label className="adm-table-search">
                <Search aria-hidden="true" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={`Поиск по «${active?.label || 'разрезу'}»`}
                  aria-label="Поиск по строкам разреза"
                />
                {query ? (
                  <button type="button" aria-label="Очистить поиск" onClick={() => setQuery('')}><X aria-hidden="true" /></button>
                ) : null}
              </label>
              <span className="admin-meta">Строк: {visibleRows.length}</span>
              <button type="button" className="admin-button admin-button--quiet" onClick={exportCsv} disabled={!visibleRows.length}>
                <Download aria-hidden="true" /> Выгрузить CSV
              </button>
            </div>

            <div className="adm-table-scroll" role="region" aria-label="Таблица атрибуции" tabIndex={0}>
              <table className="adm-data-table">
                <caption className="sr-only">Атрибуция по выбранному разрезу за последние {data.days} дней</caption>
                <thead>
                  <tr>
                    {columns.map((column) => {
                      const sorted = sortKey === column.key;
                      return (
                        <th
                          key={String(column.key)}
                          scope="col"
                          className={column.numeric ? 'is-numeric' : ''}
                          aria-sort={sorted ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                        >
                          <button type="button" onClick={() => toggleSort(column.key)} title={column.title || `Сортировать по «${column.label}»`}>
                            {column.label}
                            <ArrowDownUp aria-hidden="true" className={sorted ? `is-sorted is-${sortDirection}` : ''} />
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map((row) => (
                    <tr key={row.key}>
                      {columns.map((column) => (
                        <td
                          key={String(column.key)}
                          className={`${column.numeric ? 'is-numeric' : 'is-key'} ${column.tone?.(row) || ''}`.trim()}
                          title={column.key === 'key' ? row.key : undefined}
                        >
                          {column.format(row, currency)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {active?.supported && visibleRows.length === 0 && (
                <AdminBlank
                  inline
                  icon={<Search />}
                  title={query ? 'Ничего не нашлось' : 'За период данных нет'}
                  text={query
                    ? 'Попробуйте другой запрос или снимите фильтр.'
                    : 'Выберите период длиннее или другой разрез — возможно, данные ещё не накопились.'}
                  actions={query ? <button type="button" className="admin-button" onClick={() => setQuery('')}>Сбросить поиск</button> : undefined}
                />
              )}
            </div>

            {visibleRows.length > shownRows.length && (
              <button type="button" className="admin-button adm-table-more" onClick={() => setShowAll(true)}>
                Показать все {visibleRows.length}
              </button>
            )}
          </section>

          <AdminAdSpend password={password} days={days} onSaved={() => void load()} />

          <div className="adm-attribution__footer">
            <section className="admin-panel adm-card">
              <header className="adm-card__head">
                <h3 className="admin-card-title"><ShieldCheck aria-hidden="true" /> Покрытие лидов</h3>
              </header>
              <div className="adm-coverage">
                {[
                  ['Страница входа', coverage?.leadRates.pagePath],
                  ['UTM-метки', coverage?.leadRates.utm],
                  ['Маркетинговое согласие', coverage?.leadRates.marketingConsent],
                ].map(([label, value]) => (
                  <div key={String(label)} className="adm-coverage__row">
                    <div className="adm-coverage__head">
                      <span>{label}</span>
                      <strong>{formatPercent(value as number | null)}</strong>
                    </div>
                    <div
                      className="adm-coverage__track"
                      role="progressbar"
                      aria-label={String(label)}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={value === null || value === undefined ? undefined : Math.round(Number(value))}
                      aria-valuetext={value === null || value === undefined ? 'Недоступно' : formatPercent(value as number)}
                    >
                      <span style={{ width: `${Math.min(Math.max(Number(value || 0), 0), 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="admin-hint">«—» означает, что нужного поля нет в схеме, а не нулевой результат.</p>
            </section>

            <section className="admin-panel adm-card adm-card--quiet">
              <header className="adm-card__head">
                <h3 className="admin-card-title"><Info aria-hidden="true" /> Как это считается</h3>
              </header>
              <ul className="adm-limitations">
                {data.limitations?.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </section>
          </div>
        </>
      )}
    </div>
  );
}
