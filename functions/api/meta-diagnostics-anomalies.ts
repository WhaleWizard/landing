import { CACHE_CONTROL } from '../_lib/cache';
import { json } from '../_lib/http';
import type { Env } from '../_lib/types';

function getProvidedSecret(request: Request): string | undefined {
  const url = new URL(request.url);
  return request.headers.get('x-meta-debug-secret') || url.searchParams.get('secret') || undefined;
}

function pct(value: number, total: number): number {
  if (!total) return 0;
  return Math.round((value / total) * 10_000) / 100;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const debugSecret = env.META_CAPI_DEBUG_SECRET;
  const providedSecret = getProvidedSecret(request);

  if (!debugSecret || providedSecret !== debugSecret) {
    return json({ success: false, error: 'META_CAPI_DEBUG_SECRET is required and must match x-meta-debug-secret or ?secret=' }, { status: 403, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }

  if (!env.DB) {
    return json({ success: false, error: 'D1 binding DB is not available in this Pages environment.' }, { status: 500, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }

  const now = Date.now();
  const sinceRecent = new Date(now - 6 * 60 * 60 * 1000).toISOString();
  const sinceBaseline = new Date(now - 72 * 60 * 60 * 1000).toISOString();

  const query = `
    SELECT
      event_name,
      SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS recent_total,
      SUM(CASE WHEN created_at >= ? AND status = 'failed' THEN 1 ELSE 0 END) AS recent_failed,
      SUM(CASE WHEN created_at >= ? AND has_fbc = 1 THEN 1 ELSE 0 END) AS recent_with_fbc,
      SUM(CASE WHEN created_at >= ? AND marketing_consent = 1 THEN 1 ELSE 0 END) AS recent_with_consent,
      SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS baseline_total,
      SUM(CASE WHEN created_at >= ? AND status = 'failed' THEN 1 ELSE 0 END) AS baseline_failed,
      SUM(CASE WHEN created_at >= ? AND has_fbc = 1 THEN 1 ELSE 0 END) AS baseline_with_fbc,
      SUM(CASE WHEN created_at >= ? AND marketing_consent = 1 THEN 1 ELSE 0 END) AS baseline_with_consent
    FROM meta_capi_diagnostics
    WHERE created_at >= ?
    GROUP BY event_name
  `;

  const rows = await env.DB.prepare(query)
    .bind(sinceRecent, sinceRecent, sinceRecent, sinceRecent, sinceBaseline, sinceBaseline, sinceBaseline, sinceBaseline, sinceBaseline)
    .all<any>();

  const anomalies: Array<Record<string, unknown>> = [];
  for (const row of rows.results || []) {
    const recentTotal = Number(row.recent_total || 0);
    const baseTotal = Number(row.baseline_total || 0);
    if (!recentTotal || baseTotal < 10) continue;

    const recentFail = pct(Number(row.recent_failed || 0), recentTotal);
    const baseFail = pct(Number(row.baseline_failed || 0), baseTotal);
    if (recentFail - baseFail >= 15) {
      anomalies.push({ severity: 'critical', code: 'failed_rate_spike', event_name: row.event_name, recent_fail_rate: recentFail, baseline_fail_rate: baseFail });
    }

    const recentFbc = pct(Number(row.recent_with_fbc || 0), recentTotal);
    const baseFbc = pct(Number(row.baseline_with_fbc || 0), baseTotal);
    if (baseFbc - recentFbc >= 20) {
      anomalies.push({ severity: 'warning', code: 'fbc_rate_drop', event_name: row.event_name, recent_fbc_rate: recentFbc, baseline_fbc_rate: baseFbc });
    }

    const recentConsent = pct(Number(row.recent_with_consent || 0), recentTotal);
    const baseConsent = pct(Number(row.baseline_with_consent || 0), baseTotal);
    if (baseConsent - recentConsent >= 20) {
      anomalies.push({ severity: 'warning', code: 'consent_rate_drop', event_name: row.event_name, recent_consent_rate: recentConsent, baseline_consent_rate: baseConsent });
    }
  }

  return json({ success: true, checked_at: new Date().toISOString(), recent_window_hours: 6, baseline_window_hours: 72, anomalies }, { headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
};
