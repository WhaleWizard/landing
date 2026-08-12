import { verifyAdminPassword } from '../../_lib/auth';
import { CACHE_CONTROL } from '../../_lib/cache';
import { json } from '../../_lib/http';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };
const PSI_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
const MAX_SITEMAP_URLS = 200;
const PSI_TIMEOUT_MS = 90_000;
const PSI_CACHE_TTL_SECONDS = 12 * 60 * 60;
const PSI_CACHE_VERSION = '1';

type Strategy = 'mobile' | 'desktop';

interface LighthouseAudit {
  title?: string;
  description?: string;
  score?: number | null;
  numericValue?: number;
  numericUnit?: string;
  displayValue?: string;
  details?: {
    type?: string;
    overallSavingsMs?: number;
    overallSavingsBytes?: number;
  };
}

interface PsiResponse {
  id?: string;
  analysisUTCTimestamp?: string;
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: unknown;
  };
  loadingExperience?: {
    overall_category?: string;
    metrics?: Record<string, { percentile?: number; category?: string }>;
  };
  originLoadingExperience?: {
    overall_category?: string;
    metrics?: Record<string, { percentile?: number; category?: string }>;
  };
  lighthouseResult?: {
    finalUrl?: string;
    fetchTime?: string;
    lighthouseVersion?: string;
    runWarnings?: string[];
    runtimeError?: { message?: string };
    categories?: {
      performance?: { score?: number | null };
      accessibility?: { score?: number | null };
      'best-practices'?: { score?: number | null };
      seo?: { score?: number | null };
    };
    audits?: Record<string, LighthouseAudit>;
  };
}

interface WorkerCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

function defaultWorkerCache(): WorkerCache | null {
  try {
    const cacheStorage = (globalThis as unknown as {
      caches?: { default?: WorkerCache };
    }).caches;
    return cacheStorage?.default || null;
  } catch {
    return null;
  }
}

function auditCacheRequest(request: Request, target: URL, strategy: Strategy): Request {
  const cacheUrl = new URL(request.url);
  cacheUrl.search = '';
  cacheUrl.searchParams.set('url', target.toString());
  cacheUrl.searchParams.set('strategy', strategy);
  cacheUrl.searchParams.set('cacheVersion', PSI_CACHE_VERSION);
  return new Request(cacheUrl.toString(), { method: 'GET' });
}

function isQuotaError(status: number, payload: PsiResponse): boolean {
  if (status === 429 || payload.error?.code === 429) return true;
  const errorText = [
    payload.error?.status,
    payload.error?.message,
    payload.error?.details ? JSON.stringify(payload.error.details) : '',
  ].filter(Boolean).join(' ');
  return /resource[_\s-]*exhausted|quota\s*(?:exceeded|limit)|queries\s+per\s+day/i.test(errorText);
}

function isConfigurationError(status: number, payload: PsiResponse): boolean {
  if (status !== 400 && status !== 403) return false;
  const errorText = [
    payload.error?.status,
    payload.error?.message,
    payload.error?.details ? JSON.stringify(payload.error.details) : '',
  ].filter(Boolean).join(' ');
  return /api.?key|access.?not.?configured|not been used|not enabled|disabled|permission denied|forbidden/i.test(errorText);
}

function adminRateLimitError(response: Response): Response {
  const retryAfter = response.headers.get('Retry-After');
  return json({
    success: false,
    code: 'ADMIN_RATE_LIMITED',
    fatal: true,
    retryable: true,
    error: 'Слишком много запросов к проверке скорости. Подождите до окончания текущего минутного окна и запустите проверку снова.',
  }, {
    status: 429,
    headers: {
      ...noStore,
      ...(retryAfter ? { 'Retry-After': retryAfter } : {}),
    },
  });
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, '');
}

function configuredOrigin(request: Request, env: Env): URL {
  try {
    return new URL(env.SITE_URL || new URL(request.url).origin);
  } catch {
    return new URL(request.url);
  }
}

