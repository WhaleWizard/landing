import { json, readRequestText } from '../../_lib/http';
import { CACHE_CONTROL } from '../../_lib/cache';
import { verifyAdminPassword } from '../../_lib/auth';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

/**
 * Шаблон недели: повторяющиеся дела по дням недели и постоянные цели.
 * Хранится одной строкой в `planner_template` — шаблон у админки один.
 *
 * Привычки сюда не входят намеренно: список привычек и так переносится
 * с последней заполненной недели в `/api/admin/planner`.
 */

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };

const MAX_BODY_BYTES = 64 * 1024;
const MIGRATION = '0029_planner_template.sql';

const DAYS_IN_WEEK = 7;
const LIMITS = {
  tasksPerDay: 30,
  taskText: 300,
  goals: 12,
  goalText: 200,
} as const;

export type PlannerTemplate = { days: string[][]; goals: string[] };

const CONTROL_CHARS = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]', 'g');

function cleanLine(value: unknown, maxLength: number): string {
  return String(value ?? '').replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function normalizeTemplate(input: unknown): PlannerTemplate {
  const source = (input || {}) as Partial<PlannerTemplate>;
  const days = Array.from({ length: DAYS_IN_WEEK }, (_, index) => {
    const list = Array.isArray(source.days) ? source.days[index] : null;
    return Array.isArray(list)
      ? list.map((item) => cleanLine(item, LIMITS.taskText)).filter(Boolean).slice(0, LIMITS.tasksPerDay)
      : [];
  });
  const goals = Array.isArray(source.goals)
    ? source.goals.map((item) => cleanLine(item, LIMITS.goalText)).filter(Boolean).slice(0, LIMITS.goals)
    : [];
  return { days, goals };
}

/** Пустой шаблон хранить незачем — он ничем не отличается от отсутствия шаблона. */
function isEmptyTemplate(template: PlannerTemplate): boolean {
  return template.goals.length === 0 && template.days.every((day) => day.length === 0);
}

function isMissingTableError(error: unknown): boolean {
  return /no such table/i.test(error instanceof Error ? error.message : String(error));
}

function migrationResponse() {
  return json(
    { success: false, migrationRequired: true, migration: MIGRATION, error: `Примените миграцию ${MIGRATION} — до неё шаблон недели негде хранить.` },
    { status: 503, headers: noStore },
  );
}

function getPassword(request: Request, body?: { password?: string }): string {
  return request.headers.get('X-Admin-Password') || body?.password || '';
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

  try {
    const row = await env.DB
      .prepare('SELECT data_json, updated_at FROM planner_template WHERE id = 1')
      .first<{ data_json: string; updated_at: string }>();

    if (!row) return json({ success: true, template: null, updatedAt: null }, { headers: noStore });

    let template: PlannerTemplate;
    try {
      template = normalizeTemplate(JSON.parse(row.data_json));
    } catch {
      template = normalizeTemplate(null);
    }
    return json(
      { success: true, template: isEmptyTemplate(template) ? null : template, updatedAt: row.updated_at },
      { headers: noStore },
    );
  } catch (error) {
    if (isMissingTableError(error)) return migrationResponse();
    return json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to load template' },
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

  let body: { password?: string; template?: unknown; clear?: boolean };
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

  const template = normalizeTemplate(body.template);
  const shouldClear = Boolean(body.clear) || isEmptyTemplate(template);
  const updatedAt = new Date().toISOString();

  try {
    if (shouldClear) {
      await env.DB.prepare('DELETE FROM planner_template WHERE id = 1').run();
      return json({ success: true, template: null, updatedAt: null }, { headers: noStore });
    }

    await env.DB
      .prepare('INSERT OR REPLACE INTO planner_template (id, data_json, updated_at) VALUES (1, ?, ?)')
      .bind(JSON.stringify(template), updatedAt)
      .run();

    return json({ success: true, template, updatedAt }, { headers: noStore });
  } catch (error) {
    if (isMissingTableError(error)) return migrationResponse();
    return json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to save template' },
      { status: 500, headers: noStore },
    );
  }
};
