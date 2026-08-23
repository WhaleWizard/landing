/**
 * Сессия админки.
 *
 * Сессия не хранится в базе, а подписывается: в cookie лежит срок жизни и
 * подпись, сервер проверяет подпись и время. На бесплатном тарифе Cloudflare
 * это принципиально — иначе каждый запрос админки стоил бы записи в D1, а
 * суточный лимит записей там конечный.
 *
 * Ключ подписи выводится односторонним хешем из пароля админки, как в
 * `page-lock-preview.ts`. Отсюда полезное свойство: смена `ADMIN_PASSWORD`
 * мгновенно выкидывает все живые сессии, отдельного «выхода со всех
 * устройств» заводить не нужно.
 *
 * Пароль в cookie не попадает ни в каком виде.
 */

import type { Env } from './types';

export const ADMIN_SESSION_COOKIE = 'ww_admin_session';
export const ADMIN_SESSION_TTL_SECONDS = 12 * 60 * 60;

const TOKEN_VERSION = '1';

function toHex(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}

async function signingKey(env: Env): Promise<string | null> {
  const secret = String(env.ADMIN_PASSWORD || '').trim();
  if (!secret) return null;
  return sha256Hex(`ww-admin-session-key|${secret}`);
}

async function hmacHex(keyHex: string, message: string): Promise<string> {
  const keyBytes = new Uint8Array(keyHex.length / 2);
  for (let index = 0; index < keyHex.length; index += 2) {
    keyBytes[index / 2] = Number.parseInt(keyHex.slice(index, index + 2), 16);
  }
  const key = await crypto.subtle.importKey('raw', keyBytes as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message) as BufferSource));
}

export function readCookie(request: Request, name: string): string {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === name) return rest.join('=');
  }
  return '';
}

/** Токен вида `1.<истекает>.<подпись>`. */
export async function createAdminSessionToken(env: Env, nowMs = Date.now()): Promise<string | null> {
  const keyHex = await signingKey(env);
  if (!keyHex) return null;

  const expiresAt = Math.floor(nowMs / 1000) + ADMIN_SESSION_TTL_SECONDS;
  const payload = `${TOKEN_VERSION}.${expiresAt}`;
  return `${payload}.${await hmacHex(keyHex, payload)}`;
}

export async function verifyAdminSessionToken(env: Env, token: string, nowMs = Date.now()): Promise<boolean> {
  const keyHex = await signingKey(env);
  if (!keyHex) return false;

  const parts = String(token || '').split('.');
  if (parts.length !== 3) return false;

  const [version, expiresRaw, signature] = parts;
  if (version !== TOKEN_VERSION) return false;
  if (!/^\d{10,11}$/.test(expiresRaw)) return false;
  if (!/^[0-9a-f]{64}$/.test(signature)) return false;

  // Срок проверяется до подписи только для дешёвого отсева; подпись всё равно
  // обязательна, подделать срок без ключа нельзя.
  if (Number(expiresRaw) <= Math.floor(nowMs / 1000)) return false;

  return safeEqual(await hmacHex(keyHex, `${version}.${expiresRaw}`), signature);
}

export async function hasValidAdminSession(request: Request, env: Env): Promise<boolean> {
  const token = readCookie(request, ADMIN_SESSION_COOKIE);
  if (!token) return false;
  return verifyAdminSessionToken(env, token);
}

/**
 * `SameSite=Strict` — админка целиком свой домен, межсайтовые переходы в неё
 * не ведут; это заодно закрывает CSRF без отдельных токенов.
 */
export function buildSessionCookie(token: string): string {
  return [
    `${ADMIN_SESSION_COOKIE}=${token}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    `Max-Age=${ADMIN_SESSION_TTL_SECONDS}`,
  ].join('; ');
}

export function buildSessionClearCookie(): string {
  return `${ADMIN_SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}