function isAllowedSiteUrl(candidate: URL, origin: URL): boolean {
  return candidate.protocol === 'https:'
    && normalizeHostname(candidate.hostname) === normalizeHostname(origin.hostname);
}

function auditMetric(audits: Record<string, LighthouseAudit>, id: string) {
  const audit = audits[id];
  if (!audit) return null;
  return {
    value: typeof audit.numericValue === 'number' ? audit.numericValue : null,
    unit: audit.numericUnit || null,
    displayValue: audit.displayValue || null,
    score: typeof audit.score === 'number' ? audit.score : null,
  };
}

function fieldMetric(
  metrics: Record<string, { percentile?: number; category?: string }> | undefined,
  id: string,
  scale = 1,
) {
  const metric = metrics?.[id];
  if (!metric || typeof metric.percentile !== 'number') return null;
  return {
    value: metric.percentile / scale,
    category: metric.category || 'NONE',
  };
}

function compactPsiResponse(payload: PsiResponse, requestedUrl: string, strategy: Strategy) {
  const lighthouse = payload.lighthouseResult;
  if (!lighthouse) {
    throw new Error(payload.error?.message || 'PageSpeed не вернул результат Lighthouse');
  }
  if (lighthouse.runtimeError?.message) {
    throw new Error(lighthouse.runtimeError.message);
  }

  const audits = lighthouse.audits || {};
  const opportunities = Object.entries(audits)
    .filter(([, audit]) => (
      audit.details?.type === 'opportunity'
      && (
        Number(audit.details.overallSavingsMs || 0) > 0
        || Number(audit.details.overallSavingsBytes || 0) > 0
      )
    ))
    .map(([id, audit]) => ({
      id,
      title: audit.title || id,
      displayValue: audit.displayValue || null,
      savingsMs: Math.round(Number(audit.details?.overallSavingsMs || 0)),
      savingsBytes: Math.round(Number(audit.details?.overallSavingsBytes || 0)),
    }))
    .sort((a, b) => (b.savingsMs - a.savingsMs) || (b.savingsBytes - a.savingsBytes))
    .slice(0, 5);

  const pageField = payload.loadingExperience;
  const originField = payload.originLoadingExperience;
  const fieldSource = Object.keys(pageField?.metrics || {}).length > 0 ? pageField : originField;
  const fieldScope = fieldSource === pageField ? 'page' : fieldSource === originField ? 'origin' : 'none';
  const categoryScore = (id: 'performance' | 'accessibility' | 'best-practices' | 'seo') => {
    const score = lighthouse.categories?.[id]?.score;
    return typeof score === 'number' ? Math.round(score * 100) : null;
  };

  return {
    url: requestedUrl,
    finalUrl: lighthouse.finalUrl || payload.id || requestedUrl,
    strategy,
    score: categoryScore('performance'),
    scores: {
      performance: categoryScore('performance'),
      accessibility: categoryScore('accessibility'),
      bestPractices: categoryScore('best-practices'),
      seo: categoryScore('seo'),
    },
    fetchedAt: lighthouse.fetchTime || payload.analysisUTCTimestamp || new Date().toISOString(),
    lighthouseVersion: lighthouse.lighthouseVersion || null,
    lab: {
      fcp: auditMetric(audits, 'first-contentful-paint'),
      lcp: auditMetric(audits, 'largest-contentful-paint'),
      tbt: auditMetric(audits, 'total-blocking-time'),
      cls: auditMetric(audits, 'cumulative-layout-shift'),
      speedIndex: auditMetric(audits, 'speed-index'),
      serverResponse: auditMetric(audits, 'server-response-time'),
      totalBytes: auditMetric(audits, 'total-byte-weight'),
    },
    field: {
      scope: fieldScope,
      overallCategory: fieldSource?.overall_category || 'NONE',
      lcp: fieldMetric(fieldSource?.metrics, 'LARGEST_CONTENTFUL_PAINT_MS'),
      inp: fieldMetric(fieldSource?.metrics, 'INTERACTION_TO_NEXT_PAINT'),
      cls: fieldMetric(fieldSource?.metrics, 'CUMULATIVE_LAYOUT_SHIFT_SCORE', 100),
      fcp: fieldMetric(fieldSource?.metrics, 'FIRST_CONTENTFUL_PAINT_MS'),
      ttfb: fieldMetric(fieldSource?.metrics, 'EXPERIMENTAL_TIME_TO_FIRST_BYTE'),
    },
    opportunities,
    warnings: (lighthouse.runWarnings || []).slice(0, 5),
  };
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PSI_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { 'User-Agent': 'whale-wizard-admin-performance/1.0' },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function listSitemapPages(request: Request, env: Env): Promise<Response> {
  const origin = configuredOrigin(request, env);
  const sitemapUrl = new URL('/sitemap.xml', origin);
  const response = await fetch(sitemapUrl.toString(), {
    headers: { 'User-Agent': 'whale-wizard-admin-performance/1.0' },
  });
  if (!response.ok) {
    return json(
      { success: false, error: `sitemap.xml ответил HTTP ${response.status}` },
      { status: 502, headers: noStore },
    );
  }

  const xml = await response.text();
  const discovered = Array.from(xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi))
    .map((match) => decodeXml(match[1].trim()))
    .filter(Boolean);
  const unique = Array.from(new Set(discovered))
    .map((value) => {
      try {
        return new URL(value, origin);
      } catch {
        return null;
      }
    })
    .filter((value): value is URL => Boolean(value && isAllowedSiteUrl(value, origin)))
    .map((value) => value.toString());

  return json({
    success: true,
    pages: unique.slice(0, MAX_SITEMAP_URLS),
    total: unique.length,
    truncated: unique.length > MAX_SITEMAP_URLS,
    sitemapUrl: sitemapUrl.toString(),
    apiKeyConfigured: Boolean(env.PAGESPEED_API_KEY?.trim()),
  }, { headers: noStore });
}

