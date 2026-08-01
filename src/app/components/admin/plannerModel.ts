// Модель недельного планера: типы, работа с датами и все расчёты.
// Логика вынесена отдельно от разметки — формулы повторяют исходную таблицу-референс.

export const DAYS_IN_WEEK = 7;

export const WEEKDAY_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;
export const WEEKDAY_FULL = [
  'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье',
] as const;

export const PLANNER_LIMITS = {
  goals: 12,
  tasksPerDay: 30,
  notesPerDay: 10,
  habits: 12,
  goalText: 200,
  taskText: 300,
  noteText: 500,
  habitName: 120,
  journalText: 1000,
} as const;

export type PlannerCheckItem = { id: string; text: string; done: boolean };
export type PlannerNote = { id: string; text: string };

export type PlannerJournal = {
  sleep: string;
  energy: number;
  mood: number;
  lesson: string;
  gratitude: string;
  thoughts: string;
};

export type PlannerDay = {
  tasks: PlannerCheckItem[];
  notes: PlannerNote[];
  journal: PlannerJournal;
};

export type PlannerHabit = { id: string; name: string; days: boolean[] };

export type PlannerWeekData = {
  goals: PlannerCheckItem[];
  days: PlannerDay[];
  habits: PlannerHabit[];
};

let idCounter = 0;

export function createId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

export function emptyJournal(): PlannerJournal {
  return { sleep: '', energy: 0, mood: 0, lesson: '', gratitude: '', thoughts: '' };
}

export function emptyDay(): PlannerDay {
  return { tasks: [], notes: [], journal: emptyJournal() };
}

export function emptyWeek(): PlannerWeekData {
  return { goals: [], days: Array.from({ length: DAYS_IN_WEEK }, emptyDay), habits: [] };
}

// Ответ API может прийти неполным (старая запись, ручная правка в базе) —
// приводим его к полной форме, чтобы интерфейс никогда не падал на undefined.
export function normalizeWeekData(input: unknown): PlannerWeekData {
  const source = (input || {}) as Partial<PlannerWeekData>;

  const normalizeChecks = (value: unknown, limit: number, prefix: string): PlannerCheckItem[] => (
    Array.isArray(value)
      ? value.slice(0, limit).map((item) => ({
          id: String((item as PlannerCheckItem)?.id || createId(prefix)),
          text: String((item as PlannerCheckItem)?.text ?? ''),
          done: Boolean((item as PlannerCheckItem)?.done),
        }))
      : []
  );

  const days = Array.from({ length: DAYS_IN_WEEK }, (_, index) => {
    const day = Array.isArray(source.days) ? source.days[index] : null;
    const journal = (day?.journal || {}) as Partial<PlannerJournal>;
    return {
      tasks: normalizeChecks(day?.tasks, PLANNER_LIMITS.tasksPerDay, 'task'),
      notes: Array.isArray(day?.notes)
        ? day.notes.slice(0, PLANNER_LIMITS.notesPerDay).map((note) => ({
            id: String(note?.id || createId('note')),
            text: String(note?.text ?? ''),
          }))
        : [],
      journal: {
        sleep: String(journal.sleep ?? ''),
        energy: Number(journal.energy) || 0,
        mood: Number(journal.mood) || 0,
        lesson: String(journal.lesson ?? ''),
        gratitude: String(journal.gratitude ?? ''),
        thoughts: String(journal.thoughts ?? ''),
      },
    } satisfies PlannerDay;
  });

  const habits = Array.isArray(source.habits)
    ? source.habits.slice(0, PLANNER_LIMITS.habits).map((habit) => ({
        id: String(habit?.id || createId('habit')),
        name: String(habit?.name ?? ''),
        days: Array.from({ length: DAYS_IN_WEEK }, (_, index) => Boolean(habit?.days?.[index])),
      }))
    : [];

  return { goals: normalizeChecks(source.goals, PLANNER_LIMITS.goals, 'goal'), days, habits };
}

/* ---------- Даты ---------- */

export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export function addDays(date: Date, amount: number): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + amount);
  return copy;
}

// Неделя всегда начинается с понедельника: так на неделю приходится ровно одна
// запись в базе, а стрелки «‹ ›» ходят ровно по неделям.
export function mondayOf(date: Date): Date {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  const weekday = copy.getDay();
  copy.setDate(copy.getDate() - (weekday === 0 ? 6 : weekday - 1));
  return copy;
}

export function currentWeekStart(): string {
  return toIsoDate(mondayOf(new Date()));
}

export function weekDates(weekStartIso: string): Date[] {
  const start = parseIsoDate(weekStartIso);
  return Array.from({ length: DAYS_IN_WEEK }, (_, index) => addDays(start, index));
}

const dayMonthFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const dayShortFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });

export function formatDayShort(date: Date): string {
  return dayShortFormatter.format(date).replace('.', '');
}

