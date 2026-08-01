import { json, readRequestText } from '../../_lib/http';
import { CACHE_CONTROL } from '../../_lib/cache';
import { verifyAdminPassword } from '../../_lib/auth';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };

// Тело недели целиком приходит одним JSON, поэтому лимит задан явно:
// при заполненных 7 днях реальный размер — единицы килобайт.
const MAX_BODY_BYTES = 256 * 1024;

const DAYS_IN_WEEK = 7;
const LIMITS = {
  goals: 12,
  goalText: 200,
  tasksPerDay: 30,
  taskText: 300,
  notesPerDay: 10,
  noteText: 500,
  habits: 12,
  habitName: 120,
  journalText: 1000,
  sleepText: 8,
} as const;

type PlannerTask = { id: string; text: string; done: boolean };
type PlannerNote = { id: string; text: string };
type PlannerJournal = {
  sleep: string;
  energy: number;
  mood: number;
  lesson: string;
  gratitude: string;
  thoughts: string;
};
type PlannerDay = { tasks: PlannerTask[]; notes: PlannerNote[]; journal: PlannerJournal };
type PlannerHabit = { id: string; name: string; days: boolean[] };
type PlannerWeekData = { goals: PlannerTask[]; days: PlannerDay[]; habits: PlannerHabit[] };

function isMissingTableError(error: unknown): boolean {
  return /no such table/i.test(error instanceof Error ? error.message : String(error));
}

// Любая дата приводится к понедельнику своей недели: так на неделю всегда
// приходится ровно одна строка в базе, а навигация «‹ ›» остаётся предсказуемой.
function normalizeWeekStart(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  const weekday = parsed.getUTCDay(); // 0 — воскресенье
  const shift = weekday === 0 ? 6 : weekday - 1;
  parsed.setUTCDate(parsed.getUTCDate() - shift);
  return parsed.toISOString().slice(0, 10);
}

function cleanId(value: unknown): string {
  const id = String(value ?? '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40);
  return id || `id-${Math.random().toString(36).slice(2, 10)}`;
}

// Управляющие символы вырезаем, перевод строки и табуляцию оставляем:
// «Мысли» и «Заметки дня» — многострочные поля.
const CONTROL_CHARS = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]', 'g');

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? '').replace(CONTROL_CHARS, '').slice(0, maxLength);
}

function clampNumber(value: unknown, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function normalizeCheckList(value: unknown, limit: number, textLimit: number): PlannerTask[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, limit).map((item) => ({
    id: cleanId((item as PlannerTask)?.id),
    text: cleanText((item as PlannerTask)?.text, textLimit),
    done: Boolean((item as PlannerTask)?.done),
  }));
}

function normalizeNotes(value: unknown): PlannerNote[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, LIMITS.notesPerDay).map((item) => ({
    id: cleanId((item as PlannerNote)?.id),
    text: cleanText((item as PlannerNote)?.text, LIMITS.noteText),
  }));
}

function normalizeJournal(value: unknown): PlannerJournal {
  const source = (value || {}) as Partial<PlannerJournal>;
  return {
    sleep: cleanText(source.sleep, LIMITS.sleepText),
    energy: clampNumber(source.energy, 0, 3),
    mood: clampNumber(source.mood, 0, 5),
    lesson: cleanText(source.lesson, LIMITS.journalText),
    gratitude: cleanText(source.gratitude, LIMITS.journalText),
    thoughts: cleanText(source.thoughts, LIMITS.journalText),
  };
}

function emptyDay(): PlannerDay {
  return { tasks: [], notes: [], journal: normalizeJournal(null) };
}

function normalizeWeekData(value: unknown): PlannerWeekData {
  const source = (value || {}) as Partial<PlannerWeekData>;
  const days: PlannerDay[] = [];
  for (let index = 0; index < DAYS_IN_WEEK; index += 1) {
    const day = Array.isArray(source.days) ? source.days[index] : null;
    days.push({
      tasks: normalizeCheckList(day?.tasks, LIMITS.tasksPerDay, LIMITS.taskText),
      notes: normalizeNotes(day?.notes),
      journal: normalizeJournal(day?.journal),
    });
  }

  const habits: PlannerHabit[] = Array.isArray(source.habits)
    ? source.habits.slice(0, LIMITS.habits).map((habit) => {
        const rawDays = Array.isArray(habit?.days) ? habit.days : [];
        return {
          id: cleanId(habit?.id),
          name: cleanText(habit?.name, LIMITS.habitName),
          days: Array.from({ length: DAYS_IN_WEEK }, (_, index) => Boolean(rawDays[index])),
        };
      })
    : [];

  return {
    goals: normalizeCheckList(source.goals, LIMITS.goals, LIMITS.goalText),
    days,
    habits,
  };
}

function isBlankWeek(data: PlannerWeekData): boolean {
  if (data.goals.some((goal) => goal.text.trim() || goal.done)) return false;
  if (data.habits.some((habit) => habit.name.trim() || habit.days.some(Boolean))) return false;
  return !data.days.some((day) => (
    day.tasks.some((task) => task.text.trim() || task.done) ||
    day.notes.some((note) => note.text.trim()) ||
    day.journal.sleep.trim() ||
    day.journal.energy > 0 ||
    day.journal.mood > 0 ||
    day.journal.lesson.trim() ||
    day.journal.gratitude.trim() ||
    day.journal.thoughts.trim()
  ));
}

