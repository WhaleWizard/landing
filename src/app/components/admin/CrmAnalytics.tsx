import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, CalendarClock, CircleDollarSign, Clock3, Gauge,
  Info, RefreshCw, Target, Timer, TrendingUp, Trophy,
} from 'lucide-react';
import { StatTile, formatMoney, formatNumber, formatPercent } from './AttributionCharts';
import { AdminBlank, AdminSectionSkeleton } from './AdminFeedback';
import { withPlural } from '../../utils/plural';

interface StageRow {
  stage: string;
  count: number;
  value: number;
  otherCurrencyDeals: number;
}

interface AnalyticsResponse {
  success?: boolean;
  error?: string;
  migration?: string;
  checkedAt?: string;
  currency?: string;
  stages?: StageRow[];
  funnel?: Array<{ stage: string; label: string; count: number; stageCr: number | null; totalCr: number | null }>;
  totals?: {
    leads: number; open: number; won: number; lost: number;
    winRate: number | null;
    /** null, когда ни у одной сделки нет суммы в валюте отчёта: «—», а не ноль. */
    openValue: number | null; wonValue: number | null; averageDeal: number | null;
    /** Сколько сделок вошло в сумму и у скольких сумма не заполнена — для подписей плиток. */
    wonPriced?: number; wonWithoutValue?: number; openPriced?: number; openWithoutValue?: number;
  };
  health?: { overdue: number; today: number; withoutNextAction: number; stale: number | null; staleDays: number };
  tasks?: { open: number; overdue: number; completed30d: number };
  cycle?: { averageDays: number | null; deals: number; available: boolean };
  firstResponse?: { averageMinutes: number | null; answered: number; available: boolean };
  quality?: { target: number; nontarget: number; unrated: number } | null;
  /** `value: null` — в месяце ни у одной сделки не указана сумма (DA-07). */
  revenueByMonth?: Array<{ month: string; deals: number; value: number | null; priced?: number; withoutValue?: number }>;
  lossReasons?: Array<{ reason: string; count: number }>;
  /** otherCurrencyDeals приходит, когда сервер считает сделки в другой валюте по источникам. */
  wonBySource?: Array<{ source: string; deals: number; value: number | null; priced?: number; otherCurrencyDeals?: number }>;
  notes?: string[];
}

const STAGE_LABELS: Record<string, string> = {
  new: 'Новые',
  contacted: 'Связались',
  discovery: 'Обсуждение',
  proposal: 'Предложение',
  won: 'Выиграны',
  lost: 'Проиграны',
  archived: 'Архив',
};

/**
 * Подпись плитки с деньгами: по скольким сделкам посчитана сумма и у скольких
 * её нет. Без этого «Выиграно: 5 000 USD» при трёх сделках без суммы читается
 * как итог по всем пяти.
 */
function valueCoverage(priced?: number, withoutValue?: number): string {
  if (priced === undefined || withoutValue === undefined) return '';
  if (!priced && !withoutValue) return '';
  if (!withoutValue) return ` Сумма — по ${withPlural(priced, ['сделке', 'сделкам', 'сделкам'])}.`;
  if (!priced) return ` Сумма не заполнена ни у одной (${withoutValue}).`;
  return ` Сумма — по ${withPlural(priced, ['сделке', 'сделкам', 'сделкам'])}; у ${withoutValue} сумма не заполнена.`;
}

