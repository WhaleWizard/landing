import { CACHE_CONTROL } from '../_lib/cache';
import { json } from '../_lib/http';
import type { Env } from '../_lib/types';

type AlertSeverity = 'warning' | 'critical';

type Alert = {
  severity: AlertSeverity;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

type SummaryRow = {
  event_name: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  with_fbc: number;
  with_marketing_consent: number;
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

function addAlert(alerts: Alert[], severity: AlertSeverity, code: string, message: string, details?: Record<string, unknown>): void {
  alerts.push({ severity, code, message, details });
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
    const summary = await env.DB.prepare(`
      SELECT
        event_name,
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped,
        SUM(CASE WHEN has_fbc = 1 THEN 1 ELSE 0 END) AS with_fbc,
        SUM(CASE WHEN marketing_consent = 1 THEN 1 ELSE 0 END) AS with_marketing_consent
      FROM meta_capi_diagnostics
      WHERE created_at >= ?
      GROUP BY event_name
    `).bind(since).all<SummaryRow>();

    const rows = summary.results || [];
    const byEvent = new Map(rows.map((row) => [row.event_name, row]));
    const alerts: Alert[] = [];
    const pageView = byEvent.get('PageView');
    const lead = byEvent.get('Lead');

    if (!pageView || Number(pageView.sent || 0) === 0) {
      addAlert(alerts, 'critical', 'no_pageviews_sent', 'No sent PageView events were recorded in the lookback window.', { hours });
    }

    for (const row of rows) {
      const failed = Number(row.failed || 0);
      const total = Number(row.total || 0);
      const sent = Number(row.sent || 0);
      const fbcRate = pct(Number(row.with_fbc || 0), total);
      const consentRate = pct(Number(row.with_marketing_consent || 0), total);

      if (failed > 0) {
        addAlert(alerts, row.event_name === 'Lead' ? 'critical' : 'warning', 'failed_events_present', `${row.event_name} has failed diagnostics rows.`, { event_name: row.event_name, failed, total });
      }

      if (sent >= 5 && fbcRate < 50) {
        addAlert(alerts, 'warning', 'low_fbc_rate', `${row.event_name} has low fbc coverage.`, { event_name: row.event_name, fbc_rate: fbcRate, sent });
      }

      if (total >= 5 && consentRate < 50) {
        addAlert(alerts, 'warning', 'low_marketing_consent_rate', `${row.event_name} has low marketing consent coverage.`, { event_name: row.event_name, marketing_consent_rate: consentRate, total });
      }
    }

    if (pageView && Number(pageView.sent || 0) >= 10 && (!lead || Number(lead.sent || 0) === 0)) {
      addAlert(alerts, 'warning', 'traffic_without_leads', 'PageView events are present but no sent Lead event was recorded.', { pageviews_sent: pageView.sent, hours });
    }

    const critical = alerts.filter((alert) => alert.severity === 'critical').length;
    const warnings = alerts.filter((alert) => alert.severity === 'warning').length;

    return json(
      {
        success: true,
        ok: critical === 0 && warnings === 0,
        checked_at: new Date().toISOString(),
        lookback_hours: hours,
        since,
        alert_counts: { critical, warnings, total: alerts.length },
        alerts,
        summary: rows,
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
