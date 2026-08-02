import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import RealUserVitals from './RealUserVitals';
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Gauge,
  LoaderCircle,
  Monitor,
  Play,
  RefreshCw,
  Smartphone,
  Square,
} from 'lucide-react';

type Strategy = 'mobile' | 'desktop';
type RunStatus = 'idle' | 'running' | 'done' | 'error';
type FatalErrorCode =
  | 'PAGESPEED_KEY_REQUIRED'
  | 'PAGESPEED_QUOTA_EXCEEDED'
  | 'PAGESPEED_CONFIGURATION_ERROR'
  | 'ADMIN_AUTH_REQUIRED'
  | 'ADMIN_RATE_LIMITED';
type ApiBlock = 'quota' | 'configuration' | 'auth' | 'rate-limit';

interface AuditMetric {
  value: number | null;
  unit: string | null;
  displayValue: string | null;
  score: number | null;
}

interface FieldMetric {
  value: number;
  category: string;
}

interface PerformanceResult {
  url: string;
  finalUrl: string;
  strategy: Strategy;
  cacheHit?: boolean;
  score: number | null;
  scores: {
    performance: number | null;
    accessibility: number | null;
    bestPractices: number | null;
    seo: number | null;
  };
  fetchedAt: string;
  lighthouseVersion: string | null;
  lab: {
    fcp: AuditMetric | null;
    lcp: AuditMetric | null;
    tbt: AuditMetric | null;
    cls: AuditMetric | null;
    speedIndex: AuditMetric | null;
    serverResponse: AuditMetric | null;
    totalBytes: AuditMetric | null;
  };
  field: {
    scope: 'page' | 'origin' | 'none';
    overallCategory: string;
    lcp: FieldMetric | null;
    inp: FieldMetric | null;
    cls: FieldMetric | null;
    fcp: FieldMetric | null;
    ttfb: FieldMetric | null;
  };
  opportunities: Array<{
    id: string;
    title: string;
    displayValue: string | null;
    savingsMs: number;
    savingsBytes: number;
  }>;
  warnings: string[];
}

interface PageRow {
  url: string;
  mobile?: PerformanceResult;
  desktop?: PerformanceResult;
  mobileStatus: RunStatus;
  desktopStatus: RunStatus;
  mobileError?: string;
  desktopError?: string;
}

interface PagesPayload {
  success?: boolean;
  pages?: string[];
  total?: number;
  truncated?: boolean;
  sitemapUrl?: string;
  apiKeyConfigured?: boolean;
  code?: string;
  error?: string;
  localOnly?: boolean;
}

const STORAGE_KEY = 'ww-admin-performance-results-v1';
const RESULT_FRESHNESS_MS = 12 * 60 * 60 * 1000;
const FATAL_ERROR_CODES = new Set<FatalErrorCode>([
  'PAGESPEED_KEY_REQUIRED',
  'PAGESPEED_QUOTA_EXCEEDED',
  'PAGESPEED_CONFIGURATION_ERROR',
  'ADMIN_AUTH_REQUIRED',
  'ADMIN_RATE_LIMITED',
]);

class PerformanceApiError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'PerformanceApiError';
    this.code = code;
  }
}

interface RunSummary {
  successCount: number;
  errorCount: number;
  fatal?: {
    code: FatalErrorCode;
    message: string;
  };
}

function isFatalError(error: unknown): error is PerformanceApiError & { code: FatalErrorCode } {
  return error instanceof PerformanceApiError
    && FATAL_ERROR_CODES.has(error.code as FatalErrorCode);
}

function fatalNotice(code: FatalErrorCode): string {
  if (code === 'PAGESPEED_KEY_REQUIRED') {
    return 'ключ PageSpeed API не настроен';
  }
  if (code === 'PAGESPEED_QUOTA_EXCEEDED') {
    return 'дневная квота PageSpeed API исчерпана';
  }
  if (code === 'ADMIN_AUTH_REQUIRED') {
    return 'пароль администратора больше не принят';
  }
  if (code === 'ADMIN_RATE_LIMITED') {
    return 'достигнут минутный лимит запросов админки';
  }
  return 'ключ или доступ к PageSpeed Insights API настроены некорректно';
}

