import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Coins, Info, RefreshCw, Save,
  Target, TrendingUp, Trophy, UserCheck, Wallet,
} from 'lucide-react';
import { AdminBlank, AdminSectionSkeleton, notify } from './AdminFeedback';
import { AdminDecimalInput } from './AdminUI';
import { formatMoney, formatNumber, formatPercent } from './AttributionCharts';

interface Goal {
  period: string;
  leads_target: number;
  qualified_target: number;
  revenue_target: number;
  spend_cap: number;
  currency: string;
  note: string;
}

interface PeriodFact {
  leads: number;
  qualified: number;
  won: number;
  revenue: number | null;
  spend: number | null;
}

interface GoalsResponse {
  success?: boolean;
  error?: string;
  migration?: string;
  code?: string;
  today?: string;
  period?: string;
  goal?: Goal;
  hasGoal?: boolean;
  fact?: PeriodFact;
  forecast?: {
    elapsedDays: number; totalDays: number; isCurrent: boolean;
    leads: number | null; qualified: number | null; revenue: number | null; spend: number | null;
  };
  history?: Array<{ period: string; goal: Goal | null; fact: PeriodFact }>;
  notes?: string[];
}

function periodLabel(period: string): string {
  const parsed = new Date(`${period}-01T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return period;
  const text = parsed.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function shortPeriod(period: string): string {
  const parsed = new Date(`${period}-01T00:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? period
    : parsed.toLocaleDateString('ru-RU', { month: 'short', year: '2-digit', timeZone: 'UTC' });
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

/**
 * Кольцо план/факт. Заливка идёт по доле выполнения, а перевыполнение
 * не «переливается» через край: кольцо остаётся полным, а точное значение
 * подписано числом.
 */
function GoalRing({
  label,
  fact,
  target,
  forecastValue,
  format,
  tone,
  invert = false,
}: {
  label: string;
  fact: number | null;
  target: number;
  forecastValue: number | null;
  format: (value: number | null) => string;
  tone: 1 | 2 | 3 | 4 | 5 | 6;
  /** Для расхода «больше» — плохо: кольцо краснеет при приближении к потолку. */
  invert?: boolean;
}) {
  const hasTarget = target > 0;
  const value = fact === null ? 0 : fact;
  const ratio = hasTarget ? value / target : 0;
  const percent = hasTarget ? Math.min(Math.round(ratio * 100), 100) : 0;
  const forecastRatio = hasTarget && forecastValue !== null ? forecastValue / target : null;

  const state = !hasTarget
    ? 'is-empty'
    : invert
      ? (ratio > 1 ? 'is-bad' : ratio > 0.85 ? 'is-warn' : 'is-good')
      : (ratio >= 1 ? 'is-good' : forecastRatio !== null && forecastRatio < 0.85 ? 'is-warn' : 'is-neutral');

  return (
    <div className={`goal-ring ${state}`} style={{ ['--goal-color' as string]: `var(--adm-viz-${tone})` }}>
      <div
        className="goal-ring__dial"
        style={{ ['--goal-ring-value' as string]: String(percent) }}
        role="img"
        aria-label={hasTarget
          ? `${label}: ${format(fact)} из ${format(target)}, выполнено ${percent}%`
          : `${label}: цель не задана, факт ${format(fact)}`}
      >
        <span className="goal-ring__percent">{hasTarget ? `${percent}%` : '—'}</span>
      </div>
      <div className="goal-ring__body">
        <span className="goal-ring__label">{label}</span>
        <span className="goal-ring__value">{format(fact)}</span>
        <span className="goal-ring__target">
          {hasTarget ? `из ${format(target)}` : 'цель не задана'}
        </span>
        {forecastValue !== null && hasTarget && (
          <span className="goal-ring__forecast">
            прогноз к концу месяца: {format(forecastValue)}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Конфетти в момент, когда план по заявкам закрыт.
 *
 * Правила, из-за которых это не превращается в раздражитель:
 * — только текущий месяц: листая прошлые, салюта не будет;
 * — один раз на месяц, факт записан в localStorage;
 * — при системной настройке «меньше движения» не срабатывает совсем.
 * Библиотека грузится по требованию — ради салюта раз в месяц её не стоит
 * держать в основном куске админки.
 */
function useGoalCelebration(
  period: string,
  goal: Goal | undefined,
  fact: PeriodFact | undefined,
) {
  useEffect(() => {
    if (!goal || !fact) return;
    if (period !== currentPeriod()) return;
    if (goal.leads_target <= 0 || fact.leads < goal.leads_target) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    const key = `ww-admin-goal-party-${period}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, '1');
    } catch {
      // Приватный режим: без памяти о салюте лучше не показывать его вовсе,
      // чем запускать при каждом открытии раздела.
      return;
    }

    let cancelled = false;
    void import('canvas-confetti').then(({ default: confetti }) => {
      if (cancelled) return;
      const common = { spread: 74, startVelocity: 42, ticks: 160, scalar: 0.9, disableForReducedMotion: true };
      const colors = ['#a78bfa', '#8b5cf6', '#60a5fa', '#3b82f6', '#c4b5fd'];
      confetti({ ...common, particleCount: 70, origin: { x: 0.2, y: 0.35 }, angle: 62, colors });
      confetti({ ...common, particleCount: 70, origin: { x: 0.8, y: 0.35 }, angle: 118, colors });
    }).catch(() => {
      // Салют — украшение. Если чанк не догрузился, раздел работает как был.
    });

    return () => { cancelled = true; };
  }, [fact, goal, period]);
}

/** Раздел «Цели»: план на месяц, факт, прогноз и траектория по месяцам. */
export default function AdminGoals({ password }: { password: string }) {
  const [period, setPeriod] = useState(currentPeriod);
  const [data, setData] = useState<GoalsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const requestSequence = useRef(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [migration, setMigration] = useState('');
  const [draft, setDraft] = useState<Goal | null>(null);

  const load = useCallback(async () => {
    // Номер запроса. Месяцы листаются стрелками быстрее, чем отвечает сервер,
    // и ответ по предыдущему месяцу мог прийти последним — на экране
    // оказывались цели одного месяца под заголовком другого.
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/goals?period=${period}`, {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as GoalsResponse | null;
      if (requestId !== requestSequence.current) return;
      if (!response.ok || !payload?.success) {
        setMigration(payload?.migration || '');
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      setMigration('');
      setData(payload);
      setDraft(payload.goal || null);
    } catch (loadError) {
      if (requestId !== requestSequence.current) return;
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить цели');
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [password, period]);

  useEffect(() => { void load(); }, [load]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft) return;
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/admin/goals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
        credentials: 'same-origin',
        body: JSON.stringify({ ...draft, period }),
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; error?: string; migration?: string } | null;
      if (!response.ok || !payload?.success) {
        setMigration(payload?.migration || '');
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      notify.success('Цель сохранена', periodLabel(period));
      await load();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : 'Не удалось сохранить цель';
      setError(message);
      notify.error('Цель не сохранилась', message);
    } finally {
      setSaving(false);
    }
  };

  const goal = data?.goal;
  const fact = data?.fact;
  const currency = goal?.currency || 'USD';
  const money = useCallback((value: number | null) => formatMoney(value, currency), [currency]);

  const history = useMemo(() => (data?.history || []).filter((item) => (
    item.goal || item.fact.leads > 0 || (item.fact.spend || 0) > 0
  )), [data]);

  useGoalCelebration(period, goal, fact);

  const profit = fact && fact.revenue !== null && fact.spend !== null ? fact.revenue - fact.spend : null;
  const romi = fact && fact.revenue !== null && fact.spend !== null && fact.spend > 0
    ? ((fact.revenue - fact.spend) / fact.spend) * 100
    : null;
  const cpl = fact && fact.spend !== null && fact.leads > 0 ? fact.spend / fact.leads : null;

  if (loading && !data) return <AdminSectionSkeleton tiles={4} rows={3} />;

  return (
    <div className="admin-stack admin-stack--lg goals">
      <div className="admin-section-header">
        <div>
          <p className="admin-eyebrow">Планирование</p>
          <h2 className="admin-title"><Target aria-hidden="true" /> Цели и деньги</h2>
          <p className="admin-subtitle">
            План на месяц и то, как идут дела на самом деле. Прогноз строится по текущему темпу, деньги — по введённым расходам и суммам выигранных сделок.
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

      {migration ? (
        <div className="admin-notice admin-notice--warning" role="status">
          Примените миграцию <code>{migration}</code> к production D1 — до неё цели негде хранить.
        </div>
      ) : null}
      {error && !migration ? <div className="admin-notice admin-notice--danger" role="alert">{error}</div> : null}

      {data?.success && fact && (
        <>
          {!data.hasGoal && (
            <AdminBlank
              inline
              title={`На ${periodLabel(period).toLowerCase()} цель ещё не задана`}
              text="Заполните план ниже — появятся кольца выполнения, прогноз к концу месяца и предупреждение, если темпа не хватает."
            />
          )}

          <div className="goals__rings">
            <GoalRing
              label="Заявки"
              fact={fact.leads}
              target={goal?.leads_target || 0}
              forecastValue={data.forecast?.leads ?? null}
              format={(value) => formatNumber(value)}
              tone={1}
            />
            <GoalRing
              label="Целевые заявки"
              fact={fact.qualified}
              target={goal?.qualified_target || 0}
              forecastValue={data.forecast?.qualified ?? null}
              format={(value) => formatNumber(value)}
              tone={2}
            />
            <GoalRing
              label="Выручка"
              fact={fact.revenue}
              target={goal?.revenue_target || 0}
              forecastValue={data.forecast?.revenue ?? null}
              format={money}
              tone={6}
            />
            <GoalRing
              label="Расход"
              fact={fact.spend}
              target={goal?.spend_cap || 0}
              forecastValue={data.forecast?.spend ?? null}
              format={money}
              tone={3}
              invert
            />
          </div>

          {data.forecast?.isCurrent && (
            <p className="goals__pace">
              Прошло {data.forecast.elapsedDays} из {data.forecast.totalDays} дней месяца.
              {goal && goal.leads_target > 0 && data.forecast.leads !== null && (
                data.forecast.leads >= goal.leads_target
                  ? ' При текущем темпе план по заявкам будет выполнен.'
                  : ` При текущем темпе выйдет ${formatNumber(data.forecast.leads)} заявок из ${formatNumber(goal.leads_target)} — темпа не хватает.`
              )}
            </p>
          )}

          <div className="goals__money">
            <div className="goals__money-item">
              <span><Wallet aria-hidden="true" /> Расход</span>
              <strong>{money(fact.spend)}</strong>
            </div>
            <div className="goals__money-item">
              <span><TrendingUp aria-hidden="true" /> Выручка</span>
              <strong>{money(fact.revenue)}</strong>
            </div>
            <div className={`goals__money-item ${profit !== null && profit < 0 ? 'is-bad' : profit !== null ? 'is-good' : ''}`}>
              <span><Coins aria-hidden="true" /> Прибыль</span>
              <strong>{money(profit)}</strong>
            </div>
            <div className={`goals__money-item ${romi !== null && romi < 0 ? 'is-bad' : romi !== null ? 'is-good' : ''}`}>
              <span><Trophy aria-hidden="true" /> ROMI</span>
              <strong>{formatPercent(romi)}</strong>
            </div>
            <div className="goals__money-item">
              <span><UserCheck aria-hidden="true" /> Цена лида</span>
              <strong>{money(cpl)}</strong>
            </div>
          </div>

          <section className="admin-panel adm-card">
            <header className="adm-card__head">
              <h3 className="admin-card-title">План на {periodLabel(period).toLowerCase()}</h3>
              <p className="admin-hint">Ставьте достижимые числа: кольца и прогноз считаются именно от них.</p>
            </header>
            <form className="goals__form" onSubmit={save}>
              <label className="admin-field">
                <span className="admin-label">Заявки</span>
                <input
                  type="text" inputMode="numeric" value={draft?.leads_target ?? 0}
                  onChange={(event) => setDraft((current) => current && { ...current, leads_target: Number(event.target.value.replace(/\D/g, '')) || 0 })}
                />
              </label>
              <label className="admin-field">
                <span className="admin-label">Целевые заявки</span>
                <input
                  type="text" inputMode="numeric" value={draft?.qualified_target ?? 0}
                  onChange={(event) => setDraft((current) => current && { ...current, qualified_target: Number(event.target.value.replace(/\D/g, '')) || 0 })}
                />
              </label>
              {/*
                Денежные поля — через AdminDecimalInput. Прежний разбор вырезал
                всё, кроме цифр и точки, поэтому запятая просто исчезала:
                «1 500,50» превращалось в 150050 — ошибка в сто раз ровно в том
                числе, от которого считаются кольца и прогноз всего раздела.
              */}
              <label className="admin-field">
                <span className="admin-label">Выручка</span>
                <AdminDecimalInput
                  inputMode="decimal"
                  value={draft?.revenue_target ?? 0}
                  onValueChange={(value) => setDraft((current) => current && { ...current, revenue_target: value ?? 0 })}
                />
              </label>
              <label className="admin-field">
                <span className="admin-label">Потолок расхода</span>
                <AdminDecimalInput
                  inputMode="decimal"
                  value={draft?.spend_cap ?? 0}
                  onValueChange={(value) => setDraft((current) => current && { ...current, spend_cap: value ?? 0 })}
                />
              </label>
              <label className="admin-field">
                <span className="admin-label">Валюта</span>
                <input
                  type="text" maxLength={3} value={draft?.currency ?? 'USD'}
                  onChange={(event) => setDraft((current) => current && { ...current, currency: event.target.value.toUpperCase().slice(0, 3) })}
                />
              </label>
              <div className="goals__form-actions">
                <button type="submit" className="admin-button admin-button--primary" disabled={saving}>
                  <Save aria-hidden="true" /> {saving ? 'Сохраняю…' : 'Сохранить цель'}
                </button>
              </div>
            </form>
          </section>

          {history.length > 0 && (
            <section className="admin-panel adm-card">
              <header className="adm-card__head">
                <h3 className="admin-card-title">Как шли месяцы</h3>
                <p className="admin-hint">План и факт рядом: видно траекторию, а не один месяц.</p>
              </header>
              <div className="adm-table-scroll">
                <table className="adm-data-table goals__table">
                  <thead>
                    <tr>
                      <th scope="col">Месяц</th>
                      <th scope="col" className="is-numeric">Заявки</th>
                      <th scope="col" className="is-numeric">План</th>
                      <th scope="col" className="is-numeric">Целевые</th>
                      <th scope="col" className="is-numeric">Выручка</th>
                      <th scope="col" className="is-numeric">Расход</th>
                      <th scope="col" className="is-numeric">Выполнение</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((item) => {
                      const target = item.goal?.leads_target || 0;
                      const done = target > 0 ? Math.round((item.fact.leads / target) * 100) : null;
                      return (
                        <tr key={item.period} className={item.period === period ? 'is-current' : ''}>
                          <td className="is-key">{shortPeriod(item.period)}</td>
                          <td className="is-numeric">{formatNumber(item.fact.leads)}</td>
                          <td className="is-numeric">{target > 0 ? formatNumber(target) : '—'}</td>
                          <td className="is-numeric">{formatNumber(item.fact.qualified)}</td>
                          <td className="is-numeric">{formatMoney(item.fact.revenue, item.goal?.currency || currency)}</td>
                          <td className="is-numeric">{formatMoney(item.fact.spend, item.goal?.currency || currency)}</td>
                          <td className={`is-numeric ${done === null ? '' : done >= 100 ? 'is-good' : done < 70 ? 'is-bad' : ''}`}>
                            {done === null ? '—' : `${done}%`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="admin-panel adm-card adm-card--quiet">
            <header className="adm-card__head">
              <h3 className="admin-card-title"><Info aria-hidden="true" /> Как это считается</h3>
            </header>
            <ul className="adm-limitations">
              {(data.notes || []).map((note, index) => <li key={index}>{note}</li>)}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
