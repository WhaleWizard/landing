import { CACHE_CONTROL } from '../_lib/cache';
import { json } from '../_lib/http';
import { enforceRateLimit } from '../_lib/rate-limit';
import { readRequestText } from '../_lib/http';
import { detectDeviceFromUserAgent, isTrustedTrackingRequest } from '../_lib/meta-capi';
import type { Env } from '../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };
const MAX_BODY_BYTES = 4 * 1024;

/** Пороги Google: значения выше первого — «нужно улучшить», выше второго — «плохо». */
const THRESHOLDS: Record<string, [number, number]> = {
  LCP: [2500, 4000],
  INP: [200, 500],
  CLS: [0.1, 0.25],
  TTFB: [800, 1800],
};

const MAX_VALUES: Record<string, number> = {
  LCP: 120_000,
  INP: 120_000,
  CLS: 100,
  TTFB: 120_000,
};

interface VitalInput {
  metric?: unknown;
  value?: unknown;
  path?: unknown;
}

/** Тип устройства общий с событиями Meta: одна логика, одно место. */
function detectDevice(userAgent: string): string {
  return detectDeviceFromUserAgent(userAgent) || '';
}

function normalizePath(raw: unknown): string {
  const value = String(raw || '/').split('?')[0].split('#')[0].trim();
  if (!value.startsWith('/')) return '/';
  const trimmed = value.length > 1 && value.endsWith('/') ? value.slice(0, -1) : value;
  return trimmed.slice(0, 200);
}

function bucket(metric: string, value: number): 'good' | 'needs_improvement' | 'poor' {
  const [good, poor] = THRESHOLDS[metric];
  if (value <= good) return 'good';
  return value <= poor ? 'needs_improvement' : 'poor';
}

/**
 * Приём реальных Core Web Vitals. Эндпоинт публичный, поэтому принимает
 * только известные метрики в разумных границах и складывает их сразу в
 * суточный агрегат: отдельные визиты не хранятся, идентификаторов нет.
 * Тип устройства определяется на сервере, из тела запроса он не берётся.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // Эндпоинт пишет в D1 до четырёх строк за запрос. Без проверки источника
  // писать сюда мог кто угодно, а на бесплатном тарифе Cloudflare суточный
  // лимит записей конечный: чужой поток выжигал бы его вместо метрик.
  if (!isTrustedTrackingRequest(request, env)) {
    return json({ success: false, error: 'untrusted_request_origin' }, { status: 403, headers: noStore });
  }

  const rateLimited = await enforceRateLimit(request, 'pageview');
  if (rateLimited) return rateLimited;

  const body = await readRequestText(request, MAX_BODY_BYTES);
  if (!body.ok) return json({ success: false }, { status: 413, headers: noStore });

  let payload: { metrics?: VitalInput[] };
  try {
    payload = body.text ? JSON.parse(body.text) : {};
  } catch {
    return json({ success: false }, { status: 400, headers: noStore });
  }

  // Без базы метрики просто некуда писать — но и ошибкой это не является:
  // сайт не должен ничего замечать.
  if (!env.DB) return json({ success: true, stored: 0 }, { headers: noStore });

  const device = detectDevice(request.headers.get('user-agent') || '');
  const items = Array.isArray(payload.metrics) ? payload.metrics.slice(0, 8) : [];
  const statements: D1PreparedStatement[] = [];

  for (const item of items) {
    const metric = String(item.metric || '').toUpperCase();
    if (!THRESHOLDS[metric]) continue;
    const value = Number(item.value);
    if (!Number.isFinite(value) || value < 0 || value > MAX_VALUES[metric]) continue;

    const rating = bucket(metric, value);
    const path = normalizePath(item.path);
    const rounded = metric === 'CLS' ? Math.round(value * 1000) / 1000 : Math.round(value);

    statements.push(env.DB.prepare(`
      INSERT INTO web_vitals_daily (day, metric, device, page_path, samples, value_sum, good, needs_improvement, poor)
      VALUES (date('now'), ?, ?, ?, 1, ?, ?, ?, ?)
      ON CONFLICT(day, metric, device, page_path) DO UPDATE SET
        samples = samples + 1,
        value_sum = value_sum + excluded.value_sum,
        good = good + excluded.good,
        needs_improvement = needs_improvement + excluded.needs_improvement,
        poor = poor + excluded.poor,
        updated_at = datetime('now')
    `).bind(
      metric,
      device,
      path,
      rounded,
      rating === 'good' ? 1 : 0,
      rating === 'needs_improvement' ? 1 : 0,
      rating === 'poor' ? 1 : 0,
    ));
  }

  if (!statements.length) return json({ success: true, stored: 0 }, { headers: noStore });

  try {
    await env.DB.batch(statements);
    return json({ success: true, stored: statements.length }, { headers: noStore });
  } catch {
    // Нет таблицы или сбой записи — метрика не важнее самого сайта.
    return json({ success: true, stored: 0 }, { headers: noStore });
  }
};
