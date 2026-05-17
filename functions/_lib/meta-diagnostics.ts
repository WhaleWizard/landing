import type { Env } from './types';

export type MetaDiagnosticsInput = {
  event_name: string;
  event_id?: string;
  event_time?: number;
  status: 'sent' | 'failed' | 'skipped';
  events_received?: number;
  fbtrace_id?: string;
  error_code?: string | number;
  error_message?: string;
  page_path?: string;
  page_url?: string;
  service?: string;
  has_fbp?: boolean;
  has_fbc?: boolean;
  has_external_id?: boolean;
  has_email?: boolean;
  has_phone?: boolean;
  has_fbclid?: boolean;
  has_utm?: boolean;
  marketing_consent?: boolean;
  consent_version?: number;
  consent_source?: string;
  consent_region?: string;
  consent_timestamp?: number;
};

type MetaDiagnosticsEnv = Env & {
  META_CAPI_DIAGNOSTICS?: KVNamespace;
};

export type MetaDiagnosticsWriteResult = {
  kv: { attempted: boolean; ok: boolean; error?: string };
  d1: { attempted: boolean; ok: boolean; error?: string };
  console_fallback: boolean;
};

function safeString(value: unknown, max = 2048): string | null {
  if (value === undefined || value === null) return null;
  return String(value).slice(0, max);
}

function safeBool(value: unknown): number | null {
  return typeof value === 'boolean' ? (value ? 1 : 0) : null;
}

function getCreatedAt(): string {
  return new Date().toISOString();
}

function getDiagnosticId(input: MetaDiagnosticsInput): string {
  const random = crypto.randomUUID();
  return `meta_capi_diag:${Date.now()}:${input.event_name}:${input.event_id || random}:${random}`;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function recordMetaDiagnostics(env: MetaDiagnosticsEnv, input: MetaDiagnosticsInput): Promise<MetaDiagnosticsWriteResult> {
  const createdAt = getCreatedAt();
  const record = {
    ...input,
    created_at: createdAt,
  };

  const result: MetaDiagnosticsWriteResult = {
    kv: { attempted: false, ok: false },
    d1: { attempted: false, ok: false },
    console_fallback: false,
  };

  const kv = env.META_CAPI_DIAGNOSTICS;
  if (kv) {
    result.kv.attempted = true;
    try {
      await kv.put(getDiagnosticId(input), JSON.stringify(record), { expirationTtl: 60 * 60 * 24 * 30 });
      result.kv.ok = true;
    } catch (error) {
      result.kv.error = toErrorMessage(error);
      console.warn('[Meta CAPI] Failed to write diagnostics to KV', error);
    }
  }

  if (env.DB) {
    result.d1.attempted = true;
    try {
      await env.DB.prepare(`
        INSERT INTO meta_capi_diagnostics (
          event_name, event_id, event_time, status, events_received, fbtrace_id,
          error_code, error_message, page_path, page_url, service,
          has_fbp, has_fbc, has_external_id, has_email, has_phone, has_fbclid, has_utm,
          marketing_consent, consent_version, consent_source, consent_region, consent_timestamp, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        safeString(input.event_name, 80),
        safeString(input.event_id, 128),
        input.event_time ?? null,
        safeString(input.status, 20),
        input.events_received ?? null,
        safeString(input.fbtrace_id, 120),
        safeString(input.error_code, 80),
        safeString(input.error_message, 1024),
        safeString(input.page_path, 512),
        safeString(input.page_url, 2048),
        safeString(input.service, 120),
        safeBool(input.has_fbp),
        safeBool(input.has_fbc),
        safeBool(input.has_external_id),
        safeBool(input.has_email),
        safeBool(input.has_phone),
        safeBool(input.has_fbclid),
        safeBool(input.has_utm),
        safeBool(input.marketing_consent),
        input.consent_version ?? null,
        safeString(input.consent_source, 80),
        safeString(input.consent_region, 80),
        input.consent_timestamp ?? null,
        createdAt,
      ).run();
      result.d1.ok = true;
    } catch (error) {
      result.d1.error = toErrorMessage(error);
      console.warn('[Meta CAPI] Failed to write diagnostics to D1', error);
    }
  }

  if (!kv && !env.DB) {
    result.console_fallback = true;
    console.info('[Meta CAPI diagnostics]', record);
  }

  return result;
}

export async function wasMetaEventAlreadySent(env: Env & { META_CAPI_IDEMPOTENCY?: KVNamespace }, eventName: string, eventId?: string): Promise<boolean> {
  if (!eventId || !env.META_CAPI_IDEMPOTENCY) return false;
  try {
    const key = `meta_capi_sent:${eventName}:${eventId}`;
    return Boolean(await env.META_CAPI_IDEMPOTENCY.get(key));
  } catch (error) {
    console.warn('[Meta CAPI] Idempotency read failed', error);
    return false;
  }
}

export async function markMetaEventSent(env: Env & { META_CAPI_IDEMPOTENCY?: KVNamespace }, eventName: string, eventId?: string): Promise<void> {
  if (!eventId || !env.META_CAPI_IDEMPOTENCY) return;
  try {
    const key = `meta_capi_sent:${eventName}:${eventId}`;
    await env.META_CAPI_IDEMPOTENCY.put(key, '1', { expirationTtl: 60 * 60 * 48 });
  } catch (error) {
    console.warn('[Meta CAPI] Idempotency write failed', error);
  }
}
