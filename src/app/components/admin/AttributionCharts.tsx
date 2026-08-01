import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useReducedMotion } from 'motion/react';
import { ArrowDownRight, ArrowUpRight, Minus, TriangleAlert } from 'lucide-react';

export function formatNumber(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? '—'
    : value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? '—'
    : `${value.toLocaleString('ru-RU', { maximumFractionDigits: digits })}%`;
}

export function formatMoney(value: number | null | undefined, currency: string | null): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const amount = value.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
  return currency ? `${amount} ${currency}` : amount;
}

export function formatDayLabel(day: string): string {
  const parsed = new Date(`${day}T00:00:00Z`);
  return Number.isNaN(parsed.getTime())
    ? day
    : parsed.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}

/**
 * Числа «докручиваются» до значения — так глаз замечает, что показатель
 * обновился. При выключенных анимациях значение появляется сразу.
 */
function useCountUp(value: number | null, enabled: boolean): number | null {
  const [displayed, setDisplayed] = useState<number | null>(value);
  const frameRef = useRef(0);

  useEffect(() => {
    if (value === null) { setDisplayed(null); return undefined; }
    if (!enabled) { setDisplayed(value); return undefined; }

    const from = 0;
    const duration = 620;
    const started = performance.now();
    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / duration);
      const eased = 1 - (1 - progress) ** 3;
      setDisplayed(from + (value - from) * eased);
      if (progress < 1) frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [enabled, value]);

  return displayed;
}

export function CountUpValue({ value, format }: { value: number | null; format?: (value: number | null) => string }) {
  const reduced = useReducedMotion();
  const animated = useCountUp(value, !reduced);
  const shown = animated === null ? null : Math.round(animated);
  return <>{(format || formatNumber)(value === null ? null : shown)}</>;
}

export function DeltaBadge({
  current,
  previous,
  invert = false,
  label,
}: {
  current: number | null | undefined;
  previous: number | null | undefined;
  /** Для расходов и цены лида рост — это плохо. */
  invert?: boolean;
  label: string;
}) {
  if (current === null || current === undefined || previous === null || previous === undefined) return null;
  if (previous === 0 && current === 0) return null;

  const delta = previous === 0 ? null : ((current - previous) / previous) * 100;
  const direction = current === previous ? 'flat' : current > previous ? 'up' : 'down';
  const good = direction === 'flat' ? 'flat' : (direction === 'up') !== invert ? 'good' : 'bad';
  const Icon = direction === 'flat' ? Minus : direction === 'up' ? ArrowUpRight : ArrowDownRight;
  const text = delta === null
    ? `с 0 до ${formatNumber(current)}`
    : `${delta > 0 ? '+' : ''}${delta.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`;

  return (
    <span className={`adm-delta is-${good}`} title={`${label}: было ${formatNumber(previous)}, стало ${formatNumber(current)}`}>
      <Icon aria-hidden="true" />
      {text}
    </span>
  );
}

export interface FunnelStep {
  key: string;
  label: string;
  value: number | null;
  hint: string;
  /** Подпись перехода с предыдущей ступени, если её нельзя вычислить процентом. */
  transitionNote?: string;
}

/**
 * Воронка: ступени сужаются пропорционально значению, между ними подписан
 * процент перехода. Самый слабый переход помечается — это и есть место,
 * где теряются деньги. Все числа продублированы таблицей.
 */
