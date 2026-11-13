import { readWonPeriod } from '../../_lib/admin-period-facts';
import { verifyAdminPassword } from '../../_lib/auth';
import { CACHE_CONTROL } from '../../_lib/cache';
import { json } from '../../_lib/http';
import { ACCOUNTING_CURRENCY } from '../../_lib/money';
import { getLeadsColumns, hasLeadSoftDelete } from '../../_lib/leads';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';
import { localTodayIso, sqliteLocalModifier, timezoneOffsetFromRequest } from '../../_lib/local-day';

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
  { from, to }: { from: string; to: string },
  currency: string,
  columns: Set<string>,
  activeCond: string,
  available: { pageStats: boolean; visitors: boolean; spend: boolean },
  localModifier: string,
): Promise<PeriodNumbers> {
  const timeColumn = columns.has('last_submitted_at') ? 'COALESCE(last_submitted_at, created_at)' : 'created_at';
  const qualified = columns.has('quality') ? "COUNT(CASE WHEN quality = 'target' THEN 1 END)" : 'NULL';

  const row = await db.prepare(`
    SELECT COUNT(*) AS leads, ${qualified} AS qualified
    FROM leads
    WHERE date(${timeColumn}, ?) BETWEEN date(?) AND date(?) AND ${activeCond}
  `).bind(localModifier, from, to).first<{ leads: number; qualified: number | null }>();

  const { won, revenue } = await readWonPeriod(db, columns, activeCond, localModifier, from, to, currency);

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

  // Ни одной строки расходов за месяц — расходы не заведены, а не равны нулю.
  // Ноль здесь превращал бы «Прибыль» в выручку, а «Цену заявки» — в 0 $:
  // выдуманные числа. Строка с суммой 0, которую владелец ввёл сам, остаётся
  // честным нулём.
  let spend: number | null = null;
  if (available.spend) {
    const stats = await db.prepare('SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM ad_spend WHERE day >= date(?) AND day <= date(?) AND currency = ?')
      .bind(from, to, currency).first<{ n: number; total: number }>();
    spend = number(stats?.n) > 0 ? round(number(stats?.total)) : null;
  }

  return {
    views,
    visitors,
    leads: number(row?.leads),
    qualified: row?.qualified === null || row?.qualified === undefined ? null : number(row.qualified),
    won,
    revenue,
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
    // Дата берётся по времени владельца: SQL-функция date('now') в SQLite
    // всегда считает по Гринвичу, и с полуночи до пяти утра давала вчера.
    const today = localTodayIso(request);
    const period = normalizePeriod(new URL(request.url).searchParams.get('period'), today.slice(0, 7));
    const bounds = monthBounds(period);
    const from = bounds.from;
    const to = today < bounds.to ? today : bounds.to;

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
    const currency = goal?.currency || ACCOUNTING_CURRENCY;
    const available = { pageStats: hasPageStats, visitors: hasVisitors, spend: hasSpend };
    const localModifier = sqliteLocalModifier(timezoneOffsetFromRequest(request));

    const current = await readPeriod(db, { from, to }, currency, columns, activeCond, available, localModifier);
    const previous = await readPeriod(db, monthBounds(previousPeriod(period)), currency, columns, activeCond, available, localModifier);

    const timeColumn = columns.has('last_submitted_at') ? 'COALESCE(last_submitted_at, created_at)' : 'created_at';
    const sources = columns.has('utm_source')
      ? await db.prepare(`
          SELECT CASE WHEN TRIM(COALESCE(utm_source, '')) = '' THEN 'Без источника' ELSE LOWER(TRIM(utm_source)) END AS source,
            COUNT(*) AS leads,
            ${columns.has('quality') ? "SUM(CASE WHEN quality = 'target' THEN 1 ELSE 0 END)" : 'NULL'} AS qualified
          FROM leads
          WHERE date(${timeColumn}, ?) BETWEEN date(?) AND date(?) AND ${activeCond}
          GROUP BY source ORDER BY leads DESC LIMIT 6
        `).bind(localModifier, from, to).all<{ source: string; leads: number; qualified: number | null }>()
      : { results: [] as Array<{ source: string; leads: number; qualified: number | null }> };

    const pages = hasPageStats
      ? await db.prepare(`
          SELECT page_path, SUM(views) AS views FROM page_stats_daily
          WHERE day >= date(?) AND day <= date(?)
          GROUP BY page_path ORDER BY views DESC LIMIT 6
        `).bind(from, to).all<{ page_path: string; views: number }>()
      : { results: [] as Array<{ page_path: string; views: number }> };

    const articleColumns = await db.prepare('PRAGMA table_info(articles)').all<{ name: string }>();
    const hasArticleStatus = (articleColumns.results || []).some((column) => column.name === 'status');
    const published = (articleColumns.results || []).length > 0
      ? await db.prepare(`
          SELECT COUNT(*) AS total FROM articles
          WHERE published_at <= ? AND date(published_at, ?) BETWEEN date(?) AND date(?)
          ${hasArticleStatus ? "AND status <> 'draft'" : ''}
        `).bind(new Date().toISOString(), localModifier, from, to).first<{ total: number }>()
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
      // Местный день владельца: по нему интерфейс запирает «›» в будущее.
      today,
      isCurrentMonth: today.slice(0, 7) === period,
      through: to,
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
        'Выручка считается по дате выигрыша и суммам сделок. Фактические поступления учитываются в «Финансах». Заявки считаются по местной дате последней заявки контакта.',
        ...(current.revenue === null && current.won ? ['Для итоговой суммы заполните суммы выигранных сделок в валюте отчёта.'] : []),
        current.spend === null
          ? 'Расходы за месяц не заведены, поэтому цена лида и окупаемость не рассчитаны.'
          : `Деньги считаются в ${currency}; суммы в других валютах к ней не приводятся.`,
        ...(today.slice(0, 7) === period ? ['Сравнение с предыдущим месяцем появится после окончания текущего.'] : []),
      ],
    }, { headers: noStore });
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Не удалось собрать отчёт',
    }, { status: 500, headers: noStore });
  }
};
