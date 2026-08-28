import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Target } from 'lucide-react';
import { formatMoney, formatNumber } from './AttributionCharts';
import { plural } from '../../utils/plural';

interface GoalsResponse {
  success?: boolean;
  goal?: { leads_target: number; revenue_target: number; currency: string };
  hasGoal?: boolean;
  fact?: { leads: number; revenue: number | null };
  forecast?: { elapsedDays: number; totalDays: number; isCurrent: boolean; leads: number | null };
}

function Bar({ label, fact, target, format }: {
  label: string;
  fact: number | null;
  target: number;
  format: (value: number | null) => string;
}) {
  const value = fact === null ? 0 : fact;
  const percent = target > 0 ? Math.min(Math.round((value / target) * 100), 100) : 0;
  return (
    <div className="today-goal__row">
      <div className="today-goal__head">
        <span>{label}</span>
        <strong>{format(fact)}<em> из {format(target)}</em></strong>
      </div>
      <div
        className="today-goal__bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={`${label}: выполнено ${percent}%`}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

/**
 * Цель месяца на стартовом экране. Показывается только когда план задан:
 * пустые полосы с нулями не сообщают ничего, кроме того, что ими не пользуются.
 */
export default function TodayGoal({ password, onNavigate }: { password: string; onNavigate: () => void }) {
  const [data, setData] = useState<GoalsResponse | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/goals', {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as GoalsResponse | null;
      setData(response.ok && payload?.success ? payload : null);
    } catch {
      setData(null);
    }
  }, [password]);

  useEffect(() => { void load(); }, [load]);

  if (!data?.hasGoal || !data.goal || !data.fact) return null;

  const { goal, fact, forecast } = data;
  const currency = goal.currency || 'USD';
  const behind = forecast?.isCurrent
    && goal.leads_target > 0
    && forecast.leads !== null
    && forecast.leads < goal.leads_target;

  return (
    <section className="admin-panel adm-card today-goal" aria-label="Цель месяца">
      <header className="adm-card__head adm-card__head--row">
        <div>
          <h3 className="admin-card-title"><Target aria-hidden="true" /> Цель месяца</h3>
          {forecast?.isCurrent && (
            <p className="admin-hint">Прошло {forecast.elapsedDays} из {forecast.totalDays} дней</p>
          )}
        </div>
        <button type="button" className="admin-button admin-button--quiet" onClick={onNavigate}>
          Подробно <ArrowRight aria-hidden="true" />
        </button>
      </header>

      {goal.leads_target > 0 && (
        <Bar label="Заявки" fact={fact.leads} target={goal.leads_target} format={(value) => formatNumber(value)} />
      )}
      {goal.revenue_target > 0 && (
        <Bar label="Выручка" fact={fact.revenue} target={goal.revenue_target} format={(value) => formatMoney(value, currency)} />
      )}

      {behind && (
        <p className="today-goal__warn">
          При текущем темпе {plural(Math.round(forecast?.leads ?? 0), ['выйдет', 'выйдут', 'выйдет'])}{' '}
          {formatNumber(forecast?.leads ?? null)} {plural(Math.round(forecast?.leads ?? 0), ['заявка', 'заявки', 'заявок'])} — плана не хватит.
        </p>
      )}
    </section>
  );
}
