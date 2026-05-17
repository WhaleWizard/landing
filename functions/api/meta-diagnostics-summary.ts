import { CACHE_CONTROL } from '../_lib/cache';
import { json } from '../_lib/http';
import type { Env } from '../_lib/types';

type SummaryRow = {
  event_name: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  events_received: number;
  with_fbp: number;
  with_fbc: number;
  with_fbclid: number;
  with_utm: number;
  with_email: number;
  with_phone: number;
  with_external_id: number;
  with_marketing_consent: number;
  avg_match_quality_score: number | null;
  avg_score_identity: number | null;
  avg_score_attribution: number | null;
  avg_score_consent: number | null;
  avg_score_context: number | null;
  avg_lead_value: number | null;
  latest_created_at: string | null;
};

type LatestRow = {
  event_name: string;
  status: string;
  events_received: number | null;
  fbtrace_id: string | null;
  error_code: string | null;
  error_message: string | null;
  page_path: string | null;
  service: string | null;
  form_id: string | null;
  form_variant: string | null;
  contact_method: string | null;
  lead_source_page: string | null;
  match_quality_score: number | null;
  event_source_url: string | null;
  page_path_normalized: string | null;
  lead_value: number | null;
  lead_currency: string | null;
  score_identity: number | null;
  score_attribution: number | null;
  score_consent: number | null;
  score_context: number | null;
  has_fbp: number | null;
  has_fbc: number | null;
  has_fbclid: number | null;
  has_utm: number | null;
  marketing_consent: number | null;
  created_at: string;
};

function getProvidedSecret(request: Request): string | undefined {
  const url = new URL(request.url);
  return request.headers.get('x-meta-debug-secret') || url.searchParams.get('secret') || undefined;
}

function getLookbackHours(request: Request): number {
  const raw = new URL(request.url).searchParams.get('hours');
  const parsed = raw ? Number(raw) : 24;
  if (!Number.isFinite(parsed)) return 24;
  return Math.min(Math.max(Math.floor(parsed), 1), 24 * 30);
}

function pct(value: number, total: number): number {
  if (!total) return 0;
  return Math.round((value / total) * 10_000) / 100;
}

function formatRows(rows: SummaryRow[]) {
  return rows.map((row) => ({
    ...row,
    avg_match_quality_score: row.avg_match_quality_score === null ? null : Math.round(row.avg_match_quality_score * 100) / 100,
    avg_score_identity: row.avg_score_identity === null ? null : Math.round(row.avg_score_identity * 100) / 100,
    avg_score_attribution: row.avg_score_attribution === null ? null : Math.round(row.avg_score_attribution * 100) / 100,
    avg_score_consent: row.avg_score_consent === null ? null : Math.round(row.avg_score_consent * 100) / 100,
    avg_score_context: row.avg_score_context === null ? null : Math.round(row.avg_score_context * 100) / 100,
    avg_lead_value: row.avg_lead_value === null ? null : Math.round(row.avg_lead_value * 100) / 100,
    sent_rate: pct(row.sent, row.total),
    failed_rate: pct(row.failed, row.total),
    skipped_rate: pct(row.skipped, row.total),
    fbp_rate: pct(row.with_fbp, row.total),
    fbc_rate: pct(row.with_fbc, row.total),
    fbclid_rate: pct(row.with_fbclid, row.total),
    utm_rate: pct(row.with_utm, row.total),
    email_rate: pct(row.with_email, row.total),
    phone_rate: pct(row.with_phone, row.total),
    external_id_rate: pct(row.with_external_id, row.total),
    marketing_consent_rate: pct(row.with_marketing_consent, row.total),
  }));
}

async function getColumns(env: Env): Promise<Set<string>> {
  if (!env.DB) return new Set();
  const columnsResult = await env.DB.prepare('PRAGMA table_info(meta_capi_diagnostics)').all<{ name: string }>();
  return new Set((columnsResult.results || []).map((column) => column.name).filter(Boolean));
}

