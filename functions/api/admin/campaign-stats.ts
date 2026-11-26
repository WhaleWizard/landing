import { verifyAdminPassword } from '../../_lib/auth';
import { classifyChannel } from '../../../shared/marketing-channel';
import { CACHE_CONTROL } from '../../_lib/cache';
import { json, readCappedJsonBody } from '../../_lib/http';
import { sqliteLocalModifier, timezoneOffsetFromRequest } from '../../_lib/local-day';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };

export interface CampaignRecord {
  id: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string;
  utm_term: string;
  channel: string;
  date: string;
  impressions: number;
  clicks: number;
  spend: number;
  currency: string;
  notes: string;
  created_at?: string;
  updated_at?: string;
}

export interface CampaignAggregate {
  key: string;
  utm_source: string;
  utm_campaign: string;
  utm_medium: string;
  channel: string;
  impressions: number;
  clicks: number;
  ctr: number | null;
  spend: number | null;
  /** Расход введён не по всем записям кампании (DA-69). */
  spendUnknown?: boolean;
  /** У выигранных сделок кампании не везде указана сумма (DA-70). */
  revenueIncomplete?: boolean;
  currency: string | null;
  cpc: number | null;
  leads: number;
  cpl: number | null;
  qualified: number;
  cpq: number | null;
  won: number;
  cac: number | null;
  revenue: number | null;
  revenueCurrency: string | null;
  romi: number | null;
}

export interface CampaignStatsResponse {
  success: boolean;
  error?: string;
  configured: boolean;
  migrationRequired?: string | null;
  days: number;
  campaigns: CampaignAggregate[];
  records: CampaignRecord[];
  summary: {
    impressions: number;
    clicks: number;
    ctr: number | null;
    spend: number | null;
    currency: string | null;
    cpc: number | null;
    leads: number;
    cpl: number | null;
    qualified: number;
    cpq: number | null;
    won: number;
    cac: number | null;
    revenue: number | null;
    revenueCurrency: string | null;
    romi: number | null;
  };
}

// Общее правило с графиком каналов «Воронки» (CL-01): `shared/marketing-channel.ts`.
function detectChannel(source: string, campaign: string): string {
  return classifyChannel(source, '', campaign);
}

function round(val: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(val * f) / f;
}

function singleCurrency(currencies: Set<string>): string | null {
  return currencies.size === 1 ? [...currencies][0] || null : null;
}

async function tableExists(db: D1Database, name: string): Promise<boolean> {
  const row = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(name)
    .first<{ name: string }>();
  return Boolean(row?.name);
}

