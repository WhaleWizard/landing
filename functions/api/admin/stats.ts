import { json } from '../../_lib/http';
import { CACHE_CONTROL } from '../../_lib/cache';
import { verifyAdminPassword } from '../../_lib/auth';
import { hasLeadSoftDelete } from '../../_lib/leads';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };

function isMissingTableError(error: unknown): boolean {
  return /no such table/i.test(error instanceof Error ? error.message : String(error));
}

async function safeAll<T>(promise: Promise<{ results?: T[] }>): Promise<T[]> {
  try {
    return (await promise).results || [];
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

async function safeFirst<T>(promise: Promise<T | null>): Promise<T | null> {
  try {
    return await promise;
  } catch (error) {
    if (isMissingTableError(error)) return null;
    throw error;
  }
}

// Сводка для дашборда админки: посещаемость, заявки, здоровье Meta CAPI.
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  if (!verifyAdminPassword(request.headers.get('X-Admin-Password') || '', env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.DB) {
    return json({ success: false, error: 'База D1 не подключена (доступно только на продакшене)' }, { status: 503, headers: noStore });
  }

  try {
    const db = env.DB;
    // Заявки в корзине (миграция 0020) не учитываются в сводке дашборда.
    const activeCond = (await hasLeadSoftDelete(db)) ? 'deleted_at IS NULL' : '1=1';
    const [viewsDaily, uniquesDaily, topPages, viewTotals, leadCounts, recentLeads, outboxPending, capiDay] = await Promise.all([
      // просмотры по дням за 14 дней (для графика и сравнения недель)
      safeAll<{ day: string; views: number }>(db.prepare(
        `SELECT day, SUM(views) AS views FROM page_stats_daily
         WHERE day >= date('now', '-13 day') GROUP BY day ORDER BY day ASC`
      ).all()),
      // уникальные по дням за 14 дней
      safeAll<{ day: string; uniques: number }>(db.prepare(
        `SELECT day, COUNT(*) AS uniques FROM visitor_hashes_daily
         WHERE day >= date('now', '-13 day') GROUP BY day ORDER BY day ASC`
      ).all()),
      // топ страниц за 7 дней
      safeAll<{ page_path: string; views: number }>(db.prepare(
        `SELECT page_path, SUM(views) AS views FROM page_stats_daily
         WHERE day >= date('now', '-6 day') GROUP BY page_path ORDER BY views DESC LIMIT 10`
      ).all()),
      // суммы просмотров: текущие 7 дней и предыдущие 7 дней
      safeFirst<{ current: number; previous: number }>(db.prepare(
        `SELECT
           SUM(CASE WHEN day >= date('now', '-6 day') THEN views ELSE 0 END) AS current,
           SUM(CASE WHEN day < date('now', '-6 day') THEN views ELSE 0 END) AS previous
         FROM page_stats_daily WHERE day >= date('now', '-13 day')`
      ).first()),
      // заявки по статусам + за 7 дней
      safeFirst<{ total: number; fresh: number; week: number }>(db.prepare(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS fresh,
                SUM(CASE WHEN created_at >= datetime('now', '-7 day') THEN 1 ELSE 0 END) AS week
         FROM leads WHERE ${activeCond}`
      ).first()),
      // последние заявки для дашборда
      safeAll<{ id: number; name: string; service: string; budget: string; status: string; created_at: string }>(db.prepare(
        `SELECT id, name, service, budget, status, created_at FROM leads WHERE ${activeCond} ORDER BY id DESC LIMIT 5`
      ).all()),
      // очередь недоставленных событий Meta
      safeFirst<{ pending: number }>(db.prepare(
        "SELECT COUNT(*) AS pending FROM meta_outbox WHERE status = 'pending'"
      ).first()),
      // события CAPI за сутки: отправлено/ошибки
      safeFirst<{ sent: number; failed: number }>(db.prepare(
        `SELECT SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
                SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
         FROM meta_capi_diagnostics WHERE created_at >= datetime('now', '-1 day')`
      ).first()),
    ]);

    const uniquesTotals = await safeFirst<{ current: number; previous: number }>(db.prepare(
      `SELECT
         SUM(CASE WHEN day >= date('now', '-6 day') THEN 1 ELSE 0 END) AS current,
         SUM(CASE WHEN day < date('now', '-6 day') THEN 1 ELSE 0 END) AS previous
       FROM visitor_hashes_daily WHERE day >= date('now', '-13 day')`
    ).first());

    return json({
      success: true,
      viewsDaily,
      uniquesDaily,
      topPages,
      totals: {
        views7: viewTotals?.current || 0,
        views7Prev: viewTotals?.previous || 0,
        uniques7: uniquesTotals?.current || 0,
        uniques7Prev: uniquesTotals?.previous || 0,
        leadsTotal: leadCounts?.total || 0,
        leadsNew: leadCounts?.fresh || 0,
        leads7: leadCounts?.week || 0,
      },
      recentLeads,
      capi: {
        outboxPending: outboxPending?.pending || 0,
        sent24h: capiDay?.sent || 0,
        failed24h: capiDay?.failed || 0,
      },
    }, { headers: noStore });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : 'Failed to load stats' }, { status: 500, headers: noStore });
  }
};
