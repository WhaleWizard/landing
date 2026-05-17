import { CACHE_CONTROL } from '../_lib/cache';
import { json } from '../_lib/http';
import { recordMetaDiagnostics } from '../_lib/meta-diagnostics';
import type { Env } from '../_lib/types';

type DiagnosticsCheck = {
  ok: boolean;
  error?: string;
};

type DiagnosticsTableCheck = DiagnosticsCheck & {
  exists?: boolean;
  count?: number;
  latest_created_at?: string | null;
  columns?: string[];
  missing_columns?: string[];
  optional_columns?: string[];
  missing_optional_columns?: string[];
};

const REQUIRED_DIAGNOSTICS_COLUMNS = [
  'event_name', 'event_id', 'event_time', 'status', 'events_received', 'fbtrace_id',
  'error_code', 'error_message', 'page_path', 'page_url', 'service',
  'has_fbp', 'has_fbc', 'has_external_id', 'has_email', 'has_phone', 'has_fbclid', 'has_utm',
  'marketing_consent', 'consent_version', 'consent_source', 'consent_region', 'consent_timestamp', 'created_at',
];

const OPTIONAL_DIAGNOSTICS_COLUMNS = [
  'form_id', 'form_variant', 'contact_method', 'lead_source_page', 'match_quality_score',
  'event_source_url', 'page_path_normalized', 'lead_value', 'lead_currency',
  'score_identity', 'score_attribution', 'score_consent', 'score_context',
];

function getProvidedSecret(request: Request): string | undefined {
  const url = new URL(request.url);
  return request.headers.get('x-meta-debug-secret') || url.searchParams.get('secret') || undefined;
}

