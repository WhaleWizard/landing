import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, CalendarClock, CircleDollarSign, Clock3, Gauge,
  Info, RefreshCw, Target, TrendingUp, Trophy,
} from 'lucide-react';
import { StatTile, formatMoney, formatNumber, formatPercent } from './AttributionCharts';
import { AdminBlank, AdminSectionSkeleton } from './AdminFeedback';

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
  totals?: {
    leads: number; open: number; won: number; lost: number;
    winRate: number | null; openValue: number; wonValue: number; averageDeal: number | null;
  };
  health?: { overdue: number; today: number; withoutNextAction: number; stale: number | null; staleDays: number };
  tasks?: { open: number; overdue: number; completed30d: number };
  cycle?: { averageDays: number | null; deals: number; available: boolean };
  quality?: { target: number; nontarget: number; unrated: number } | null;
  revenueByMonth?: Array<{ month: string; deals: number; value: number }>;
  lossReasons?: Array<{ reason: string; count: number }>;
  wonBySource?: Array<{ source: string; deals: number; value: number }>;
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

function monthLabel(month: string): string {
  const parsed = new Date(`${month}-01T00:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? month
    : parsed.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit', timeZone: 'UTC' });
}

/** Ранжированные полосы: одна шкала, один тон, значение подписано у каждой строки. */
function RankedBars({
  items,
  slot,
  emptyText,
  formatValue,
}: {
  items: Array<{ key: string; value: number; note?: string }>;
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
            {formatValue(item.value)}
            {item.note ? <em>{item.note}</em> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function RevenueColumns({ months, currency }: { months: Array<{ month: string; deals: number; value: number }>; currency: string }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...months.map((month) => month.value));
  if (!months.length) return <p className="crm-analytics__empty">Выигранных сделок с суммой пока нет.</p>;

  return (
    <figure className="crm-months">
      <figcaption className="crm-months__caption">
        {active === null
          ? `Максимум за месяц: ${formatMoney(max, currency)}`
          : `${monthLabel(months[active].month)} · ${formatMoney(months[active].value, currency)} · сделок: ${months[active].deals}`}
      </figcaption>
      <div className="crm-months__plot">
        {months.map((month, index) => (
          <button
            type="button"
            key={month.month}
            className={`crm-months__col${active === index ? ' is-active' : ''}`}
            onMouseEnter={() => setActive(index)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(index)}
            onBlur={() => setActive(null)}
            aria-label={`${monthLabel(month.month)}: ${formatMoney(month.value, currency)}, сделок ${month.deals}`}
          >
            <span className="crm-months__bar" style={{ height: `${Math.max((month.value / max) * 100, month.value > 0 ? 4 : 0)}%` }} />
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
                  <td>{formatMoney(month.value, currency)}</td>
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
      const response = await fetch('/api/admin/crm-analytics', {
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
        icon={<Trophy />}
        title="Сделок пока нет"
        text="Аналитика включится, когда появятся заявки и вы проставите этапы и суммы в карточках. Ничего настраивать не нужно."
      />
    );
  }
  const health = data.health;
  const activeStages = (data.stages || []).filter((stage) => !['archived'].includes(stage.stage));

  return (
    <div className="admin-stack admin-stack--lg crm-analytics">
      <div className="adm-tiles">
        <StatTile
          icon={<CircleDollarSign aria-hidden="true" />}
          title="В работе"
          value={formatMoney(totals?.openValue ?? null, currency)}
          detail={`${formatNumber(totals?.open ?? null)} открытых сделок в активных этапах.`}
        />
        <StatTile
          icon={<Trophy aria-hidden="true" />}
          title="Выиграно"
          value={formatMoney(totals?.wonValue ?? null, currency)}
          detail={`${formatNumber(totals?.won ?? null)} сделок закрыто в плюс.`}
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
          <RankedBars
            slot={2}
            items={(data.wonBySource || []).map((row) => ({
              key: row.source,
              value: row.value > 0 ? row.value : row.deals,
              note: `${row.deals} сд.`,
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

      <section className="admin-panel adm-card adm-card--quiet">
        <header className="adm-card__head">
          <h3 className="admin-card-title"><Info aria-hidden="true" /> Как это считается</h3>
        </header>
        <ul className="adm-limitations">
          {(data.notes || []).map((note) => <li key={note}>{note}</li>)}
        </ul>
      </section>
    </div>
  );
}
