import { CACHE_CONTROL } from '../_lib/cache';
import { json } from '../_lib/http';
import type { Env } from '../_lib/types';

const CORE_EVENTS = ['PageView', 'ViewContent', 'LeadFormView', 'FormStart', 'Lead', 'EngagedView', 'Contact'] as const;

type CoverageRow = {
  page_path: string;
  event_name: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  latest_created_at: string | null;
};

type CoverageEvent = {
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  latest_created_at: string | null;
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

function emptyEvent(): CoverageEvent {
  return { total: 0, sent: 0, failed: 0, skipped: 0, latest_created_at: null };
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
    const rows = await env.DB.prepare(`
      SELECT
        COALESCE(NULLIF(page_path, ''), '(unknown)') AS page_path,
        event_name,
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) AS skipped,
        MAX(created_at) AS latest_created_at
      FROM meta_capi_diagnostics
      WHERE created_at >= ?
        AND event_name IN (${CORE_EVENTS.map(() => '?').join(', ')})
      GROUP BY page_path, event_name
      ORDER BY page_path ASC, event_name ASC
    `).bind(since, ...CORE_EVENTS).all<CoverageRow>();

    const byPage = new Map<string, { page_path: string; events: Record<string, CoverageEvent>; missing_core_events: string[] }>();

    for (const row of rows.results || []) {
      if (!byPage.has(row.page_path)) {
        byPage.set(row.page_path, {
          page_path: row.page_path,
          events: Object.fromEntries(CORE_EVENTS.map((eventName) => [eventName, emptyEvent()])),
          missing_core_events: [],
        });
      }

      byPage.get(row.page_path)!.events[row.event_name] = {
        total: Number(row.total || 0),
        sent: Number(row.sent || 0),
        failed: Number(row.failed || 0),
        skipped: Number(row.skipped || 0),
        latest_created_at: row.latest_created_at,
      };
    }

    const pages = [...byPage.values()].map((page) => ({
      ...page,
      missing_core_events: CORE_EVENTS.filter((eventName) => page.events[eventName].total === 0),
    }));

    return json(
      {
        success: true,
        checked_at: new Date().toISOString(),
        lookback_hours: hours,
        since,
        core_events: CORE_EVENTS,
        pages,
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
