import { verifyAdminPassword } from '../../_lib/auth';
import { CACHE_CONTROL } from '../../_lib/cache';
import { json } from '../../_lib/http';
import { getLeadsColumns, hasLeadSoftDelete } from '../../_lib/leads';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };

function number(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function normalizePeriod(value: unknown, fallback: string): string {
  const raw = String(value || '').trim().slice(0, 7);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : fallback;
}

function monthBounds(period: string): { from: string; to: string } {
  const [year, month] = period.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(lastDay).padStart(2, '0')}` };
}

function previousPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 2, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function tableExists(db: D1Database, name: string): Promise<boolean> {
  const row = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(name)
    .first<{ name: string }>();
  return Boolean(row?.name);
}

interface PeriodNumbers {
  views: number | null;
  visitors: number | null;
  leads: number;
  qualified: number | null;
  won: number | null;
  revenue: number | null;
  spend: number | null;
}

async function readPeriod(
  db: D1Database,
  period: string,
  currency: string,
  columns: Set<string>,
  activeCond: string,
  available: { pageStats: boolean; visitors: boolean; spend: boolean },
): Promise<PeriodNumbers> {
  const { from, to } = monthBounds(period);
  const timeColumn = columns.has('last_submitted_at') ? 'COALESCE(last_submitted_at, created_at)' : 'created_at';
  const qualified = columns.has('quality') ? "SUM(CASE WHEN quality = 'target' THEN 1 ELSE 0 END)" : 'NULL';
  const won = columns.has('pipeline_stage') ? "SUM(CASE WHEN pipeline_stage = 'won' THEN 1 ELSE 0 END)" : 'NULL';
  const hasRevenue = columns.has('deal_value') && columns.has('deal_currency') && columns.has('pipeline_stage');

  const statement = db.prepare(`
    SELECT COUNT(*) AS leads, ${qualified} AS qualified, ${won} AS won,
      ${hasRevenue ? "SUM(CASE WHEN pipeline_stage = 'won' AND deal_currency = ? THEN COALESCE(deal_value, 0) ELSE 0 END)" : 'NULL'} AS revenue
    FROM leads
    WHERE date(${timeColumn}) >= date(?) AND date(${timeColumn}) <= date(?) AND ${activeCond}
  `);
  const row = hasRevenue
    ? await statement.bind(currency, from, to).first<{ leads: number; qualified: number | null; won: number | null; revenue: number | null }>()
    : await statement.bind(from, to).first<{ leads: number; qualified: number | null; won: number | null; revenue: number | null }>();

  let views: number | null = null;
  if (available.pageStats) {
    const stats = await db.prepare('SELECT COALESCE(SUM(views), 0) AS total FROM page_stats_daily WHERE day >= date(?) AND day <= date(?)')
      .bind(from, to).first<{ total: number }>();
    views = number(stats?.total);
  }

  let visitors: number | null = null;
  if (available.visitors) {
    const stats = await db.prepare('SELECT COUNT(*) AS total FROM visitor_hashes_daily WHERE day >= date(?) AND day <= date(?)')
      .bind(from, to).first<{ total: number }>();
    visitors = number(stats?.total);
  }

  let spend: number | null = null;
  if (available.spend) {
    const stats = await db.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM ad_spend WHERE day >= date(?) AND day <= date(?) AND currency = ?')
      .bind(from, to, currency).first<{ total: number }>();
    spend = round(number(stats?.total));
  }

  return {
    views,
    visitors,
    leads: number(row?.leads),
    qualified: row?.qualified === null || row?.qualified === undefined ? null : number(row.qualified),
    won: row?.won === null || row?.won === undefined ? null : number(row.won),
    revenue: row?.revenue === null || row?.revenue === undefined ? null : round(number(row.revenue)),
    spend,
  };
}

/**
 * Готовый отчёт за месяц: итоги, сравнение с прошлым месяцем, источники и
 * публикации. Собирается из тех же данных, что показывает админка, — чтобы
 * не пересобирать всё это руками, когда нужно подвести черту.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;
  if (!verifyAdminPassword(request.headers.get('X-Admin-Password') || '', env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.DB) {
    return json({ success: false, code: 'D1_NOT_BOUND', error: 'Отчёт строится по D1 и доступен на production.' }, { status: 503, headers: noStore });
  }

  const db = env.DB;
  try {
    const todayRow = await db.prepare("SELECT date('now') AS today").first<{ today: string }>();
    const today = String(todayRow?.today || new Date().toISOString().slice(0, 10));
    const period = normalizePeriod(new URL(request.url).searchParams.get('period'), today.slice(0, 7));
    const { from, to } = monthBounds(period);

    const columns = await getLeadsColumns(db);
    const activeCond = (await hasLeadSoftDelete(db)) ? 'deleted_at IS NULL' : '1=1';
    const [hasPageStats, hasVisitors, hasSpend, hasGoals] = await Promise.all([
      tableExists(db, 'page_stats_daily'),
      tableExists(db, 'visitor_hashes_daily'),
      tableExists(db, 'ad_spend'),
      tableExists(db, 'admin_goals'),
    ]);

    const goal = hasGoals
      ? await db.prepare('SELECT * FROM admin_goals WHERE period = ?').bind(period)
        .first<{ leads_target: number; qualified_target: number; revenue_target: number; spend_cap: number; currency: string }>()
      : null;
    const currency = goal?.currency || 'USD';
    const available = { pageStats: hasPageStats, visitors: hasVisitors, spend: hasSpend };

    const current = await readPeriod(db, period, currency, columns, activeCond, available);
    const previous = await readPeriod(db, previousPeriod(period), currency, columns, activeCond, available);

    const timeColumn = columns.has('last_submitted_at') ? 'COALESCE(last_submitted_at, created_at)' : 'created_at';
    const sources = columns.has('utm_source')
      ? await db.prepare(`
          SELECT CASE WHEN TRIM(COALESCE(utm_source, '')) = '' THEN 'Без источника' ELSE LOWER(TRIM(utm_source)) END AS source,
            COUNT(*) AS leads,
            ${columns.has('quality') ? "SUM(CASE WHEN quality = 'target' THEN 1 ELSE 0 END)" : 'NULL'} AS qualified
          FROM leads
          WHERE date(${timeColumn}) >= date(?) AND date(${timeColumn}) <= date(?) AND ${activeCond}
          GROUP BY source ORDER BY leads DESC LIMIT 6
        `).bind(from, to).all<{ source: string; leads: number; qualified: number | null }>()
      : { results: [] as Array<{ source: string; leads: number; qualified: number | null }> };

    const pages = hasPageStats
      ? await db.prepare(`
          SELECT page_path, SUM(views) AS views FROM page_stats_daily
          WHERE day >= date(?) AND day <= date(?)
          GROUP BY page_path ORDER BY views DESC LIMIT 6
        `).bind(from, to).all<{ page_path: string; views: number }>()
      : { results: [] as Array<{ page_path: string; views: number }> };

    const published = await tableExists(db, 'articles')
      ? await db.prepare(`
          SELECT COUNT(*) AS total FROM articles
          WHERE published_at IS NOT NULL AND date(published_at) >= date(?) AND date(published_at) <= date(?)
        `).bind(from, to).first<{ total: number }>().catch(() => null)
      : null;

    const profit = current.revenue !== null && current.spend !== null ? round(current.revenue - current.spend) : null;
    const cpl = current.spend !== null && current.leads > 0 ? round(current.spend / current.leads) : null;
    const cpq = current.spend !== null && current.qualified ? round(current.spend / current.qualified) : null;
    const romi = current.revenue !== null && current.spend !== null && current.spend > 0
      ? round(((current.revenue - current.spend) / current.spend) * 100, 1)
      : null;

    return json({
      success: true,
      period,
      isCurrentMonth: today.slice(0, 7) === period,
      currency,
      current,
      previous,
      derived: { profit, cpl, cpq, romi },
      goal: goal || null,
      sources: (sources.results || []).map((row) => ({
        source: String(row.source),
        leads: number(row.leads),
        qualified: row.qualified === null || row.qualified === undefined ? null : number(row.qualified),
      })),
      pages: (pages.results || []).map((row) => ({ path: String(row.page_path), views: number(row.views) })),
      publishedArticles: published ? number(published.total) : null,
      notes: [
        'Отчёт собран из тех же данных, что показывает админка: ничего не досчитывается и не округляется в свою пользу.',
        current.spend === null
          ? 'Расходы за месяц не заведены, поэтому цена лида и окупаемость не рассчитаны.'
          : `Деньги считаются в ${currency}; суммы в других валютах к ней не приводятся.`,
        'Если месяц ещё не закончился, числа неполные — сравнение с прошлым месяцем будет нечестным до его конца.',
      ],
    }, { headers: noStore });
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Не удалось собрать отчёт',
    }, { status: 500, headers: noStore });
  }
};
