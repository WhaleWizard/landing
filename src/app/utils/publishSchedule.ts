/**
 * Раскладка публикаций по расписанию.
 *
 * Владелец пишет статьи пачкой и хочет, чтобы они выходили сами: несколько
 * в день, в случайное время рабочего дня, в случайном порядке. Здесь только
 * расчёт — чистая функция без сети. Сохраняет план эндпоинт
 * `/api/admin/articles-schedule`, который меняет у статей лишь статус и дату
 * публикации.
 *
 * Время считается в поясе владельца (Ташкент, UTC+5, без перехода на летнее
 * время) и переводится в UTC для базы.
 */

export const OWNER_UTC_OFFSET_MINUTES = 5 * 60;
/** Меньше этого между двумя статьями одного дня — выглядит как выгрузка пачкой. */
export const MIN_GAP_MINUTES = 45;

export interface ScheduleOptions {
  /** Первый день в формате YYYY-MM-DD, по поясу владельца. */
  startDate: string;
  days: number;
  perDay: number;
  /** Окно публикаций, часы по поясу владельца: [fromHour, toHour). */
  fromHour: number;
  toHour: number;
  /** Перемешать порядок статей. */
  shuffle: boolean;
  /** Источник случайности; в тестах — детерминированный. */
  random?: () => number;
  offsetMinutes?: number;
}

export interface ScheduledItem {
  slug: string;
  /** ISO в UTC — то, что уходит в базу. */
  publishedAt: string;
  /** YYYY-MM-DD по поясу владельца — для показа. */
  localDate: string;
  /** HH:MM по поясу владельца — для показа. */
  localTime: string;
}

export interface ScheduleResult {
  items: ScheduledItem[];
  /** Статьи, которым не хватило мест в расписании. */
  overflow: string[];
  error?: string;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function parseDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return { year, month, day };
}

/**
 * Сколько статей выпадает на каждый день. Если статей меньше, чем мест,
 * они равномерно распределяются по всему периоду, а не набиваются в первые
 * дни: пять статей на двадцать один день — это раз в четыре дня, а не пять
 * дней подряд и тишина. Первая статья всегда выходит в первый же день.
 */
function dailyCounts(total: number, days: number, perDay: number): number[] {
  const capacity = days * perDay;
  const placed = Math.min(total, capacity);
  const counts = new Array(days).fill(0);
  if (placed === 0) return counts;
  if (placed >= capacity) return counts.map(() => perDay);
  // Статья k уходит в день floor(k*days/placed): первая — в день 0, дальше
  // с равным шагом. В один день попадает не больше ceil(placed/days) статей,
  // а это не больше perDay, потому что placed ≤ days*perDay.
  for (let k = 0; k < placed; k += 1) {
    counts[Math.floor((k * days) / placed)] += 1;
  }
  return counts;
}

/** Случайные минуты в окне с минимальным зазором, по возрастанию. */
function pickMinutes(count: number, windowStart: number, windowEnd: number, random: () => number): number[] | null {
  const span = windowEnd - windowStart;
  const needed = (count - 1) * MIN_GAP_MINUTES;
  if (count === 0) return [];
  if (span <= needed) return null;
  // Сначала случайные точки в «сжатом» отрезке, потом раздвигаем на зазор:
  // так зазор соблюдается всегда, а распределение остаётся равномерным.
  const free = span - needed;
  const raw = Array.from({ length: count }, () => Math.floor(random() * free)).sort((a, b) => a - b);
  return raw.map((value, index) => windowStart + value + index * MIN_GAP_MINUTES);
}

function shuffled<T>(items: T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function planSchedule(slugs: string[], options: ScheduleOptions): ScheduleResult {
  const random = options.random ?? Math.random;
  const offset = options.offsetMinutes ?? OWNER_UTC_OFFSET_MINUTES;
  const start = parseDate(options.startDate);
  const days = Math.floor(options.days);
  const perDay = Math.floor(options.perDay);
  const fromMinutes = Math.floor(options.fromHour) * 60;
  const toMinutes = Math.floor(options.toHour) * 60;

  if (!start) return { items: [], overflow: slugs, error: 'Укажите дату начала' };
  if (!Number.isInteger(days) || days < 1 || days > 366) return { items: [], overflow: slugs, error: 'Период — от 1 до 366 дней' };
  if (!Number.isInteger(perDay) || perDay < 1 || perDay > 12) return { items: [], overflow: slugs, error: 'В день — от 1 до 12 статей' };
  if (fromMinutes < 0 || toMinutes > 24 * 60 || toMinutes <= fromMinutes) return { items: [], overflow: slugs, error: 'Окно времени: «с» должно быть раньше «до»' };
  if (toMinutes - fromMinutes <= (perDay - 1) * MIN_GAP_MINUTES) {
    return { items: [], overflow: slugs, error: `В окно не помещается ${perDay} статей с перерывом ${MIN_GAP_MINUTES} минут — расширьте окно или уменьшите число в день` };
  }

  const order = options.shuffle ? shuffled(slugs, random) : [...slugs];
  const counts = dailyCounts(order.length, days, perDay);
  const items: ScheduledItem[] = [];
  let cursor = 0;

  for (let dayIndex = 0; dayIndex < days && cursor < order.length; dayIndex += 1) {
    const minutes = pickMinutes(counts[dayIndex], fromMinutes, toMinutes, random);
    if (!minutes) continue;
    for (const minuteOfDay of minutes) {
      const localMs = Date.UTC(start.year, start.month - 1, start.day + dayIndex) + minuteOfDay * 60_000;
      const local = new Date(localMs);
      items.push({
        slug: order[cursor],
        publishedAt: new Date(localMs - offset * 60_000).toISOString(),
        localDate: `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`,
        localTime: `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`,
      });
      cursor += 1;
    }
  }

  return { items, overflow: order.slice(cursor) };
}

/** Завтра по поясу владельца, YYYY-MM-DD — разумное начало по умолчанию. */
export function ownerTomorrow(now = Date.now(), offsetMinutes = OWNER_UTC_OFFSET_MINUTES): string {
  const local = new Date(now + offsetMinutes * 60_000 + 24 * 60 * 60_000);
  return `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`;
}