function blockedTitle(block: ApiBlock): string {
  if (block === 'quota') return 'Квота PageSpeed Insights исчерпана';
  if (block === 'configuration') return 'PageSpeed Insights API настроен некорректно';
  if (block === 'auth') return 'Нужно заново войти в админку';
  return 'Минутный лимит запросов исчерпан';
}

function blockedDescription(block: ApiBlock): string {
  if (block === 'quota') {
    return 'Новые проверки остановлены, чтобы не повторять заведомо отклонённые запросы. Дождитесь обновления дневной квоты или увеличьте лимит в Google Cloud.';
  }
  if (block === 'configuration') {
    return 'Проверьте, что PageSpeed Insights API включён, ключ действителен, а API restrictions разрешают pagespeedonline.googleapis.com.';
  }
  if (block === 'auth') {
    return 'Сервер больше не принимает текущий пароль. Обновите страницу и войдите в админку заново.';
  }
  return 'Новые проверки остановлены. Подождите до следующего минутного окна, затем обновите sitemap и повторите запуск.';
}

function freshStoredResult(result: PerformanceResult | undefined): PerformanceResult | undefined {
  if (!result?.fetchedAt) return undefined;
  const fetchedAt = Date.parse(result.fetchedAt);
  if (!Number.isFinite(fetchedAt)) return undefined;
  const age = Date.now() - fetchedAt;
  return age >= 0 && age <= RESULT_FRESHNESS_MS ? result : undefined;
}

function readStoredResults(): Record<string, Partial<Record<Strategy, PerformanceResult>>> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function scoreTone(score: number | null): string {
  if (score === null) return 'border-[var(--adm-border)] text-[var(--adm-fg)]/45';
  if (score >= 90) return 'border-emerald-500 text-emerald-600 dark:text-emerald-400';
  if (score >= 50) return 'border-amber-500 text-amber-600 dark:text-amber-400';
  return 'border-[var(--adm-danger)] text-[var(--adm-danger)]';
}

function ScoreBadge({ score, label }: { score: number | null; label: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 text-center" title={`${label}: ${score ?? 'нет данных'}`}>
      <span className={`flex h-10 w-10 items-center justify-center rounded-full border-[3px] text-sm font-semibold tabular-nums ${scoreTone(score)}`}>
        {score ?? '—'}
      </span>
      <span className="max-w-[72px] text-[10px] leading-tight text-[var(--adm-fg)]/60">{label}</span>
    </div>
  );
}

function formatMetric(metric: AuditMetric | null, fallback = '—'): string {
  if (!metric) return fallback;
  if (metric.displayValue) return metric.displayValue;
  if (metric.value === null) return fallback;
  return String(Math.round(metric.value * 100) / 100);
}

function formatField(metric: FieldMetric | null, unit: 'ms' | 'score'): string {
  if (!metric) return '—';
  if (unit === 'score') return metric.value.toFixed(2);
  return metric.value >= 1000 ? `${(metric.value / 1000).toFixed(1)} с` : `${Math.round(metric.value)} мс`;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '';
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
  return `${Math.round(bytes / 1024)} КБ`;
}

