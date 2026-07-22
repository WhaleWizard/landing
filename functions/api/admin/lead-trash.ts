import { json } from '../../_lib/http';
import { CACHE_CONTROL } from '../../_lib/cache';
import { verifyAdminPassword } from '../../_lib/auth';
import { enforceRateLimit } from '../../_lib/rate-limit';
import { hasLeadSoftDelete } from '../../_lib/leads';
import { qualityEventIds } from '../../_lib/admin-lead-quality-status';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };

export const LEAD_TRASH_MIGRATION = '0020_leads_soft_delete.sql';

const MAX_IDS_PER_REQUEST = 200;
const DEFAULT_TRASH_LIMIT = 50;
const MAX_TRASH_LIMIT = 200;

// Дочерние записи заявки. Восстановление их не трогает — они лежат нетронутыми,
// пока заявка в корзине, и удаляются только при окончательной очистке.
const LEAD_CHILD_TABLES = ['crm_lead_tags', 'crm_notes', 'crm_tasks', 'lead_activity', 'lead_ingestions'] as const;

function getPassword(request: Request, body?: { password?: string }): string {
  return request.headers.get('X-Admin-Password') || body?.password || '';
}

function migrationRequired(): Response {
  return json({
    success: false,
    code: 'LEAD_TRASH_MIGRATION_REQUIRED',
    migration: LEAD_TRASH_MIGRATION,
    error: `Примените миграцию ${LEAD_TRASH_MIGRATION} — до неё корзина заявок недоступна`,
  }, { status: 503, headers: noStore });
}

function parseIds(value: unknown): number[] {
  if (!Array.isArray(value)) throw new Error('ids must be an array');
  const ids = value.map((item) => Number(item));
  if (ids.some((id) => !Number.isInteger(id) || id <= 0)) throw new Error('ids must be positive integers');
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) throw new Error('ids must not be empty');
  if (unique.length > MAX_IDS_PER_REQUEST) throw new Error(`ids must contain at most ${MAX_IDS_PER_REQUEST} items`);
  return unique;
}

function normalizeReason(value: unknown): string {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, 200);
}

async function tableExists(db: D1Database, name: string): Promise<boolean> {
  const row = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").bind(name).first<{ name: string }>();
  return Boolean(row?.name);
}

async function leadColumns(db: D1Database): Promise<Set<string>> {
  const result = await db.prepare('PRAGMA table_info(leads)').all<{ name: string }>();
  return new Set((result.results || []).map((column) => column.name));
}

interface TrashTargetRow {
  id: number;
  event_id?: string;
  quality?: string;
  quality_action_id?: string;
}

// Ещё не ушедшие в Meta события качества отменяем: отправлять оценку заявки,
// которую администратор только что убрал, смысла нет. Уже подтверждённые
// Meta события не трогаем — отозвать их невозможно.
async function cancelQueuedQualityEvents(db: D1Database, rows: TrashTargetRow[]): Promise<number> {
  if (!rows.length || !(await tableExists(db, 'meta_outbox'))) return 0;
  const eventIds = new Set<string>();
  for (const row of rows) {
    for (const quality of ['target', 'nontarget'] as const) {
      for (const eventId of qualityEventIds(row, quality)) eventIds.add(eventId);
    }
  }
  const ids = Array.from(eventIds);
  if (!ids.length) return 0;
  const placeholders = ids.map(() => '?').join(', ');
  const result = await db.prepare(
    `DELETE FROM meta_outbox WHERE id IN (${placeholders}) AND status IN ('pending', 'retry')`,
  ).bind(...ids).run() as { meta?: { changes?: number } };
  return Number(result.meta?.changes || 0);
}