// «1 — 7 июня 2026», «29 июня — 5 июля 2026», «28 декабря 2026 — 3 января 2027»
export function formatWeekRange(weekStartIso: string): string {
  const start = parseIsoDate(weekStartIso);
  const end = addDays(start, DAYS_IN_WEEK - 1);
  const sameYear = start.getFullYear() === end.getFullYear();
  const sameMonth = sameYear && start.getMonth() === end.getMonth();
  if (sameMonth) {
    return `${start.getDate()} — ${dayMonthFormatter.format(end)} ${end.getFullYear()}`;
  }
  if (sameYear) {
    return `${dayMonthFormatter.format(start)} — ${dayMonthFormatter.format(end)} ${end.getFullYear()}`;
  }
  return `${dayMonthFormatter.format(start)} ${start.getFullYear()} — ${dayMonthFormatter.format(end)} ${end.getFullYear()}`;
}

// Компактный вариант для узких экранов: «27 июл — 2 авг».
// Год добавляется только когда неделя не из текущего года — иначе подпись
// не помещается в кнопку на 320px и обрезается.
export function formatWeekRangeShort(weekStartIso: string): string {
  const start = parseIsoDate(weekStartIso);
  const end = addDays(start, DAYS_IN_WEEK - 1);
  const base = `${formatDayShort(start)} — ${formatDayShort(end)}`;
  const currentYear = new Date().getFullYear();
  return end.getFullYear() === currentYear && start.getFullYear() === currentYear
    ? base
    : `${base} ${end.getFullYear()}`;
}

export function shiftWeek(weekStartIso: string, weeks: number): string {
  return toIsoDate(addDays(parseIsoDate(weekStartIso), weeks * DAYS_IN_WEEK));
}

// Индекс сегодняшнего дня внутри показанной недели или -1, если неделя другая.
export function todayIndexIn(weekStartIso: string): number {
  const todayIso = toIsoDate(new Date());
  return weekDates(weekStartIso).findIndex((date) => toIsoDate(date) === todayIso);
}

/* ---------- Расчёты ---------- */

export type PlannerDayStats = { total: number; done: number; undone: number; progress: number };

export type PlannerStats = {
  days: PlannerDayStats[];
  total: number;
  done: number;
  undone: number;
  progress: number;
  bestDayIndex: number;
  goalsTotal: number;
  goalsDone: number;
  habitChecks: number;
  habitSlots: number;
};

function countFilled(items: PlannerCheckItem[]): number {
  return items.filter((item) => item.text.trim().length > 0).length;
}

function countDone(items: PlannerCheckItem[]): number {
  return items.filter((item) => item.text.trim().length > 0 && item.done).length;
}

export function computeStats(data: PlannerWeekData): PlannerStats {
  const days = data.days.map((day) => {
    const total = countFilled(day.tasks);
    const done = countDone(day.tasks);
    return { total, done, undone: Math.max(0, total - done), progress: total ? done / total : 0 };
  });

  const total = days.reduce((sum, day) => sum + day.total, 0);
  const done = days.reduce((sum, day) => sum + day.done, 0);

  // Самый продуктивный день — с наибольшим числом выполненных задач.
  // Пока не выполнено ничего, «лидера» нет: подсвечивать первый день нечестно.
  let bestDayIndex = -1;
  days.forEach((day, index) => {
    if (day.done > 0 && (bestDayIndex === -1 || day.done > days[bestDayIndex].done)) {
      bestDayIndex = index;
    }
  });

  const namedHabits = data.habits.filter((habit) => habit.name.trim().length > 0);

  return {
    days,
    total,
    done,
    undone: Math.max(0, total - done),
    progress: total ? done / total : 0,
    bestDayIndex,
    goalsTotal: countFilled(data.goals),
    goalsDone: countDone(data.goals),
    habitChecks: namedHabits.reduce((sum, habit) => sum + habit.days.filter(Boolean).length, 0),
    habitSlots: namedHabits.length * DAYS_IN_WEEK,
  };
}

export function habitProgress(habit: PlannerHabit): number {
  return habit.days.filter(Boolean).length / DAYS_IN_WEEK;
}

export function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/* ---------- Состояние дня для дневника ---------- */

export const SLEEP_OPTIONS = ['', '4ч', '5ч', '6ч', '7ч', '8ч', '9ч', '10ч', '11ч', '12ч'];

export const MOOD_LEVELS = [
  { value: 1, label: 'Тяжело' },
  { value: 2, label: 'Так себе' },
  { value: 3, label: 'Нормально' },
  { value: 4, label: 'Хорошо' },
  { value: 5, label: 'Отлично' },
] as const;

export const ENERGY_LEVELS = [
  { value: 1, label: 'Низкая' },
  { value: 2, label: 'Средняя' },
  { value: 3, label: 'Высокая' },
] as const;

export function isDayFilled(day: PlannerDay): boolean {
  return (
    day.tasks.some((task) => task.text.trim()) ||
    day.notes.some((note) => note.text.trim()) ||
    Boolean(day.journal.sleep) ||
    day.journal.energy > 0 ||
    day.journal.mood > 0 ||
    Boolean(day.journal.lesson.trim()) ||
    Boolean(day.journal.gratitude.trim()) ||
    Boolean(day.journal.thoughts.trim())
  );
}