async function getLeadColumns(db: D1Database): Promise<Set<string>> {
  const result = await db.prepare('PRAGMA table_info(leads)').all<{ name: string }>();
  return new Set((result.results || []).map((row) => row.name));
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const password = request.headers.get('X-Admin-Password') || '';
  if (!verifyAdminPassword(password, env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }

  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  if (!env.DB) {
    return json({
      success: false,
      error: 'База данных D1 не подключена к этому окружению',
      configured: false,
      days: 30,
      campaigns: [],
      records: [],
      summary: {
        impressions: 0, clicks: 0, ctr: null, spend: null, currency: null,
        cpc: null, leads: 0, cpl: null, qualified: 0, cpq: null, won: 0,
        cac: null, revenue: null, revenueCurrency: null, romi: null,
      },
    }, { status: 503, headers: noStore });
  }

  const url = new URL(request.url);
  const rawDays = Number(url.searchParams.get('days') || 30);
  const days = Math.min(Math.max(Number.isFinite(rawDays) ? Math.floor(rawDays) : 30, 1), 90);
  const localModifier = sqliteLocalModifier(timezoneOffsetFromRequest(request));

  let hasStatsTable: boolean;
  let hasLeadsTable: boolean;
  try {
    [hasStatsTable, hasLeadsTable] = await Promise.all([
      tableExists(env.DB, 'campaign_stats'), tableExists(env.DB, 'leads'),
    ]);
  } catch {
    return json({ success: false, error: 'Не удалось проверить схему базы данных' }, { status: 503, headers: noStore });
  }

  const migrationRequired = hasStatsTable ? null : '0046_campaign_stats.sql';

  // Read recorded campaign_stats within the date window
  let records: CampaignRecord[] = [];
  let spendKnownColumn = false;
  if (hasStatsTable) {
    try {
      spendKnownColumn = (await env.DB.prepare('PRAGMA table_info(campaign_stats)').all<{ name: string }>()).results
        ?.some((column) => column.name === 'spend_known') ?? false;
      const recordsRes = await env.DB.prepare(
        `SELECT id, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
                channel, date, impressions, clicks, spend, currency, notes, created_at, updated_at,
                ${spendKnownColumn ? 'spend_known' : '1 AS spend_known'}
         FROM campaign_stats
         WHERE date BETWEEN DATE('now', ?, '-' || ? || ' days') AND DATE('now', ?)
         ORDER BY date DESC, spend DESC`
      ).bind(localModifier, days - 1, localModifier).all<CampaignRecord>();
      records = recordsRes.results || [];
    } catch {
      return json({ success: false, error: 'Не удалось прочитать расходы кампаний' }, { status: 503, headers: noStore });
    }
  }

  // Aggregate stats from campaign_stats and leads
  interface LeadGroup {
    leads: number;
    qualified: number;
    won: number;
    revenue: number;
    revenueCurrencies: Set<string>;
    /** Выигранные сделки без суммы: выручка кампании тогда неполная (DA-70). */
    unknownRevenue: number;
  }
  const leadGroups = new Map<string, LeadGroup>();

  if (hasLeadsTable) {
    try {
      const leadCols = await getLeadColumns(env.DB);
      const hasDeletedAt = leadCols.has('deleted_at');
      const hasQuality = leadCols.has('quality');
      const hasPipeline = leadCols.has('pipeline_stage');
      const hasStatus = leadCols.has('status');
      const hasDealValue = leadCols.has('deal_value');
      const currencyExpr = leadCols.has('deal_currency') ? "UPPER(TRIM(COALESCE(deal_currency, '')))" : "''";
      const hasUtmSource = leadCols.has('utm_source');
      const hasUtmCampaign = leadCols.has('utm_campaign');

      const sourceExpr = hasUtmSource ? "TRIM(COALESCE(utm_source, ''))" : "''";
      const campaignExpr = hasUtmCampaign ? "TRIM(COALESCE(utm_campaign, ''))" : "''";
      const qualExpr = hasQuality ? "SUM(CASE WHEN quality = 'target' OR quality = 'qualified' THEN 1 ELSE 0 END)" : "0";
      const wonExpr = hasPipeline
        ? (hasStatus ? "SUM(CASE WHEN pipeline_stage = 'won' OR status = 'won' THEN 1 ELSE 0 END)" : "SUM(CASE WHEN pipeline_stage = 'won' THEN 1 ELSE 0 END)")
        : (hasStatus ? "SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END)" : "0");
      // Явный 0 — известная выручка, пустая сумма — неизвестная (DA-70).
      const wonCond = hasPipeline
        ? (hasStatus ? "(pipeline_stage = 'won' OR status = 'won')" : "pipeline_stage = 'won'")
        : (hasStatus ? "status = 'won'" : '0');
      const revExpr = hasDealValue ? `SUM(CASE WHEN ${wonCond} AND deal_value IS NOT NULL THEN deal_value ELSE 0 END)` : '0';
      const pricedExpr = hasDealValue ? `SUM(CASE WHEN ${wonCond} AND deal_value IS NOT NULL THEN 1 ELSE 0 END)` : '0';
      const unknownExpr = hasDealValue ? `SUM(CASE WHEN ${wonCond} AND deal_value IS NULL THEN 1 ELSE 0 END)` : `SUM(CASE WHEN ${wonCond} THEN 1 ELSE 0 END)`;
      // День заявки — как в «Воронке»: последнее обращение, иначе первое
      // (DA-71). Вернувшийся контакт иначе был в «Воронке» и не был здесь.
      const leadDay = leadCols.has('last_submitted_at') ? 'COALESCE(last_submitted_at, created_at)' : 'created_at';
      const deletedCond = hasDeletedAt ? "AND (deleted_at IS NULL)" : "";

      const leadsQuery = await env.DB.prepare(
        `SELECT
           ${sourceExpr} AS source,
           ${campaignExpr} AS campaign,
           COUNT(*) AS total_leads,
           ${qualExpr} AS qualified_leads,
           ${wonExpr} AS won_leads,
           ${currencyExpr} AS revenue_currency,
           ${revExpr} AS total_revenue,
           ${pricedExpr} AS priced_revenue,
           ${unknownExpr} AS unknown_revenue
         FROM leads
         WHERE date(${leadDay}, ?) BETWEEN date('now', ?, '-' || ? || ' days') AND date('now', ?)
           ${deletedCond}
         GROUP BY ${sourceExpr}, ${campaignExpr}, ${currencyExpr}`
      ).bind(localModifier, localModifier, days - 1, localModifier).all<{
        source: string;
        campaign: string;
        total_leads: number;
        qualified_leads: number;
        won_leads: number;
        total_revenue: number;
        revenue_currency: string;
        priced_revenue: number;
        unknown_revenue: number;
      }>();

      for (const row of leadsQuery.results || []) {
        const key = JSON.stringify([row.source.toLowerCase(), row.campaign.toLowerCase()]);
        const group = leadGroups.get(key) || { leads: 0, qualified: 0, won: 0, revenue: 0, revenueCurrencies: new Set<string>(), unknownRevenue: 0 };
        group.leads += Number(row.total_leads || 0);
        group.qualified += Number(row.qualified_leads || 0);
        group.won += Number(row.won_leads || 0);
        if (Number(row.priced_revenue || 0) > 0) {
          group.revenue += Number(row.total_revenue || 0);
          group.revenueCurrencies.add(row.revenue_currency);
        }
        group.unknownRevenue += Number(row.unknown_revenue || 0);
        leadGroups.set(key, group);
      }
    } catch {
      return json({ success: false, error: 'Не удалось прочитать заявки кампаний' }, { status: 503, headers: noStore });
    }
  }

  // Aggregate campaigns
  const aggregateMap = new Map<string, CampaignAggregate>();
  const spendCurrenciesByCampaign = new Map<string, Set<string>>();
  const spendUnknown = new Set<string>();
  const revenueIncomplete = new Set<string>();

  // First process recorded campaign_stats
  for (const r of records) {
    const s = r.utm_source.toLowerCase().trim();
    const c = r.utm_campaign.toLowerCase().trim();
    const key = JSON.stringify([s, c]);
    const ch = r.channel || detectChannel(s, c);

    const existing = aggregateMap.get(key) || {
      key,
      utm_source: s || '—',
      utm_campaign: c || '—',
      utm_medium: r.utm_medium,
      channel: ch,
      impressions: 0,
      clicks: 0,
      ctr: null,
      spend: 0,
      currency: null,
      cpc: null,
      leads: 0,
      cpl: null,
      qualified: 0,
      cpq: null,
      won: 0,
      cac: null,
      revenue: null,
      revenueCurrency: null,
      romi: null,
    };

    existing.impressions += Number(r.impressions || 0);
    existing.clicks += Number(r.clicks || 0);
    existing.spend = (existing.spend ?? 0) + Number(r.spend || 0);
    // Запись без введённого расхода делает расход кампании неизвестным
    // (DA-69): клики без расхода — не бесплатные клики.
    if (Number((r as { spend_known?: number }).spend_known ?? 1) === 0) spendUnknown.add(key);
    const currencies = spendCurrenciesByCampaign.get(key) || new Set<string>();
    currencies.add(r.currency?.trim().toUpperCase() || '');
    spendCurrenciesByCampaign.set(key, currencies);
    aggregateMap.set(key, existing);
  }

  // Ручные расходы (раздел «Расходы», таблица ad_spend) — для кампаний без
  // своих записей здесь (DA-71): «Воронка» видела расход 200 USD, а эта
  // таблица — «расхода нет». Записи кампании главнее: двойного счёта нет.
  try {
    if (await tableExists(env.DB, 'ad_spend')) {
      const recordKeys = new Set(aggregateMap.keys());
      const spendRows = await env.DB.prepare(
        `SELECT LOWER(TRIM(source)) AS source, LOWER(TRIM(campaign)) AS campaign, currency, SUM(amount) AS amount
         FROM ad_spend
         WHERE day BETWEEN DATE('now', ?, '-' || ? || ' days') AND DATE('now', ?)
         GROUP BY 1, 2, 3`,
      ).bind(localModifier, days - 1, localModifier).all<{ source: string; campaign: string; currency: string; amount: number }>();
      for (const row of spendRows.results || []) {
        const key = JSON.stringify([row.source || '', row.campaign || '']);
        if (recordKeys.has(key)) continue;
        const existing = aggregateMap.get(key) || {
          key,
          utm_source: row.source || '—',
          utm_campaign: row.campaign || '—',
          utm_medium: '',
          channel: detectChannel(row.source || '', row.campaign || ''),
          impressions: 0, clicks: 0, ctr: null,
          spend: 0, currency: null, cpc: null,
          leads: 0, cpl: null, qualified: 0, cpq: null, won: 0, cac: null,
          revenue: null, revenueCurrency: null, romi: null,
        };
        existing.spend = (existing.spend ?? 0) + Number(row.amount || 0);
        const currencies = spendCurrenciesByCampaign.get(key) || new Set<string>();
        currencies.add(String(row.currency || '').trim().toUpperCase());
        spendCurrenciesByCampaign.set(key, currencies);
        aggregateMap.set(key, existing);
      }
    }
  } catch {
    // Без ручных расходов раздел показывает свои записи, как раньше.
  }

  // Merge leads data
  for (const [key, l] of leadGroups.entries()) {
    const [s, c] = JSON.parse(key) as [string, string];
    const existing = aggregateMap.get(key) || {
      key,
      utm_source: s || '—',
      utm_campaign: c || '—',
      utm_medium: '',
      channel: detectChannel(s, c),
      impressions: 0,
      clicks: 0,
      ctr: null,
      spend: null,
      currency: null,
      cpc: null,
      leads: 0,
      cpl: null,
      qualified: 0,
      cpq: null,
      won: 0,
      cac: null,
      revenue: null,
      revenueCurrency: null,
      romi: null,
    };

    existing.leads += l.leads;
    existing.qualified += l.qualified;
    existing.won += l.won;
    existing.revenueCurrency = singleCurrency(l.revenueCurrencies);
    // Выручка с выигранной сделкой без суммы — неполная (DA-70): ROMI по
    // ней был бы завышен, поэтому выручки нет, а признак объясняет почему.
    if (l.unknownRevenue > 0) revenueIncomplete.add(key);
    existing.revenue = existing.revenueCurrency && l.unknownRevenue === 0 ? l.revenue : null;
    aggregateMap.set(key, existing);
  }

  // Calculate metrics for all campaigns
  const campaigns: CampaignAggregate[] = Array.from(aggregateMap.values()).map((item) => {
    const currency = singleCurrency(spendCurrenciesByCampaign.get(item.key) || new Set());
    const spend = currency && !spendUnknown.has(item.key) ? item.spend : null;
    const ctr = item.impressions > 0 ? round((item.clicks / item.impressions) * 100) : null;
    const cpc = item.clicks > 0 && spend !== null ? round(spend / item.clicks) : null;
    const cpl = item.leads > 0 && spend !== null ? round(spend / item.leads) : null;
    const cpq = item.qualified > 0 && spend !== null ? round(spend / item.qualified) : null;
    const cac = item.won > 0 && spend !== null ? round(spend / item.won) : null;
    const romi = spend !== null && spend > 0 && item.revenue !== null && currency === item.revenueCurrency
      ? round(((item.revenue - spend) / spend) * 100) : null;

    return {
      ...item,
      spendUnknown: spendUnknown.has(item.key),
      revenueIncomplete: revenueIncomplete.has(item.key),
      spend,
      currency,
      ctr,
      cpc,
      cpl,
      cpq,
      cac,
      romi,
    };
  }).sort((a, b) => (b.spend || b.leads) - (a.spend || a.leads));

  // Calculate summary
  let totalImp = 0;
  let totalClicks = 0;
  let totalSpend = 0;
  let totalLeads = 0;
  let totalQual = 0;
  let totalWon = 0;
  let totalRev = 0;

  for (const c of campaigns) {
    totalImp += c.impressions;
    totalClicks += c.clicks;
    totalSpend += c.spend ?? 0;
    totalLeads += c.leads;
    totalQual += c.qualified;
    totalWon += c.won;
    totalRev += c.revenue ?? 0;
  }

  const currency = singleCurrency(new Set([...spendCurrenciesByCampaign.values()].flatMap((values) => [...values])));
  const revenueCurrency = singleCurrency(new Set([...leadGroups.values()].flatMap((group) => [...group.revenueCurrencies])));

  const summary = {
    impressions: totalImp,
    clicks: totalClicks,
    ctr: totalImp > 0 ? round((totalClicks / totalImp) * 100) : null,
    spend: currency ? round(totalSpend) : null,
    currency,
    cpc: totalClicks > 0 && currency ? round(totalSpend / totalClicks) : null,
    leads: totalLeads,
    cpl: totalLeads > 0 && currency && campaigns.every((c) => !c.leads || c.spend !== null) ? round(totalSpend / totalLeads) : null,
    qualified: totalQual,
    cpq: totalQual > 0 && currency && campaigns.every((c) => !c.qualified || c.spend !== null) ? round(totalSpend / totalQual) : null,
    won: totalWon,
    cac: totalWon > 0 && currency && campaigns.every((c) => !c.won || c.spend !== null) ? round(totalSpend / totalWon) : null,
    revenue: revenueCurrency ? round(totalRev) : null,
    revenueCurrency,
    romi: totalSpend > 0 && currency && currency === revenueCurrency && campaigns.every((c) => !c.won || c.spend !== null)
      ? round(((totalRev - totalSpend) / totalSpend) * 100) : null,
  };

  return json({
    success: true,
    configured: true,
    migrationRequired,
    days,
    campaigns,
    records,
    summary,
  }, { headers: noStore });
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const password = request.headers.get('X-Admin-Password') || '';
  if (!verifyAdminPassword(password, env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }

  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  if (!env.DB) {
    return json({ success: false, error: 'База данных D1 не подключена' }, { status: 503, headers: noStore });
  }

  const hasStatsTable = await tableExists(env.DB, 'campaign_stats').catch(() => null);
  if (hasStatsTable === null) {
    return json({ success: false, error: 'Не удалось проверить схему базы данных' }, { status: 503, headers: noStore });
  }
  if (!hasStatsTable) {
    return json({
      success: false,
      error: 'Таблица campaign_stats отсутствует. Примените миграцию 0046_campaign_stats.sql',
      migration: '0046_campaign_stats.sql',
    }, { status: 503, headers: noStore });
  }

  const body = await readCappedJsonBody(request, 64 * 1024) as {
    action?: string;
    id?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    utm_term?: string;
    channel?: string;
    date?: string;
    impressions?: number;
    clicks?: number;
    spend?: number;
    currency?: string;
    notes?: string;
  } | null;

  if (!body?.action) {
    return json({ success: false, error: 'Не указано действие' }, { status: 400, headers: noStore });
  }

  const nowIso = new Date().toISOString();

  if (body.action === 'save_record') {
    const id = typeof body.id === 'string' ? body.id.trim() || crypto.randomUUID() : crypto.randomUUID();
    const utm_source = String(body.utm_source || '').trim();
    const utm_campaign = String(body.utm_campaign || '').trim();
    const date = String(body.date || '');
    const day = new Date(`${date}T00:00:00Z`);

    if (!utm_source || !utm_campaign || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date) {
      return json({ success: false, error: 'Укажите источник (utm_source), кампанию (utm_campaign) и дату YYYY-MM-DD' }, { status: 400, headers: noStore });
    }

    const utm_medium = String(body.utm_medium || '').trim();
    const utm_content = String(body.utm_content || '').trim();
    const utm_term = String(body.utm_term || '').trim();
    const channel = String(body.channel || detectChannel(utm_source, utm_campaign)).trim();
    const impressions = body.impressions ?? 0;
    const clicks = body.clicks ?? 0;
    // Пустое поле расхода — «не введён», а не 0 (DA-69, миграция 0048).
    const spendProvided = body.spend !== null && body.spend !== undefined && String(body.spend).trim() !== '';
    const spend = spendProvided ? Number(body.spend) : 0;
    const currency = String(body.currency || 'USD').trim().toUpperCase();
    if (!Number.isSafeInteger(impressions) || impressions < 0 || !Number.isSafeInteger(clicks) || clicks < 0
      || !Number.isFinite(spend) || spend < 0 || !/^[A-Z]{3}$/.test(currency)) {
      return json({ success: false, error: 'Проверьте показы, клики, расход и код валюты' }, { status: 400, headers: noStore });
    }
    const notes = String(body.notes || '').slice(0, 500);
    const hasSpendKnown = (await env.DB.prepare('PRAGMA table_info(campaign_stats)').all<{ name: string }>()).results
      ?.some((column) => column.name === 'spend_known') ?? false;

    await env.DB.prepare(
      `INSERT INTO campaign_stats (
         id, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
         channel, date, impressions, clicks, spend, currency, notes, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET
         utm_source = excluded.utm_source,
         utm_medium = excluded.utm_medium,
         utm_campaign = excluded.utm_campaign,
         utm_content = excluded.utm_content,
         utm_term = excluded.utm_term,
         channel = excluded.channel,
         date = excluded.date,
         impressions = excluded.impressions,
         clicks = excluded.clicks,
         spend = excluded.spend,
         currency = excluded.currency,
         notes = excluded.notes,
         updated_at = excluded.updated_at`
    ).bind(
      id, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
      channel, date, impressions, clicks, spend, currency, notes, nowIso, nowIso
    ).run();
    if (hasSpendKnown) {
      await env.DB.prepare('UPDATE campaign_stats SET spend_known = ? WHERE id = ?').bind(spendProvided ? 1 : 0, id).run();
    }

    return json({ success: true, id }, { headers: noStore });
  }

  if (body.action === 'delete_record') {
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!id) {
      return json({ success: false, error: 'Не указана запись' }, { status: 400, headers: noStore });
    }

    await env.DB.prepare('DELETE FROM campaign_stats WHERE id = ?').bind(id).run();
    return json({ success: true, deleted: id }, { headers: noStore });
  }

  return json({ success: false, error: 'Неизвестное действие' }, { status: 400, headers: noStore });
};
