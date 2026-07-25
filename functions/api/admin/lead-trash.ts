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
const MAX_TRASH_OFFSET = 100_000;

// D1 не принимает больше 100 подставляемых значений в одном запросе, поэтому
// любой список id режется на части. Запас до 100 оставлен под параметры,
// которые идут вместе со списком (причина удаления, лимит, смещение).
const SQL_PARAM_CHUNK = 80;
// Очистка корзины идёт порциями: так один запрос не упирается ни в лимит
// параметров, ни в лимит времени воркера. Остаток возвращается админке,
// и она дожимает его следующим вызовом, показывая прогресс.
const PURGE_SCAN_BATCH = 200;
const MAX_PURGE_PER_REQUEST = 1000;

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

function chunks<T>(values: T[], size = SQL_PARAM_CHUNK): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
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

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

async function tableExists(db: D1Database, name: string): Promise<boolean> {
  const row = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").bind(name).first<{ name: string }>();
  return Boolean(row?.name);
}

async function leadColumns(db: D1Database): Promise<Set<string>> {
  const result = await db.prepare('PRAGMA table_info(leads)').all<{ name: string }>();
  return new Set((result.results || []).map((column) => column.name));
}

async function countTrashed(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS count FROM leads WHERE deleted_at IS NOT NULL').first<{ count: number }>();
  return Number(row?.count || 0);
}

interface TrashTargetRow {
  id: number;
  event_id?: string;
  quality?: string;
  quality_action_id?: string;
}

// Отбираем реально затронутые заявки до изменения: после него контекст событий
// качества уже не найти, а история не должна записываться по чужим id.
async function selectTargets(db: D1Database, ids: number[], trashed: boolean): Promise<TrashTargetRow[]> {
  const rows: TrashTargetRow[] = [];
  for (const part of chunks(ids)) {
    const placeholders = part.map(() => '?').join(', ');
    const result = await db.prepare(
      `SELECT id, event_id, quality, quality_action_id FROM leads
       WHERE id IN (${placeholders}) AND deleted_at IS ${trashed ? 'NOT NULL' : 'NULL'}`,
    ).bind(...part).all<TrashTargetRow>();
    rows.push(...(result.results || []));
  }
  return rows;
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
  let cancelled = 0;
  for (const part of chunks(Array.from(eventIds))) {
    const placeholders = part.map(() => '?').join(', ');
    const result = await db.prepare(
      `DELETE FROM meta_outbox WHERE id IN (${placeholders}) AND status IN ('pending', 'retry')`,
    ).bind(...part).run() as { meta?: { changes?: number } };
    cancelled += Number(result.meta?.changes || 0);
  }
  return cancelled;
}

// Отмена очереди и журнал — сопутствующая работа. Их сбой не должен выдавать
// уже выполненное удаление за неудачу: администратор увидит предупреждение,
// а не ложную ошибку поверх сделанной операции.
async function cancelQueuedQualityEventsSafely(
  db: D1Database,
  rows: TrashTargetRow[],
  warnings: string[],
): Promise<number> {
  try {
    return await cancelQueuedQualityEvents(db, rows);
  } catch (error) {
    warnings.push(`Очередь событий Meta не очищена: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`);
    return 0;
  }
}

async function auditTrashAction(
  db: D1Database,
  ids: number[],
  type: 'lead_trashed' | 'lead_restored',
  note: string,
  warnings: string[],
): Promise<void> {
  try {
    if (!ids.length || !(await tableExists(db, 'lead_activity'))) return;
    const columnsResult = await db.prepare('PRAGMA table_info(lead_activity)').all<{ name: string }>();
    const columns = new Set((columnsResult.results || []).map((column) => column.name));
    if (!['lead_id', 'type', 'from', 'to', 'note'].every((column) => columns.has(column))) return;

    const names = ['lead_id', 'type', '"from"', '"to"', 'note'];
    const extras: Array<string | number> = [];
    if (columns.has('actor')) { names.push('actor'); extras.push('admin'); }
    if (columns.has('entity_type')) { names.push('entity_type'); extras.push('lead'); }

    for (const part of chunks(ids, 50)) {
      await db.batch(part.map((id) => db.prepare(
        `INSERT INTO lead_activity (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`,
      ).bind(id, type, '', '', note, ...extras)));
    }
  } catch (error) {
    warnings.push(`История изменений не записана: ${error instanceof Error ? error.message : 'неизвестная ошибка'}`);
  }
}