function optionalColumn(columns: Set<string>, name: string, fallback = 'NULL'): string {
  return columns.has(name) ? name : `${fallback} AS ${name}`;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const debugSecret = env.META_CAPI_DEBUG_SECRET;
  const providedSecret = getProvidedSecret(request);

  if (!debugSecret || providedSecret !== debugSecret) {
    return json(
      { success: false, error: 'META_CAPI_DEBUG_SECRET is required and must match x-meta-debug-secret or ?secret=' },
      { status: 403, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }

  if (!env.DB) {
    return json(
      { success: false, error: 'D1 binding DB is not available in this Pages environment.' },
      { status: 500, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }

  const hours = getLookbackHours(request);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  try {
    const columns = await getColumns(env);
    const avgQualityExpression = columns.has('match_quality_score') ? 'AVG(match_quality_score)' : 'NULL';
    const avgScoreIdentity = columns.has('score_identity') ? 'AVG(score_identity)' : 'NULL';
    const avgScoreAttribution = columns.has('score_attribution') ? 'AVG(score_attribution)' : 'NULL';
    const avgScoreConsent = columns.has('score_consent') ? 'AVG(score_consent)' : 'NULL';
    const avgScoreContext = columns.has('score_context') ? 'AVG(score_context)' : 'NULL';
    const avgLeadValue = columns.has('lead_value') ? 'AVG(lead_value)' : 'NULL';

    const summary = await env.DB.prepare(`
      SELECT
        event_name,
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped,
        COALESCE(SUM(events_received), 0) AS events_received,
        SUM(CASE WHEN has_fbp = 1 THEN 1 ELSE 0 END) AS with_fbp,
        SUM(CASE WHEN has_fbc = 1 THEN 1 ELSE 0 END) AS with_fbc,
        SUM(CASE WHEN has_fbclid = 1 THEN 1 ELSE 0 END) AS with_fbclid,
        SUM(CASE WHEN has_utm = 1 THEN 1 ELSE 0 END) AS with_utm,
        SUM(CASE WHEN has_email = 1 THEN 1 ELSE 0 END) AS with_email,
        SUM(CASE WHEN has_phone = 1 THEN 1 ELSE 0 END) AS with_phone,
        SUM(CASE WHEN has_external_id = 1 THEN 1 ELSE 0 END) AS with_external_id,
        SUM(CASE WHEN marketing_consent = 1 THEN 1 ELSE 0 END) AS with_marketing_consent,
        ${avgQualityExpression} AS avg_match_quality_score,
        ${avgScoreIdentity} AS avg_score_identity,
        ${avgScoreAttribution} AS avg_score_attribution,
        ${avgScoreConsent} AS avg_score_consent,
        ${avgScoreContext} AS avg_score_context,
        ${avgLeadValue} AS avg_lead_value,
        MAX(created_at) AS latest_created_at
      FROM meta_capi_diagnostics
      WHERE created_at >= ?
      GROUP BY event_name
      ORDER BY latest_created_at DESC
    `).bind(since).all<SummaryRow>();

    const latest = await env.DB.prepare(`
      SELECT
        event_name, status, events_received, fbtrace_id, error_code, error_message,
        page_path, service,
        ${optionalColumn(columns, 'form_id')},
        ${optionalColumn(columns, 'form_variant')},
        ${optionalColumn(columns, 'contact_method')},
        ${optionalColumn(columns, 'lead_source_page')},
        ${optionalColumn(columns, 'match_quality_score')},
        ${optionalColumn(columns, 'event_source_url')},
        ${optionalColumn(columns, 'page_path_normalized')},
        ${optionalColumn(columns, 'lead_value')},
        ${optionalColumn(columns, 'lead_currency')},
        ${optionalColumn(columns, 'score_identity')},
        ${optionalColumn(columns, 'score_attribution')},
        ${optionalColumn(columns, 'score_consent')},
        ${optionalColumn(columns, 'score_context')},
        has_fbp, has_fbc, has_fbclid, has_utm, marketing_consent, created_at
      FROM meta_capi_diagnostics
      WHERE created_at >= ?
      ORDER BY created_at DESC
      LIMIT 25
    `).bind(since).all<LatestRow>();

    return json(
      {
        success: true,
        checked_at: new Date().toISOString(),
        lookback_hours: hours,
        since,
        optional_columns: ['form_id', 'form_variant', 'contact_method', 'lead_source_page', 'match_quality_score', 'event_source_url', 'page_path_normalized', 'lead_value', 'lead_currency', 'score_identity', 'score_attribution', 'score_consent', 'score_context'].filter((column) => columns.has(column)),
        summary: formatRows(summary.results || []),
        latest: latest.results || [],
      },
      { headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  } catch (error) {
    return json(
      { success: false, error: error instanceof Error ? error.message : String(error), since, lookback_hours: hours },
      { status: 500, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }
};