function monthLabel(month: string): string {
  const parsed = new Date(`${month}-01T00:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? month
    : parsed.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

/**
 * Ранжированные полосы: одна шкала, один тон, значение подписано у каждой
 * строки. `display` заменяет подпись значения словами — для строк, у которых
 * числа нет («сумма не указана»): показать там «0 USD» значило бы выдать
 * отсутствие данных за ноль.
 */
function RankedBars({
  items,
  slot,
  emptyText,
  formatValue,
}: {
  items: Array<{ key: string; value: number; note?: string; display?: string }>;
  slot: number;
  emptyText: string;
  formatValue: (value: number) => string;
}) {
  const max = Math.max(1, ...items.map((item) => item.value));
  if (!items.length) return <p className="crm-analytics__empty">{emptyText}</p>;
  return (
    <ul className="crm-ranked" style={{ ['--crm-ranked-color' as string]: `var(--adm-viz-${slot})` }}>
      {items.map((item) => (
        <li key={item.key}>
          <span className="crm-ranked__label" title={item.key}>{item.key}</span>
          <span className="crm-ranked__track">
            <span className="crm-ranked__fill" style={{ width: `${Math.max((item.value / max) * 100, 2)}%` }} />
          </span>
          <span className="crm-ranked__value">
            {item.display ?? formatValue(item.value)}
            {item.note ? <em>{item.note}</em> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

type RevenueMonth = { month: string; deals: number; value: number | null; withoutValue?: number };

/** Сумма месяца словами: неизвестная сумма — не ноль (DA-07). */
function monthMoney(month: RevenueMonth, currency: string): string {
  if (month.value === null) return 'сумма не указана';
  const partial = (month.withoutValue || 0) > 0 ? ` (без суммы: ${month.withoutValue})` : '';
  return `${formatMoney(month.value, currency)}${partial}`;
}

function RevenueColumns({ months, currency }: { months: RevenueMonth[]; currency: string }) {
  // Активный месяц хранится по ключу, а не по номеру столбца (DA-29): после
  // обновления выбранного месяца могло уже не быть, и график падал.
  const [activeMonth, setActiveMonth] = useState<string | null>(null);
  const active = months.find((month) => month.month === activeMonth) ?? null;
  // Максимум данных и масштаб оси — разные вещи (DA-14): подпись не должна
  // показывать технический минимум шкалы «1 USD», когда результат нулевой.
  const known = months.map((month) => month.value).filter((value): value is number => value !== null);
  const dataMax = known.length ? Math.max(...known) : null;
  const scale = Math.max(1, dataMax ?? 0);
  if (!months.length) return <p className="crm-analytics__empty">Выигранных сделок с суммой пока нет.</p>;

  return (
    <figure className="crm-months">
      <figcaption className="crm-months__caption">
        {active === null
          ? (dataMax === null ? 'Суммы выигранных сделок не указаны' : `Максимум за месяц: ${formatMoney(dataMax, currency)}`)
          : `${monthLabel(active.month)} · ${monthMoney(active, currency)} · сделок: ${active.deals}`}
      </figcaption>
      <div className="crm-months__plot">
        {months.map((month) => (
          <button
            type="button"
            key={month.month}
            className={`crm-months__col${activeMonth === month.month ? ' is-active' : ''}`}
            onMouseEnter={() => setActiveMonth(month.month)}
            onMouseLeave={() => setActiveMonth(null)}
            onFocus={() => setActiveMonth(month.month)}
            onBlur={() => setActiveMonth(null)}
            aria-label={`${monthLabel(month.month)}: ${monthMoney(month, currency)}, сделок ${month.deals}`}
          >
            <span className="crm-months__bar" style={{ height: `${Math.max(((month.value ?? 0) / scale) * 100, (month.value ?? 0) > 0 ? 4 : 0)}%` }} />
            <span className="crm-months__label">{monthLabel(month.month)}</span>
          </button>
        ))}
      </div>
      <details className="adm-figure__table">
        <summary>Показать таблицей</summary>
        <div className="adm-table-scroll">
          <table className="adm-mini-table">
            <thead><tr><th scope="col">Месяц</th><th scope="col">Сделок</th><th scope="col">Сумма</th></tr></thead>
            <tbody>
              {months.map((month) => (
                <tr key={month.month}>
                  <th scope="row">{monthLabel(month.month)}</th>
                  <td>{formatNumber(month.deals)}</td>
                  <td>{monthMoney(month, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** Дашборд CRM: состояние пайплайна, деньги и причины потерь. */
export default function CrmAnalytics({ password, refreshToken }: { password: string; refreshToken: number }) {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [migration, setMigration] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Часовой пояс: «на сегодня» здесь должно означать тот же день, что в
      // списке заявок и на стартовом экране.
      const response = await fetch(`/api/admin/crm-analytics?timezone_offset=${new Date().getTimezoneOffset()}`, {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as AnalyticsResponse | null;
      if (!response.ok || !payload?.success) {
        setMigration(payload?.migration || '');
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      setMigration('');
      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось собрать аналитику');
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => { void load(); }, [load, refreshToken]);

  if (loading && !data) return <AdminSectionSkeleton tiles={5} rows={3} />;
  if (error && !data) {
    return (
      <div className="admin-panel admin-stack p-6" role="alert">
        <div className="admin-notice admin-notice--danger"><strong>Аналитика недоступна</strong><br />{error}</div>
        {migration ? <p className="admin-muted">Нужно применить миграцию <code>{migration}</code>.</p> : null}
        <button className="admin-button" type="button" onClick={() => void load()}><RefreshCw aria-hidden="true" /> Повторить</button>
      </div>
    );
  }
  if (!data) return null;

  const currency = data.currency || 'USD';
  const totals = data.totals;
  if (!totals || totals.leads === 0) {
    return (
      <AdminBlank
        title="Сделок пока нет"
        text="Аналитика включится, когда появятся заявки и вы проставите этапы и суммы в карточках. Ничего настраивать не нужно."
      />
    );
  }
  const health = data.health;
  const activeStages = (data.stages || []).filter((stage) => !['archived'].includes(stage.stage));
  // Сколько сделок выпало из денежных сумм из-за другой валюты.
  const otherCurrencyDeals = activeStages.reduce((sum, stage) => sum + Number(stage.otherCurrencyDeals || 0), 0);

  return (
    <div className="admin-stack admin-stack--lg crm-analytics">
      {error ? (
        // Обновление не удалось, а на экране прежние цифры (DA-30): говорим,
        // что они устарели и от какого момента, и даём повторить.
        <div className="admin-notice admin-notice--warning" role="status">
          <strong>Цифры не обновились</strong> — показаны данные{data.checkedAt ? ` от ${new Date(data.checkedAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}` : ' прошлой загрузки'}. {error}{' '}
          <button className="admin-button admin-button--compact" type="button" onClick={() => void load()} disabled={loading}>
            <RefreshCw aria-hidden="true" /> Повторить
          </button>
        </div>
      ) : null}
      <div className="adm-tiles adm-tiles--crm-analytics">
        <StatTile
          icon={<CircleDollarSign aria-hidden="true" />}
          title="В работе"
          value={formatMoney(totals?.openValue ?? null, currency)}
          detail={`${formatNumber(totals?.open ?? null)} открытых сделок в активных этапах.${valueCoverage(totals?.openPriced, totals?.openWithoutValue)}`}
        />
        <StatTile
          icon={<Trophy aria-hidden="true" />}
          title="Выиграно"
          value={formatMoney(totals?.wonValue ?? null, currency)}
          detail={`${formatNumber(totals?.won ?? null)} сделок закрыто в плюс.${valueCoverage(totals?.wonPriced, totals?.wonWithoutValue)}`}
        />
        <StatTile
          icon={<TrendingUp aria-hidden="true" />}
          title="Средний чек"
          value={formatMoney(totals?.averageDeal ?? null, currency)}
          detail="Выигранная сумма, делённая на число выигранных сделок."
        />
        <StatTile
          icon={<Target aria-hidden="true" />}
          title="Доля побед"
          value={formatPercent(totals?.winRate ?? null)}
          detail="Выигранные среди закрытых сделок: открытые исход ещё не определили."
        />
        <StatTile
          icon={<Timer aria-hidden="true" />}
          title="Первый ответ"
          value={data.firstResponse?.averageMinutes === null || data.firstResponse?.averageMinutes === undefined
            ? '—'
            : data.firstResponse.averageMinutes < 60
              ? `${formatNumber(Math.round(data.firstResponse.averageMinutes))} мин`
              : `${formatNumber(Math.round(data.firstResponse.averageMinutes / 6) / 10)} ч`}
          detail={data.firstResponse?.available
            ? `Среднее время до первого касания по ${formatNumber(data.firstResponse.answered)} заявкам.`
            : 'Нужна миграция 0025 — до неё время первого ответа не фиксируется.'}
          tone={data.firstResponse?.available ? 'default' : 'muted'}
        />
        <StatTile
          icon={<Gauge aria-hidden="true" />}
          title="Цикл сделки"
          value={data.cycle?.averageDays === null || data.cycle?.averageDays === undefined
            ? '—'
            : `${formatNumber(data.cycle.averageDays)} дн.`}
          detail={data.cycle?.available
            ? `Среднее время от заявки до победы по ${formatNumber(data.cycle.deals)} сделкам.`
            : 'В схеме нет даты закрытия сделки.'}
          tone={data.cycle?.available ? 'default' : 'muted'}
        />
      </div>

      <section className="admin-panel adm-card">
        <header className="adm-card__head">
          <h3 className="admin-card-title"><AlertTriangle aria-hidden="true" /> Здоровье пайплайна</h3>
          <p className="admin-hint">Что требует внимания прямо сейчас.</p>
        </header>
        <div className="crm-health">
          <div className={Number(health?.overdue || 0) ? 'is-alarm' : ''}>
            <AlertTriangle aria-hidden="true" /><span>Просрочен следующий шаг</span><strong>{formatNumber(health?.overdue ?? null)}</strong>
          </div>
          <div><CalendarClock aria-hidden="true" /><span>Запланировано на сегодня</span><strong>{formatNumber(health?.today ?? null)}</strong></div>
          <div className={Number(health?.withoutNextAction || 0) ? 'is-warn' : ''}>
            <Clock3 aria-hidden="true" /><span>Без следующего шага</span><strong>{formatNumber(health?.withoutNextAction ?? null)}</strong>
          </div>
          <div className={Number(health?.stale || 0) ? 'is-warn' : ''}>
            <Gauge aria-hidden="true" /><span>Без движения дольше {health?.staleDays || 14} дней</span><strong>{formatNumber(health?.stale ?? null)}</strong>
          </div>
          <div><Target aria-hidden="true" /><span>Открытые задачи</span><strong>{formatNumber(data.tasks?.open ?? null)}</strong></div>
          <div className={Number(data.tasks?.overdue || 0) ? 'is-alarm' : ''}>
            <Clock3 aria-hidden="true" /><span>Просроченные задачи</span><strong>{formatNumber(data.tasks?.overdue ?? null)}</strong>
          </div>
        </div>
      </section>

      <div className="crm-analytics__grid">
        <section className="admin-panel adm-card">
          <header className="adm-card__head">
            <h3 className="admin-card-title">Сделки по этапам</h3>
            <p className="admin-hint">Текущее состояние, а не число переходов за период.</p>
            {/*
              Суммы считаются только по сделкам в {currency}: курсов в системе
              нет. Сервер давно присылал число выпавших сделок, но раздел его
              не показывал — сумма молча оказывалась неполной. Сейчас учёт
              ведётся только в долларах, поэтому строка не появится; она нужна
              на случай записи, заведённой в базе руками.
            */}
            {otherCurrencyDeals > 0 ? (
              <p className="admin-hint admin-state--warning">
                {withPlural(otherCurrencyDeals, ['сделка', 'сделки', 'сделок'])} в другой валюте — в суммы ниже
                {otherCurrencyDeals === 1 ? ' она не входит' : ' они не входят'}. Курсов в системе нет, приводить их не к чему.
              </p>
            ) : null}
          </header>
          <RankedBars
            slot={1}
            items={activeStages.map((stage) => ({
              key: STAGE_LABELS[stage.stage] || stage.stage,
              value: stage.count,
              note: stage.value > 0 ? formatMoney(stage.value, currency) : undefined,
            }))}
            emptyText="Сделок пока нет."
            formatValue={(value) => formatNumber(value)}
          />
        </section>

        <section className="admin-panel adm-card">
          <header className="adm-card__head">
            <h3 className="admin-card-title">Выручка по месяцам</h3>
            <p className="admin-hint">Выигранные сделки в {currency}, последние 12 месяцев.</p>
          </header>
          <RevenueColumns months={data.revenueByMonth || []} currency={currency} />
        </section>

        <section className="admin-panel adm-card">
          <header className="adm-card__head">
            <h3 className="admin-card-title">Откуда выигранные сделки</h3>
            <p className="admin-hint">Источник заявки, а если его нет — услуга.</p>
          </header>
          {/*
            Шкала денежная, поэтому число сделок в неё не подставляется: раньше
            источник с тремя сделками без суммы рисовался как «3 USD» рядом с
            настоящими деньгами соседей. Строка без суммы подписывается словами
            и остаётся на минимальной полосе.
          */}
          <RankedBars
            slot={2}
            items={(data.wonBySource || []).map((row) => ({
              key: row.source,
              value: row.value ?? 0,
              note: `${row.deals} сд.`,
              display: row.value !== null
                ? undefined
                : (row.otherCurrencyDeals || 0) > 0 ? 'сумма в другой валюте' : 'сумма не указана',
            }))}
            emptyText="Выигранных сделок пока нет."
            formatValue={(value) => formatMoney(value, currency)}
          />
        </section>

        <section className="admin-panel adm-card">
          <header className="adm-card__head">
            <h3 className="admin-card-title">Причины проигрышей</h3>
            <p className="admin-hint">Заполняется полем «Причина проигрыша» в карточке сделки.</p>
          </header>
          <RankedBars
            slot={4}
            items={(data.lossReasons || []).map((row) => ({ key: row.reason, value: row.count }))}
            emptyText="Причины не заполнены — их стоит записывать, иначе повторные потери не видны."
            formatValue={(value) => `${formatNumber(value)}`}
          />
        </section>
      </div>

      {data.funnel && data.funnel.length > 0 ? (
        <section className="admin-panel adm-card">
          <header className="adm-card__head">
            <h3 className="admin-card-title"><TrendingUp aria-hidden="true" /> Воронка и конверсия этапов (CR)</h3>
            <p className="admin-hint">
              Сквозной путь сделок: процент перехода на следующий шаг и общая конверсия от входа.
            </p>
          </header>
          <div className="crm-funnel-steps">
            {data.funnel.map((step, idx) => (
              <div key={step.stage} className="crm-funnel-step">
                <div className="crm-funnel-step__head">
                  <span className="crm-funnel-step__index">{idx + 1}</span>
                  <strong className="crm-funnel-step__name">{step.label}</strong>
                  <span className="crm-funnel-step__count">{formatNumber(step.count)} сделок</span>
                </div>
                <div className="crm-funnel-step__metrics">
                  {step.stageCr !== null ? (
                    <span className="crm-funnel-step__badge" title="Конверсия из предыдущего шага">
                      Конверсия шага: {formatPercent(step.stageCr)}
                    </span>
                  ) : (
                    <span className="crm-funnel-step__badge crm-funnel-step__badge--start">Начало</span>
                  )}
                  {step.totalCr !== null ? (
                    <span className="crm-funnel-step__badge crm-funnel-step__badge--total" title="Общая конверсия от входа">
                      Сквозная: {formatPercent(step.totalCr)}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="admin-panel adm-card adm-card--quiet">
        <header className="adm-card__head">
          <h3 className="admin-card-title"><Info aria-hidden="true" /> Как это считается</h3>
        </header>
        <ul className="adm-limitations">
          {(data.notes || []).map((note, index) => <li key={index}>{note}</li>)}
        </ul>
      </section>
    </div>
  );
}
