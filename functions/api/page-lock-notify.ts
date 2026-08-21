import { readRequestText } from '../_lib/http';
import { verifyFormStamp } from '../_lib/page-lock-preview';
import { findPageLock, isLockablePath, normalizePagePath, pageLockLabel, readPageLockSnapshot } from '../_lib/page-locks';
import { enforceRateLimit } from '../_lib/rate-limit';
import type { Env } from '../_lib/types';

/**
 * Форма «сообщить, когда откроется» с заглушки закрытой страницы.
 *
 * Работает без JavaScript: обычная отправка формы, затем переадресация обратно
 * на ту же страницу с меткой результата — иначе обновление страницы отправляло
 * бы почту повторно.
 *
 * Почта пишется в отдельную таблицу, а НЕ в заявки. Человек, оставивший адрес
 * на закрытой странице, — не заявка: попади он в `leads`, он посчитался бы в
 * воронке, цене лида и ROMI, а выдуманным цифрам в этом проекте не место.
 */

const MAX_BODY_BYTES = 4096;
const MAX_EMAIL_LENGTH = 120;
const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@.]+(?:\.[^\s@.]+)+$/;

type NotifyState = 'ok' | 'duplicate' | 'error' | 'email' | 'limit';

function backTo(path: string, state: NotifyState): Response {
  const target = `${path}?ww=${state}`;
  return new Response(null, {
    status: 303,
    headers: {
      Location: target,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function normalizeEmail(value: string): string {
  return String(value || '').trim().toLowerCase().slice(0, MAX_EMAIL_LENGTH);
}

async function notifyTelegram(env: Env, path: string, email: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  const text = [
    'Ждут открытия закрытой страницы',
    `Страница: ${pageLockLabel(path)} (${path})`,
    `Почта: ${email}`,
  ].join('\n');

  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
    });
  } catch {
    // Уведомление — удобство. Запись в базе уже есть, и она главная.
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const rateLimited = await enforceRateLimit(request, 'page_lock_notify');

  const body = await readRequestText(request, MAX_BODY_BYTES);
  const form = body.ok ? new URLSearchParams(body.text) : new URLSearchParams();
  const path = normalizePagePath(form.get('path') || '/');
  const safePath = isLockablePath(path) ? path : '/';

  if (rateLimited) return backTo(safePath, 'limit');

  // Ловушка для ботов: поле спрятано от людей и должно остаться пустым.
  if ((form.get('company') || '').trim()) return backTo(safePath, 'ok');
  if (form.get('consent') !== '1') return backTo(safePath, 'error');
  if (!(await verifyFormStamp(env, form.get('stamp') || ''))) return backTo(safePath, 'error');

  const email = normalizeEmail(form.get('email') || '');
  if (!EMAIL_PATTERN.test(email)) return backTo(safePath, 'email');

  // Почта собирается только на действительно закрытой странице: на открытой
  // такой формы нет, и присылать её туда незачем.
  const snapshot = await readPageLockSnapshot(env, waitUntil);
  const lock = findPageLock(snapshot.locks, safePath);
  if (!lock || !lock.showSubscribe) return backTo(safePath, 'error');

  if (!env.DB) return backTo(safePath, 'error');

  try {
    const result = await env.DB
      .prepare('INSERT INTO page_lock_subscribers (path, email) VALUES (?, ?) ON CONFLICT(path, email) DO NOTHING')
      .bind(lock.path, email)
      .run() as { meta?: { changes?: number } };

    if (Number(result?.meta?.changes || 0) === 0) return backTo(safePath, 'duplicate');

    waitUntil(notifyTelegram(env, lock.path, email));
    return backTo(safePath, 'ok');
  } catch {
    return backTo(safePath, 'error');
  }
};