// Окончательное удаление порции заявок вместе со связанными записями.
async function purgeLeads(db: D1Database, ids: number[]): Promise<number> {
  if (!ids.length) return 0;
  const childTables: string[] = [];
  for (const table of LEAD_CHILD_TABLES) {
    if (await tableExists(db, table)) childTables.push(table);
  }

  let purged = 0;
  for (const part of chunks(ids)) {
    const placeholders = part.map(() => '?').join(', ');
    // Связанные записи чистим явно: полагаться на каскад внешних ключей нельзя,
    // он включается настройкой соединения, а не схемой.
    const statements = childTables.map((table) => db
      .prepare(`DELETE FROM ${table} WHERE lead_id IN (${placeholders})`)
      .bind(...part));
    statements.push(db.prepare(`DELETE FROM leads WHERE id IN (${placeholders})`).bind(...part));
    const results = await db.batch(statements);
    purged += Number((results[results.length - 1] as { meta?: { changes?: number } })?.meta?.changes || 0);
  }
  return purged;
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
    const parsedOffset = Number(url.searchParams.get('offset') || 0);
    const offset = Number.isInteger(parsedOffset) && parsedOffset > 0
      ? Math.min(parsedOffset, MAX_TRASH_OFFSET)
      : 0;

    const columns = await leadColumns(env.DB);
    const optional = ['service', 'utm_source', 'submissions_count', 'message']
      .filter((column) => columns.has(column));
    const selected = ['id', 'name', 'email', 'phone', 'telegram_username', 'created_at', 'deleted_at', 'deleted_reason', ...optional];

    // Поиск по корзине: те же поля, что видны в карточке строки.
    const query = String(url.searchParams.get('q') || '').trim().slice(0, 120);
    const where = ['deleted_at IS NOT NULL'];
    const values: Array<string | number> = [];
    if (query) {
      const pattern = `%${escapeLike(query)}%`;
      const searchable = ['name', 'email', 'phone', 'telegram_username', 'deleted_reason']
        .concat(['service', 'message'].filter((column) => columns.has(column)));
      where.push(`(${searchable.map((column) => `${column} LIKE ? ESCAPE '\\'`).join(' OR ')})`);
      values.push(...searchable.map(() => pattern));
    }
    const whereSql = where.join(' AND ');

    const [rows, matchedRow, total] = await Promise.all([
      env.DB.prepare(
        `SELECT ${selected.join(', ')} FROM leads
         WHERE ${whereSql}
         ORDER BY deleted_at DESC, id DESC LIMIT ? OFFSET ?`,
      ).bind(...values, limit, offset).all<Record<string, unknown>>(),
      env.DB.prepare(`SELECT COUNT(*) AS count FROM leads WHERE ${whereSql}`).bind(...values).first<{ count: number }>(),
      countTrashed(env.DB),
    ]);

    return json({
      success: true,
      leads: rows.results || [],
      // `total` — вся корзина, `matched` — сколько подходит под поиск.
      total,
      matched: Number(matchedRow?.count || 0),
      query,
      limit,
      offset,
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
  const warnings: string[] = [];

  try {
    if (action === 'delete') {
      const ids = parseIds(body.ids);
      const reason = normalizeReason(body.reason);
      const affected = await selectTargets(db, ids, false);
      if (!affected.length) {
        return json({ success: true, moved: 0, cancelled_events: 0, trash_total: await countTrashed(db) }, { headers: noStore });
      }

      const affectedIds = affected.map((row) => row.id);
      let moved = 0;
      for (const part of chunks(affectedIds)) {
        const placeholders = part.map(() => '?').join(', ');
        const result = await db.prepare(
          `UPDATE leads SET deleted_at = datetime('now'), deleted_reason = ?, updated_at = datetime('now')
           WHERE id IN (${placeholders}) AND deleted_at IS NULL`,
        ).bind(reason, ...part).run() as { meta?: { changes?: number } };
        moved += Number(result.meta?.changes || 0);
      }

      const cancelled = await cancelQueuedQualityEventsSafely(db, affected, warnings);
      await auditTrashAction(db, affectedIds, 'lead_trashed', reason ? `Заявка убрана в корзину: ${reason}` : 'Заявка убрана в корзину', warnings);

      return json({
        success: true,
        moved,
        cancelled_events: cancelled,
        trash_total: await countTrashed(db),
        warnings,
      }, { headers: noStore });
    }

    if (action === 'restore') {
      const ids = parseIds(body.ids);
      const affected = await selectTargets(db, ids, true);
      if (!affected.length) {
        return json({ success: true, restored: 0, trash_total: await countTrashed(db) }, { headers: noStore });
      }

      const affectedIds = affected.map((row) => row.id);
      let restored = 0;
      for (const part of chunks(affectedIds)) {
        const placeholders = part.map(() => '?').join(', ');
        const result = await db.prepare(
          `UPDATE leads SET deleted_at = NULL, deleted_reason = '', updated_at = datetime('now')
           WHERE id IN (${placeholders}) AND deleted_at IS NOT NULL`,
        ).bind(...part).run() as { meta?: { changes?: number } };
        restored += Number(result.meta?.changes || 0);
      }
      // История пишется только по фактически восстановленным заявкам.
      await auditTrashAction(db, affectedIds, 'lead_restored', 'Заявка восстановлена из корзины', warnings);

      return json({ success: true, restored, trash_total: await countTrashed(db), warnings }, { headers: noStore });
    }

    // Окончательное удаление. Только из корзины: активную заявку стереть нельзя,
    // её сначала нужно осознанно туда положить.
    if (action === 'purge') {
      const doomed = await selectTargets(db, parseIds(body.ids), true);
      if (!doomed.length) {
        return json({ success: true, purged: 0, cancelled_events: 0, remaining: await countTrashed(db) }, { headers: noStore });
      }
      const cancelled = await cancelQueuedQualityEventsSafely(db, doomed, warnings);
      const purged = await purgeLeads(db, doomed.map((row) => row.id));
      return json({
        success: true,
        purged,
        cancelled_events: cancelled,
        remaining: await countTrashed(db),
        warnings,
      }, { headers: noStore });
    }

    // Полная очистка: порциями, пока корзина не опустеет или пока не исчерпан
    // лимит одного запроса. Незакрытый остаток возвращается администратору.
    let purged = 0;
    let cancelled = 0;
    while (purged < MAX_PURGE_PER_REQUEST) {
      const batch = await db.prepare(
        `SELECT id, event_id, quality, quality_action_id FROM leads
         WHERE deleted_at IS NOT NULL ORDER BY id LIMIT ?`,
      ).bind(PURGE_SCAN_BATCH).all<TrashTargetRow>();
      const rows = batch.results || [];
      if (!rows.length) break;

      cancelled += await cancelQueuedQualityEventsSafely(db, rows, warnings);
      const removed = await purgeLeads(db, rows.map((row) => row.id));
      purged += removed;
      // Защита от бесконечного цикла, если строку почему-то не удалось стереть.
      if (removed === 0) {
        warnings.push('Часть заявок не удалось удалить — попробуйте повторить очистку.');
        break;
      }
    }

    return json({
      success: true,
      purged,
      cancelled_events: cancelled,
      remaining: await countTrashed(db),
      warnings,
    }, { headers: noStore });
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update trash',
    }, { status: 400, headers: noStore });
  }
};
