import { verifyAdminPassword } from '../../_lib/auth';
import { CACHE_CONTROL } from '../../_lib/cache';
import { json } from '../../_lib/http';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };

type DimensionKey = 'page' | 'source' | 'campaign' | 'utm' | 'service' | 'form_id' | 'form_variant';

interface DimensionRow {
  key: string;
  views: number | null;
  visitors: number | null;
  leads: number;
  conversion: number | null;
  submissions: number | null;
  qualified: number | null;
  unqualified: number | null;
  won: number | null;
  revenue: number | null;
  spend: number | null;
  cpl: number | null;
  cpq: number | null;
  romi: number | null;
}

interface DimensionResult {
  key: DimensionKey;
  label: string;
  supported: boolean;
  reason: string | null;
  hasViews: boolean;
  hasSpend: boolean;
  rows: DimensionRow[];
}

interface PeriodTotals {
  visitors: number | null;
  views: number | null;
  leads: number | null;
  submissions: number | null;
  qualified: number | null;
  unqualified: number | null;
  won: number | null;
  revenue: number | null;
  spend: number | null;
}

const EMPTY_TOTALS: PeriodTotals = {
  visitors: null, views: null, leads: null, submissions: null,
  qualified: null, unqualified: null, won: null, revenue: null, spend: null,
};

function boundedDays(request: Request): number {
  const raw = Number(new URL(request.url).searchParams.get('days') || 30);
  if (!Number.isFinite(raw)) return 30;
  return Math.min(Math.max(Math.floor(raw), 1), 90);
}

