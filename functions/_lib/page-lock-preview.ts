import type { Env } from './types';

/**
 * Предпросмотр закрытой страницы владельцем.
 *
 * Ссылка подписывается секретным ключом и живёт два часа. Ключ выводится из
 * пароля админки односторонним хешем: сам пароль в ссылку не попадает, а смена
 * пароля мгновенно убивает все выданные ссылки. Отдельный секрет
 * `PAGE_LOCK_PREVIEW_SECRET` можно задать, если захочется отвязать одно от
 * другого.
 *
 * Никаких «флажков» в localStorage или заголовках: доступ к закрытой странице
 * даёт только подпись, которую без ключа не подделать.
 */

export const PREVIEW_COOKIE = 'ww_preview';
export const PREVIEW_QUERY = 'ww_preview';
export const PREVIEW_TTL_SECONDS = 2 * 60 * 60;

const TOKEN_VERSION = '1';
const PREVIEW_PURPOSE = 'preview';
const FORM_PURPOSE = 'form';
// Форма на заглушке отправляется человеком, а не за миллисекунду скриптом.
const FORM_MIN_AGE_SECONDS = 2;
const FORM_MAX_AGE_SECONDS = 2 * 60 * 60;

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
  const secret = String(env.PAGE_LOCK_PREVIEW_SECRET || env.ADMIN_PASSWORD || '').trim();
  if (!secret) return null;
  return sha256Hex(`ww-page-lock-key|${secret}`);
}

async function hmacHex(keyHex: string, message: string): Promise<string> {
  const keyBytes = new Uint8Array(keyHex.length / 2);
  for (let index = 0; index < keyHex.length; index += 2) {
    keyBytes[index / 2] = Number.parseInt(keyHex.slice(index, index + 2), 16);
  }
  const key = await crypto.subtle.importKey('raw', keyBytes as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message) as BufferSource);
  return toHex(signature);
}

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Одноразовая ссылка предпросмотра. `null`, если пароль админки не задан. */
export async function createPreviewToken(env: Env, ttlSeconds = PREVIEW_TTL_SECONDS): Promise<string | null> {
  const keyHex = await signingKey(env);
  if (!keyHex) return null;
  const expiresAt = nowSeconds() + Math.max(60, Math.min(PREVIEW_TTL_SECONDS, Math.floor(ttlSeconds)));
  const nonce = randomHex(16);
  const signature = await hmacHex(keyHex, `${PREVIEW_PURPOSE}|${TOKEN_VERSION}|${expiresAt}|${nonce}`);
  return `${TOKEN_VERSION}.${expiresAt}.${nonce}.${signature}`;
}

export async function verifyPreviewToken(env: Env, token: string): Promise<{ ok: boolean; expiresAt: number }> {
  const parts = String(token || '').split('.');
  if (parts.length !== 4) return { ok: false, expiresAt: 0 };

  const [version, expiresRaw, nonce, signature] = parts;
  if (version !== TOKEN_VERSION) return { ok: false, expiresAt: 0 };
  if (!/^\d{1,12}$/.test(expiresRaw) || !/^[0-9a-f]{32}$/.test(nonce) || !/^[0-9a-f]{64}$/.test(signature)) {
    return { ok: false, expiresAt: 0 };
  }

  const expiresAt = Number(expiresRaw);
  if (expiresAt <= nowSeconds()) return { ok: false, expiresAt };

  const keyHex = await signingKey(env);
  if (!keyHex) return { ok: false, expiresAt };

  const expected = await hmacHex(keyHex, `${PREVIEW_PURPOSE}|${TOKEN_VERSION}|${expiresAt}|${nonce}`);
  return { ok: safeEqual(expected, signature), expiresAt };
}

function readCookie(request: Request, name: string): string {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [rawName, ...rest] = part.split('=');
    if (rawName.trim() === name) return rest.join('=').trim();
  }
  return '';
}

function previewCookie(token: string, maxAgeSeconds: number): string {
  const attributes = [
    `${PREVIEW_COOKIE}=${token}`,
    'Path=/',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
  ];
  return attributes.join('; ');
}

export interface PreviewAccess {
  active: boolean;
  /** Переадресация на чистый адрес после обмена ссылки на cookie. */
  redirect: Response | null;
}

/**
 * Разбирает доступ к предпросмотру для текущего запроса.
 *
 * Ссылка обменивается на cookie и тут же убирается из адресной строки: иначе
 * подписанный токен утёк бы в закладки, в реферер и в статистику. Cookie
 * проверяется подписью на каждом запросе, поэтому подделать её нельзя, а
 * просроченная перестаёт работать сама.
 */
export async function resolvePreviewAccess(request: Request, env: Env, url: URL): Promise<PreviewAccess> {
  const queryToken = url.searchParams.get(PREVIEW_QUERY);

  if (queryToken === 'off') {
    const target = new URL(url.toString());
    target.searchParams.delete(PREVIEW_QUERY);
    return {
      active: false,
      redirect: new Response(null, {
        status: 302,
        headers: {
          Location: `${target.pathname}${target.search}${target.hash}`,
          'Set-Cookie': previewCookie('', 0),
          'Cache-Control': 'no-store',
        },
      }),
    };
  }

  if (queryToken) {
    const verified = await verifyPreviewToken(env, queryToken);
    const target = new URL(url.toString());
    target.searchParams.delete(PREVIEW_QUERY);
    const headers = new Headers({
      Location: `${target.pathname}${target.search}${target.hash}`,
      'Cache-Control': 'no-store',
    });
    if (verified.ok) {
      headers.set('Set-Cookie', previewCookie(queryToken, verified.expiresAt - nowSeconds()));
    }
    return { active: false, redirect: new Response(null, { status: 302, headers }) };
  }

  const cookieToken = readCookie(request, PREVIEW_COOKIE);
  if (!cookieToken) return { active: false, redirect: null };

  const verified = await verifyPreviewToken(env, cookieToken);
  return { active: verified.ok, redirect: null };
}

/**
 * Подпись времени для формы на заглушке.
 *
 * Даёт две вещи сразу: форму нельзя отправлять пачкой со стороннего скрипта
 * (подпись выдаётся только при показе страницы) и нельзя отправить мгновенно,
 * как это делает бот.
 */
export async function createFormStamp(env: Env): Promise<string> {
  const keyHex = await signingKey(env);
  if (!keyHex) return '';
  const issuedAt = nowSeconds();
  const signature = await hmacHex(keyHex, `${FORM_PURPOSE}|${issuedAt}`);
  return `${issuedAt}.${signature}`;
}

export async function verifyFormStamp(env: Env, stamp: string): Promise<boolean> {
  const parts = String(stamp || '').split('.');
  if (parts.length !== 2) return false;

  const [issuedRaw, signature] = parts;
  if (!/^\d{1,12}$/.test(issuedRaw) || !/^[0-9a-f]{64}$/.test(signature)) return false;

  const issuedAt = Number(issuedRaw);
  const age = nowSeconds() - issuedAt;
  if (age < FORM_MIN_AGE_SECONDS || age > FORM_MAX_AGE_SECONDS) return false;

  const keyHex = await signingKey(env);
  if (!keyHex) return false;

  const expected = await hmacHex(keyHex, `${FORM_PURPOSE}|${issuedAt}`);
  return safeEqual(expected, signature);
}

/** Хеш «кто сделал» для журнала: сырые IP и user-agent не хранятся. */
export async function actorHash(request: Request): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const agent = request.headers.get('User-Agent') || 'unknown';
  return (await sha256Hex(`page-lock-actor|${ip}|${agent}`)).slice(0, 32);
}
