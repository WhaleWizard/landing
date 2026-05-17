import type { Env } from './types';

export type SignatureVerification = { ok: true } | { ok: false; reason: string };

function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.trim();
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < cleaned.length; i += 2) bytes[i / 2] = parseInt(cleaned.slice(i, i + 2), 16);
  return bytes;
}

async function hmacSha256Hex(secretHex: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', hexToBytes(secretHex), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export function getTrackingSignatureMode(env: Env): 'off' | 'monitor' | 'enforce' {
  const raw = String((env as Env & { TRACKING_SIGNATURE_MODE?: string }).TRACKING_SIGNATURE_MODE || 'monitor').toLowerCase();
  if (raw === 'off' || raw === 'monitor' || raw === 'enforce') return raw;
  return 'monitor';
}

export async function verifyTrackingSignature(request: Request, env: Env, bodyText: string): Promise<SignatureVerification> {
  const secret = (env as Env & { TRACKING_HMAC_SECRET?: string }).TRACKING_HMAC_SECRET;
  const nonceKv = (env as Env & { META_CAPI_NONCE?: KVNamespace }).META_CAPI_NONCE;
  if (!secret || !nonceKv) return { ok: false, reason: 'signature_not_configured' };

  const ts = request.headers.get('x-track-ts') || '';
  const nonce = request.headers.get('x-track-nonce') || '';
  const signature = (request.headers.get('x-track-signature') || '').toLowerCase();
  if (!ts || !nonce || !signature) return { ok: false, reason: 'missing_headers' };

  const now = Math.floor(Date.now() / 1000);
  const tsNum = Number(ts);
  const ttl = Number((env as Env & { TRACKING_SIG_TTL_SEC?: string }).TRACKING_SIG_TTL_SEC || 60);
  if (!Number.isFinite(tsNum) || Math.abs(now - tsNum) > ttl) return { ok: false, reason: 'expired_timestamp' };

  const nonceKey = `nonce:${nonce}`;
  const seen = await nonceKv.get(nonceKey);
  if (seen) return { ok: false, reason: 'replayed_nonce' };

  const expected = await hmacSha256Hex(secret, `${ts}.${nonce}.${bodyText}`);
  if (!safeEqual(expected, signature)) return { ok: false, reason: 'invalid_signature' };

  await nonceKv.put(nonceKey, '1', { expirationTtl: Math.max(120, ttl * 2) });
  return { ok: true };
}