function isEnabled(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

async function checkDiagnosticsTable(env: Env): Promise<DiagnosticsTableCheck> {
  if (!env.DB) {
    return { ok: false, exists: false, error: 'D1 binding DB is not available in this Pages environment.' };
  }

  try {
    const table = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='meta_capi_diagnostics' LIMIT 1",
    ).first<{ name: string }>();

    if (!table?.name) {
      return { ok: false, exists: false, error: 'D1 table meta_capi_diagnostics was not found on the bound DB.' };
    }

    const columnsResult = await env.DB.prepare(
      'PRAGMA table_info(meta_capi_diagnostics)',
    ).all<{ name: string }>();
    const columns = (columnsResult.results || []).map((column) => column.name).filter(Boolean);
    const missingColumns = REQUIRED_DIAGNOSTICS_COLUMNS.filter((column) => !columns.includes(column));
    const missingOptionalColumns = OPTIONAL_DIAGNOSTICS_COLUMNS.filter((column) => !columns.includes(column));

    const stats = await env.DB.prepare(
      'SELECT COUNT(*) AS count, MAX(created_at) AS latest_created_at FROM meta_capi_diagnostics',
    ).first<{ count: number; latest_created_at: string | null }>();

    return {
      ok: missingColumns.length === 0,
      exists: true,
      count: Number(stats?.count || 0),
      latest_created_at: stats?.latest_created_at ?? null,
      columns,
      missing_columns: missingColumns,
      optional_columns: OPTIONAL_DIAGNOSTICS_COLUMNS.filter((column) => columns.includes(column)),
      missing_optional_columns: missingOptionalColumns,
      error: missingColumns.length > 0 ? `D1 table is missing columns: ${missingColumns.join(', ')}` : undefined,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function checkDiagnosticEvent(env: Env, eventId: string): Promise<DiagnosticsCheck & { found?: boolean }> {
  if (!env.DB) return { ok: false, found: false, error: 'D1 binding DB is not available in this Pages environment.' };

  try {
    const row = await env.DB.prepare(
      'SELECT event_id FROM meta_capi_diagnostics WHERE event_id = ? LIMIT 1',
    ).bind(eventId).first<{ event_id: string }>();

    return { ok: Boolean(row?.event_id), found: Boolean(row?.event_id) };
  } catch (error) {
    return {
      ok: false,
      found: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function maybeWriteProbe(request: Request, env: Env): Promise<DiagnosticsCheck & { event_id?: string; inserted?: boolean; write_result?: Awaited<ReturnType<typeof recordMetaDiagnostics>> }> {
  const url = new URL(request.url);
  const shouldWrite = request.method === 'POST' || url.searchParams.get('write') === '1';

  if (!shouldWrite) return { ok: true };

  const eventId = `diagnostics-health-${crypto.randomUUID()}`;

  try {
    const writeResult = await recordMetaDiagnostics(env, {
      event_name: 'DiagnosticsHealthCheck',
      event_id: eventId,
      event_time: Math.floor(Date.now() / 1000),
      status: 'skipped',
      error_message: 'manual_diagnostics_probe',
      page_url: url.origin,
      service: 'meta_capi_diagnostics_health',
      marketing_consent: true,
    });

    if (!writeResult.d1.ok) {
      return {
        ok: false,
        event_id: eventId,
        inserted: false,
        write_result: writeResult,
        error: writeResult.d1.error || 'recordMetaDiagnostics did not write to D1.',
      };
    }

    const inserted = await checkDiagnosticEvent(env, eventId);

    return {
      ok: inserted.ok,
      event_id: eventId,
      inserted: inserted.found,
      write_result: writeResult,
      error: inserted.ok ? undefined : (inserted.error || 'Diagnostics probe row was not found after recordMetaDiagnostics ran.'),
    };
  } catch (error) {
    return {
      ok: false,
      event_id: eventId,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const debugSecret = env.META_CAPI_DEBUG_SECRET;
  const providedSecret = getProvidedSecret(request);

  if (!debugSecret || providedSecret !== debugSecret) {
    return json(
      { success: false, error: 'META_CAPI_DEBUG_SECRET is required and must match x-meta-debug-secret or ?secret=' },
      { status: 403, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }

  const before = await checkDiagnosticsTable(env);
  const write_probe = await maybeWriteProbe(request, env);
  const after = write_probe.event_id ? await checkDiagnosticsTable(env) : before;

  return json(
    {
      success: before.ok && write_probe.ok && after.ok,
      checked_at: new Date().toISOString(),
      environment: {
        has_DB_binding: Boolean(env.DB),
        has_META_CAPI_ACCESS_TOKEN: isEnabled(env.META_CAPI_ACCESS_TOKEN),
        has_META_CAPI_DEBUG_SECRET: isEnabled(env.META_CAPI_DEBUG_SECRET),
        has_META_CAPI_TEST_CODE: isEnabled(env.META_CAPI_TEST_CODE),
        has_META_CAPI_IDEMPOTENCY: Boolean(env.META_CAPI_IDEMPOTENCY),
        has_META_CAPI_DIAGNOSTICS: Boolean(env.META_CAPI_DIAGNOSTICS),
        META_CAPI_API_VERSION: env.META_CAPI_API_VERSION || null,
        VITE_META_PIXEL_ID: env.VITE_META_PIXEL_ID || null,
        SITE_URL_configured: isEnabled(env.SITE_URL),
      },
      diagnostics_table_before: before,
      write_probe,
      diagnostics_table_after: after,
      next_steps: [
        'If has_DB_binding=false, fix Pages Functions Production binding name to DB.',
        'If diagnostics_table_before.exists=false, run migration 0002 on the DB bound to Production.',
        'If diagnostics_table_before.missing_columns is not empty, apply the required base migration/schema to the DB bound to Production.',
        'If diagnostics_table_before.missing_optional_columns is not empty, apply optional quality/form diagnostics migration 0003 when ready.',
        'If write_probe.write_result.d1.error is present, that is the exact D1 write error from recordMetaDiagnostics.',
        'If write_probe.inserted=true and count increases, D1 diagnostics writes work and the empty table means browser/API events are not reaching the functions.',
      ],
    },
    { headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
  );
};
