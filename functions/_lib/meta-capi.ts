import type { Env } from './types';

export const DEFAULT_META_PIXEL_ID = '926332213606723';

export type MetaApiReceipt = {
  events_received?: number;
  fbtrace_id?: string;
  messages?: string[];
  error?: {
    code?: number | string;
    error_subcode?: number | string;
    is_transient?: boolean | number | string;
    message?: string;
    type?: string;
    fbtrace_id?: string;
  };
};

export type MetaDataProcessingOptions = {
  data_processing_options?: string[];
  data_processing_options_country?: number;
  data_processing_options_state?: number;
};

export function getMetaPixelId(env: Env): string {
  return env.VITE_META_PIXEL_ID || DEFAULT_META_PIXEL_ID;
}

export function getMetaApiVersion(env: Env): string {
  return env.META_CAPI_API_VERSION || 'v25.0';
}

export function isConfirmedMetaReceipt(receipt: MetaApiReceipt | null | undefined): boolean {
  return Number(receipt?.events_received || 0) > 0;
}

// Meta can return retryable Graph errors as HTTP 400. The structured Graph
// error is therefore part of the retry decision; HTTP status alone is not.
const RETRYABLE_META_ERROR_CODES = new Set([
  1, 2, 4, 17, 32, 341, 613, 2601,
  80000, 80001, 80002, 80003, 80004, 80005, 80006, 80008,
]);
const RETRYABLE_META_ERROR_SUBCODES = new Set([99, 1815107, 2018012]);

function optionalInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function isExplicitTrue(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true';
}

export function parseMetaApiReceipt(value: string): MetaApiReceipt | null {
  if (!value.trim()) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as MetaApiReceipt
      : null;
  } catch {
    return null;
  }
}

export function isRetryableMetaResponse(status: number, receipt: MetaApiReceipt | null | undefined): boolean {
  if (isRetryableMetaStatus(status)) return true;

  const graphError = receipt?.error;
  if (isExplicitTrue(graphError?.is_transient)) return true;

  const code = optionalInteger(graphError?.code);
  if (code !== undefined && RETRYABLE_META_ERROR_CODES.has(code)) return true;

  const subcode = optionalInteger(graphError?.error_subcode);
  if (subcode !== undefined && RETRYABLE_META_ERROR_SUBCODES.has(subcode)) return true;

  // A parsed, non-transient 4xx is permanent. Unexpected non-4xx responses
  // (including an unconfirmed 2xx) stay retryable so an ambiguous response
  // can never destroy the durable payload.
  return !(status >= 400 && status < 500);
}

function parseDataProcessingOptions(value: string | undefined): string[] | undefined {
  const options = (value || '')
    .split(',')
    .map((option) => option.trim())
    .filter(Boolean);
  return options.length ? options : undefined;
}

function parseOptionalInteger(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

export function getMetaDataProcessingOptions(env: Env): MetaDataProcessingOptions {
  const dataProcessingOptions = parseDataProcessingOptions(env.META_CAPI_DATA_PROCESSING_OPTIONS);
  if (!dataProcessingOptions) return {};

  const country = parseOptionalInteger(env.META_CAPI_DATA_PROCESSING_OPTIONS_COUNTRY);
  const state = parseOptionalInteger(env.META_CAPI_DATA_PROCESSING_OPTIONS_STATE);
  const hasGeoPair = typeof country === 'number' && typeof state === 'number';

  return {
    data_processing_options: dataProcessingOptions,
    data_processing_options_country: hasGeoPair ? country : undefined,
    data_processing_options_state: hasGeoPair ? state : undefined,
  };
}

export function getMetaTimeoutMs(env: Env): number {
  const raw = Number((env as Env & { META_CAPI_TIMEOUT_MS?: string }).META_CAPI_TIMEOUT_MS || 4500);
  if (!Number.isFinite(raw)) return 4500;
  return Math.min(10000, Math.max(1500, Math.floor(raw)));
}

export function getMetaRetryCount(env: Env): number {
  const raw = Number((env as Env & { META_CAPI_RETRY_COUNT?: string }).META_CAPI_RETRY_COUNT || 2);
  if (!Number.isFinite(raw)) return 2;
  return Math.min(4, Math.max(0, Math.floor(raw)));
}

export function isRetryableMetaStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

export async function fetchMetaWithRetry(url: string, init: RequestInit, env: Env): Promise<Response> {
  const timeoutMs = getMetaTimeoutMs(env);
  const retries = getMetaRetryCount(env);
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(`meta_timeout_${timeoutMs}ms`), timeoutMs);

    try {
      const response = await fetch(url, { ...init, signal: ctrl.signal });
      clearTimeout(timer);
      if (response.ok || !isRetryableMetaStatus(response.status) || attempt === retries) {
        return response;
      }
    } catch (error) {
      clearTimeout(timer);
      lastError = error;
      if (attempt === retries) throw error;
    }

    const backoffMs = Math.min(2500, 200 * 2 ** attempt) + Math.floor(Math.random() * 200);
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
  }

  throw (lastError instanceof Error ? lastError : new Error('Meta request failed after retries'));
}

export function isTrustedTrackingRequest(request: Request, env: Env): boolean {
  const siteUrl = env.SITE_URL;
  if (!siteUrl) return true;

  let siteHost = '';
  try {
    siteHost = new URL(siteUrl).host;
  } catch {
    return true;
  }

  const origin = request.headers.get('Origin');
  const referer = request.headers.get('Referer');

  const originHost = safeHost(origin);
  const refererHost = safeHost(referer);

  if (originHost && originHost === siteHost) return true;
  if (refererHost && refererHost === siteHost) return true;

  // Раньше здесь было `return !origin && !referer` — доверяли запросу, если
  // ОБА заголовка отсутствуют. Браузер их всегда проставляет сам; отсутствие
  // обоих — типичный признак прямого скрипта/curl, а не реального визита.
  // Такой запрос не должен автоматически считаться доверенным.
  return false;
}

function safeHost(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).host;
  } catch {
    return undefined;
  }
}
