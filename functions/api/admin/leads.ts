import { json } from '../../_lib/http';
import { CACHE_CONTROL } from '../../_lib/cache';
import { verifyAdminPassword } from '../../_lib/auth';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

const LEAD_STATUSES = new Set(['new', 'in_progress', 'closed']);
const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };

function getPassword(request: Request, body?: { password?: string }): string {
  return request.headers.get('X-Admin-Password') || body?.password || '';
}

function isMissingTableError(error: unknown): boolean {
  return /no such table/i.test(error instanceof Error ? error.message : String(error));
}

// Список заявок для админки
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  if (!verifyAdminPassword(getPassword(request), env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.DB) {
    return json({ success: false, error: 'База D1 не подключена (доступно только на продакшене)' }, { status: 503, headers: noStore });
  }

  try {
    const [rows, counts] = await Promise.all([
      env.DB.prepare(
        `SELECT id, name, email, phone, telegram_username, contact_method, budget, message, service,
                page_path, status, telegram_delivered, created_at, updated_at
         FROM leads ORDER BY id DESC LIMIT 300`
      ).all(),
      env.DB.prepare('SELECT status, COUNT(*) AS count FROM leads GROUP BY status').all<{ status: string; count: number }>(),
    ]);
    const byStatus: Record<string, number> = {};
    for (const row of counts.results || []) byStatus[row.status] = row.count;
    return json({ success: true, leads: rows.results || [], counts: byStatus }, { headers: noStore });
  } catch (error) {
    if (isMissingTableError(error)) {
      return json({ success: false, error: 'Таблица заявок ещё не создана — примените миграцию 0008 в D1' }, { status: 503, headers: noStore });
    }
    return json({ success: false, error: error instanceof Error ? error.message : 'Failed to load leads' }, { status: 500, headers: noStore });
  }
};

// Смена статуса заявки: { id, status: new | in_progress | closed }
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => ({})) as { password?: string; id?: number; status?: string };
  if (!verifyAdminPassword(getPassword(request, body), env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.DB) {
    return json({ success: false, error: 'База D1 не подключена' }, { status: 503, headers: noStore });
  }
  const id = Number(body.id);
  const status = String(body.status || '');
  if (!Number.isInteger(id) || id <= 0 || !LEAD_STATUSES.has(status)) {
    return json({ success: false, error: 'id and valid status are required' }, { status: 400, headers: noStore });
  }

  try {
    await env.DB.prepare("UPDATE leads SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(status, id).run();
    return json({ success: true }, { headers: noStore });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : 'Failed to update lead' }, { status: 500, headers: noStore });
  }
};
