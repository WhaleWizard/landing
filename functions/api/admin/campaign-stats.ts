import { verifyAdminPassword } from '../../_lib/auth';
import { CACHE_CONTROL } from '../../_lib/cache';
import { json, readCappedJsonBody } from '../../_lib/http';
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
  spend: number;
  currency: string;
  cpc: number | null;
  leads: number;
  cpl: number | null;
  qualified: number;
  cpq: number | null;
  won: number;
  cac: number | null;
  revenue: number;
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
    spend: number;
    currency: string;
    cpc: number | null;
    leads: number;
    cpl: number | null;
    qualified: number;
    cpq: number | null;
    won: number;
    cac: number | null;
    revenue: number;
    romi: number | null;
  };
}

function detectChannel(source: string, campaign: string): string {
  const s = `${source} ${campaign}`.toLowerCase();
  if (/\b(?:meta|facebook|fb|instagram|inst|ig)\b/i.test(s)) return 'meta';
  if (/\b(?:google|gads|adwords|pmax|cpc)\b/i.test(s)) return 'google';
  if (/\b(?:tg|telegram)\b/i.test(s)) return 'telegram';
  if (/\b(?:organic|seo|органика)\b/i.test(s)) return 'organic';
  return 'other';
}

function round(val: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(val * f) / f;
}

async function tableExists(db: D1Database, name: string): Promise<boolean> {
  try {
    const row = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .bind(name)
      .first<{ name: string }>();
    return Boolean(row?.name);
  } catch {
    return false;
  }
}

