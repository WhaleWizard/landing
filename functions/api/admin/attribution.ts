import { verifyAdminPassword } from '../../_lib/auth';
import { CACHE_CONTROL } from '../../_lib/cache';
import { json } from '../../_lib/http';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };

type DimensionKey = 'page' | 'service' | 'utm' | 'form_id' | 'form_variant';

interface DimensionRow {
  key: string;
  views: number | null;
  visitors: number | null;
  leads: number;
  submissions: number | null;
  qualified: number | null;
  unqualified: number | null;
  won: number | null;
}

interface DimensionResult {
  key: DimensionKey;
  label: string;
  supported: boolean;
  reason: string | null;
  rows: DimensionRow[];
}

function boundedDays(request: Request): number {
  const raw = Number(new URL(request.url).searchParams.get('days') || 30);
  if (!Number.isFinite(raw)) return 30;
  return Math.min(Math.max(Math.floor(raw), 1), 90);
}

function number(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percentage(part: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((part / total) * 10_000) / 100;
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

async function groupedLeads(
  db: D1Database,
  expression: string,
  modifier: string,
  columns: Set<string>,
  won: WonSupport,
): Promise<DimensionRow[]> {
  const createdColumn = columns.has('last_submitted_at') ? 'COALESCE(last_submitted_at, created_at)' : 'created_at';
  const submissionsExpression = columns.has('submissions_count') ? 'SUM(submissions_count)' : 'NULL';
  const qualifiedExpression = columns.has('quality')
    ? "SUM(CASE WHEN quality = 'target' THEN 1 ELSE 0 END)"
    : 'NULL';
  const unqualifiedExpression = columns.has('quality')
    ? "SUM(CASE WHEN quality = 'nontarget' THEN 1 ELSE 0 END)"
    : 'NULL';
  const wonExpression = won.expression ? `SUM(CASE WHEN ${won.expression} THEN 1 ELSE 0 END)` : 'NULL';

  const rows = await db.prepare(`
    SELECT
      ${expression} AS group_key,
      COUNT(*) AS leads,
      ${submissionsExpression} AS submissions,
      ${qualifiedExpression} AS qualified,
      ${unqualifiedExpression} AS unqualified,
      ${wonExpression} AS won
    FROM leads
    WHERE date(${createdColumn}) >= date('now', ?)
    GROUP BY group_key
    ORDER BY leads DESC, group_key ASC
    LIMIT 50
  `).bind(modifier).all<{
    group_key: string; leads: number; submissions: number | null;
    qualified: number | null; unqualified: number | null; won: number | null;
  }>();

  return (rows.results || []).map((row) => ({
    key: cleanGroupKey(row.group_key),
    views: null,
    visitors: null,
    leads: number(row.leads),
    submissions: row.submissions === null ? null : number(row.submissions),
    qualified: row.qualified === null ? null : number(row.qualified),
    unqualified: row.unqualified === null ? null : number(row.unqualified),
    won: row.won === null ? null : number(row.won),
  }));
}

async function pageViews(db: D1Database, modifier: string): Promise<Map<string, number>> {
  const rows = await db.prepare(`
    SELECT page_path, SUM(views) AS views
    FROM page_stats_daily
    WHERE day >= date('now', ?)
    GROUP BY page_path
    ORDER BY views DESC
    LIMIT 100
  `).bind(modifier).all<{ page_path: string; views: number }>();
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
        submissions: null,
        qualified: null,
        unqualified: null,
        won: null,
      });
    }
  }
  return [...merged.values()]
    .sort((a, b) => (b.views || 0) - (a.views || 0) || b.leads - a.leads)
    .slice(0, 50);
}

