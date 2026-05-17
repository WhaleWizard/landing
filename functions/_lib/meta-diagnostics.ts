import type { Env } from './types';

export type MetaDiagnosticsInput = {
  event_source_url?: string;
  page_path_normalized?: string;
  lead_value?: number;
  lead_currency?: string;
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
  form_id?: string;
  form_variant?: string;
  contact_method?: string;
  lead_source_page?: string;
};

type MetaDiagnosticsEnv = Env & {
  META_CAPI_DIAGNOSTICS?: KVNamespace;
};

export type MetaDiagnosticsWriteResult = {
  kv: { attempted: boolean; ok: boolean; error?: string };
  d1: { attempted: boolean; ok: boolean; error?: string; stored_columns?: string[]; match_quality_score?: number };
  console_fallback: boolean;
};

type DiagnosticValue = string | number | null;

type DiagnosticsColumnCache = {
  expiresAt: number;
  columns: Set<string>;
};

let diagnosticsColumnCache: DiagnosticsColumnCache | null = null;

function safeString(value: unknown, max = 2048): string | null {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized.slice(0, max) : null;
}

function safeBool(value: unknown): number | null {
  return typeof value === 'boolean' ? (value ? 1 : 0) : null;
}


function safeCurrency(value: unknown): string | null {
  const normalized = safeString(value, 3);
  return normalized ? normalized.toUpperCase() : null;
}

function safePositiveNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100) / 100;
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

function computeMatchQualityScore(input: MetaDiagnosticsInput): number {
  let score = 0;
  if (input.marketing_consent) score += 5;
  if (input.has_fbp) score += 12;
  if (input.has_fbc) score += 18;
  if (input.has_fbclid) score += 10;
  if (input.has_utm) score += 8;
  if (input.has_external_id) score += 12;
  if (input.has_email) score += 20;
  if (input.has_phone) score += 15;
  if (safeString(input.event_source_url, 2048)) score += 5;
  if (safeString(input.page_path_normalized, 512)) score += 5;
  if (safePositiveNumber(input.lead_value) !== null) score += 5;
  return Math.min(score, 100);
}

function computeScoreIdentity(input: MetaDiagnosticsInput): number {
  let score = 0;
  if (input.has_email) score += 40;
  if (input.has_phone) score += 30;
  if (input.has_external_id) score += 30;
  return Math.min(score, 100);
}

function computeScoreAttribution(input: MetaDiagnosticsInput): number {
  let score = 0;
  if (input.has_fbp) score += 25;
  if (input.has_fbc) score += 35;
  if (input.has_fbclid) score += 20;
  if (input.has_utm) score += 20;
  return Math.min(score, 100);
}

function computeScoreConsent(input: MetaDiagnosticsInput): number {
  return input.marketing_consent ? 100 : 0;
}

function computeScoreContext(input: MetaDiagnosticsInput): number {
  let score = 0;
  if (safeString(input.page_path, 512)) score += 20;
  if (safeString(input.page_path_normalized, 512)) score += 20;
  if (safeString(input.event_source_url, 2048)) score += 20;
  if (safeString(input.form_id, 120)) score += 20;
  if (safeString(input.lead_source_page, 512)) score += 20;
  return Math.min(score, 100);
}

async function getDiagnosticsColumns(db: D1Database): Promise<Set<string>> {
  const now = Date.now();
  if (diagnosticsColumnCache && diagnosticsColumnCache.expiresAt > now) {
    return diagnosticsColumnCache.columns;
  }

  const columnsResult = await db.prepare('PRAGMA table_info(meta_capi_diagnostics)').all<{ name: string }>();
  const columns = new Set((columnsResult.results || []).map((column) => column.name).filter(Boolean));
  diagnosticsColumnCache = { columns, expiresAt: now + 5 * 60 * 1000 };
  return columns;
}

function buildDiagnosticValues(input: MetaDiagnosticsInput, createdAt: string): Record<string, DiagnosticValue> {
  const matchQualityScore = computeMatchQualityScore(input);
  const scoreIdentity = computeScoreIdentity(input);
  const scoreAttribution = computeScoreAttribution(input);
  const scoreConsent = computeScoreConsent(input);
  const scoreContext = computeScoreContext(input);

  return {
    event_name: safeString(input.event_name, 80),
    event_id: safeString(input.event_id, 128),
    event_time: input.event_time ?? null,
    status: safeString(input.status, 20),
    events_received: input.events_received ?? null,
    fbtrace_id: safeString(input.fbtrace_id, 120),
    error_code: safeString(input.error_code, 80),
    error_message: safeString(input.error_message, 1024),
    page_path: safeString(input.page_path, 512),
    page_url: safeString(input.page_url, 2048),
    event_source_url: safeString(input.event_source_url, 2048),
    page_path_normalized: safeString(input.page_path_normalized, 512),
    service: safeString(input.service, 120),
    has_fbp: safeBool(input.has_fbp),
    has_fbc: safeBool(input.has_fbc),
    has_external_id: safeBool(input.has_external_id),
    has_email: safeBool(input.has_email),
    has_phone: safeBool(input.has_phone),
    has_fbclid: safeBool(input.has_fbclid),
    has_utm: safeBool(input.has_utm),
    marketing_consent: safeBool(input.marketing_consent),
    consent_version: input.consent_version ?? null,
    consent_source: safeString(input.consent_source, 80),
    consent_region: safeString(input.consent_region, 80),
    consent_timestamp: input.consent_timestamp ?? null,
    form_id: safeString(input.form_id, 120),
    form_variant: safeString(input.form_variant, 120),
    contact_method: safeString(input.contact_method, 80),
    lead_source_page: safeString(input.lead_source_page, 512),
    match_quality_score: matchQualityScore,
    score_identity: scoreIdentity,
    score_attribution: scoreAttribution,
    score_consent: scoreConsent,
    score_context: scoreContext,
    lead_value: safePositiveNumber(input.lead_value),
    lead_currency: safeCurrency(input.lead_currency),
    created_at: createdAt,
  };
}

export async function recordMetaDiagnostics(env: MetaDiagnosticsEnv, input: MetaDiagnosticsInput): Promise<MetaDiagnosticsWriteResult> {
  const createdAt = getCreatedAt();
  const valuesByColumn = buildDiagnosticValues(input, createdAt);
  const record = {
    ...input,
    match_quality_score: valuesByColumn.match_quality_score,
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
      const availableColumns = await getDiagnosticsColumns(env.DB);
      const columns = Object.keys(valuesByColumn).filter((column) => availableColumns.has(column));
      const placeholders = columns.map(() => '?').join(', ');
      const values = columns.map((column) => valuesByColumn[column]);

      await env.DB.prepare(`
        INSERT INTO meta_capi_diagnostics (${columns.join(', ')})
        VALUES (${placeholders})
      `).bind(...values).run();

      result.d1.ok = true;
      result.d1.stored_columns = columns;
      result.d1.match_quality_score = Number(valuesByColumn.match_quality_score);
    } catch (error) {
      result.d1.error = toErrorMessage(error);
      diagnosticsColumnCache = null;
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
