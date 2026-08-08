import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { motion, useReducedMotion } from 'motion/react';
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
 * Динамика по дням. Раньше каждая метрика рисовалась отдельным графиком, а
 * SVG тянулся вместе с шириной колонки — на мониторе три блока по 250 px
 * съедали целый экран, причём пустой ряд занимал столько же места, сколько
 * наполненный. Теперь это один график фиксированной высоты с переключателем
 * метрик: сравнение идёт по одной шкале, лишней прокрутки нет.
 */
export function TrendGroup({ series, points }: { series: TrendSeries[]; points: SeriesPoint[] }) {
  const available = series.filter((item) => points.some((point) => point[item.key] !== null));
  const [metric, setMetric] = useState<TrendSeries['key'] | null>(null);

  if (!points.length || !available.length) {
    return <p className="adm-funnel__empty">Динамика появится, когда в базе накопятся дневные данные.</p>;
  }

  const current = available.find((item) => item.key === metric) || available[0];
  const totals = new Map(available.map((item) => [
    item.key,
    points.reduce((sum, point) => sum + Number(point[item.key] || 0), 0),
  ]));

  return (
    <div className="adm-trend-panel">
      <div className="adm-trend-panel__switch" role="group" aria-label="Метрика графика">
        {available.map((item) => (
          <button
            key={String(item.key)}
            type="button"
            aria-pressed={current.key === item.key}
            className={current.key === item.key ? 'is-active' : ''}
            style={{ ['--adm-trend-color' as string]: `var(--adm-viz-${item.slot})` }}
            onClick={() => setMetric(item.key)}
          >
            <span className="adm-swatch" aria-hidden="true" />
            <span className="adm-trend-panel__name">{item.label}</span>
            <span className="adm-trend-panel__total">{formatNumber(totals.get(item.key) || 0)}</span>
          </button>
        ))}
      </div>

      <TrendChart
        key={String(current.key)}
        label={current.label}
        slot={current.slot}
        points={points}
        metric={current.key}
      />

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

// Поднято с 208: на всю ширину экрана прежняя высота давала почти плоскую
// ленту — перепады дня сжимались до пары пикселей и график переставал что-то
// показывать.
const TREND_HEIGHT = 248;
const TREND_PADDING = 14;

function TrendChart({
  label,
  slot,
  points,
  metric,
}: {
  label: string;
  slot: number;
  points: SeriesPoint[];
  metric: keyof Omit<SeriesPoint, 'day'>;
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const wrapRef = useRef<HTMLElement>(null);
  // viewBox совпадает с фактическим размером в пикселях: график не
  // растягивается по вертикали вслед за шириной и не искажает точки.
  const [width, setWidth] = useState(760);

  useEffect(() => {
    const element = wrapRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0]?.contentRect.width || 0);
      if (next > 0) setWidth(Math.max(280, next));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const height = TREND_HEIGHT;
  const padding = TREND_PADDING;
  const values = points.map((point) => Number(point[metric] || 0));
  const max = Math.max(1, ...values);
  const hasData = values.some((value) => value > 0);
  const { line, area } = useMemo(
    () => buildPath(values, max, width, height, padding),
    [height, max, padding, values.join(','), width],
  );
  const total = values.reduce((sum, value) => sum + value, 0);
  const peakIndex = values.indexOf(Math.max(...values));

  const stepX = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0;
  const pointX = (index: number) => padding + index * stepX;
  const pointY = (index: number) => padding + (height - padding * 2) - (values[index] / max) * (height - padding * 2);

  const handlePointer = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const relative = ((event.clientX - rect.left) / rect.width) * width;
    const index = stepX > 0 ? Math.round((relative - padding) / stepX) : 0;
    setActiveIndex(Math.min(Math.max(index, 0), values.length - 1));
  };

  const handleKey = (event: React.KeyboardEvent<SVGSVGElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const base = activeIndex === null ? values.length - 1 : activeIndex;
    const next = event.key === 'ArrowLeft' ? base - 1 : base + 1;
    setActiveIndex(Math.min(Math.max(next, 0), values.length - 1));
  };

  const active = activeIndex !== null && activeIndex >= 0 && activeIndex < values.length ? activeIndex : null;
  const gradientId = `adm-trend-${String(metric)}`;
  // Подписи только по краям и в середине: четырнадцать дат подряд — это шум.
  const axisLabels = points.length > 2 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : [0];

  return (
    <figure className="adm-trend" style={{ ['--adm-trend-color' as string]: `var(--adm-viz-${slot})` }} ref={wrapRef}>
      <div className="adm-trend__readout" aria-hidden="true">
        <span className="adm-trend__readout-value">
          {active === null ? formatNumber(total) : formatNumber(points[active][metric])}
        </span>
        <span className="adm-trend__readout-note">
          {active === null ? `${label} · всего за период` : `${label} · ${formatDayLabel(points[active].day)}`}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="adm-trend__svg"
        role="img"
        tabIndex={0}
        aria-label={`${label} по дням. Всего за период ${formatNumber(total)}. Стрелками влево и вправо можно пройти по дням.`}
        onPointerMove={handlePointer}
        onPointerLeave={() => setActiveIndex(null)}
        onKeyDown={handleKey}
        onBlur={() => setActiveIndex(null)}
      >
        <defs>
          {/* Три точки, а не две: заливка гаснет быстрее вверху и дольше
              тянется внизу, поэтому под линией читается объём, а не ровный
              треугольник цвета. */}
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--adm-trend-color)" stopOpacity="0.42" />
            <stop offset="55%" stopColor="var(--adm-trend-color)" stopOpacity="0.12" />
            <stop offset="100%" stopColor="var(--adm-trend-color)" stopOpacity="0.01" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((step) => (
          <line
            key={step}
            className="adm-trend__grid"
            x1={padding}
            x2={width - padding}
            y1={padding + (height - padding * 2) * step}
            y2={padding + (height - padding * 2) * step}
          />
        ))}
        <line className="adm-trend__baseline" x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} />
        {hasData && <path d={area} className="adm-trend__area" fill={`url(#${gradientId})`} />}
        {hasData && <path d={line} className="adm-trend__line" pathLength={1} />}
        {!hasData && (
          <line className="adm-trend__flat" x1={padding} x2={width - padding} y1={height - padding} y2={height - padding} />
        )}
        {hasData && peakIndex >= 0 && (
          <circle className="adm-trend__peak" cx={pointX(peakIndex)} cy={pointY(peakIndex)} r={4} />
        )}
        {active !== null && hasData && (
          <g>
            <line className="adm-trend__cursor" x1={pointX(active)} y1={padding} x2={pointX(active)} y2={height - padding} />
            <circle className="adm-trend__dot" cx={pointX(active)} cy={pointY(active)} r={5} />
          </g>
        )}
      </svg>
      <div className="adm-trend__axis" aria-hidden="true">
        {axisLabels.map((index) => (
          <span key={index}>{formatDayLabel(points[index].day)}</span>
        ))}
      </div>
      {!hasData && <p className="adm-trend__empty">За выбранный период по этой метрике данных нет.</p>}
    </figure>
  );
}