export function FunnelChart({ steps }: { steps: FunnelStep[] }) {
  const usable = steps.filter((step) => step.value !== null);
  const top = usable.length ? Math.max(...usable.map((step) => step.value || 0)) : 0;

  const transitions = steps.map((step, index) => {
    if (index === 0) return null;
    const previous = steps[index - 1];
    if (previous.value === null || step.value === null || previous.value <= 0) return null;
    return Math.round((step.value / previous.value) * 1000) / 10;
  });
  const measurable = transitions.filter((value): value is number => value !== null);
  const worst = measurable.length > 1 ? Math.min(...measurable) : null;

  if (!usable.length || top <= 0) {
    return <p className="adm-funnel__empty">За выбранный период данных для воронки нет.</p>;
  }

  return (
    <figure className="adm-funnel">
      <ol className="adm-funnel__steps">
        {steps.map((step, index) => {
          const share = step.value === null ? 0 : Math.max(step.value / top, 0);
          // Между посетителями и сделками разница в сотни раз: при прямой
          // пропорции три нижние ступени слиплись бы в одинаковые огрызки.
          // Корень доли сохраняет порядок и разницу; точные числа — рядом.
          const width = step.value === null ? 0 : Math.max(Math.sqrt(share) * 100, share > 0 ? 5 : 0);
          const transition = transitions[index];
          const isWorst = worst !== null && transition !== null && transition === worst;

          return (
            <li key={step.key} className="adm-funnel__step">
              {index > 0 && (
                <div className={`adm-funnel__link${isWorst ? ' is-bottleneck' : ''}`}>
                  <span className="adm-funnel__link-line" aria-hidden="true" />
                  <span className="adm-funnel__link-label">
                    {isWorst && <TriangleAlert aria-hidden="true" />}
                    {transition === null
                      ? step.transitionNote || 'переход не считается'
                      : `${formatPercent(transition)} переходят дальше`}
                  </span>
                </div>
              )}
              <div className="adm-funnel__row">
                <div className="adm-funnel__meta">
                  <span className="adm-funnel__label">{step.label}</span>
                  <span className={`adm-funnel__value${step.value === null ? ' is-empty' : ''}`}>
                    <CountUpValue value={step.value} />
                  </span>
                </div>
                <div className="adm-funnel__track">
                  {/* Ширина — обычный стиль, а рост — CSS-анимация поверх него:
                      полоса остаётся правильной, даже если анимации отключены. */}
                  <div
                    className="adm-funnel__bar"
                    style={{ width: `${width}%`, ['--adm-funnel-depth' as string]: String(index) }}
                  />
                </div>
                <p className="adm-funnel__hint">{step.hint}</p>
              </div>
            </li>
          );
        })}
      </ol>

      <p className="adm-funnel__scale-note">
        Длина полосы — корень доли от первой ступени, иначе нижние ступени были бы неразличимы. Сравнивать нужно по числам и процентам перехода.
      </p>

      <details className="adm-figure__table">
        <summary>Показать таблицей</summary>
        <div className="adm-table-scroll">
          <table className="adm-mini-table">
            <thead>
              <tr><th scope="col">Ступень</th><th scope="col">Значение</th><th scope="col">Переход</th></tr>
            </thead>
            <tbody>
              {steps.map((step, index) => (
                <tr key={step.key}>
                  <th scope="row">{step.label}</th>
                  <td>{formatNumber(step.value)}</td>
                  <td>{transitions[index] === null ? '—' : formatPercent(transitions[index])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

export interface SeriesPoint {
  day: string;
  views: number | null;
  visitors: number | null;
  leads: number | null;
  qualified: number | null;
}

interface TrendSeries {
  key: keyof Omit<SeriesPoint, 'day'>;
  label: string;
  /** Номер слота палитры: цвет закреплён за метрикой и не переезжает. */
  slot: 1 | 2 | 3 | 4 | 5 | 6;
}

function buildPath(values: number[], max: number, width: number, height: number, padding: number): { line: string; area: string } {
  if (values.length === 0) return { line: '', area: '' };
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;
  const stepX = values.length > 1 ? innerWidth / (values.length - 1) : 0;
  const pointAt = (value: number, index: number) => {
    const x = padding + index * stepX;
    const y = padding + innerHeight - (max > 0 ? (value / max) * innerHeight : 0);
    return [x, y] as const;
  };
  const points = values.map(pointAt);
  const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  const first = points[0];
  const last = points[points.length - 1];
  const area = `${line} L${last[0].toFixed(2)} ${(height - padding).toFixed(2)} L${first[0].toFixed(2)} ${(height - padding).toFixed(2)} Z`;
  return { line, area };
}

/**
 * Динамика по дням. Каждая метрика — отдельный график с общей осью дат
 * (никаких двух шкал на одном поле), курсор синхронизирован между ними.
 */
export function TrendGroup({ series, points }: { series: TrendSeries[]; points: SeriesPoint[] }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const available = series.filter((item) => points.some((point) => point[item.key] !== null));

  if (!points.length || !available.length) {
    return <p className="adm-funnel__empty">Динамика появится, когда в базе накопятся дневные данные.</p>;
  }

  return (
    <div className="adm-trend-group">
      {available.map((item) => (
        <TrendChart
          key={String(item.key)}
          label={item.label}
          slot={item.slot}
          points={points}
          metric={item.key}
          activeIndex={activeIndex}
          onActiveIndexChange={setActiveIndex}
        />
      ))}
      <details className="adm-figure__table">
        <summary>Показать таблицей</summary>
        <div className="adm-table-scroll">
          <table className="adm-mini-table">
            <thead>
              <tr>
                <th scope="col">День</th>
                {available.map((item) => <th scope="col" key={String(item.key)}>{item.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.day}>
                  <th scope="row">{formatDayLabel(point.day)}</th>
                  {available.map((item) => <td key={String(item.key)}>{formatNumber(point[item.key])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function TrendChart({
  label,
  slot,
  points,
  metric,
  activeIndex,
  onActiveIndexChange,
}: {
  label: string;
  slot: number;
  points: SeriesPoint[];
  metric: keyof Omit<SeriesPoint, 'day'>;
  activeIndex: number | null;
  onActiveIndexChange: (index: number | null) => void;
}) {
  const width = 640;
  const height = 132;
  const padding = 10;
  const values = points.map((point) => Number(point[metric] || 0));
  const max = Math.max(1, ...values);
  const { line, area } = useMemo(() => buildPath(values, max, width, height, padding), [max, values.join(',')]);
  const total = values.reduce((sum, value) => sum + value, 0);
  const peakIndex = values.indexOf(Math.max(...values));

  const stepX = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0;
  const pointX = (index: number) => padding + index * stepX;
  const pointY = (index: number) => padding + (height - padding * 2) - (values[index] / max) * (height - padding * 2);

  const handlePointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relative = ((event.clientX - rect.left) / rect.width) * width;
    const index = stepX > 0
      ? Math.round((relative - padding) / stepX)
      : 0;
    onActiveIndexChange(Math.min(Math.max(index, 0), values.length - 1));
  };

  const handleKey = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const base = activeIndex === null ? values.length - 1 : activeIndex;
    const next = event.key === 'ArrowLeft' ? base - 1 : base + 1;
    onActiveIndexChange(Math.min(Math.max(next, 0), values.length - 1));
  };

  const active = activeIndex !== null && activeIndex >= 0 && activeIndex < values.length ? activeIndex : null;

  return (
    <figure className="adm-trend" style={{ ['--adm-trend-color' as string]: `var(--adm-viz-${slot})` }}>
      <figcaption className="adm-trend__head">
        <span className="adm-trend__label"><span className="adm-swatch" aria-hidden="true" />{label}</span>
        <span className="adm-trend__total">
          {active === null
            ? `всего ${formatNumber(total)}`
            : `${formatDayLabel(points[active].day)} · ${formatNumber(points[active][metric])}`}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="adm-trend__svg"
        role="img"
        tabIndex={0}
        aria-label={`${label} по дням. Всего за период ${formatNumber(total)}. Стрелками влево и вправо можно пройти по дням.`}
        onPointerMove={handlePointer}
        onPointerLeave={() => onActiveIndexChange(null)}
        onKeyDown={handleKey}
        onBlur={() => onActiveIndexChange(null)}
      >
        <defs>
          <linearGradient id={`adm-trend-${metric}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--adm-trend-color)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--adm-trend-color)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line className="adm-trend__baseline" x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} vectorEffect="non-scaling-stroke" />
        <path d={area} className="adm-trend__area" fill={`url(#adm-trend-${metric})`} />
        {/* pathLength="1" нормирует длину линии, поэтому «прорисовку» делает
            обычная CSS-анимация штриха — без пересчёта в JavaScript. */}
        <path d={line} className="adm-trend__line" pathLength={1} vectorEffect="non-scaling-stroke" />
        {values.length > 0 && max > 0 && peakIndex >= 0 && (
          <circle className="adm-trend__peak" cx={pointX(peakIndex)} cy={pointY(peakIndex)} r={4} vectorEffect="non-scaling-stroke" />
        )}
        {active !== null && (
          <g>
            <line className="adm-trend__cursor" x1={pointX(active)} y1={padding} x2={pointX(active)} y2={height - padding} vectorEffect="non-scaling-stroke" />
            <circle className="adm-trend__dot" cx={pointX(active)} cy={pointY(active)} r={5} vectorEffect="non-scaling-stroke" />
          </g>
        )}
      </svg>
    </figure>
  );
}

export function StatTile({
  icon,
  title,
  value,
  detail,
  delta,
  tone = 'default',
}: {
  icon: ReactNode;
  title: string;
  value: ReactNode;
  detail: string;
  delta?: ReactNode;
  tone?: 'default' | 'muted';
}) {
  return (
    <div className={`adm-tile${tone === 'muted' ? ' is-muted' : ''}`}>
      <div className="adm-tile__head">
        <span className="adm-tile__icon" aria-hidden="true">{icon}</span>
        <span className="adm-tile__title">{title}</span>
        {delta}
      </div>
      <div className="adm-tile__value">{value}</div>
      <p className="adm-tile__detail">{detail}</p>
    </div>
  );
}
