/**
 * «Сегодня» по времени владельца, а не по Гринвичу.
 *
 * Разделы «Финансы», «Цели», «Отчёт», сводка и уведомления считали день через
 * `new Date().toISOString()`, то есть по UTC. Владелец в UTC+5: с полуночи до
 * пяти утра по местному времени эти разделы жили во вчерашнем дне. Новый
 * расход получал вчерашнюю дату, «просрочен» у счёта загорался на пять часов
 * позже, а расход, внесённый в 01:00 первого числа, попадал в прошлый месяц —
 * то есть деньги уезжали не в тот отчёт.
 *
 * Смещение приходит из браузера тем же способом, что уже работает в разделах
 * «Сегодня» и «Заявки»: `new Date().getTimezoneOffset()` — минуты, на которые
 * местное время отстаёт от UTC (для UTC+5 это −300).
 */

/** Предел смещения: реальные пояса укладываются в ±14 часов. */
const MAX_OFFSET_MINUTES = 840;

export function timezoneOffsetFromRequest(request: Request): number {
  let raw: string | null = null;
  try {
    raw = new URL(request.url).searchParams.get('timezone_offset');
  } catch {
    raw = null;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > MAX_OFFSET_MINUTES) return 0;
  return Math.trunc(parsed);
}

/** Местная дата в формате YYYY-MM-DD. Без параметра ведёт себя как раньше. */
export function localTodayIso(request: Request): string {
  const offset = timezoneOffsetFromRequest(request);
  return new Date(Date.now() - offset * 60_000).toISOString().slice(0, 10);
}

/** Местный месяц в формате YYYY-MM. */
export function localMonth(request: Request): string {
  return localTodayIso(request).slice(0, 7);
}

/** Местная дата по уже разобранному смещению — для мест без объекта запроса. */
export function localTodayIsoFromOffset(offsetMinutes: number): string {
  const offset = Number.isFinite(offsetMinutes) && Math.abs(offsetMinutes) <= MAX_OFFSET_MINUTES
    ? Math.trunc(offsetMinutes)
    : 0;
  return new Date(Date.now() - offset * 60_000).toISOString().slice(0, 10);
}

/**
 * Модификатор для SQLite, переводящий хранимое UTC-время в местное:
 * `date(created_at, ?)` со значением `'+300 minutes'` даёт местный день
 * для UTC+5. Смещение из браузера идёт со знаком «наоборот» (−300), поэтому
 * знак меняется здесь.
 */
export function sqliteLocalModifier(offsetMinutes: number): string {
  const offset = Number.isFinite(offsetMinutes) && Math.abs(offsetMinutes) <= MAX_OFFSET_MINUTES
    ? Math.trunc(offsetMinutes)
    : 0;
  return `${-offset >= 0 ? '+' : '-'}${Math.abs(offset)} minutes`;
}