/**
 * Мини-график для плитки метрики: форма ряда за период под самим числом.
 *
 * Число отвечает на «сколько», мини-график — на «куда идёт», и вместе они
 * читаются за одно движение глаза. Точных значений здесь нет намеренно: для
 * них есть большой график и таблица под ним. Поэтому у него `aria-hidden` —
 * для чтения с экрана он не несёт ничего сверх соседнего числа.
 *
 * viewBox растягивается по ширине плитки (`preserveAspectRatio="none"`), а
 * толщина линии держится постоянной через `vector-effect` — иначе в широкой
 * плитке линия расплывалась бы в полосу, а в узкой превращалась в нитку.
 */
export function AdminSparkline({
  values,
  slot = 1,
  height = 42,
}: {
  values: Array<number | null>;
  slot?: 1 | 2 | 3 | 4 | 5 | 6;
  height?: number;
}) {
  const reduced = useReducedMotion();
  const id = useId().replace(/:/g, '');
  const clean = values.map((value) => Number(value || 0));

  // Один столбик или пустой ряд рисовать нечем: линия из одной точки — это
  // точка, и она врёт про динамику сильнее, чем её отсутствие.
  if (clean.length < 2 || clean.every((value) => value === 0)) return null;

  const width = 100;
  const top = 3;
  const bottom = height - 3;
  const max = Math.max(...clean);
  const min = Math.min(...clean);
  const span = max - min;
  const stepX = width / (clean.length - 1);
  // Ряд без разброса рисуется прямой по середине. Формула через (value - min)
  // прижала бы её к самому низу, и ровный поток читался бы как ноль.
  const points = clean.map((value, index) => [
    index * stepX,
    span === 0 ? (top + bottom) / 2 : bottom - ((value - min) / span) * (bottom - top),
  ] as const);

  const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' ');
  const area = `${line} L${width} ${height} L0 ${height} Z`;

  return (
    <svg
      className="adm-spark"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      style={{ ['--adm-spark-color' as string]: `var(--adm-viz-${slot})`, height }}
    >
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--adm-spark-color)" stopOpacity="0.38" />
          <stop offset="100%" stopColor="var(--adm-spark-color)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path
        className="adm-spark__area"
        d={area}
        fill={`url(#spark-${id})`}
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.path
        className="adm-spark__line"
        d={line}
        fill="none"
        initial={reduced ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      />
    </svg>
  );
}

export function StatTile({
  icon,
  title,
  value,
  detail,
  delta,
  tone = 'default',
  spark,
  sparkSlot = 1,
}: {
  icon: ReactNode;
  title: string;
  value: ReactNode;
  detail: string;
  delta?: ReactNode;
  tone?: 'default' | 'muted';
  /** Ряд за период: под числом появится его форма. */
  spark?: Array<number | null>;
  sparkSlot?: 1 | 2 | 3 | 4 | 5 | 6;
}) {
  return (
    <div className={`adm-tile${tone === 'muted' ? ' is-muted' : ''}${spark ? ' has-spark' : ''}`}>
      <div className="adm-tile__head">
        <span className="adm-tile__icon" aria-hidden="true">{icon}</span>
        <span className="adm-tile__title">{title}</span>
      </div>
      {/*
        Изменение стоит рядом с числом, а не рядом с подписью. В одной строке
        с подписью оно отъедало половину ширины, и «Уникальные за 7 дней»
        превращалось в «Уникальные з…». К числу оно и относится по смыслу.
      */}
      <div className="adm-tile__figure">
        <div className="adm-tile__value">{value}</div>
        {delta}
      </div>
      <p className="adm-tile__detail">{detail}</p>
      {spark ? <AdminSparkline values={spark} slot={sparkSlot} /> : null}
    </div>
  );
}