function number(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentage(part: number, total: number): number | null {
  if (total <= 0) return null;
  return round((part / total) * 100);
}

/** Деление, которое честно возвращает «нет ответа» вместо Infinity и NaN. */
function ratio(part: number | null, total: number | null): number | null {
  if (part === null || total === null || !Number.isFinite(total) || total <= 0) return null;
  return round(part / total);
}

async function tableExists(db: D1Database, name: string): Promise<boolean> {
  const row = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(name)
    .first<{ name: string }>();
  return Boolean(row?.name);
}

async function getColumns(db: D1Database, table: string): Promise<Set<string>> {
  const result = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return new Set((result.results || []).map((row) => row.name));
}

function cleanGroupKey(value: unknown): string {
  const key = String(value || '').trim().replace(/[\r\n\t]+/g, ' ');
  return key ? key.slice(0, 200) : 'Не указано';
}

function normalizedDimensionExpression(column: string): string {
  return `CASE WHEN TRIM(COALESCE(${column}, '')) = '' THEN 'Не указано' ELSE SUBSTR(TRIM(${column}), 1, 200) END`;
}

function sourceExpression(): string {
  return `CASE WHEN TRIM(COALESCE(utm_source, '')) = '' THEN 'Без источника' ELSE LOWER(SUBSTR(TRIM(utm_source), 1, 120)) END`;
}

function campaignExpression(): string {
  return `CASE
    WHEN TRIM(COALESCE(utm_source, '') || COALESCE(utm_campaign, '')) = '' THEN 'Без кампании'
    ELSE SUBSTR(
      LOWER(COALESCE(NULLIF(TRIM(utm_source), ''), '—')) || ' / ' ||
      LOWER(COALESCE(NULLIF(TRIM(utm_campaign), ''), '—')),
      1, 200
    )
  END`;
}

function utmExpression(): string {
  return `CASE
    WHEN TRIM(COALESCE(utm_source, '') || COALESCE(utm_medium, '') || COALESCE(utm_campaign, '')) = '' THEN 'Без UTM'
    ELSE SUBSTR(
      COALESCE(NULLIF(TRIM(utm_source), ''), '—') || ' / ' ||
      COALESCE(NULLIF(TRIM(utm_medium), ''), '—') || ' / ' ||
      COALESCE(NULLIF(TRIM(utm_campaign), ''), '—'),
      1, 200
    )
  END`;
}

interface WonSupport {
  supported: boolean;
  expression: string | null;
  source: string | null;
}

async function detectWonSupport(db: D1Database, columns: Set<string>): Promise<WonSupport> {
  if (columns.has('won')) return { supported: true, expression: 'won = 1', source: 'leads.won' };
  if (columns.has('pipeline_stage')) {
    return { supported: true, expression: "LOWER(pipeline_stage) = 'won'", source: 'leads.pipeline_stage' };
  }
  if (columns.has('stage')) {
    return { supported: true, expression: "LOWER(stage) IN ('won', 'closed_won')", source: 'leads.stage' };
  }
  if (columns.has('deal_status')) {
    return { supported: true, expression: "LOWER(deal_status) IN ('won', 'closed_won')", source: 'leads.deal_status' };
  }
  if (columns.has('status')) {
    const statuses = await db.prepare('SELECT DISTINCT LOWER(status) AS status FROM leads LIMIT 50').all<{ status: string }>();
    const available = new Set((statuses.results || []).map((row) => row.status));
    if (available.has('won') || available.has('closed_won')) {
      return { supported: true, expression: "LOWER(status) IN ('won', 'closed_won')", source: 'leads.status' };
    }
  }
  return { supported: false, expression: null, source: null };
}

interface LeadQueryContext {
  columns: Set<string>;
  won: WonSupport;
  /** Валюта, в которой считаются деньги; смешивать курсы без источника нельзя. */
  currency: string | null;
  activeCondition: string;
  timeColumn: string;
}

function revenueExpression(context: LeadQueryContext): string {
  const { columns, won, currency } = context;
  if (!currency || !won.expression || !columns.has('deal_value') || !columns.has('deal_currency')) return 'NULL';
  return `SUM(CASE WHEN ${won.expression} AND deal_currency = '${currency}' THEN COALESCE(deal_value, 0) ELSE 0 END)`;
}

function leadAggregates(context: LeadQueryContext): string {
  const { columns, won } = context;
  const submissions = columns.has('submissions_count') ? 'SUM(submissions_count)' : 'NULL';
  const qualified = columns.has('quality') ? "SUM(CASE WHEN quality = 'target' THEN 1 ELSE 0 END)" : 'NULL';
  const unqualified = columns.has('quality') ? "SUM(CASE WHEN quality = 'nontarget' THEN 1 ELSE 0 END)" : 'NULL';
  const wonSql = won.expression ? `SUM(CASE WHEN ${won.expression} THEN 1 ELSE 0 END)` : 'NULL';
  return `COUNT(*) AS leads,
    ${submissions} AS submissions,
    ${qualified} AS qualified,
    ${unqualified} AS unqualified,
    ${wonSql} AS won,
    ${revenueExpression(context)} AS revenue`;
}

interface RawAggregateRow {
  leads: number;
  submissions: number | null;
  qualified: number | null;
  unqualified: number | null;
  won: number | null;
  revenue: number | null;
}

function nullableNumber(value: number | null | undefined): number | null {
  return value === null || value === undefined ? null : number(value);
}

async function groupedLeads(
  db: D1Database,
  expression: string,
  window: { from: string; to: string },
  context: LeadQueryContext,
): Promise<DimensionRow[]> {
  const rows = await db.prepare(`
    SELECT ${expression} AS group_key, ${leadAggregates(context)}
    FROM leads
    WHERE date(${context.timeColumn}) >= date(?)
      AND date(${context.timeColumn}) <= date(?)
      AND ${context.activeCondition}
    GROUP BY group_key
    ORDER BY leads DESC, group_key ASC
    LIMIT 200
  `).bind(window.from, window.to).all<RawAggregateRow & { group_key: string }>();

  return (rows.results || []).map((row) => ({
    key: cleanGroupKey(row.group_key),
    views: null,
    visitors: null,
    leads: number(row.leads),
    conversion: null,
    submissions: nullableNumber(row.submissions),
    qualified: nullableNumber(row.qualified),
    unqualified: nullableNumber(row.unqualified),
    won: nullableNumber(row.won),
    revenue: nullableNumber(row.revenue),
    spend: null,
    cpl: null,
    cpq: null,
    romi: null,
  }));
}

async function pageViews(db: D1Database, window: { from: string; to: string }): Promise<Map<string, number>> {
  const rows = await db.prepare(`
    SELECT page_path, SUM(views) AS views
    FROM page_stats_daily
    WHERE day >= date(?) AND day <= date(?)
    GROUP BY page_path
    ORDER BY views DESC
    LIMIT 200
  `).bind(window.from, window.to).all<{ page_path: string; views: number }>();
  return new Map((rows.results || []).map((row) => [cleanGroupKey(row.page_path), number(row.views)]));
}

function mergePageRows(leadRows: DimensionRow[], views: Map<string, number>): DimensionRow[] {
  const merged = new Map<string, DimensionRow>();
  for (const row of leadRows) merged.set(row.key, { ...row, views: views.get(row.key) || 0 });
  for (const [key, count] of views) {
    if (!merged.has(key)) {
      merged.set(key, {
        key,
        views: count,
        visitors: null,
        leads: 0,
        conversion: null,
        submissions: null,
        qualified: null,
        unqualified: null,
        won: null,
        revenue: null,
        spend: null,
        cpl: null,
        cpq: null,
        romi: null,
      });
    }
  }
  return [...merged.values()].sort((a, b) => (b.views || 0) - (a.views || 0) || b.leads - a.leads);
}

/**
 * Расход по строке разреза складывается с показателями лидов: цена лида,
 * цена целевого лида и окупаемость появляются только там, где расход
 * действительно сопоставлен ключу, а не размазан по всему аккаунту.
 */
function applySpend(rows: DimensionRow[], spend: Map<string, number>): DimensionRow[] {
  const enriched = rows.map((row) => ({ ...row, spend: spend.has(row.key) ? round(spend.get(row.key) || 0) : null }));
  for (const [key, amount] of spend) {
    if (enriched.some((row) => row.key === key)) continue;
    enriched.push({
      key,
      views: null,
      visitors: null,
      leads: 0,
      conversion: null,
      submissions: null,
      qualified: null,
      unqualified: null,
      won: null,
      revenue: null,
      spend: round(amount),
      cpl: null,
      cpq: null,
      romi: null,
    });
  }
  return enriched;
}

function withDerivedMetrics(rows: DimensionRow[]): DimensionRow[] {
  return rows.map((row) => {
    const cpl = ratio(row.spend, row.leads || 0);
    const cpq = ratio(row.spend, row.qualified);
    const romi = row.spend !== null && row.spend > 0 && row.revenue !== null
      ? round(((row.revenue - row.spend) / row.spend) * 100, 1)
      : null;
    return {
      ...row,
      conversion: row.views === null || row.views <= 0 ? null : percentage(row.leads, row.views),
      cpl,
      cpq,
      romi,
    };
  });
}

function sortRows(rows: DimensionRow[]): DimensionRow[] {
  return [...rows]
    .sort((a, b) => b.leads - a.leads || (b.views || 0) - (a.views || 0) || a.key.localeCompare(b.key, 'ru'))
    .slice(0, 100);
}

function unavailable(key: DimensionKey, label: string, reason: string): DimensionResult {
  return { key, label, supported: false, reason, hasViews: false, hasSpend: false, rows: [] };
}

/** Границы периода считаются один раз, чтобы прошлый период был ровно такой же длины. */
function periodWindows(days: number, todayIso: string): { current: { from: string; to: string }; previous: { from: string; to: string } } {
  const today = new Date(`${todayIso}T00:00:00Z`);
  const shift = (offsetDays: number) => new Date(today.getTime() + offsetDays * 86_400_000).toISOString().slice(0, 10);
  return {
    current: { from: shift(-(days - 1)), to: shift(0) },
    previous: { from: shift(-(days * 2 - 1)), to: shift(-days) },
  };
}

async function readTotals(
  db: D1Database,
  window: { from: string; to: string },
  context: LeadQueryContext,
  availability: { leads: boolean; pageStats: boolean; visitors: boolean },
): Promise<PeriodTotals> {
  const totals: PeriodTotals = { ...EMPTY_TOTALS };

  if (availability.pageStats) {
    const row = await db.prepare('SELECT COALESCE(SUM(views), 0) AS total FROM page_stats_daily WHERE day >= date(?) AND day <= date(?)')
      .bind(window.from, window.to).first<{ total: number }>();
    totals.views = number(row?.total);
  }
  if (availability.visitors) {
    const row = await db.prepare('SELECT COUNT(*) AS total FROM visitor_hashes_daily WHERE day >= date(?) AND day <= date(?)')
      .bind(window.from, window.to).first<{ total: number }>();
    totals.visitors = number(row?.total);
  }
  if (availability.leads) {
    const row = await db.prepare(`
      SELECT ${leadAggregates(context)}
      FROM leads
      WHERE date(${context.timeColumn}) >= date(?) AND date(${context.timeColumn}) <= date(?)
        AND ${context.activeCondition}
    `).bind(window.from, window.to).first<RawAggregateRow>();
    totals.leads = number(row?.leads);
    totals.submissions = nullableNumber(row?.submissions);
    totals.qualified = nullableNumber(row?.qualified);
    totals.unqualified = nullableNumber(row?.unqualified);
    totals.won = nullableNumber(row?.won);
    totals.revenue = row?.revenue === null || row?.revenue === undefined ? null : round(number(row.revenue));
  }
  return totals;
}

async function readSpendTotal(db: D1Database, window: { from: string; to: string }, currency: string): Promise<number> {
  const row = await db.prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM ad_spend WHERE day >= date(?) AND day <= date(?) AND currency = ?')
    .bind(window.from, window.to, currency).first<{ total: number }>();
  return round(number(row?.total));
}

async function readSpendByKey(
  db: D1Database,
  window: { from: string; to: string },
  currency: string,
  mode: 'source' | 'campaign',
): Promise<Map<string, number>> {
  const expression = mode === 'source'
    ? "CASE WHEN TRIM(source) = '' THEN 'Без источника' ELSE LOWER(TRIM(source)) END"
    : `CASE
        WHEN TRIM(source) = '' AND TRIM(campaign) = '' THEN 'Без кампании'
        ELSE LOWER(COALESCE(NULLIF(TRIM(source), ''), '—')) || ' / ' || LOWER(COALESCE(NULLIF(TRIM(campaign), ''), '—'))
      END`;
  const rows = await db.prepare(`
    SELECT ${expression} AS group_key, COALESCE(SUM(amount), 0) AS amount
    FROM ad_spend
    WHERE day >= date(?) AND day <= date(?) AND currency = ?
    GROUP BY group_key
    LIMIT 200
  `).bind(window.from, window.to, currency).all<{ group_key: string; amount: number }>();
  return new Map((rows.results || []).map((row) => [cleanGroupKey(row.group_key), number(row.amount)]));
}

/**
 * Валюта отчёта: та, в которой больше всего расходов, иначе — валюта
 * выигранных сделок. Складывать разные валюты без курса нельзя, поэтому
 * остальные показываются отдельным предупреждением, а не суммируются.
 */
async function detectCurrency(
  db: D1Database,
  window: { from: string; to: string },
  context: LeadQueryContext,
  spendAvailable: boolean,
): Promise<{ currency: string | null; otherCurrencies: string[] }> {
  const found = new Map<string, number>();

  if (spendAvailable) {
    const rows = await db.prepare(`
      SELECT currency, COALESCE(SUM(amount), 0) AS amount FROM ad_spend
      WHERE day >= date(?) AND day <= date(?) GROUP BY currency ORDER BY amount DESC LIMIT 10
    `).bind(window.from, window.to).all<{ currency: string; amount: number }>();
    for (const row of rows.results || []) found.set(row.currency, number(row.amount));
    if (found.size) {
      const sorted = [...found.entries()].sort((a, b) => b[1] - a[1]);
      return { currency: sorted[0][0], otherCurrencies: sorted.slice(1).map(([currency]) => currency) };
    }
  }

  if (context.won.expression && context.columns.has('deal_value') && context.columns.has('deal_currency')) {
    const rows = await db.prepare(`
      SELECT deal_currency AS currency, COALESCE(SUM(deal_value), 0) AS amount FROM leads
      WHERE ${context.won.expression} AND deal_value IS NOT NULL AND ${context.activeCondition}
        AND date(${context.timeColumn}) >= date(?) AND date(${context.timeColumn}) <= date(?)
      GROUP BY deal_currency ORDER BY amount DESC LIMIT 10
    `).bind(window.from, window.to).all<{ currency: string; amount: number }>();
    const sorted = (rows.results || []).filter((row) => number(row.amount) > 0);
    if (sorted.length) {
      return { currency: String(sorted[0].currency || 'USD'), otherCurrencies: sorted.slice(1).map((row) => String(row.currency)) };
    }
  }

  return { currency: null, otherCurrencies: [] };
}

interface SeriesPoint {
  day: string;
  views: number | null;
  visitors: number | null;
  leads: number | null;
  qualified: number | null;
}

async function readSeries(
  db: D1Database,
  window: { from: string; to: string },
  days: number,
  context: LeadQueryContext,
  availability: { leads: boolean; pageStats: boolean; visitors: boolean },
): Promise<SeriesPoint[]> {
  const points = new Map<string, SeriesPoint>();
  const start = new Date(`${window.from}T00:00:00Z`).getTime();
  for (let index = 0; index < days; index += 1) {
    const day = new Date(start + index * 86_400_000).toISOString().slice(0, 10);
    points.set(day, {
      day,
      views: availability.pageStats ? 0 : null,
      visitors: availability.visitors ? 0 : null,
      leads: availability.leads ? 0 : null,
      qualified: availability.leads && context.columns.has('quality') ? 0 : null,
    });
  }

  if (availability.pageStats) {
    const rows = await db.prepare(`
      SELECT day, COALESCE(SUM(views), 0) AS views FROM page_stats_daily
      WHERE day >= date(?) AND day <= date(?) GROUP BY day
    `).bind(window.from, window.to).all<{ day: string; views: number }>();
    for (const row of rows.results || []) {
      const point = points.get(String(row.day));
      if (point) point.views = number(row.views);
    }
  }
  if (availability.visitors) {
    const rows = await db.prepare(`
      SELECT day, COUNT(*) AS visitors FROM visitor_hashes_daily
      WHERE day >= date(?) AND day <= date(?) GROUP BY day
    `).bind(window.from, window.to).all<{ day: string; visitors: number }>();
    for (const row of rows.results || []) {
      const point = points.get(String(row.day));
      if (point) point.visitors = number(row.visitors);
    }
  }
  if (availability.leads) {
    const qualified = context.columns.has('quality') ? "SUM(CASE WHEN quality = 'target' THEN 1 ELSE 0 END)" : 'NULL';
    const rows = await db.prepare(`
      SELECT date(${context.timeColumn}) AS day, COUNT(*) AS leads, ${qualified} AS qualified
      FROM leads
      WHERE date(${context.timeColumn}) >= date(?) AND date(${context.timeColumn}) <= date(?)
        AND ${context.activeCondition}
      GROUP BY day
    `).bind(window.from, window.to).all<{ day: string; leads: number; qualified: number | null }>();
    for (const row of rows.results || []) {
      const point = points.get(String(row.day));
      if (!point) continue;
      point.leads = number(row.leads);
      point.qualified = nullableNumber(row.qualified);
    }
  }

  return [...points.values()];
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;
  if (!verifyAdminPassword(request.headers.get('X-Admin-Password') || '', env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }

  const days = boundedDays(request);
  if (!env.DB) {
    return json({
      success: false,
      code: 'D1_NOT_BOUND',
      error: 'Атрибуция строится по D1 и доступна в production после подключения биндинга DB.',
      days,
    }, { status: 503, headers: noStore });
  }

  try {
    const db = env.DB;
    const todayRow = await db.prepare("SELECT date('now') AS today").first<{ today: string }>();
    const windows = periodWindows(days, String(todayRow?.today || new Date().toISOString().slice(0, 10)));

    const [leadsTableExists, pageStatsTableExists, visitorsTableExists, spendTableExists] = await Promise.all([
      tableExists(db, 'leads'),
      tableExists(db, 'page_stats_daily'),
      tableExists(db, 'visitor_hashes_daily'),
      tableExists(db, 'ad_spend'),
    ]);
    const [columns, pageStatsColumns, visitorColumns] = await Promise.all([
      leadsTableExists ? getColumns(db, 'leads') : Promise.resolve(new Set<string>()),
      pageStatsTableExists ? getColumns(db, 'page_stats_daily') : Promise.resolve(new Set<string>()),
      visitorsTableExists ? getColumns(db, 'visitor_hashes_daily') : Promise.resolve(new Set<string>()),
    ]);

    const availability = {
      leads: leadsTableExists && columns.has('created_at'),
      pageStats: pageStatsTableExists && ['day', 'page_path', 'views'].every((column) => pageStatsColumns.has(column)),
      visitors: visitorsTableExists && ['day', 'visitor_hash'].every((column) => visitorColumns.has(column)),
    };

    const won = availability.leads
      ? await detectWonSupport(db, columns)
      : { supported: false, expression: null, source: null };

    const baseContext: LeadQueryContext = {
      columns,
      won,
      currency: null,
      activeCondition: columns.has('deleted_at') ? 'deleted_at IS NULL' : '1=1',
      timeColumn: columns.has('last_submitted_at') ? 'COALESCE(last_submitted_at, created_at)' : 'created_at',
    };

    const { currency, otherCurrencies } = availability.leads || spendTableExists
      ? await detectCurrency(db, windows.current, baseContext, spendTableExists)
      : { currency: null, otherCurrencies: [] };
    const context: LeadQueryContext = { ...baseContext, currency };

    const [summary, previous] = await Promise.all([
      readTotals(db, windows.current, context, availability),
      readTotals(db, windows.previous, context, availability),
    ]);

    if (spendTableExists && currency) {
      summary.spend = await readSpendTotal(db, windows.current, currency);
      previous.spend = await readSpendTotal(db, windows.previous, currency);
    }

    const series = await readSeries(db, windows.current, days, context, availability);

    let leadCoverage = { pagePath: null as number | null, utm: null as number | null, marketingConsent: null as number | null };
    if (availability.leads) {
      const coverageExpressions = [
        columns.has('page_path') ? "SUM(CASE WHEN TRIM(COALESCE(page_path, '')) != '' THEN 1 ELSE 0 END)" : 'NULL',
        columns.has('utm_source')
          ? "SUM(CASE WHEN TRIM(COALESCE(utm_source, '') || COALESCE(utm_medium, '') || COALESCE(utm_campaign, '')) != '' THEN 1 ELSE 0 END)"
          : 'NULL',
        columns.has('marketing_consent') ? 'SUM(CASE WHEN marketing_consent = 1 THEN 1 ELSE 0 END)' : 'NULL',
      ];
      const coverage = await db.prepare(`
        SELECT ${coverageExpressions[0]} AS with_page, ${coverageExpressions[1]} AS with_utm,
          ${coverageExpressions[2]} AS with_consent
        FROM leads
        WHERE date(${context.timeColumn}) >= date(?) AND date(${context.timeColumn}) <= date(?)
          AND ${context.activeCondition}
      `).bind(windows.current.from, windows.current.to)
        .first<{ with_page: number | null; with_utm: number | null; with_consent: number | null }>();
      const totalLeads = summary.leads || 0;
      leadCoverage = {
        pagePath: coverage?.with_page === null || coverage?.with_page === undefined ? null : percentage(number(coverage.with_page), totalLeads),
        utm: coverage?.with_utm === null || coverage?.with_utm === undefined ? null : percentage(number(coverage.with_utm), totalLeads),
        marketingConsent: coverage?.with_consent === null || coverage?.with_consent === undefined ? null : percentage(number(coverage.with_consent), totalLeads),
      };
    }

    const spendReady = spendTableExists && Boolean(currency);
    const dimensions: DimensionResult[] = [];

    if (availability.leads && columns.has('page_path')) {
      const rows = await groupedLeads(db, normalizedDimensionExpression('page_path'), windows.current, context);
      const views = availability.pageStats ? await pageViews(db, windows.current) : new Map<string, number>();
      dimensions.push({
        key: 'page',
        label: 'Страница',
        supported: true,
        reason: availability.pageStats ? null : 'Просмотры недоступны: нет таблицы page_stats_daily.',
        hasViews: availability.pageStats,
        hasSpend: false,
        rows: sortRows(withDerivedMetrics(availability.pageStats ? mergePageRows(rows, views) : rows)),
      });
    } else {
      dimensions.push(unavailable('page', 'Страница', 'В таблице leads нет page_path или сама таблица не создана.'));
    }

    if (availability.leads && columns.has('utm_source')) {
      const rows = await groupedLeads(db, sourceExpression(), windows.current, context);
      const spend = spendReady ? await readSpendByKey(db, windows.current, currency as string, 'source') : new Map<string, number>();
      dimensions.push({
        key: 'source',
        label: 'Источник',
        supported: true,
        reason: spendReady
          ? 'Расход подставляется по совпадению названия источника с utm_source заявки.'
          : 'Заполните расходы, чтобы увидеть цену лида и окупаемость по источникам.',
        hasViews: false,
        hasSpend: spendReady,
        rows: sortRows(withDerivedMetrics(applySpend(rows, spend))),
      });

      const campaignRows = await groupedLeads(db, campaignExpression(), windows.current, context);
      const campaignSpend = spendReady ? await readSpendByKey(db, windows.current, currency as string, 'campaign') : new Map<string, number>();
      dimensions.push({
        key: 'campaign',
        label: 'Кампания',
        supported: columns.has('utm_campaign'),
        reason: columns.has('utm_campaign')
          ? 'Ключ строки — «источник / кампания»; расход берётся из строк с той же парой.'
          : 'В таблице leads нет utm_campaign — примените миграцию 0011.',
        hasViews: false,
        hasSpend: spendReady,
        rows: columns.has('utm_campaign') ? sortRows(withDerivedMetrics(applySpend(campaignRows, campaignSpend))) : [],
      });
    } else {
      dimensions.push(unavailable('source', 'Источник', 'Примените миграцию 0011: UTM-поля ещё не сохранены в leads.'));
      dimensions.push(unavailable('campaign', 'Кампания', 'Примените миграцию 0011: UTM-поля ещё не сохранены в leads.'));
    }

    if (availability.leads && ['utm_source', 'utm_medium', 'utm_campaign'].every((column) => columns.has(column))) {
      dimensions.push({
        key: 'utm',
        label: 'UTM полностью',
        supported: true,
        reason: 'UTM показывает последний известный источник для дедуплицированного контакта.',
        hasViews: false,
        hasSpend: false,
        rows: sortRows(withDerivedMetrics(await groupedLeads(db, utmExpression(), windows.current, context))),
      });
    } else {
      dimensions.push(unavailable('utm', 'UTM полностью', 'Примените миграцию 0011: UTM-поля ещё не сохранены в leads.'));
    }

    if (availability.leads && columns.has('service')) {
      dimensions.push({
        key: 'service',
        label: 'Услуга',
        supported: true,
        reason: 'Просмотры нельзя честно связать с услугой: page_stats_daily не хранит этот признак.',
        hasViews: false,
        hasSpend: false,
        rows: sortRows(withDerivedMetrics(await groupedLeads(db, normalizedDimensionExpression('service'), windows.current, context))),
      });
    } else {
      dimensions.push(unavailable('service', 'Услуга', 'В таблице leads нет поля service.'));
    }

    for (const [key, label] of [['form_id', 'Форма'], ['form_variant', 'Вариант формы']] as const) {
      if (availability.leads && columns.has(key)) {
        dimensions.push({
          key,
          label,
          supported: true,
          reason: 'Заявки до применения миграции 0022 попадают в строку «Не указано»: тогда признак формы ещё не сохранялся.',
          hasViews: false,
          hasSpend: false,
          rows: sortRows(withDerivedMetrics(await groupedLeads(db, normalizedDimensionExpression(key), windows.current, context))),
        });
      } else {
        dimensions.push(unavailable(
          key,
          label,
          `Примените миграцию 0022_leads_form_source.sql — поле ${key} приходит с форм сайта, но пока не сохраняется в leads.`,
        ));
      }
    }

    const limitations = [
      'Лиды считаются по дедуплицированным контактам в leads. submissions_count — накопленный счётчик у контактов, активных в выбранном периоде; без журнала отправок его нельзя честно разложить по датам.',
      'Целевой, нецелевой и выигранный — текущие состояния среди лидов выбранного периода, а не число изменений этих состояний внутри периода.',
      'Повторная заявка обновляет страницу, услугу и UTM контакта, поэтому модель атрибуции — последний известный источник, а не история касаний.',
      'Конверсия страницы — заявки этой страницы к её просмотрам за тот же период; посетитель мог прийти на одну страницу, а оставить заявку на другой.',
      '«Дневные уникальные» — сумма уникальных посетителей за каждый день периода: один человек может учитываться снова в другой день. visitor_hashes_daily намеренно не хранит страницу или рекламные метки.',
      'Просмотры по услуге, источнику и UTM не вычисляются: агрегированная статистика страниц не содержит эти измерения.',
      won.supported
        ? `Сделки «выиграно» читаются из ${won.source}.`
        : 'Этап «выиграно» не показывается числом: в текущей схеме leads нет однозначного статуса сделки.',
      spendReady
        ? `Расходы берутся из введённых вручную строк ad_spend и сопоставляются по названию источника. Всё считается в ${currency}.`
        : 'Расходы, цена лида и окупаемость не рассчитываются: в ad_spend нет данных за период.',
      ...(otherCurrencies.length
        ? [`В периоде встречаются и другие валюты (${otherCurrencies.join(', ')}). Курсов в системе нет, поэтому они не суммируются с ${currency}.`]
        : []),
      ...(leadsTableExists && !availability.leads
        ? ['Таблица leads существует, но в ней нет обязательного created_at; показатели лидов отключены до исправления схемы.']
        : []),
      ...(pageStatsTableExists && !availability.pageStats
        ? ['Таблица page_stats_daily существует не полностью; просмотры отключены до исправления схемы.']
        : []),
      ...(visitorsTableExists && !availability.visitors
        ? ['Таблица visitor_hashes_daily существует не полностью; посетители отключены до исправления схемы.']
        : []),
    ];

    return json({
      success: true,
      checkedAt: new Date().toISOString(),
      days,
      period: windows.current,
      previousPeriod: windows.previous,
      currency,
      summary,
      previous,
      series,
      dimensions,
      coverage: {
        tables: { leads: availability.leads, pageStats: availability.pageStats, visitors: availability.visitors, spend: spendTableExists },
        qualityAvailable: availability.leads && columns.has('quality'),
        wonAvailable: won.supported,
        wonSource: won.source,
        submissionsAvailable: availability.leads && columns.has('submissions_count'),
        revenueAvailable: Boolean(currency) && columns.has('deal_value'),
        spendAvailable: spendReady,
        leadFields: {
          pagePath: availability.leads && columns.has('page_path'),
          utm: availability.leads && columns.has('utm_source'),
          formId: availability.leads && columns.has('form_id'),
          formVariant: availability.leads && columns.has('form_variant'),
          marketingConsent: availability.leads && columns.has('marketing_consent'),
        },
        leadRates: leadCoverage,
        model: 'last_known_touch_on_deduplicated_contact',
      },
      limitations,
    }, { headers: noStore });
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Не удалось построить атрибуцию',
      days,
    }, { status: 500, headers: noStore });
  }
};