function AuditPanel({
  strategy,
  result,
  status,
  error,
}: {
  strategy: Strategy;
  result?: PerformanceResult;
  status: RunStatus;
  error?: string;
}) {
  const DeviceIcon = strategy === 'mobile' ? Smartphone : Monitor;
  const title = strategy === 'mobile' ? 'Mobile' : 'Desktop';

  return (
    <section className="rounded-xl border border-[var(--adm-border)] bg-[var(--adm-card)] p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-semibold">
          <DeviceIcon className="h-4 w-4 text-[var(--adm-primary)]" aria-hidden="true" />
          {title}
        </span>
        <span className="flex items-center gap-1.5">
          {status === 'done' && result?.cacheHit && (
            <span
              className="rounded-full border border-[var(--adm-border)] bg-[var(--adm-muted)]/40 px-1.5 py-0.5 text-[9px] font-medium text-[var(--adm-fg)]/55"
              title="Результат взят из серверного кэша — новый запрос к Google не выполнялся"
            >
              кэш
            </span>
          )}
          {status === 'running' && <LoaderCircle className="h-4 w-4 animate-spin text-[var(--adm-primary)]" aria-label="Проверяется" />}
          {status === 'done' && <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-label="Готово" />}
          {status === 'error' && <AlertTriangle className="h-4 w-4 text-[var(--adm-danger)]" aria-label="Ошибка" />}
        </span>
      </div>

      {status === 'error' ? (
        <p className="min-h-20 text-xs leading-relaxed text-[var(--adm-danger)]">{error || 'Проверка не удалась'}</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-2">
            <ScoreBadge score={result?.scores.performance ?? null} label="Скорость" />
            <ScoreBadge score={result?.scores.accessibility ?? null} label="Доступность" />
            <ScoreBadge score={result?.scores.bestPractices ?? null} label="Рекомендации" />
            <ScoreBadge score={result?.scores.seo ?? null} label="SEO" />
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 border-t border-[var(--adm-border)] pt-2 text-center">
            <div><span className="block text-[10px] text-[var(--adm-fg)]/50">LCP</span><strong className="text-xs tabular-nums">{formatMetric(result?.lab.lcp || null)}</strong></div>
            <div><span className="block text-[10px] text-[var(--adm-fg)]/50">TBT</span><strong className="text-xs tabular-nums">{formatMetric(result?.lab.tbt || null)}</strong></div>
            <div><span className="block text-[10px] text-[var(--adm-fg)]/50">CLS</span><strong className="text-xs tabular-nums">{formatMetric(result?.lab.cls || null)}</strong></div>
            <div><span className="block text-[10px] text-[var(--adm-fg)]/50">Вес</span><strong className="text-xs tabular-nums">{formatMetric(result?.lab.totalBytes || null)}</strong></div>
          </div>
          <div className="mt-2 rounded-lg bg-[var(--adm-muted)]/35 px-2.5 py-2 text-[10px] text-[var(--adm-fg)]/60">
            {result?.field.scope === 'none' || !result
              ? 'Реальные данные CrUX: нет данных'
              : `CrUX ${result.field.scope === 'page' ? 'страницы' : 'домена'} · LCP ${formatField(result.field.lcp, 'ms')} · INP ${formatField(result.field.inp, 'ms')} · CLS ${formatField(result.field.cls, 'score')}`}
          </div>
          {result && (result.opportunities.length > 0 || result.warnings.length > 0) && (
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer text-[var(--adm-primary)]">Что улучшить</summary>
              <div className="mt-2 space-y-1.5 text-[var(--adm-fg)]/65">
                {result.opportunities.map((item) => (
                  <p key={item.id}>
                    {item.title}
                    {item.displayValue ? ` — ${item.displayValue}` : ''}
                    {!item.displayValue && item.savingsMs ? ` — до ${item.savingsMs} мс` : ''}
                    {!item.displayValue && !item.savingsMs && item.savingsBytes ? ` — ${formatBytes(item.savingsBytes)}` : ''}
                  </p>
                ))}
                {result.warnings.map((warning, index) => <p key={`${warning}-${index}`}>{warning}</p>)}
              </div>
            </details>
          )}
        </>
      )}
    </section>
  );
}

