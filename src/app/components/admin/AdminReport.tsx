import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ClipboardCopy, FileText, Info, Printer, RefreshCw } from 'lucide-react';
import { AdminBlank, AdminSectionSkeleton, notify } from './AdminFeedback';
import { formatMoney, formatNumber, formatPercent } from './AttributionCharts';

interface PeriodNumbers {
  views: number | null;
  visitors: number | null;
  leads: number;
  qualified: number | null;
  won: number | null;
  revenue: number | null;
  spend: number | null;
}

interface ReportResponse {
  success?: boolean;
  error?: string;
  period?: string;
  isCurrentMonth?: boolean;
  currency?: string;
  current?: PeriodNumbers;
  previous?: PeriodNumbers;
  derived?: { profit: number | null; cpl: number | null; cpq: number | null; romi: number | null };
  goal?: { leads_target: number; qualified_target: number; revenue_target: number; spend_cap: number } | null;
  sources?: Array<{ source: string; leads: number; qualified: number | null }>;
  pages?: Array<{ path: string; views: number }>;
  publishedArticles?: number | null;
  notes?: string[];
}

function periodLabel(period: string): string {
  const parsed = new Date(`${period}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return period;
  const text = parsed.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function shiftPeriod(period: string, months: number): string {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/** Изменение к прошлому месяцу словами, а не только стрелкой. */
function change(current: number | null, previous: number | null): string {
  if (current === null || previous === null) return '';
  if (previous === 0) return current === 0 ? 'без изменений' : 'с нуля';
  const delta = ((current - previous) / previous) * 100;
  if (Math.abs(delta) < 1) return 'на уровне прошлого месяца';
  return `${delta > 0 ? '+' : ''}${delta.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}% к прошлому месяцу`;
}

/** Раздел «Отчёт»: итоги месяца одним экраном, готовые к печати и копированию. */
export default function AdminReport({ password }: { password: string }) {
  const [period, setPeriod] = useState(currentPeriod);
  const [data, setData] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/report?period=${period}`, {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      setData(await response.json().catch(() => null));
    } catch {
      setData({ success: false, error: 'Не удалось собрать отчёт' });
    } finally {
      setLoading(false);
    }
  }, [password, period]);

  useEffect(() => { void load(); }, [load]);

  const currency = data?.currency || 'USD';
  const current = data?.current;
  const previous = data?.previous;
  const derived = data?.derived;

  const plainText = useMemo(() => {
    if (!current) return '';
    const lines = [
      `Отчёт за ${periodLabel(period).toLowerCase()}`,
      '',
      `Посетители: ${formatNumber(current.visitors)}`,
      `Просмотры: ${formatNumber(current.views)}`,
      `Заявки: ${formatNumber(current.leads)}${previous ? ` (${change(current.leads, previous.leads)})` : ''}`,
      `Целевые заявки: ${formatNumber(current.qualified)}`,
      `Выигранные сделки: ${formatNumber(current.won)}`,
    ];
    if (current.spend !== null) lines.push(`Расход: ${formatMoney(current.spend, currency)}`);
    if (current.revenue !== null) lines.push(`Выручка: ${formatMoney(current.revenue, currency)}`);
    if (derived?.profit !== null && derived?.profit !== undefined) lines.push(`Прибыль: ${formatMoney(derived.profit, currency)}`);
    if (derived?.cpl !== null && derived?.cpl !== undefined) lines.push(`Цена заявки: ${formatMoney(derived.cpl, currency)}`);
    if (derived?.romi !== null && derived?.romi !== undefined) lines.push(`Окупаемость: ${formatPercent(derived.romi)}`);
    if (data?.sources?.length) {
      lines.push('', 'Источники заявок:');
      for (const source of data.sources) lines.push(`— ${source.source}: ${source.leads}`);
    }
    return lines.join('\n');
  }, [currency, current, data?.sources, derived, period, previous]);

  if (loading && !data) return <AdminSectionSkeleton tiles={4} rows={3} />;

  return (
    <div className="admin-stack admin-stack--lg report">
      <div className="admin-section-header">
        <div>
          <p className="admin-eyebrow">Итоги</p>
          <h2 className="admin-title"><FileText aria-hidden="true" /> Отчёт за месяц</h2>
          <p className="admin-subtitle">
            Всё, что нужно, чтобы подвести черту: трафик, заявки, деньги и источники за месяц с сравнением с предыдущим.
          </p>
        </div>
        <div className="goals__period">
          <button type="button" className="admin-button admin-button--icon" aria-label="Предыдущий месяц" onClick={() => setPeriod((value) => shiftPeriod(value, -1))}>
            <ChevronLeft aria-hidden="true" />
          </button>
          <span className="goals__period-label">{periodLabel(period)}</span>
          <button
            type="button"
            className="admin-button admin-button--icon"
            aria-label="Следующий месяц"
            disabled={period >= currentPeriod()}
            onClick={() => setPeriod((value) => shiftPeriod(value, 1))}
          >
            <ChevronRight aria-hidden="true" />
          </button>
          <button type="button" className="admin-button admin-button--quiet" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" />
          </button>
        </div>
      </div>

      {!data?.success ? (
        <AdminBlank
          title="Отчёт пока не собрать"
          text={data?.error || 'Данные появятся, когда накопится статистика за выбранный месяц.'}
        />
      ) : (
        <>
          {data.isCurrentMonth && (
            <div className="admin-notice" role="status">
              <strong>Месяц ещё идёт.</strong> Числа неполные, а сравнение с прошлым месяцем станет честным только после его окончания.
            </div>
          )}

          <div className="report__actions">
            <button
              type="button"
              className="admin-button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(plainText);
                  notify.success('Отчёт скопирован', 'Можно вставить в заметки или сообщение');
                } catch {
                  notify.error('Не удалось скопировать', 'Выделите текст ниже вручную');
                }
              }}
            >
              <ClipboardCopy aria-hidden="true" /> Скопировать текстом
            </button>
            <button type="button" className="admin-button" onClick={() => window.print()}>
              <Printer aria-hidden="true" /> Распечатать или в PDF
            </button>
          </div>

          <div className="adm-tiles">
            {[
              { label: 'Посетители', value: formatNumber(current?.visitors ?? null), note: change(current?.visitors ?? null, previous?.visitors ?? null) },
              { label: 'Заявки', value: formatNumber(current?.leads ?? null), note: change(current?.leads ?? null, previous?.leads ?? null) },
              { label: 'Целевые', value: formatNumber(current?.qualified ?? null), note: change(current?.qualified ?? null, previous?.qualified ?? null) },
              { label: 'Сделки', value: formatNumber(current?.won ?? null), note: change(current?.won ?? null, previous?.won ?? null) },
            ].map((tile) => (
              <div className="adm-tile" key={tile.label}>
                <div className="adm-tile__head"><span className="adm-tile__title">{tile.label}</span></div>
                <div className="adm-tile__value">{tile.value}</div>
                <p className="adm-tile__detail">{tile.note || 'нет данных за прошлый месяц'}</p>
              </div>
            ))}
          </div>

          {(current?.spend !== null || current?.revenue !== null) && (
            <div className="adm-tiles adm-tiles--money">
              <div className="adm-tile">
                <div className="adm-tile__head"><span className="adm-tile__title">Расход</span></div>
                <div className="adm-tile__value">{formatMoney(current?.spend ?? null, currency)}</div>
                <p className="adm-tile__detail">{change(current?.spend ?? null, previous?.spend ?? null)}</p>
              </div>
              <div className="adm-tile">
                <div className="adm-tile__head"><span className="adm-tile__title">Выручка</span></div>
                <div className="adm-tile__value">{formatMoney(current?.revenue ?? null, currency)}</div>
                <p className="adm-tile__detail">{change(current?.revenue ?? null, previous?.revenue ?? null)}</p>
              </div>
              <div className="adm-tile">
                <div className="adm-tile__head"><span className="adm-tile__title">Прибыль</span></div>
                <div className="adm-tile__value">{formatMoney(derived?.profit ?? null, currency)}</div>
                <p className="adm-tile__detail">Выручка минус расход</p>
              </div>
              <div className="adm-tile">
                <div className="adm-tile__head"><span className="adm-tile__title">Цена заявки</span></div>
                <div className="adm-tile__value">{formatMoney(derived?.cpl ?? null, currency)}</div>
                <p className="adm-tile__detail">{derived?.cpq !== null && derived?.cpq !== undefined ? `Целевая — ${formatMoney(derived.cpq, currency)}` : 'Расход на одну заявку'}</p>
              </div>
              <div className="adm-tile">
                <div className="adm-tile__head"><span className="adm-tile__title">Окупаемость</span></div>
                <div className="adm-tile__value">{formatPercent(derived?.romi ?? null)}</div>
                <p className="adm-tile__detail">(выручка − расход) ÷ расход</p>
              </div>
            </div>
          )}

          <div className="report__columns">
            <section className="admin-panel adm-card">
              <header className="adm-card__head"><h3 className="admin-card-title">Откуда пришли заявки</h3></header>
              {data.sources?.length ? (
                <ul className="report__list">
                  {data.sources.map((source) => (
                    <li key={source.source}>
                      <span>{source.source}</span>
                      <strong>{formatNumber(source.leads)}</strong>
                      <em>{source.qualified === null ? '' : `целевых ${source.qualified}`}</em>
                    </li>
                  ))}
                </ul>
              ) : <p className="admin-muted">За месяц заявок с метками не было.</p>}
            </section>

            <section className="admin-panel adm-card">
              <header className="adm-card__head"><h3 className="admin-card-title">Самые посещаемые страницы</h3></header>
              {data.pages?.length ? (
                <ul className="report__list">
                  {data.pages.map((page) => (
                    <li key={page.path}>
                      <span title={page.path}>{page.path === '/' ? 'Главная' : page.path}</span>
                      <strong>{formatNumber(page.views)}</strong>
                      <em />
                    </li>
                  ))}
                </ul>
              ) : <p className="admin-muted">Статистика страниц за месяц пуста.</p>}
            </section>
          </div>

          {data.publishedArticles !== null && data.publishedArticles !== undefined && (
            <p className="admin-meta">Опубликовано материалов за месяц: {formatNumber(data.publishedArticles)}</p>
          )}

          <section className="admin-panel adm-card adm-card--quiet">
            <header className="adm-card__head"><h3 className="admin-card-title"><Info aria-hidden="true" /> Как это считается</h3></header>
            <ul className="adm-limitations">
              {(data.notes || []).map((note) => <li key={note}>{note}</li>)}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