type CompactResult = ReturnType<typeof compactPsiResponse>;

const HISTORY_MIGRATION = '0030_pagespeed_history.sql';

function isMissingTableError(error: unknown): boolean {
  return /no such table/i.test(error instanceof Error ? error.message : String(error));
}

/**
 * Запись замера в историю — «лучшее усилие»: если таблицы ещё нет или база
 * недоступна, проверка скорости всё равно должна вернуть результат.
 * Одна строка на день, страницу и режим: повторный запуск в тот же день
 * переписывает запись, а не плодит точки на графике.
 */
async function recordHistory(env: Env, result: CompactResult): Promise<void> {
  if (!env.DB) return;
  const day = new Date().toISOString().slice(0, 10);
  try {
    await env.DB
      .prepare(`INSERT OR REPLACE INTO pagespeed_history
        (day, url, strategy, performance, accessibility, best_practices, seo, lcp_ms, cls, tbt_ms, total_bytes, checked_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(
        day,
        result.url,
        result.strategy,
        result.scores.performance,
        result.scores.accessibility,
        result.scores.bestPractices,
        result.scores.seo,
        result.lab.lcp?.value ?? null,
        result.lab.cls?.value ?? null,
        result.lab.tbt?.value ?? null,
        result.lab.totalBytes?.value ?? null,
        result.fetchedAt,
      )
      .run();
  } catch {
    // История — приятное дополнение, а не условие работы раздела.
  }
}

/** Средняя оценка скорости по дням: видно, куда движется сайт в целом. */
async function listHistory(env: Env, days: number): Promise<Response> {
  if (!env.DB) {
    return json(
      { success: false, localOnly: true, error: 'База D1 не подключена (доступно только на продакшене)' },
      { status: 503, headers: noStore },
    );
  }
  try {
    const rows = await env.DB
      .prepare(`SELECT day,
                       ROUND(AVG(CASE WHEN strategy = 'mobile' THEN performance END)) AS mobile,
                       ROUND(AVG(CASE WHEN strategy = 'desktop' THEN performance END)) AS desktop,
                       COUNT(DISTINCT url) AS pages
                FROM pagespeed_history
                WHERE performance IS NOT NULL
                GROUP BY day
                ORDER BY day DESC
                LIMIT ?`)
      .bind(Math.min(120, Math.max(1, days)))
      .all<{ day: string; mobile: number | null; desktop: number | null; pages: number }>();

    const history = (rows.results || []).slice().reverse();
    return json({ success: true, history }, { headers: noStore });
  } catch (error) {
    if (isMissingTableError(error)) {
      return json(
        {
          success: false,
          migrationRequired: true,
          migration: HISTORY_MIGRATION,
          error: `Примените миграцию ${HISTORY_MIGRATION} — до неё история замеров не сохраняется.`,
        },
        { status: 503, headers: noStore },
      );
    }
    return json(
      { success: false, error: error instanceof Error ? error.message : 'Не удалось загрузить историю' },
      { status: 500, headers: noStore },
    );
  }
}

async function runAudit(
  request: Request,
  env: Env,
  requestedUrl: string,
  strategy: Strategy,
  force: boolean,
): Promise<Response> {
  const siteOrigin = configuredOrigin(request, env);
  let target: URL;
  try {
    target = new URL(requestedUrl);
  } catch {
    return json({ success: false, error: 'Некорректный URL' }, { status: 400, headers: noStore });
  }
  if (!isAllowedSiteUrl(target, siteOrigin)) {
    return json(
      { success: false, error: 'Можно проверять только страницы этого сайта' },
      { status: 400, headers: noStore },
    );
  }

  const apiKey = env.PAGESPEED_API_KEY?.trim() || '';
  if (!apiKey) {
    return json({
      success: false,
      code: 'PAGESPEED_KEY_REQUIRED',
      fatal: true,
      retryable: false,
      apiKeyConfigured: false,
      quotaBlocked: false,
      error: 'Для проверки скорости нужен ключ Google PageSpeed Insights API. Добавьте секрет PAGESPEED_API_KEY в настройках Cloudflare Pages.',
    }, { status: 503, headers: noStore });
  }

  const cache = defaultWorkerCache();
  const cacheRequest = auditCacheRequest(request, target, strategy);
  if (cache && !force) {
    try {
      const cachedResponse = await cache.match(cacheRequest);
      if (cachedResponse) {
        const cachedResult = await cachedResponse.json();
        return json({
          success: true,
          result: cachedResult,
          apiKeyConfigured: true,
          cached: true,
        }, { headers: noStore });
      }
    } catch {
      // Cache API is optional locally and must never block a real PSI request.
    }
  }

  const apiUrl = new URL(PSI_ENDPOINT);
  apiUrl.searchParams.set('url', target.toString());
  apiUrl.searchParams.set('strategy', strategy);
  apiUrl.searchParams.append('category', 'performance');
  apiUrl.searchParams.append('category', 'accessibility');
  apiUrl.searchParams.append('category', 'best-practices');
  apiUrl.searchParams.append('category', 'seo');
  apiUrl.searchParams.set('locale', 'ru_RU');
  apiUrl.searchParams.set('key', apiKey);

  try {
    let response = await fetchWithTimeout(apiUrl.toString());
    let payload = await response.json().catch(() => ({})) as PsiResponse;

    // Lighthouse иногда отвечает «Something went wrong» на исправной странице:
    // отчёт приходит с кодом 200, но с runtimeError вместо результата. Одна
    // повторная попытка снимает такой разовый сбой, из-за которого раздел
    // показывал ошибку на странице, которая на самом деле проверяется.
    if (response.ok && payload.lighthouseResult?.runtimeError?.message) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const retryResponse = await fetchWithTimeout(apiUrl.toString());
      const retryPayload = await retryResponse.json().catch(() => ({})) as PsiResponse;
      // From this point the retry is the actual PSI response. Keeping the first
      // 200/runtimeError here would hide a quota, key configuration or other
      // HTTP error returned by the second request.
      response = retryResponse;
      payload = retryPayload;
    }

    if (!response.ok) {
      if (isQuotaError(response.status, payload)) {
        return json({
          success: false,
          code: 'PAGESPEED_QUOTA_EXCEEDED',
          fatal: true,
          retryable: true,
          quotaBlocked: true,
          apiKeyConfigured: true,
          error: 'Квота Google PageSpeed Insights исчерпана. Дождитесь её обновления или увеличьте лимит API в Google Cloud.',
        }, { status: 429, headers: noStore });
      }
      if (isConfigurationError(response.status, payload)) {
        return json({
          success: false,
          code: 'PAGESPEED_CONFIGURATION_ERROR',
          fatal: true,
          retryable: false,
          quotaBlocked: false,
          apiKeyConfigured: true,
          error: 'Ключ PageSpeed API недействителен, API не включён или ограничения ключа блокируют запрос. Проверьте PageSpeed Insights API и PAGESPEED_API_KEY в Google Cloud.',
        }, { status: 503, headers: noStore });
      }
      const message = payload.error?.message || `PageSpeed API ответил HTTP ${response.status}`;
      return json({
        success: false,
        error: message,
        fatal: false,
        apiKeyConfigured: true,
        quotaBlocked: false,
      }, { status: 502, headers: noStore });
    }

    const result = compactPsiResponse(payload, target.toString(), strategy);
    await recordHistory(env, result);
    if (cache) {
      try {
        await cache.put(cacheRequest, new Response(JSON.stringify(result), {
          headers: {
            'Cache-Control': `max-age=${PSI_CACHE_TTL_SECONDS}`,
            'Content-Type': 'application/json; charset=utf-8',
          },
        }));
      } catch {
        // Cache writes are best-effort and unavailable in some local runtimes.
      }
    }

    return json({
      success: true,
      result,
      apiKeyConfigured: true,
      cached: false,
    }, { headers: noStore });
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'PageSpeed не успел ответить за 90 секунд'
      : error instanceof Error ? error.message : 'Не удалось выполнить проверку PageSpeed';
    return json({
      success: false,
      error: message,
      fatal: false,
      apiKeyConfigured: true,
      quotaBlocked: false,
    }, { status: 502, headers: noStore });
  }
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const password = request.headers.get('X-Admin-Password') || '';
  if (!verifyAdminPassword(password, env)) {
    const unauthorizedRateLimit = await enforceRateLimit(request, 'admin');
    if (unauthorizedRateLimit) return adminRateLimitError(unauthorizedRateLimit);
    return json({
      success: false,
      code: 'ADMIN_AUTH_REQUIRED',
      fatal: true,
      retryable: false,
      error: 'Пароль администратора больше не принят. Обновите страницу и войдите в админку заново.',
    }, { status: 401, headers: noStore });
  }
  const performanceRateLimit = await enforceRateLimit(request, 'admin_performance');
  if (performanceRateLimit) return adminRateLimitError(performanceRateLimit);

  const params = new URL(request.url).searchParams;
  if (params.get('history') === '1') {
    return listHistory(env, Number(params.get('days')) || 60);
  }

  const requestedUrl = params.get('url')?.trim() || '';
  if (!requestedUrl) return listSitemapPages(request, env);

  const strategy: Strategy = params.get('strategy') === 'desktop' ? 'desktop' : 'mobile';
  return runAudit(request, env, requestedUrl, strategy, params.get('force') === '1');
};
