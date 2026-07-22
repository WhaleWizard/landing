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

export async function recordTrackingSignatureAudit(
  env: Env,
  input: {
    endpoint: 'lead' | 'meta-event' | 'pageview';
    mode: TrackingSignatureMode;
    verification?: SignatureVerification;
  },
): Promise<void> {
  if (!env.DB) return;
  const result = input.mode === 'off' ? 'disabled' : input.verification?.ok ? 'valid' : 'invalid';
  let reason = 'verification_not_run';
  if (input.mode === 'off') {
    reason = 'signature_disabled';
  } else if (input.verification?.ok === true) {
    reason = `replay_protection_${input.verification.replayProtection}`;
  } else if (input.verification?.ok === false) {
    reason = input.verification.reason;
  }
  try {
    await env.DB.prepare(
      `INSERT INTO tracking_signature_daily (day, endpoint, mode, result, reason, count, updated_at)
       VALUES (date('now'), ?, ?, ?, ?, 1, strftime('%s','now'))
       ON CONFLICT(day, endpoint, mode, result, reason) DO UPDATE SET
         count = tracking_signature_daily.count + 1,
         updated_at = excluded.updated_at`,
    ).bind(input.endpoint, input.mode, result, reason).run();
  } catch (error) {
    // Migration 0018 may not be applied during a rolling deploy. Signature
    // enforcement remains independent from this aggregate telemetry.
    console.error('[Tracking signature] Audit write failed:', error);
  }
}
