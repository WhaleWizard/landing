/**
 * Вход в админку: пароль плюс одноразовый код из приложения.
 *
 * Раньше пароль передавался в каждом запросе к `/api/admin/*` и жил в памяти
 * вкладки, поэтому перезагрузка страницы разлогинивала. Теперь вход выдаёт
 * подписанную сессию в HttpOnly-cookie: пароль после входа больше не ходит по
 * сети, а перезагрузка не выкидывает.
 *
 * Эндпоинт намеренно исключён из общей проверки `_middleware.ts` — иначе войти
 * было бы нельзя.
 */

import { json } from '../../_lib/http';
import { CACHE_CONTROL } from '../../_lib/cache';
import { verifyAdminPassword } from '../../_lib/auth';
import { enforceRateLimit } from '../../_lib/rate-limit';
import {
  buildSessionClearCookie,
  buildSessionCookie,
  createAdminSessionToken,
  hasValidAdminSession,
} from '../../_lib/admin-session';
import {
  claimTotpStep,
  consumeBackupCode,
  disableAdmin2fa,
  enableAdmin2fa,
  isMissingAdmin2faSchema,
  readAdmin2faState,
  storeAdmin2faSecret,
} from '../../_lib/admin-2fa';
import {
  buildOtpAuthUri,
  formatSecretForHuman,
  generateBackupCodes,
  generateTotpSecret,
  isTotpCodeFormat,
  verifyTotpCode,
} from '../../_lib/admin-totp';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };

const MIGRATION_HINT = {
  success: false,
  code: 'MIGRATION_REQUIRED',
  migration: '0036_admin_2fa.sql',
  table: 'admin_2fa',
  error: 'Двухфакторная защита требует миграции 0036. Вход по паролю работает.',
};

interface AuthBody {
  action?: string;
  password?: string;
  code?: string;
}

/**
 * Короткое уведомление владельцу. Отправка не должна ломать вход, поэтому
 * любая ошибка здесь только пишется в лог.
 */
async function notifyOwner(env: Env, text: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  try {
    await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
      // Уведомление не должно задерживать вход: зависший Telegram без таймаута
      // держал бы фоновую задачу до лимита воркера.
      signal: AbortSignal.timeout(8_000),
    });
  } catch (error) {
    console.error('[Admin auth] Не удалось отправить уведомление:', error);
  }
}

/** IPv4 — первые два октета, IPv6 — первые два блока. Остальное скрыто. */
function maskAddress(ip: string): string {
  if (!ip) return 'неизвестно';
  if (ip.includes(':')) {
    const blocks = ip.split(':').filter(Boolean).slice(0, 2);
    return blocks.length ? `${blocks.join(':')}:…` : 'неизвестно';
  }
  const octets = ip.split('.');
  return octets.length === 4 ? `${octets.slice(0, 2).join('.')}.x.x` : 'неизвестно';
}

function describeRequest(request: Request): string {
  const country = request.headers.get('CF-IPCountry') || '';
  const ip = request.headers.get('CF-Connecting-IP') || '';
  // В уведомлении полезен не сам адрес, а его узнаваемость: «это снова я» или
  // «это кто-то другой». Поэтому адрес показывается частично.
  //
  // IPv6 обрабатывается отдельно: точек в нём нет, и прежний вариант с
  // `split('.')` возвращал адрес целиком — то есть маскировка не работала
  // ровно там, где адрес длиннее и приметнее.
  const maskedIp = maskAddress(ip);
  return `${maskedIp}${country ? `, ${country}` : ''}`;
}

