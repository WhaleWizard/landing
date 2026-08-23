/**
 * Проверка токена Cloudflare Turnstile на сервере.
 *
 * Клиентский виджет сам по себе не защищает ничего: токен обязан проверяться
 * на сервере, иначе его можно просто не присылать. Ответ Cloudflare — это
 * единственное, чему здесь верят.
 *
 * Токен одноразовый: Cloudflare гасит его при первой проверке, поэтому
 * переиспользовать один пройденный виджет для потока заявок нельзя.
 *
 * Почему отказ, а не «сохранить с пометкой»: на бесплатном тарифе Cloudflare
 * суточный лимит записей в D1 конечный, и поток ботов, складываемый в базу
 * «на разбор», выжигал бы его вместо того, чтобы быть отбитым. Живой человек
 * при этом не теряется — см. `docs/SECURITY.md`.
 */

import { getClientIp } from './http';
import type { Env } from './types';

const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const VERIFY_TIMEOUT_MS = 5_000;
const MAX_TOKEN_LENGTH = 2048;

export type TurnstileResult =
  | { ok: true }
  | { ok: false; reason: TurnstileFailureReason };

/**
 * `missing_token` и `invalid_token` — разные истории, и разделены намеренно.
 * Первое означает «виджет не отработал», второе — «Cloudflare сказал нет».
 * Владельцу важно видеть их порознь: рост первого — повод проверить сайт,
 * рост второго — обычная работа защиты.
 */
export type TurnstileFailureReason =
  | 'missing_token'
  | 'invalid_token'
  | 'verification_unavailable';

export function isTurnstileConfigured(env: Env): boolean {
  return Boolean(String(env.TURNSTILE_SECRET_KEY || '').trim());
}

interface SiteverifyResponse {
  success?: boolean;
  'error-codes'?: string[];
}

export async function verifyTurnstileToken(env: Env, token: string, request: Request): Promise<TurnstileResult> {
  const secret = String(env.TURNSTILE_SECRET_KEY || '').trim();
  if (!secret) return { ok: true };

  const normalizedToken = String(token || '').trim();
  if (!normalizedToken || normalizedToken.length > MAX_TOKEN_LENGTH) {
    return { ok: false, reason: 'missing_token' };
  }

  const body = new FormData();
  body.append('secret', secret);
  body.append('response', normalizedToken);
  const ip = getClientIp(request);
  if (ip && ip !== 'unknown' && ip !== 'local') body.append('remoteip', ip);

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      body,
      signal: AbortSignal.timeout(VERIFY_TIMEOUT_MS),
    });

    if (!response.ok) {
      console.error(`[Turnstile] Siteverify ответил HTTP ${response.status}`);
      return { ok: false, reason: 'verification_unavailable' };
    }

    const result = await response.json() as SiteverifyResponse;
    if (result.success === true) return { ok: true };

    console.warn('[Turnstile] Токен отклонён:', result['error-codes']);
    return { ok: false, reason: 'invalid_token' };
  } catch (error) {
    // Сеть до Cloudflare не поднялась или проверка не уложилась в таймаут.
    // Это не признак бота, поэтому причина отдельная: решение, что с ней
    // делать, принимает вызывающая сторона.
    console.error('[Turnstile] Проверка не выполнена:', error);
    return { ok: false, reason: 'verification_unavailable' };
  }
}
