import { CACHE_CONTROL } from '../_lib/cache';
import { json } from '../_lib/http';
import type { Env } from '../_lib/types';

const FUNNEL_STEPS = ['PageView', 'ViewContent', 'LeadFormView', 'FormStart', 'Lead', 'Contact'] as const;

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

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const debugSecret = env.META_CAPI_DEBUG_SECRET;
  const providedSecret = getProvidedSecret(request);

  if (!debugSecret || providedSecret !== debugSecret) {
    return json({ success: false, error: 'META_CAPI_DEBUG_SECRET is required and must match x-meta-debug-secret or ?secret=' }, { status: 403, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }

  if (!env.DB) {
    return json({ success: false, error: 'D1 binding DB is not available in this Pages environment.' }, { status: 500, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }

  const hours = getLookbackHours(request);
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  const rows = await env.DB.prepare(`
    SELECT
      event_name,
      COALESCE(NULLIF(service, ''), '(unknown)') AS service,
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent
    FROM meta_capi_diagnostics
    WHERE created_at >= ?
      AND event_name IN (${FUNNEL_STEPS.map(() => '?').join(', ')})
    GROUP BY event_name, service
  `).bind(since, ...FUNNEL_STEPS).all<{ event_name: string; service: string; total: number; sent: number }>();

  const byService = new Map<string, Record<string, number>>();
  for (const row of rows.results || []) {
    if (!byService.has(row.service)) byService.set(row.service, {});
    byService.get(row.service)![row.event_name] = Number(row.sent || 0);
  }

  const funnel = [...byService.entries()].map(([service, counts]) => {
    const steps = FUNNEL_STEPS.map((name, idx) => {
      const sent = counts[name] || 0;
      const prev = idx === 0 ? sent : (counts[FUNNEL_STEPS[idx - 1]] || 0);
      return {
        event_name: name,
        sent,
        conversion_from_prev_rate: idx === 0 ? 100 : pct(sent, prev),
        dropoff_from_prev: idx === 0 ? 0 : Math.max(prev - sent, 0),
      };
    });

    return { service, steps };
  });

  return json({ success: true, checked_at: new Date().toISOString(), lookback_hours: hours, since, funnel }, { headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
};