export default function AdminPerformance({ password }: { password: string }) {
  const [rows, setRows] = useState<PageRow[]>([]);
  const [loadingPages, setLoadingPages] = useState(true);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState('');
  const [sitemapUrl, setSitemapUrl] = useState('');
  const [apiKeyConfigured, setApiKeyConfigured] = useState<boolean | null>(null);
  const [apiBlocked, setApiBlocked] = useState<ApiBlock | null>(null);
  const [storageHydrated, setStorageHydrated] = useState(false);
  const stopRequested = useRef(false);

  const applyFatalBlock = useCallback((code: FatalErrorCode) => {
    if (code === 'PAGESPEED_KEY_REQUIRED') setApiKeyConfigured(false);
    if (code === 'PAGESPEED_QUOTA_EXCEEDED') setApiBlocked('quota');
    if (code === 'PAGESPEED_CONFIGURATION_ERROR') setApiBlocked('configuration');
    if (code === 'ADMIN_AUTH_REQUIRED') setApiBlocked('auth');
    if (code === 'ADMIN_RATE_LIMITED') setApiBlocked('rate-limit');
  }, []);

  const runCounts = useMemo(() => rows.reduce((counts, row) => {
    for (const status of [row.mobileStatus, row.desktopStatus]) {
      if (status === 'done') counts.success += 1;
      if (status === 'error') counts.errors += 1;
    }
    return counts;
  }, { success: 0, errors: 0 }), [rows]);
  const completedRuns = runCounts.success + runCounts.errors;
  const totalRuns = rows.length * 2;

  const loadPages = useCallback(async () => {
    setLoadingPages(true);
    setNotice('');
    try {
      const response = await fetch('/api/admin/performance', {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({})) as PagesPayload;
      if (!response.ok || !payload.success || !Array.isArray(payload.pages)) {
        throw new PerformanceApiError(payload.error || `HTTP ${response.status}`, payload.code);
      }
      const stored = readStoredResults();
      setRows(payload.pages.map((url) => {
        const mobile = freshStoredResult(stored[url]?.mobile);
        const desktop = freshStoredResult(stored[url]?.desktop);
        return {
          url,
          mobile,
          desktop,
          mobileStatus: mobile ? 'done' : 'idle',
          desktopStatus: desktop ? 'done' : 'idle',
        };
      }));
      setStorageHydrated(true);
      setSitemapUrl(payload.sitemapUrl || '');
      setApiKeyConfigured(payload.apiKeyConfigured !== false);
      setApiBlocked(null);
      if (payload.truncated) setNotice(`В sitemap ${payload.total} страниц; показаны первые ${payload.pages.length}.`);
    } catch (error) {
      setApiKeyConfigured(null);
      if (isFatalError(error)) applyFatalBlock(error.code);
      setNotice(error instanceof Error ? error.message : 'Не удалось загрузить sitemap.xml');
    } finally {
      setLoadingPages(false);
    }
  }, [applyFatalBlock, password]);

  useEffect(() => {
    void loadPages();
  }, [loadPages]);

  useEffect(() => {
    if (!storageHydrated) return;
    const stored: Record<string, Partial<Record<Strategy, PerformanceResult>>> = {};
    rows.forEach((row) => {
      if (row.mobile || row.desktop) stored[row.url] = { mobile: row.mobile, desktop: row.desktop };
    });
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Браузер может запретить localStorage; результаты всё равно остаются на экране.
    }
  }, [rows, storageHydrated]);

  const updateRow = useCallback((url: string, patch: Partial<PageRow>) => {
    setRows((current) => current.map((row) => row.url === url ? { ...row, ...patch } : row));
  }, []);

  const audit = useCallback(async (url: string, strategy: Strategy, force = false): Promise<PerformanceResult> => {
    const endpoint = new URL('/api/admin/performance', window.location.origin);
    endpoint.searchParams.set('url', url);
    endpoint.searchParams.set('strategy', strategy);
    if (force) endpoint.searchParams.set('force', '1');
    const response = await fetch(endpoint.toString(), {
      headers: { 'X-Admin-Password': password },
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({})) as {
      success?: boolean;
      result?: PerformanceResult;
      error?: string;
      code?: string;
      cached?: boolean;
      apiKeyConfigured?: boolean;
    };
    if (!response.ok || !payload.success || !payload.result) {
      throw new PerformanceApiError(payload.error || `HTTP ${response.status}`, payload.code);
    }
    return {
      ...payload.result,
      cacheHit: payload.cached === true,
    };
  }, [password]);

  const runPage = useCallback(async (url: string, force = false): Promise<RunSummary> => {
    const summary: RunSummary = { successCount: 0, errorCount: 0 };
    for (const strategy of ['mobile', 'desktop'] as const) {
      if (stopRequested.current) break;
      const statusKey = strategy === 'mobile' ? 'mobileStatus' : 'desktopStatus';
      const errorKey = strategy === 'mobile' ? 'mobileError' : 'desktopError';
      const resultKey = strategy;
      updateRow(url, { [statusKey]: 'running', [errorKey]: undefined });
      try {
        const result = await audit(url, strategy, force);
        updateRow(url, { [statusKey]: 'done', [resultKey]: result });
        summary.successCount += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Проверка не удалась';
        updateRow(url, {
          [statusKey]: 'error',
          [errorKey]: message,
        });
        summary.errorCount += 1;
        if (isFatalError(error)) {
          summary.fatal = { code: error.code, message };
          applyFatalBlock(error.code);
          break;
        }
      }
    }
    return summary;
  }, [applyFatalBlock, audit, updateRow]);

  const runAll = async () => {
    if (running || rows.length === 0) return;
    stopRequested.current = false;
    setRunning(true);
    setNotice('Проверка идёт по очереди: Mobile, затем Desktop для каждой страницы.');
    setRows((current) => current.map((row) => ({
      ...row,
      mobileStatus: 'idle',
      desktopStatus: 'idle',
      mobileError: undefined,
      desktopError: undefined,
    })));
    let successCount = 0;
    let errorCount = 0;
    let fatal: RunSummary['fatal'];
    try {
      for (const row of rows) {
        if (stopRequested.current) break;
        const summary = await runPage(row.url);
        successCount += summary.successCount;
        errorCount += summary.errorCount;
        if (summary.fatal) {
          fatal = summary.fatal;
          break;
        }
      }
      if (fatal) {
        setNotice(`Проверка остановлена: ${fatalNotice(fatal.code)}. Успешно: ${successCount}, ошибок: ${errorCount}. Остальные проверки не запускались.`);
      } else if (stopRequested.current) {
        setNotice(`Проверка остановлена вручную. Успешно: ${successCount}, ошибок: ${errorCount}. Готовые результаты сохранены.`);
      } else {
        setNotice(`Проверка завершена. Успешно: ${successCount}, ошибок: ${errorCount}.`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Проверка неожиданно прервалась.');
    } finally {
      setRunning(false);
    }
  };

  const runOne = async (url: string) => {
    if (running) return;
    stopRequested.current = false;
    setRunning(true);
    setNotice('Перепроверяю страницу без использования кэша…');
    try {
      const summary = await runPage(url, true);
      if (summary.fatal) {
        setNotice(`Перепроверка остановлена: ${fatalNotice(summary.fatal.code)}. Успешно: ${summary.successCount}, ошибок: ${summary.errorCount}.`);
      } else {
        setNotice(`Перепроверка завершена. Успешно: ${summary.successCount}, ошибок: ${summary.errorCount}.`);
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Перепроверка неожиданно прервалась.');
    } finally {
      setRunning(false);
    }
  };

  const auditDisabled = apiKeyConfigured === false || apiBlocked !== null;

  return (
    <div className="admin-stack admin-stack--lg">
      <RealUserVitals password={password} />

      <div className="admin-section-header">
        <div>
          <p className="admin-eyebrow">PageSpeed Insights</p>
          <h2 className="admin-title">Скорость всех страниц</h2>
          <p className="admin-subtitle">Все URL из sitemap.xml, сразу в Mobile и Desktop. Четыре оценки соответствуют публичному отчёту Google PageSpeed.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {running ? (
            <button type="button" className="admin-button admin-button--danger" onClick={() => { stopRequested.current = true; }}>
              <Square className="h-4 w-4" aria-hidden="true" /> Остановить
            </button>
          ) : (
            <button type="button" className="admin-button admin-button--primary" disabled={loadingPages || rows.length === 0 || auditDisabled} onClick={() => void runAll()}>
              <Play className="h-4 w-4" aria-hidden="true" /> Проверить все страницы
            </button>
          )}
          <button type="button" className="admin-button admin-button--secondary" disabled={running || loadingPages || apiBlocked === 'auth'} onClick={() => void loadPages()}>
            <RefreshCw className={loadingPages ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} aria-hidden="true" /> Обновить sitemap
          </button>
        </div>
      </div>

      {apiKeyConfigured === false && (
        <section className="admin-panel border-[var(--adm-danger)]/45 bg-[var(--adm-danger)]/[0.06] p-4" role="alert">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--adm-danger)]" aria-hidden="true" />
            <div className="min-w-0">
              <strong className="text-sm text-[var(--adm-danger)]">PageSpeed Insights API не настроен</strong>
              <p className="mt-1 text-xs leading-relaxed text-[var(--adm-fg)]/70">
                В Google Cloud включите PageSpeed Insights API, создайте или проверьте API key и его ограничения, добавьте ключ в Cloudflare Pages как секрет
                {' '}<code className="font-semibold">PAGESPEED_API_KEY</code> и выполните новый deploy. До этого запуск проверок отключён.
              </p>
              <a
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--adm-primary)]"
                href="https://developers.google.com/speed/docs/insights/v5/get-started"
                target="_blank"
                rel="noreferrer"
              >
                Официальная инструкция Google <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>
      )}

      {apiBlocked && apiKeyConfigured !== false && (
        <section className="admin-panel border-[var(--adm-danger)]/45 bg-[var(--adm-danger)]/[0.06] p-4" role="alert">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--adm-danger)]" aria-hidden="true" />
            <div className="min-w-0">
              <strong className="text-sm text-[var(--adm-danger)]">
                {blockedTitle(apiBlocked)}
              </strong>
              <p className="mt-1 text-xs leading-relaxed text-[var(--adm-fg)]/70">
                {blockedDescription(apiBlocked)}
              </p>
              {(apiBlocked === 'quota' || apiBlocked === 'configuration') && (
                <a
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--adm-primary)]"
                  href="https://console.cloud.google.com/apis/api/pagespeedonline.googleapis.com/quotas"
                  target="_blank"
                  rel="noreferrer"
                >
                  Открыть настройки Google Cloud <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              )}
            </div>
          </div>
        </section>
      )}

      <section className="admin-panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-[var(--adm-primary)]" aria-hidden="true" />
            <strong>{rows.length} страниц · {totalRuns} проверок</strong>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="admin-meta">{completedRuns}/{totalRuns} обработано</span>
            <span className="text-[10px] font-medium text-emerald-500">успешно: {runCounts.success}</span>
            <span className={`text-[10px] font-medium ${runCounts.errors > 0 ? 'text-[var(--adm-danger)]' : 'text-[var(--adm-fg)]/45'}`}>
              ошибок: {runCounts.errors}
            </span>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--adm-muted)]">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${runCounts.errors > 0 ? 'bg-[var(--adm-danger)]' : 'bg-[var(--adm-primary)]'}`}
            style={{ width: totalRuns ? `${Math.round((completedRuns / totalRuns) * 100)}%` : '0%' }}
          />
        </div>
        {sitemapUrl && (
          <a className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--adm-primary)]" href={sitemapUrl} target="_blank" rel="noreferrer">
            Открыть sitemap.xml <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        )}
        {notice && <p className="mt-3 text-xs text-[var(--adm-fg)]/65" role="status">{notice}</p>}
      </section>

      {loadingPages ? (
        <div className="admin-panel flex items-center justify-center gap-2 p-8 text-sm text-[var(--adm-fg)]/60">
          <LoaderCircle className="h-5 w-5 animate-spin" aria-hidden="true" /> Загружаю страницы…
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row, index) => (
            <article key={row.url} className="admin-panel p-3 sm:p-4">
              <div className="grid gap-3 xl:grid-cols-[minmax(220px,0.75fr)_minmax(320px,1fr)_minmax(320px,1fr)_auto]">
                <div className="min-w-0">
                  <span className="admin-meta">Страница {index + 1}</span>
                  <a className="mt-1 block break-all text-sm font-semibold text-[var(--adm-fg)] hover:text-[var(--adm-primary)]" href={row.url} target="_blank" rel="noreferrer">
                    {new URL(row.url).pathname || '/'}
                  </a>
                  <p className="mt-1 truncate text-[10px] text-[var(--adm-fg)]/45" title={row.url}>{row.url}</p>
                  <button type="button" className="admin-button admin-button--quiet mt-3" disabled={running || auditDisabled} onClick={() => void runOne(row.url)}>
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Перепроверить
                  </button>
                </div>
                <AuditPanel strategy="mobile" result={row.mobile} status={row.mobileStatus} error={row.mobileError} />
                <AuditPanel strategy="desktop" result={row.desktop} status={row.desktopStatus} error={row.desktopError} />
                <div className="hidden items-center xl:flex">
                  {(row.mobileStatus === 'done' && row.desktopStatus === 'done')
                    ? <CheckCircle2 className="h-5 w-5 text-emerald-500" aria-label="Оба режима проверены" />
                    : <span className="h-5 w-5" />}
                </div>
              </div>
            </article>
          ))}
          {rows.length === 0 && !notice && <div className="admin-empty">В sitemap.xml нет страниц для проверки.</div>}
        </div>
      )}
    </div>
  );
}
