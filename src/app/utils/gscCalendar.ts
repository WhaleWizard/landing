/**
 * Календарная шкала графика Search Console (DA-121).
 *
 * Google не присылает строки за дни без показов и за последние 2–3 дня, пока
 * данные не готовы. Раньше точка ставилась по номеру строки, и один день и
 * пятидневный провал занимали одинаковую ширину. Теперь у каждого дня периода
 * своё место, а день без строки — явный пропуск.
 */
export interface CalendarDay<T> {
  date: string;
  point: T | null;
}

const DAY_MS = 86_400_000;

function dayNumber(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const time = Date.parse(`${date}T00:00:00Z`);
  return Number.isFinite(time) ? Math.round(time / DAY_MS) : null;
}

function dateOf(day: number): string {
  return new Date(day * DAY_MS).toISOString().slice(0, 10);
}

/** Все дни от первого до последнего, с точкой или пропуском. Не больше 400 дней. */
export function gscCalendarDays<T extends { date: string }>(points: T[]): Array<CalendarDay<T>> {
  const byDay = new Map<number, T>();
  for (const point of points) {
    const day = dayNumber(point.date);
    if (day !== null) byDay.set(day, point);
  }
  if (!byDay.size) return [];
  const days = [...byDay.keys()];
  const first = Math.min(...days);
  const last = Math.min(Math.max(...days), first + 400);
  const result: Array<CalendarDay<T>> = [];
  for (let day = first; day <= last; day += 1) {
    result.push({ date: dateOf(day), point: byDay.get(day) ?? null });
  }
  return result;
}

/** Непрерывные отрезки дней с данными: линия графика рвётся на пропусках. */
export function gscSegments<T>(days: Array<CalendarDay<T>>): Array<Array<{ index: number; point: T }>> {
  const segments: Array<Array<{ index: number; point: T }>> = [];
  let current: Array<{ index: number; point: T }> = [];
  days.forEach((day, index) => {
    if (day.point) {
      current.push({ index, point: day.point });
      return;
    }
    if (current.length) segments.push(current);
    current = [];
  });
  if (current.length) segments.push(current);
  return segments;
}