function emptyWeek(): PlannerWeekData {
  return { goals: [], days: Array.from({ length: DAYS_IN_WEEK }, emptyDay), habits: [] };
}

function getPassword(request: Request, body?: { password?: string }): string {
  return request.headers.get('X-Admin-Password') || body?.password || '';
}

// Новая неделя открывается не пустой: список привычек переносится с последней
// заполненной недели (без отметок), задачи и дневник всегда начинаются с нуля.
async function seedHabitsFromPreviousWeek(db: D1Database, weekStart: string): Promise<PlannerHabit[]> {
  const previous = await db
    .prepare('SELECT data_json FROM planner_weeks WHERE week_start < ? ORDER BY week_start DESC LIMIT 1')
    .bind(weekStart)
    .first<{ data_json: string }>();
  if (!previous?.data_json) return [];
  try {
    const parsed = normalizeWeekData(JSON.parse(previous.data_json));
    return parsed.habits
      .filter((habit) => habit.name.trim())
      .map((habit) => ({ ...habit, days: Array.from({ length: DAYS_IN_WEEK }, () => false) }));
  } catch {
    return [];
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin_planner');
  if (rateLimited) return rateLimited;

  if (!verifyAdminPassword(getPassword(request), env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.DB) {
    return json(
      { success: false, localOnly: true, error: 'База D1 не подключена (доступно только на продакшене)' },
      { status: 503, headers: noStore },
    );
  }

  const requestedWeek = new URL(request.url).searchParams.get('week') || '';
  const weekStart = normalizeWeekStart(requestedWeek || new Date().toISOString().slice(0, 10));
  if (!weekStart) {
    return json({ success: false, error: 'Некорректная дата недели' }, { status: 400, headers: noStore });
  }

  try {
    const row = await env.DB
      .prepare('SELECT data_json, updated_at FROM planner_weeks WHERE week_start = ?')
      .bind(weekStart)
      .first<{ data_json: string; updated_at: string }>();

    if (row) {
      let parsed: PlannerWeekData;
      try {
        parsed = normalizeWeekData(JSON.parse(row.data_json));
      } catch {
        parsed = emptyWeek();
      }
      return json({ success: true, week: weekStart, data: parsed, updatedAt: row.updated_at }, { headers: noStore });
    }

    const data = emptyWeek();
    data.habits = await seedHabitsFromPreviousWeek(env.DB, weekStart);
    return json({ success: true, week: weekStart, data, updatedAt: null, seeded: true }, { headers: noStore });
  } catch (error) {
    if (isMissingTableError(error)) {
      return json(
        { success: false, migrationRequired: true, error: 'Нужна миграция 0021_planner.sql' },
        { status: 503, headers: noStore },
      );
    }
    return json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load planner' },
      { status: 500, headers: noStore },
    );
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin_planner');
  if (rateLimited) return rateLimited;

  const raw = await readRequestText(request, MAX_BODY_BYTES);
  if (!raw.ok) {
    return json({ success: false, error: 'Слишком большой объём данных' }, { status: 413, headers: noStore });
  }

  let body: { password?: string; week?: string; data?: unknown };
  try {
    body = raw.text ? JSON.parse(raw.text) : {};
  } catch {
    return json({ success: false, error: 'Некорректный JSON' }, { status: 400, headers: noStore });
  }

  if (!verifyAdminPassword(getPassword(request, body), env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.DB) {
    return json(
      { success: false, localOnly: true, error: 'База D1 не подключена (доступно только на продакшене)' },
      { status: 503, headers: noStore },
    );
  }

  const weekStart = normalizeWeekStart(String(body.week || ''));
  if (!weekStart) {
    return json({ success: false, error: 'Некорректная дата недели' }, { status: 400, headers: noStore });
  }

  const data = normalizeWeekData(body.data);
  const updatedAt = new Date().toISOString();

  try {
    // Полностью очищенная неделя удаляется, чтобы база не копила пустые строки
    // и «перенос привычек» брал последнюю реально заполненную неделю.
    if (isBlankWeek(data)) {
      await env.DB.prepare('DELETE FROM planner_weeks WHERE week_start = ?').bind(weekStart).run();
      return json({ success: true, week: weekStart, updatedAt: null, cleared: true }, { headers: noStore });
    }

    await env.DB
      .prepare(
        `INSERT INTO planner_weeks (week_start, data_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(week_start) DO UPDATE SET data_json = excluded.data_json, updated_at = excluded.updated_at`,
      )
      .bind(weekStart, JSON.stringify(data), updatedAt)
      .run();

    return json({ success: true, week: weekStart, updatedAt }, { headers: noStore });
  } catch (error) {
    if (isMissingTableError(error)) {
      return json(
        { success: false, migrationRequired: true, error: 'Нужна миграция 0021_planner.sql' },
        { status: 503, headers: noStore },
      );
    }
    return json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to save planner' },
      { status: 500, headers: noStore },
    );
  }
};
