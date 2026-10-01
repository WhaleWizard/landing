import type { Env } from './types';

export type TrackingSignatureMode = 'off' | 'monitor' | 'enforce';
export type SignatureVerification =
  | { ok: true; replayProtection: 'd1' | 'kv' }
  | { ok: false; reason: string };

const HMAC_SECRET_HEX_LENGTH = 64;
const DEFAULT_SIGNATURE_TTL_SECONDS = 60;
const MIN_SIGNATURE_TTL_SECONDS = 10;
const MAX_SIGNATURE_TTL_SECONDS = 300;
// Keep a nonce for the full acceptance window even if TRACKING_SIG_TTL_SEC is
// increased during a rolling configuration change. Using the current TTL here
// would allow an earlier short-lived claim to expire while the same timestamp
// becomes valid under the newly enlarged window.
const NONCE_RETENTION_SECONDS = MAX_SIGNATURE_TTL_SECONDS * 2;
const MIN_NONCE_LENGTH = 16;
const MAX_NONCE_LENGTH = 128;

function normalizeHmacSecret(secret: string): string | null {
  const normalized = secret.trim();
  if (normalized.length !== HMAC_SECRET_HEX_LENGTH || !/^[0-9a-f]+$/i.test(normalized)) return null;
  return normalized;
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
  return bytes;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function hmacSha256Hex(secretHex: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', hexToBytes(secretHex) as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message) as BufferSource);
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

function getSignatureTtlSeconds(env: Env): number {
  const parsed = Number(env.TRACKING_SIG_TTL_SEC || DEFAULT_SIGNATURE_TTL_SECONDS);
  if (!Number.isFinite(parsed)) return DEFAULT_SIGNATURE_TTL_SECONDS;
  return Math.min(MAX_SIGNATURE_TTL_SECONDS, Math.max(MIN_SIGNATURE_TTL_SECONDS, Math.floor(parsed)));
}

async function claimNonceWithD1(env: Env, nonce: string, now: number, ttl: number): Promise<boolean> {
  if (!env.DB) throw new Error('d1_not_configured');
  const nonceHash = await sha256Hex(nonce);
  const expiresAt = now + Math.max(NONCE_RETENTION_SECONDS, ttl * 2);
  const result = await env.DB.prepare(
    `INSERT INTO tracking_request_nonces (nonce_hash, expires_at, created_at)
     VALUES (?, ?, ?)
     ON CONFLICT(nonce_hash) DO UPDATE SET
       expires_at = excluded.expires_at,
       created_at = excluded.created_at
     WHERE tracking_request_nonces.expires_at < ?`,
  ).bind(nonceHash, expiresAt, now, now).run() as { meta?: { changes?: number } };
  return Number(result.meta?.changes || 0) > 0;
}

async function claimNonceWithKv(env: Env, nonce: string, ttl: number): Promise<boolean> {
  if (!env.META_CAPI_NONCE) throw new Error('kv_not_configured');
  const nonceHash = await sha256Hex(nonce);
  const nonceKey = `nonce:${nonceHash}`;
  const seen = await env.META_CAPI_NONCE.get(nonceKey);
  if (seen) return false;
  await env.META_CAPI_NONCE.put(nonceKey, '1', { expirationTtl: Math.max(NONCE_RETENTION_SECONDS, ttl * 2) });
  return true;
}

/**
 * Отклонять ли запрос в строгом режиме.
 *
 * Подпись рассчитана на отправителя, который умеет её ставить: браузеру для
 * этого пришлось бы держать общий секрет, а это раздать ключ всем посетителям.
 * Поэтому код сайта подпись не формирует и не может.
 *
 * Раньше строгий режим отклонял ВСЁ, что пришло без подписи, — то есть каждую
 * заявку, каждый просмотр страницы и каждое событие Meta с настоящего сайта.
 * Один переключатель в настройках останавливал приём заявок целиком, а очередь
 * повторов считала отказ 403 окончательным и выбрасывала заявку.
 *
 * Теперь строгий режим отклоняет только те запросы, которые подпись **принесли
 * и не подтвердили**: подделанную, просроченную или уже использованную. Запрос
 * вообще без подписи проходит и записывается в журнал как неподписанный —
 * ровно так же, как в режиме наблюдения. Защита от подделки чужим сервером
 * остаётся на проверке источника запроса (`isTrustedTrackingRequest`).
 */
const UNSIGNED_REASONS = new Set(['missing_headers', 'signature_not_configured']);

export function shouldRejectBySignature(
  mode: TrackingSignatureMode,
  verification: SignatureVerification | undefined,
): boolean {
  if (mode !== 'enforce') return false;
  if (verification?.ok === true) return false;
  if (verification && verification.ok === false && UNSIGNED_REASONS.has(verification.reason)) return false;
  return true;
}

export function getTrackingSignatureMode(env: Env): TrackingSignatureMode {
  const raw = String(env.TRACKING_SIGNATURE_MODE || 'monitor').trim().toLowerCase();
  if (raw === 'off' || raw === 'monitor' || raw === 'enforce') return raw;
  return 'monitor';
}

export async function verifyTrackingSignature(request: Request, env: Env, bodyText: string): Promise<SignatureVerification> {
  const configuredSecret = env.TRACKING_HMAC_SECRET;
  if (!configuredSecret) return { ok: false, reason: 'signature_not_configured' };

  // The shared key is a 32-byte value encoded as exactly 64 hexadecimal
  // characters. Invalid configuration fails closed instead of reaching Web
  // Crypto or accepting an ambiguous representation.
  const secret = normalizeHmacSecret(configuredSecret);
  if (!secret) return { ok: false, reason: 'invalid_secret_format' };

  const timestamp = request.headers.get('x-track-ts') || '';
  const nonce = request.headers.get('x-track-nonce') || '';
  const signature = (request.headers.get('x-track-signature') || '').toLowerCase();
  if (!timestamp || !nonce || !signature) return { ok: false, reason: 'missing_headers' };
  if (!/^\d{10,11}$/.test(timestamp)) return { ok: false, reason: 'invalid_timestamp_format' };
  if (nonce.length < MIN_NONCE_LENGTH || nonce.length > MAX_NONCE_LENGTH || !/^[A-Za-z0-9_-]+$/.test(nonce)) {
    return { ok: false, reason: 'invalid_nonce_format' };
  }
  if (!/^[0-9a-f]{64}$/.test(signature)) return { ok: false, reason: 'invalid_signature_format' };

  const now = Math.floor(Date.now() / 1000);
  const timestampNumber = Number(timestamp);
  const ttl = getSignatureTtlSeconds(env);
  if (!Number.isSafeInteger(timestampNumber) || Math.abs(now - timestampNumber) > ttl) {
    return { ok: false, reason: 'expired_timestamp' };
  }

  let expected: string;
  try {
    expected = await hmacSha256Hex(secret, `${timestamp}.${nonce}.${bodyText}`);
  } catch {
    return { ok: false, reason: 'signature_verification_failed' };
  }
  if (!safeEqual(expected, signature)) return { ok: false, reason: 'invalid_signature' };

  // D1's UNIQUE constraint makes the replay claim atomic. KV remains a
  // best-effort fallback in monitor mode only; enforce mode must never rely on
  // the non-atomic KV get-then-put sequence.
  if (env.DB) {
    try {
      const claimed = await claimNonceWithD1(env, nonce, now, ttl);
      return claimed ? { ok: true, replayProtection: 'd1' } : { ok: false, reason: 'replayed_nonce' };
    } catch (error) {
      console.error('[Tracking signature] D1 nonce claim failed:', error);
      if (getTrackingSignatureMode(env) === 'enforce') return { ok: false, reason: 'nonce_store_unavailable' };
    }
  } else if (getTrackingSignatureMode(env) === 'enforce') {
    return { ok: false, reason: 'nonce_store_unavailable' };
  }

  try {
    const claimed = await claimNonceWithKv(env, nonce, ttl);
    return claimed ? { ok: true, replayProtection: 'kv' } : { ok: false, reason: 'replayed_nonce' };
  } catch (error) {
    console.error('[Tracking signature] KV nonce claim failed:', error);
    return { ok: false, reason: 'nonce_store_unavailable' };
  }
}

/**
 * Сколько строк аудита подписи позволено записать за сутки.
 *
 * Строку аудита может вызвать кто угодно поддельными заголовками `x-track-*`,
 * а каждая запись в D1 на бесплатном тарифе — из общего суточного лимита, от
 * которого зависит и приём заявок. Потолок считается в кэше дата-центра по
 * образцу `form-guard-stats.ts`: грубо, бесплатно и без записей в базу.
 */
const AUDIT_DAILY_WRITE_BUDGET = 200;
/** Отметка «день неполный»: пишется один раз, когда бюджет кончился. */
export const AUDIT_BUDGET_EXHAUSTED_REASON = 'audit_budget_exhausted';
/**
 * Под каким `endpoint` лежит отметка. Бюджет общий на все три точки, поэтому
 * записывать отметку под той точкой, чей запрос его случайно исчерпал, нельзя:
 * раздел «Проверка» суммирует строки по `endpoint`, и отметка прибавляла бы
 * единицу к счётчику lead/meta-event/pageview. Значение вне этих трёх
 * CHECK-ом не ограничено (миграция 0018), и в суммы по точкам оно не попадает.
 */
export const AUDIT_BUDGET_MARKER_ENDPOINT = 'all';

function auditBudgetKey(day: string): Request {
  return new Request(`https://internal-tracking-signature.local/budget/${day}`);
}

async function claimAuditWriteBudget(day: string): Promise<'write' | 'mark' | 'skip'> {
  let cache: Cache | undefined;
  try {
    cache = caches.default;
  } catch {
    cache = undefined;
  }
  // Без Cache API (локальный запуск) бюджет не посчитать — запись разрешена.
  if (!cache) return 'write';

  const key = auditBudgetKey(day);
  const existing = await cache.match(key);
  const used = existing ? Number(await existing.text()) || 0 : 0;
  if (used > AUDIT_DAILY_WRITE_BUDGET) return 'skip';
  await cache.put(key, new Response(String(used + 1), {
    headers: { 'Cache-Control': 'max-age=86400' },
  }));
  return used === AUDIT_DAILY_WRITE_BUDGET ? 'mark' : 'write';
}

/**
 * Суточный агрегат попыток подписи — только тех, что подпись **принесли**.
 *
 * Браузер подпись не ставит (ключ в браузер отдавать нельзя), поэтому раньше
 * каждый просмотр, событие и заявка писали строку `missing_headers`: плюс
 * одна запись D1 на каждый запрос трекинга, то есть примерно +6 на визит
 * сверх посчитанных в `docs/CLOUDFLARE_LIMITS.md` ~20. Запас бесплатного
 * тарифа кончался на четверть раньше памятки, а когда он кончается —
 * перестают записываться заявки. Неподписанные запросы и выключенный режим
 * теперь не журналируются вовсе; объём трафика по точкам виден в
 * `page_stats_daily`. Разбор и отказ запроса от этого не зависят.
 */
export async function recordTrackingSignatureAudit(
  env: Env,
  input: {
    endpoint: 'lead' | 'meta-event' | 'pageview';
    mode: TrackingSignatureMode;
    verification?: SignatureVerification;
  },
): Promise<void> {
  if (!env.DB) return;
  if (input.mode === 'off') return;
  if (!input.verification) return;
  if (input.verification.ok === false && UNSIGNED_REASONS.has(input.verification.reason)) return;

  const result = input.verification.ok ? 'valid' : 'invalid';
  const reason = input.verification.ok
    ? `replay_protection_${input.verification.replayProtection}`
    : input.verification.reason;
  try {
    const day = new Date().toISOString().slice(0, 10);
    const budget = await claimAuditWriteBudget(day);
    if (budget === 'skip') return;
    // Бюджет исчерпан: вместо очередной строки — одна отметка, что цифры за
    // день неполные. Выдавать усечённый счётчик за точный нельзя. Колонка
    // `result` ограничена CHECK-ом миграции 0018 (valid/invalid/disabled):
    // «аудит выключен до конца дня» — это `disabled`, и в valid/invalid
    // раздела «Проверка» отметка не попадает; `endpoint` у неё общий, чтобы
    // не попасть и в счётчик точки. Раздел видит её как `disabled > 0` и
    // должен писать «не меньше N», а не точное число.
    const storedEndpoint = budget === 'mark' ? AUDIT_BUDGET_MARKER_ENDPOINT : input.endpoint;
    const storedResult = budget === 'mark' ? 'disabled' : result;
    const storedReason = budget === 'mark' ? AUDIT_BUDGET_EXHAUSTED_REASON : reason;
    await env.DB.prepare(
      `INSERT INTO tracking_signature_daily (day, endpoint, mode, result, reason, count, updated_at)
       VALUES (date('now'), ?, ?, ?, ?, 1, strftime('%s','now'))
       ON CONFLICT(day, endpoint, mode, result, reason) DO UPDATE SET
         count = tracking_signature_daily.count + 1,
         updated_at = excluded.updated_at`,
    ).bind(storedEndpoint, input.mode, storedResult, storedReason).run();
  } catch (error) {
    // Migration 0018 may not be applied during a rolling deploy. Signature
    // enforcement remains independent from this aggregate telemetry.
    console.error('[Tracking signature] Audit write failed:', error);
  }
}