async function sessionResponse(env: Env, body: Record<string, unknown>): Promise<Response> {
  const token = await createAdminSessionToken(env);
  if (!token) {
    return json({ success: false, error: 'admin_password_not_configured' }, { status: 503, headers: noStore });
  }
  return json(body, { headers: { ...noStore, 'Set-Cookie': buildSessionCookie(token) } });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  let body: AuthBody;
  try {
    body = await request.json() as AuthBody;
  } catch {
    return json({ success: false, error: 'invalid_json' }, { status: 400, headers: noStore });
  }

  const action = String(body.action || 'login');
  const authorized = await hasValidAdminSession(request, env);

  if (action === 'logout') {
    return json({ success: true }, { headers: { ...noStore, 'Set-Cookie': buildSessionClearCookie() } });
  }

  if (action === 'status') {
    if (!authorized) return json({ success: true, authenticated: false }, { headers: noStore });
    try {
      const state = await readAdmin2faState(env);
      return json({
        success: true,
        authenticated: true,
        twoFactor: {
          configured: state.configured,
          enabled: state.enabled,
          backupCodesLeft: state.backupCodesLeft,
        },
      }, { headers: noStore });
    } catch (error) {
      if (isMissingAdmin2faSchema(error)) {
        return json({ success: true, authenticated: true, twoFactor: { configured: false, enabled: false, backupCodesLeft: 0, migrationRequired: true } }, { headers: noStore });
      }
      throw error;
    }
  }

  // Всё, что ниже, — попытка получить или изменить доступ.
  const rateLimited = await enforceRateLimit(request, 'admin_login');
  if (rateLimited) {
    waitUntil(notifyOwner(env, `🔐 <b>Админка: много попыток входа</b>\nОткуда: ${describeRequest(request)}\nВход временно заблокирован.`));
    return rateLimited;
  }

  // Пароль обязателен всегда: сессия его не заменяет, а дополняет. Даже
  // владелец с открытой сессией подтверждает паролем изменение настроек входа.
  const passwordOk = verifyAdminPassword(String(body.password || ''), env);
  if (!passwordOk && !(authorized && action !== 'login')) {
    return json({ success: false, error: 'invalid_credentials' }, { status: 401, headers: noStore });
  }

  let state;
  try {
    state = await readAdmin2faState(env);
  } catch (error) {
    if (!isMissingAdmin2faSchema(error)) throw error;
    // Миграции нет — двухфакторной защиты не существует, вход идёт по паролю.
    if (action === 'login') {
      waitUntil(notifyOwner(env, `🔓 <b>Вход в админку</b>\nОткуда: ${describeRequest(request)}\nДвухфакторная защита не настроена.`));
      return sessionResponse(env, { success: true, authenticated: true, twoFactor: { enabled: false } });
    }
    return json(MIGRATION_HINT, { status: 503, headers: noStore });
  }

  const rawCode = String(body.code || '').trim();

  if (action === 'login') {
    if (!state.enabled) {
      waitUntil(notifyOwner(env, `🔓 <b>Вход в админку</b>\nОткуда: ${describeRequest(request)}\nДвухфакторная защита не включена.`));
      return sessionResponse(env, { success: true, authenticated: true, twoFactor: { enabled: false, configured: state.configured } });
    }

    if (!rawCode) {
      // Пароль верный, но нужен код. Это не ошибка входа, а следующий шаг.
      return json({ success: false, error: 'code_required', codeRequired: true }, { status: 401, headers: noStore });
    }

    if (isTotpCodeFormat(rawCode)) {
      const step = await verifyTotpCode(state.secret, rawCode);
      if (step === null) {
        return json({ success: false, error: 'invalid_code' }, { status: 401, headers: noStore });
      }
      // Один код — один вход. Пока интервал не сменился, повторно им не войти.
      if (!(await claimTotpStep(env, step))) {
        return json({ success: false, error: 'code_already_used' }, { status: 401, headers: noStore });
      }
      waitUntil(notifyOwner(env, `🔐 <b>Вход в админку</b>\nОткуда: ${describeRequest(request)}`));
      return sessionResponse(env, { success: true, authenticated: true, twoFactor: { enabled: true, backupCodesLeft: state.backupCodesLeft } });
    }

    if (await consumeBackupCode(env, state, rawCode)) {
      const left = Math.max(0, state.backupCodesLeft - 1);
      waitUntil(notifyOwner(env, `🔐 <b>Вход в админку резервным кодом</b>\nОткуда: ${describeRequest(request)}\nОсталось кодов: ${left}`));
      return sessionResponse(env, { success: true, authenticated: true, usedBackupCode: true, twoFactor: { enabled: true, backupCodesLeft: left } });
    }

    return json({ success: false, error: 'invalid_code' }, { status: 401, headers: noStore });
  }

  // Настройка защиты доступна только по паролю — сессии для этого мало.
  if (!passwordOk) {
    return json({ success: false, error: 'password_required' }, { status: 401, headers: noStore });
  }

  if (action === 'setup') {
    if (!env.DB) {
      return json({ success: false, error: 'Двухфакторная защита требует базы D1 (недоступна локально)' }, { status: 503, headers: noStore });
    }
    const secret = generateTotpSecret();
    await storeAdmin2faSecret(env, secret);
    const account = 'admin@whalewzrd.com';
    return json({
      success: true,
      secret,
      secretForHuman: formatSecretForHuman(secret),
      otpauthUri: buildOtpAuthUri(secret, account, 'Whale Wizard'),
      account,
    }, { headers: noStore });
  }

  if (action === 'enable') {
    if (!state.configured) {
      return json({ success: false, error: 'setup_required' }, { status: 400, headers: noStore });
    }
    const step = await verifyTotpCode(state.secret, rawCode);
    if (step === null) {
      return json({ success: false, error: 'invalid_code' }, { status: 400, headers: noStore });
    }
    const backupCodes = generateBackupCodes();
    await enableAdmin2fa(env, backupCodes, step);
    waitUntil(notifyOwner(env, `✅ <b>Двухфакторная защита админки включена</b>\nОткуда: ${describeRequest(request)}`));
    // Коды показываются один раз: в базе лежат только их хеши.
    return sessionResponse(env, { success: true, backupCodes, twoFactor: { enabled: true, configured: true, backupCodesLeft: backupCodes.length } });
  }

  if (action === 'disable') {
    if (!state.enabled) {
      return json({ success: true, twoFactor: { enabled: false, configured: false, backupCodesLeft: 0 } }, { headers: noStore });
    }
    const step = await verifyTotpCode(state.secret, rawCode);
    const byBackupCode = step === null ? await consumeBackupCode(env, state, rawCode) : false;
    if (step === null && !byBackupCode) {
      return json({ success: false, error: 'invalid_code' }, { status: 400, headers: noStore });
    }
    await disableAdmin2fa(env);
    waitUntil(notifyOwner(env, `⚠️ <b>Двухфакторная защита админки выключена</b>\nОткуда: ${describeRequest(request)}`));
    return json({ success: true, twoFactor: { enabled: false, configured: false, backupCodesLeft: 0 } }, { headers: noStore });
  }

  return json({ success: false, error: 'unknown_action' }, { status: 400, headers: noStore });
};