async function getColumns(db: D1Database, table: string): Promise<Set<string>> {
  try {
    const result = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
    return new Set((result.results || []).map((row) => row.name));
  } catch {
    return new Set();
  }
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
        impressions: 0, clicks: 0, ctr: null, spend: 0, currency: 'USD',
        cpc: null, leads: 0, cpl: null, qualified: 0, cpq: null, won: 0,
        cac: null, revenue: 0, romi: null,
      },
    }, { status: 503, headers: noStore });
  }

  const url = new URL(request.url);
  const rawDays = Number(url.searchParams.get('days') || 30);
  const days = Math.min(Math.max(Number.isFinite(rawDays) ? Math.floor(rawDays) : 30, 1), 90);

  const hasStatsTable = await tableExists(env.DB, 'campaign_stats');
  const hasLeadsTable = await tableExists(env.DB, 'leads');

  const migrationRequired = hasStatsTable ? null : '0046_campaign_stats.sql';

  // Read recorded campaign_stats within the date window
  let records: CampaignRecord[] = [];
  if (hasStatsTable) {
    try {
      const recordsRes = await env.DB.prepare(
        `SELECT id, utm_source, utm_medium, utm_campaign, utm_content, utm_term,
                channel, date, impressions, clicks, spend, currency, notes, created_at, updated_at
         FROM campaign_stats
         WHERE date >= DATE('now', '-' || ? || ' days')
         ORDER BY date DESC, spend DESC`
      ).bind(days).all<CampaignRecord>();
      records = recordsRes.results || [];
    } catch {
      // Table error or read failure
    }
  }

  // Aggregate stats from campaign_stats and leads
  interface LeadGroup {
    leads: number;
    qualified: number;
    won: number;
    revenue: number;
  }
  const leadGroups = new Map<string, LeadGroup>();

  if (hasLeadsTable) {
    try {
      const leadCols = await getColumns(env.DB, 'leads');
      const hasDeletedAt = leadCols.has('deleted_at');
      const hasQuality = leadCols.has('quality');
      const hasPipeline = leadCols.has('pipeline_stage');
      const hasStatus = leadCols.has('status');
      const hasDealValue = leadCols.has('deal_value');
      const hasUtmSource = leadCols.has('utm_source');
      const hasUtmCampaign = leadCols.has('utm_campaign');

      const sourceExpr = hasUtmSource ? "LOWER(TRIM(COALESCE(utm_source, '')))" : "''";
      const campaignExpr = hasUtmCampaign ? "LOWER(TRIM(COALESCE(utm_campaign, '')))" : "''";
      const qualExpr = hasQuality ? "SUM(CASE WHEN quality = 'target' OR quality = 'qualified' THEN 1 ELSE 0 END)" : "0";
      const wonExpr = hasPipeline
        ? (hasStatus ? "SUM(CASE WHEN pipeline_stage = 'won' OR status = 'won' THEN 1 ELSE 0 END)" : "SUM(CASE WHEN pipeline_stage = 'won' THEN 1 ELSE 0 END)")
        : (hasStatus ? "SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END)" : "0");
      const revExpr = hasDealValue
        ? (hasPipeline
            ? (hasStatus ? "SUM(CASE WHEN (pipeline_stage = 'won' OR status = 'won') AND deal_value > 0 THEN deal_value ELSE 0 END)" : "SUM(CASE WHEN pipeline_stage = 'won' AND deal_value > 0 THEN deal_value ELSE 0 END)")
            : (hasStatus ? "SUM(CASE WHEN status = 'won' AND deal_value > 0 THEN deal_value ELSE 0 END)" : "0"))
        : "0";
      const deletedCond = hasDeletedAt ? "AND (deleted_at IS NULL)" : "";

      const leadsQuery = await env.DB.prepare(
        `SELECT
           ${sourceExpr} AS source,
           ${campaignExpr} AS campaign,
           COUNT(*) AS total_leads,
           ${qualExpr} AS qualified_leads,
           ${wonExpr} AS won_leads,
           ${revExpr} AS total_revenue
         FROM leads
         WHERE date(created_at) >= date('now', '-' || ? || ' days')
           ${deletedCond}
         GROUP BY source, campaign`
      ).bind(days).all<{
        source: string;
        campaign: string;
        total_leads: number;
        qualified_leads: number;
        won_leads: number;
        total_revenue: number;
      }>();

      for (const row of leadsQuery.results || []) {
        const key = `${row.source || '—'}::${row.campaign || '—'}`;
        leadGroups.set(key, {
          leads: Number(row.total_leads || 0),
          qualified: Number(row.qualified_leads || 0),
          won: Number(row.won_leads || 0),
          revenue: Number(row.total_revenue || 0),
        });
      }
    } catch {
      // leads query fallback
    }
  }

  // Aggregate campaigns
  const aggregateMap = new Map<string, CampaignAggregate>();

  // First process recorded campaign_stats
  for (const r of records) {
    const s = r.utm_source.toLowerCase().trim() || '—';
    const c = r.utm_campaign.toLowerCase().trim() || '—';
    const key = `${s}::${c}`;
    const ch = r.channel || detectChannel(s, c);

    const existing = aggregateMap.get(key) || {
      key,
      utm_source: s,
      utm_campaign: c,
      utm_medium: r.utm_medium,
      channel: ch,
      impressions: 0,
      clicks: 0,
      ctr: null,
      spend: 0,
      currency: r.currency || 'USD',
      cpc: null,
      leads: 0,
      cpl: null,
      qualified: 0,
      cpq: null,
      won: 0,
      cac: null,
      revenue: 0,
      romi: null,
    };

    existing.impressions += Number(r.impressions || 0);
    existing.clicks += Number(r.clicks || 0);
    existing.spend += Number(r.spend || 0);
    aggregateMap.set(key, existing);
  }

  // Merge leads data
  for (const [key, l] of leadGroups.entries()) {
    const [s, c] = key.split('::');
    const existing = aggregateMap.get(key) || {
      key,
      utm_source: s,
      utm_campaign: c,
      utm_medium: '',
      channel: detectChannel(s, c),
      impressions: 0,
      clicks: 0,
      ctr: null,
      spend: 0,
      currency: 'USD',
      cpc: null,
      leads: 0,
      cpl: null,
      qualified: 0,
      cpq: null,
      won: 0,
      cac: null,
      revenue: 0,
      romi: null,
    };

    existing.leads += l.leads;
    existing.qualified += l.qualified;
    existing.won += l.won;
    existing.revenue += l.revenue;
    aggregateMap.set(key, existing);
  }

  // Calculate metrics for all campaigns
  const campaigns: CampaignAggregate[] = Array.from(aggregateMap.values()).map((item) => {
    const ctr = item.impressions > 0 ? round((item.clicks / item.impressions) * 100) : null;
    const cpc = item.clicks > 0 && item.spend > 0 ? round(item.spend / item.clicks) : null;
    const cpl = item.leads > 0 && item.spend > 0 ? round(item.spend / item.leads) : null;
    const cpq = item.qualified > 0 && item.spend > 0 ? round(item.spend / item.qualified) : null;
    const cac = item.won > 0 && item.spend > 0 ? round(item.spend / item.won) : null;
    const romi = item.spend > 0 ? round(((item.revenue - item.spend) / item.spend) * 100) : null;

    return {
      ...item,
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
    totalSpend += c.spend;
    totalLeads += c.leads;
    totalQual += c.qualified;
    totalWon += c.won;
    totalRev += c.revenue;
  }

  const summary = {
    impressions: totalImp,
    clicks: totalClicks,
    ctr: totalImp > 0 ? round((totalClicks / totalImp) * 100) : null,
    spend: round(totalSpend),
    currency: campaigns[0]?.currency || 'USD',
    cpc: totalClicks > 0 && totalSpend > 0 ? round(totalSpend / totalClicks) : null,
    leads: totalLeads,
    cpl: totalLeads > 0 && totalSpend > 0 ? round(totalSpend / totalLeads) : null,
    qualified: totalQual,
    cpq: totalQual > 0 && totalSpend > 0 ? round(totalSpend / totalQual) : null,
    won: totalWon,
    cac: totalWon > 0 && totalSpend > 0 ? round(totalSpend / totalWon) : null,
    revenue: round(totalRev),
    romi: totalSpend > 0 ? round(((totalRev - totalSpend) / totalSpend) * 100) : null,
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

  const hasStatsTable = await tableExists(env.DB, 'campaign_stats');
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
    return json({ success: false, error: 'Missing action' }, { status: 400, headers: noStore });
  }

  const nowIso = new Date().toISOString();

  if (body.action === 'save_record') {
    const id = body.id?.trim() || crypto.randomUUID();
    const utm_source = String(body.utm_source || '').trim();
    const utm_campaign = String(body.utm_campaign || '').trim();
    const date = String(body.date || '').slice(0, 10);

    if (!utm_source || !utm_campaign || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return json({ success: false, error: 'Укажите источник (utm_source), кампанию (utm_campaign) и дату YYYY-MM-DD' }, { status: 400, headers: noStore });
    }

    const utm_medium = String(body.utm_medium || '').trim();
    const utm_content = String(body.utm_content || '').trim();
    const utm_term = String(body.utm_term || '').trim();
    const channel = String(body.channel || detectChannel(utm_source, utm_campaign)).trim();
    const impressions = Math.max(0, Math.floor(Number(body.impressions || 0)));
    const clicks = Math.max(0, Math.floor(Number(body.clicks || 0)));
    const spend = Math.max(0, Number(body.spend || 0));
    const currency = String(body.currency || 'USD').toUpperCase().slice(0, 10);
    const notes = String(body.notes || '').slice(0, 500);

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

    return json({ success: true, id }, { headers: noStore });
  }

  if (body.action === 'delete_record') {
    const id = body.id?.trim();
    if (!id) {
      return json({ success: false, error: 'Missing record id' }, { status: 400, headers: noStore });
    }

    await env.DB.prepare('DELETE FROM campaign_stats WHERE id = ?').bind(id).run();
    return json({ success: true, deleted: id }, { headers: noStore });
  }

  return json({ success: false, error: 'Unknown action' }, { status: 400, headers: noStore });
};
