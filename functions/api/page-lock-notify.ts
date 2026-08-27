import { getClientIp, readRequestText } from '../_lib/http';
import { sendPageInterestEvent } from '../_lib/page-lock-interest';
import { verifyFormStamp } from '../_lib/page-lock-preview';
import {
  findPageLock,
  isLockablePath,
  normalizePagePath,
  pageLockLabel,
  readPageLockSnapshot,
  readSubscriberFields,
} from '../_lib/page-locks';
import { enforceRateLimit } from '../_lib/rate-limit';
import type { Env } from '../_lib/types';

/**
 * Контакты с заглушки закрытой страницы.
 *
 * Работает без JavaScript: обычная отправка формы, затем переадресация обратно
 * на ту же страницу с меткой результата — иначе обновление страницы отправляло
 * бы контакт повторно.
 *
 * Данные пишутся в отдельную таблицу, а НЕ в заявки. Человек, оставивший
 * контакт на закрытой странице, — не заявка: попади он в `leads`, он
 * посчитался бы в воронке, цене лида и ROMI, а выдуманным цифрам в этом
 * проекте не место.
 *
 * В Meta уходит отдельное событие `PageInterest` и только при явной галочке
 * согласия на маркетинг. Без неё не отправляется ничего.
 */

const MAX_BODY_BYTES = 4096;
const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@.]+(?:\.[^\s@.]+)+$/;
const TELEGRAM_PATTERN = /^[a-z0-9_]{5,32}$/;

type NotifyState = 'ok' | 'duplicate' | 'error' | 'email' | 'phone' | 'telegram' | 'contact' | 'limit';

function backTo(path: string, state: NotifyState): Response {
  return new Response(null, {
    status: 303,
    headers: {
      Location: `${path}?ww=${state}`,
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function normalizeEmailInput(value: string): string {
  return String(value || '').trim().toLowerCase().slice(0, 120);
}

/**
 * Телефон приводится к цифрам с ведущим плюсом и ничего не додумывает.
 *
 * Код страны не подставляется: на заглушке нет выбора страны, а придуманный
 * префикс превратил бы чужой номер в неверный.
 */
function normalizePhoneInput(value: string): string {
  const raw = String(value || '').trim().slice(0, 32);
  if (!raw) return '';
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return '';
  return `+${digits}`;
}

function normalizeTelegramInput(value: string): string {
  const raw = String(value || '').trim().toLowerCase().slice(0, 64);
  if (!raw) return '';
  const handle = raw
    .replace(/^https?:\/\/(?:t\.me|telegram\.me)\//, '')
    .replace(/^@/, '')
    .replace(/\/+$/, '');
  return TELEGRAM_PATTERN.test(handle) ? handle : '';
}

function readCookie(request: Request, name: string): string {
  const header = request.headers.get('Cookie') || '';
  for (const part of header.split(';')) {
    const [rawName, ...rest] = part.split('=');
    if (rawName.trim() === name) return rest.join('=').trim();
  }
  return '';
}

async function notifyTelegram(
  env: Env,
  path: string,
  contacts: { email: string; phone: string; telegram: string; marketing: boolean },
): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;

  const lines = [
    'Ждут открытия закрытой страницы',
    `Страница: ${pageLockLabel(path)} (${path})`,
    contacts.email ? `Почта: ${contacts.email}` : '',
    contacts.phone ? `Телефон: ${contacts.phone}` : '',
    contacts.telegram ? `Телеграм: @${contacts.telegram}` : '',
    contacts.marketing ? 'Согласие на маркетинг: да' : 'Согласие на маркетинг: нет',
  ].filter(Boolean);

  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: lines.join('\n'), disable_web_page_preview: true }),
      signal: AbortSignal.timeout(8_000),
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

  const rawEmail = (form.get('email') || '').trim();
  const rawPhone = (form.get('phone') || '').trim();
  const rawTelegram = (form.get('telegram') || '').trim();

  if (!rawEmail && !rawPhone && !rawTelegram) return backTo(safePath, 'contact');

  const email = normalizeEmailInput(rawEmail);
  if (rawEmail && !EMAIL_PATTERN.test(email)) return backTo(safePath, 'email');

  const phone = normalizePhoneInput(rawPhone);
  if (rawPhone && !phone) return backTo(safePath, 'phone');

  const telegram = normalizeTelegramInput(rawTelegram);
  if (rawTelegram && !telegram) return backTo(safePath, 'telegram');

  // Контакты собираются только на действительно закрытой странице: на открытой
  // такой формы нет, и присылать её туда незачем.
  const snapshot = await readPageLockSnapshot(env, waitUntil);
  const lock = findPageLock(snapshot.locks, safePath);
  if (!lock || !lock.showSubscribe) return backTo(safePath, 'error');

  if (!env.DB) return backTo(safePath, 'error');

  const fields = await readSubscriberFields(env);
  const marketing = fields.marketing && form.get('marketing') === '1';
  const region = String((request as { cf?: { country?: string } }).cf?.country || '').trim();

  const columns = ['path', 'email'];
  const values: Array<string | number> = [lock.path, email];
  if (fields.phone) { columns.push('phone'); values.push(phone); }
  if (fields.telegram) { columns.push('telegram'); values.push(telegram); }
  if (fields.marketing) {
    columns.push('marketing_consent', 'consent_at', 'consent_region');
    values.push(marketing ? 1 : 0, new Date().toISOString(), region);
  }

  try {
    const statement = `INSERT INTO page_lock_subscribers (${columns.join(', ')})
      VALUES (${columns.map(() => '?').join(', ')}) ON CONFLICT DO NOTHING`;
    const result = await env.DB.prepare(statement).bind(...values).run() as {
      meta?: { changes?: number; last_row_id?: number };
    };

    if (Number(result?.meta?.changes || 0) === 0) return backTo(safePath, 'duplicate');

    waitUntil(notifyTelegram(env, lock.path, { email, phone, telegram, marketing }));

    if (marketing) {
      const url = new URL(request.url);
      waitUntil(sendPageInterestEvent(env, {
        subscriberId: Number(result?.meta?.last_row_id || 0),
        path: lock.path,
        email,
        phone,
        marketingConsent: true,
        consentRegion: region,
        clientIp: getClientIp(request),
        userAgent: request.headers.get('User-Agent') || '',
        fbp: readCookie(request, '_fbp'),
        fbc: readCookie(request, '_fbc'),
        eventSourceUrl: `${url.origin}${lock.path}`,
      }).then(() => undefined));
    }

    return backTo(safePath, 'ok');
  } catch {
    return backTo(safePath, 'error');
  }
};
