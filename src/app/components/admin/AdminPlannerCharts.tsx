import { type ReactNode } from 'react';
import { WEEKDAY_FULL, WEEKDAY_SHORT, formatDayShort, formatPercent, type PlannerDayStats } from './plannerModel';

/**
 * Кольцевой индикатор (meter): дорожка — светлая ступень того же тона,
 * заливка — акцент, при 100% переключается на «успех».
 */
export function ProgressRing({
  value,
  label,
  size = 'md',
  children,
}: {
  value: number;
  label: string;
  size?: 'sm' | 'md' | 'lg';
  children?: ReactNode;
}) {
  const safe = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const complete = safe >= 1;

  return (
    <div
      className={`planner-ring planner-ring--${size}${complete ? ' planner-ring--complete' : ''}`}
      role="img"
      aria-label={label}
    >
      <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <circle className="planner-ring__track" cx="50" cy="50" r={radius} />
        {safe > 0 && (
          <circle
            className="planner-ring__fill"
            cx="50"
            cy="50"
            r={radius}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - safe)}
            strokeLinecap={complete ? 'butt' : 'round'}
          />
        )}
      </svg>
      <div className="planner-ring__body" aria-hidden="true">{children}</div>
    </div>
  );
}

/** Тонкая полоса прогресса для строки трекера привычек. */
export function ProgressBar({ value, label }: { value: number; label: string }) {
  const safe = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return (
    <span className={`planner-bar${safe >= 1 ? ' planner-bar--complete' : ''}`} role="img" aria-label={label}>
      <span className="planner-bar__fill" style={{ width: `${safe * 100}%` }} />
    </span>
  );
}

function tickValues(max: number): number[] {
  if (max <= 1) return [0, 1];
  if (max <= 4) return Array.from({ length: max + 1 }, (_, index) => index);
  return [0, Math.round(max / 2), max];
}

/**
 * Прогресс недели: на каждый день столбец-«мера» — светлая дорожка «всего задач»
 * и акцентная заливка «выполнено». Одна шкала, один тон, подпись значения только
 * у самого результативного дня; все числа продублированы таблицей ниже.
 */
export function WeekProgressChart({
  days,
  dates,
  bestDayIndex,
  activeIndex,
  todayIndex,
  onSelectDay,
}: {
  days: PlannerDayStats[];
  dates: Date[];
  bestDayIndex: number;
  activeIndex: number;
  todayIndex: number;
  onSelectDay: (index: number) => void;
}) {
  const max = Math.max(1, ...days.map((day) => day.total));
  const ticks = tickValues(max);
  const hasData = days.some((day) => day.total > 0);

  return (
    <figure className="planner-chart">
      <figcaption className="planner-chart__head">
        <div>
          <h3 className="admin-card-title">Прогресс недели</h3>
          <p className="admin-hint">Задачи по дням: сколько запланировано и сколько закрыто.</p>
        </div>
        <ul className="planner-legend">
          <li><span className="planner-legend__swatch planner-legend__swatch--fill" />Выполнено</li>
          <li><span className="planner-legend__swatch planner-legend__swatch--track" />Всего задач</li>
        </ul>
      </figcaption>

      {hasData ? (
        <div className="planner-chart__plot">
          <div className="planner-chart__grid" aria-hidden="true">
            {[...ticks].reverse().map((tick) => (
              <div className="planner-chart__gridline" key={tick}>
                <span className="planner-chart__tick">{tick}</span>
              </div>
            ))}
          </div>
          <div className="planner-chart__cols">
            {days.map((day, index) => {
              const weekday = WEEKDAY_FULL[index];
              const dayLabel = `${weekday}, ${formatDayShort(dates[index])}`;
              return (
                <button
                  type="button"
                  key={dayLabel}
                  className="planner-col"
                  data-active={index === activeIndex || undefined}
                  data-today={index === todayIndex || undefined}
                  onClick={() => onSelectDay(index)}
                  aria-label={`${dayLabel}: выполнено ${day.done} из ${day.total}. Открыть день`}
                >
                  <span className="planner-col__slot">
                    <span className="planner-col__track" style={{ height: `${(day.total / max) * 100}%` }} />
                    <span className="planner-col__fill" style={{ height: `${(day.done / max) * 100}%` }} />
                    {index === bestDayIndex && day.done > 0 && (
                      <span className="planner-col__value" style={{ bottom: `${(day.done / max) * 100}%` }}>
                        {day.done}
                      </span>
                    )}
                  </span>
                  <span className="planner-col__tip" role="presentation">
                    <strong>{dayLabel}</strong>
                    {day.total > 0
                      ? `${day.done} из ${day.total} · ${formatPercent(day.progress)}`
                      : 'задач нет'}
                  </span>
                  <span className="planner-col__label">{WEEKDAY_SHORT[index]}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <p className="planner-chart__empty">
          Добавьте задачи в дни недели — график заполнится сам.
        </p>
      )}

      <details className="planner-table-view">
        <summary>Показать таблицей</summary>
        <div className="planner-table-scroll">
          <table className="planner-table">
            <thead>
              <tr>
                <th scope="col">День</th>
                <th scope="col">Всего</th>
                <th scope="col">Выполнено</th>
                <th scope="col">Осталось</th>
                <th scope="col">Прогресс</th>
              </tr>
            </thead>
            <tbody>
              {days.map((day, index) => (
                <tr key={WEEKDAY_FULL[index]}>
                  <th scope="row">{WEEKDAY_SHORT[index]}, {formatDayShort(dates[index])}</th>
                  <td>{day.total}</td>
                  <td>{day.done}</td>
                  <td>{day.undone}</td>
                  <td>{day.total ? formatPercent(day.progress) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