async function auditTrashAction(
  db: D1Database,
  ids: number[],
  type: 'lead_trashed' | 'lead_restored',
  note: string,
): Promise<void> {
  if (!(await tableExists(db, 'lead_activity'))) return;
  const columnsResult = await db.prepare('PRAGMA table_info(lead_activity)').all<{ name: string }>();
  const columns = new Set((columnsResult.results || []).map((column) => column.name));
  if (!['lead_id', 'type', 'from', 'to', 'note'].every((column) => columns.has(column))) return;

  const names = ['lead_id', 'type', '"from"', '"to"', 'note'];
  const extras: Array<string | number> = [];
  if (columns.has('actor')) { names.push('actor'); extras.push('admin'); }
  if (columns.has('entity_type')) { names.push('entity_type'); extras.push('lead'); }

  const statements = ids.map((id) => db.prepare(
    `INSERT INTO lead_activity (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
  ).bind(id, type, '', '', note, ...extras));
  if (statements.length) await db.batch(statements);
}

// Список заявок в корзине
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;
  if (!verifyAdminPassword(getPassword(request), env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.DB) {
    return json({ success: false, code: 'D1_NOT_CONFIGURED', error: 'База D1 не подключена' }, { status: 503, headers: noStore });
  }
  if (!(await hasLeadSoftDelete(env.DB))) return migrationRequired();

  try {
    const url = new URL(request.url);
    const parsedLimit = Number(url.searchParams.get('limit') || DEFAULT_TRASH_LIMIT);
    const limit = Number.isInteger(parsedLimit) && parsedLimit > 0
      ? Math.min(parsedLimit, MAX_TRASH_LIMIT)
      : DEFAULT_TRASH_LIMIT;

    const columns = await leadColumns(env.DB);
    const optional = ['service', 'utm_source', 'submissions_count', 'message']
      .filter((column) => columns.has(column));
    const selected = ['id', 'name', 'email', 'phone', 'telegram_username', 'created_at', 'deleted_at', 'deleted_reason', ...optional];

    const [rows, totalRow] = await Promise.all([
      env.DB.prepare(
        `SELECT ${selected.join(', ')} FROM leads
         WHERE deleted_at IS NOT NULL
         ORDER BY deleted_at DESC, id DESC LIMIT ?`,
      ).bind(limit).all<Record<string, unknown>>(),
      env.DB.prepare('SELECT COUNT(*) AS count FROM leads WHERE deleted_at IS NOT NULL').first<{ count: number }>(),
    ]);

    return json({
      success: true,
      leads: rows.results || [],
      total: Number(totalRow?.count || 0),
      limit,
    }, { headers: noStore });
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load trashed leads',
    }, { status: 500, headers: noStore });
  }
};

// Действия: { action: 'delete' | 'restore' | 'purge', ids: number[] } или { action: 'purge_all' }
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => ({})) as {
    password?: string;
    action?: string;
    ids?: unknown;
    reason?: unknown;
  };
  if (!verifyAdminPassword(getPassword(request, body), env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.DB) {
    return json({ success: false, code: 'D1_NOT_CONFIGURED', error: 'База D1 не подключена' }, { status: 503, headers: noStore });
  }
  if (!(await hasLeadSoftDelete(env.DB))) return migrationRequired();

  const db = env.DB;
  const action = String(body.action || '');
  if (!['delete', 'restore', 'purge', 'purge_all'].includes(action)) {
    return json({ success: false, error: 'action must be one of: delete, restore, purge, purge_all' }, { status: 400, headers: noStore });
  }

  try {
    if (action === 'delete') {
      const ids = parseIds(body.ids);
      const reason = normalizeReason(body.reason);
      const placeholders = ids.map(() => '?').join(', ');
      // Забираем контекст до обновления: после него события качества уже не найти.
      const targets = await db.prepare(
        `SELECT id, event_id, quality, quality_action_id FROM leads
         WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
      ).bind(...ids).all<TrashTargetRow>();
      const affected = targets.results || [];
      if (!affected.length) {
        return json({ success: true, moved: 0, cancelled_events: 0 }, { headers: noStore });
      }

      const affectedIds = affected.map((row) => row.id);
      const affectedPlaceholders = affectedIds.map(() => '?').join(', ');
      const result = await db.prepare(
        `UPDATE leads SET deleted_at = datetime('now'), deleted_reason = ?, updated_at = datetime('now')
         WHERE id IN (${affectedPlaceholders}) AND deleted_at IS NULL`,
      ).bind(reason, ...affectedIds).run() as { meta?: { changes?: number } };
      const moved = Number(result.meta?.changes || 0);

      const cancelled = await cancelQueuedQualityEvents(db, affected);
      await auditTrashAction(db, affectedIds, 'lead_trashed', reason ? `Заявка убрана в корзину: ${reason}` : 'Заявка убрана в корзину');

      return json({ success: true, moved, cancelled_events: cancelled }, { headers: noStore });
    }

    if (action === 'restore') {
      const ids = parseIds(body.ids);
      const placeholders = ids.map(() => '?').join(', ');
      const result = await db.prepare(
        `UPDATE leads SET deleted_at = NULL, deleted_reason = '', updated_at = datetime('now')
         WHERE id IN (${placeholders}) AND deleted_at IS NOT NULL`,
      ).bind(...ids).run() as { meta?: { changes?: number } };
      const restored = Number(result.meta?.changes || 0);
      if (restored > 0) {
        await auditTrashAction(db, ids, 'lead_restored', 'Заявка восстановлена из корзины');
      }
      return json({ success: true, restored }, { headers: noStore });
    }

    // Окончательное удаление. Только из корзины: активную заявку стереть нельзя,
    // её сначала нужно осознанно туда положить.
    const purgeIds = action === 'purge' ? parseIds(body.ids) : null;
    const scope = purgeIds
      ? { sql: `id IN (${purgeIds.map(() => '?').join(', ')}) AND deleted_at IS NOT NULL`, values: purgeIds }
      : { sql: 'deleted_at IS NOT NULL', values: [] as number[] };

    const doomed = await db.prepare(
      `SELECT id, event_id, quality, quality_action_id FROM leads WHERE ${scope.sql}`,
    ).bind(...scope.values).all<TrashTargetRow>();
    const doomedRows = doomed.results || [];
    if (!doomedRows.length) {
      return json({ success: true, purged: 0, cancelled_events: 0 }, { headers: noStore });
    }

    const doomedIds = doomedRows.map((row) => row.id);
    const cancelled = await cancelQueuedQualityEvents(db, doomedRows);

    // Связанные записи чистим явно: полагаться на каскад внешних ключей нельзя,
    // он включается настройкой соединения, а не схемой.
    const doomedPlaceholders = doomedIds.map(() => '?').join(', ');
    const statements: D1PreparedStatement[] = [];
    for (const table of LEAD_CHILD_TABLES) {
      if (!(await tableExists(db, table))) continue;
      statements.push(db.prepare(`DELETE FROM ${table} WHERE lead_id IN (${doomedPlaceholders})`).bind(...doomedIds));
    }
    statements.push(db.prepare(`DELETE FROM leads WHERE id IN (${doomedPlaceholders})`).bind(...doomedIds));
    const results = await db.batch(statements);
    const purged = Number((results[results.length - 1] as { meta?: { changes?: number } })?.meta?.changes || 0);

    return json({ success: true, purged, cancelled_events: cancelled }, { headers: noStore });
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update trash',
    }, { status: 400, headers: noStore });
  }
};