function unavailable(key: DimensionKey, label: string, reason: string): DimensionResult {
  return { key, label, supported: false, reason, rows: [] };
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
    const [leadsTableExists, pageStatsTableExists, visitorsTableExists] = await Promise.all([
      tableExists(db, 'leads'),
      tableExists(db, 'page_stats_daily'),
      tableExists(db, 'visitor_hashes_daily'),
    ]);
    const [columns, pageStatsColumns, visitorColumns] = await Promise.all([
      leadsTableExists ? getColumns(db, 'leads') : Promise.resolve(new Set<string>()),
      pageStatsTableExists ? getColumns(db, 'page_stats_daily') : Promise.resolve(new Set<string>()),
      visitorsTableExists ? getColumns(db, 'visitor_hashes_daily') : Promise.resolve(new Set<string>()),
    ]);
    const leadsAvailable = leadsTableExists && columns.has('created_at');
    const pageStatsAvailable = pageStatsTableExists
      && ['day', 'page_path', 'views'].every((column) => pageStatsColumns.has(column));
    const visitorsAvailable = visitorsTableExists
      && ['day', 'visitor_hash'].every((column) => visitorColumns.has(column));
    const won = leadsAvailable ? await detectWonSupport(db, columns) : { supported: false, expression: null, source: null };
    const modifier = `-${days - 1} day`;
    const leadTime = columns.has('last_submitted_at') ? 'COALESCE(last_submitted_at, created_at)' : 'created_at';

    let summary = {
      visitors: null as number | null,
      views: null as number | null,
      leads: null as number | null,
      submissions: null as number | null,
      qualified: null as number | null,
      unqualified: null as number | null,
      won: null as number | null,
    };

    let leadCoverage = {
      pagePath: null as number | null,
      utm: null as number | null,
      marketingConsent: null as number | null,
    };

    if (pageStatsAvailable) {
      const row = await db.prepare("SELECT COALESCE(SUM(views), 0) AS total FROM page_stats_daily WHERE day >= date('now', ?)")
        .bind(modifier).first<{ total: number }>();
      summary.views = number(row?.total);
    }
    if (visitorsAvailable) {
      const row = await db.prepare("SELECT COUNT(*) AS total FROM visitor_hashes_daily WHERE day >= date('now', ?)")
        .bind(modifier).first<{ total: number }>();
      summary.visitors = number(row?.total);
    }
    if (leadsAvailable) {
      const submissions = columns.has('submissions_count') ? 'SUM(submissions_count)' : 'NULL';
      const qualified = columns.has('quality') ? "SUM(CASE WHEN quality = 'target' THEN 1 ELSE 0 END)" : 'NULL';
      const unqualified = columns.has('quality') ? "SUM(CASE WHEN quality = 'nontarget' THEN 1 ELSE 0 END)" : 'NULL';
      const wonSql = won.expression ? `SUM(CASE WHEN ${won.expression} THEN 1 ELSE 0 END)` : 'NULL';
      const row = await db.prepare(`
        SELECT COUNT(*) AS leads, ${submissions} AS submissions,
          ${qualified} AS qualified, ${unqualified} AS unqualified, ${wonSql} AS won
        FROM leads WHERE date(${leadTime}) >= date('now', ?)
      `).bind(modifier).first<{
        leads: number; submissions: number | null; qualified: number | null;
        unqualified: number | null; won: number | null;
      }>();
      summary = {
        ...summary,
        leads: number(row?.leads),
        submissions: row?.submissions === null || row?.submissions === undefined ? null : number(row.submissions),
        qualified: row?.qualified === null || row?.qualified === undefined ? null : number(row.qualified),
        unqualified: row?.unqualified === null || row?.unqualified === undefined ? null : number(row.unqualified),
        won: row?.won === null || row?.won === undefined ? null : number(row.won),
      };

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
        FROM leads WHERE date(${leadTime}) >= date('now', ?)
      `).bind(modifier).first<{ with_page: number | null; with_utm: number | null; with_consent: number | null }>();
      const totalLeads = summary.leads || 0;
      leadCoverage = {
        pagePath: coverage?.with_page === null || coverage?.with_page === undefined ? null : percentage(number(coverage.with_page), totalLeads),
        utm: coverage?.with_utm === null || coverage?.with_utm === undefined ? null : percentage(number(coverage.with_utm), totalLeads),
        marketingConsent: coverage?.with_consent === null || coverage?.with_consent === undefined ? null : percentage(number(coverage.with_consent), totalLeads),
      };
    }

    const dimensions: DimensionResult[] = [];
    if (leadsAvailable && columns.has('page_path')) {
      const rows = await groupedLeads(db, normalizedDimensionExpression('page_path'), modifier, columns, won);
      const views = pageStatsAvailable ? await pageViews(db, modifier) : new Map<string, number>();
      dimensions.push({
        key: 'page', label: 'Страница', supported: true,
        reason: pageStatsAvailable ? null : 'Просмотры недоступны: нет таблицы page_stats_daily.',
        rows: pageStatsAvailable ? mergePageRows(rows, views) : rows,
      });
    } else {
      dimensions.push(unavailable('page', 'Страница', 'В таблице leads нет page_path или сама таблица не создана.'));
    }

    if (leadsAvailable && columns.has('service')) {
      dimensions.push({
        key: 'service', label: 'Услуга', supported: true,
        reason: 'Просмотры нельзя честно связать с услугой: page_stats_daily не хранит этот признак.',
        rows: await groupedLeads(db, normalizedDimensionExpression('service'), modifier, columns, won),
      });
    } else {
      dimensions.push(unavailable('service', 'Услуга', 'В таблице leads нет поля service.'));
    }

    if (leadsAvailable && ['utm_source', 'utm_medium', 'utm_campaign'].every((column) => columns.has(column))) {
      dimensions.push({
        key: 'utm', label: 'UTM', supported: true,
        reason: 'UTM показывает последний известный источник для дедуплицированного контакта.',
        rows: await groupedLeads(db, utmExpression(), modifier, columns, won),
      });
    } else {
      dimensions.push(unavailable('utm', 'UTM', 'Примените миграцию 0011: UTM-поля ещё не сохранены в leads.'));
    }

    for (const [key, label] of [['form_id', 'Форма'], ['form_variant', 'Вариант формы']] as const) {
      if (leadsAvailable && columns.has(key)) {
        dimensions.push({
          key, label, supported: true, reason: null,
          rows: await groupedLeads(db, normalizedDimensionExpression(key), modifier, columns, won),
        });
      } else {
        dimensions.push(unavailable(
          key,
          label,
          `Поле ${key} есть в диагностике событий, но пока не хранится в leads. Считать попытки диагностики как уникальные лиды было бы неточно.`,
        ));
      }
    }

    const limitations = [
      'Лиды считаются по дедуплицированным контактам в leads. submissions_count — накопленный счётчик у контактов, активных в выбранном периоде; без журнала отправок его нельзя честно разложить по датам.',
      'Целевой, нецелевой и выигранный — текущие состояния среди лидов выбранного периода, а не число изменений этих состояний внутри периода.',
      'Повторная заявка обновляет страницу, услугу и UTM контакта, поэтому модель атрибуции — последний известный источник, а не история касаний.',
      'Покрытие согласием также отражает последнее сохранённое значение у дедуплицированного контакта.',
      '«Дневные уникальные» — сумма уникальных посетителей за каждый день периода: один человек может учитываться снова в другой день. visitor_hashes_daily намеренно не хранит страницу или рекламные метки.',
      'Просмотры по услуге и UTM не вычисляются: агрегированная статистика страниц не содержит эти измерения.',
      won.supported
        ? `Сделки «выиграно» читаются из ${won.source}.`
        : 'Этап «выиграно» не показывается числом: в текущей схеме leads нет однозначного статуса сделки.',
      'Расходы, доход и окупаемость не рассчитываются, пока нет надёжного источника этих данных.',
      ...(leadsTableExists && !leadsAvailable
        ? ['Таблица leads существует, но в ней нет обязательного created_at; показатели лидов отключены до исправления схемы.']
        : []),
      ...(pageStatsTableExists && !pageStatsAvailable
        ? ['Таблица page_stats_daily существует не полностью; просмотры отключены до исправления схемы.']
        : []),
      ...(visitorsTableExists && !visitorsAvailable
        ? ['Таблица visitor_hashes_daily существует не полностью; посетители отключены до исправления схемы.']
        : []),
    ];

    return json({
      success: true,
      checkedAt: new Date().toISOString(),
      days,
      summary,
      dimensions,
      coverage: {
        tables: { leads: leadsAvailable, pageStats: pageStatsAvailable, visitors: visitorsAvailable },
        qualityAvailable: leadsAvailable && columns.has('quality'),
        wonAvailable: won.supported,
        wonSource: won.source,
        submissionsAvailable: leadsAvailable && columns.has('submissions_count'),
        leadFields: {
          pagePath: leadsAvailable && columns.has('page_path'),
          utm: leadsAvailable && columns.has('utm_source'),
          formId: leadsAvailable && columns.has('form_id'),
          formVariant: leadsAvailable && columns.has('form_variant'),
          marketingConsent: leadsAvailable && columns.has('marketing_consent'),
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
