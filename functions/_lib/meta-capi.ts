import type { Env } from './types';

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

  return !origin && !referer;
}

function safeHost(value: string | null): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).host;
  } catch {
    return undefined;
  }
}
