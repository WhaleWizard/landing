import { json } from '../../_lib/http';
import { CACHE_CONTROL } from '../../_lib/cache';
import { verifyAdminPassword } from '../../_lib/auth';
import { enforceRateLimit } from '../../_lib/rate-limit';
import { sendLeadQualityEvent, type LeadQualityRow } from '../../_lib/lead-quality';
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
    // Повторные заявки поднимают лид наверх: сортируем по дате последней подачи.
    // SELECT * — состав колонок зависит от применённых миграций (0008/0009/0010).
    let rows;
    try {
      rows = await env.DB.prepare('SELECT * FROM leads ORDER BY COALESCE(last_submitted_at, created_at) DESC LIMIT 300').all();
    } catch (error) {
      // Миграция 0009 ещё не применена — сортируем по id
      if (!/no such column/i.test(error instanceof Error ? error.message : String(error))) throw error;
      rows = await env.DB.prepare('SELECT * FROM leads ORDER BY id DESC LIMIT 300').all();
    }
    const counts = await env.DB.prepare('SELECT status, COUNT(*) AS count FROM leads GROUP BY status').all<{ status: string; count: number }>();
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

const LEAD_QUALITIES = new Set(['', 'target', 'nontarget']);

// Обновление заявки: { id, status?: new|in_progress|closed, quality?: ''|target|nontarget }
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => ({})) as { password?: string; id?: number; status?: string; quality?: string };
  if (!verifyAdminPassword(getPassword(request, body), env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.DB) {
    return json({ success: false, error: 'База D1 не подключена' }, { status: 503, headers: noStore });
  }
  const id = Number(body.id);
  const hasStatus = body.status !== undefined;
  const hasQuality = body.quality !== undefined;
  const status = String(body.status ?? '');
  const quality = String(body.quality ?? '');
  if (
    !Number.isInteger(id) || id <= 0 ||
    (!hasStatus && !hasQuality) ||
    (hasStatus && !LEAD_STATUSES.has(status)) ||
    (hasQuality && !LEAD_QUALITIES.has(quality))
  ) {
    return json({ success: false, error: 'id and valid status or quality are required' }, { status: 400, headers: noStore });
  }

  try {
    if (hasStatus) {
      await env.DB.prepare("UPDATE leads SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(status, id).run();
    }
    let meta: { status: string; reason?: string } | undefined;
    if (hasQuality) {
      await env.DB.prepare("UPDATE leads SET quality = ?, updated_at = datetime('now') WHERE id = ?").bind(quality, id).run();
      // Метка «целевой/нецелевой» — сигнал качества для Meta.
      // Снятие метки (quality = '') событие не отправляет: «отозвать» его нельзя.
      if (quality === 'target' || quality === 'nontarget') {
        const row = await env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(id).first<LeadQualityRow>();
        if (row) {
          meta = await sendLeadQualityEvent(env, row, quality);
        }
      }
    }
    return json({ success: true, meta }, { headers: noStore });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : 'Failed to update lead' }, { status: 500, headers: noStore });
  }
};
