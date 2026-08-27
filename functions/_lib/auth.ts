import type { Env } from './types';

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

export function verifyAdminPassword(inputPassword: string, env: Env): boolean {
  if (!env.ADMIN_PASSWORD) return false;
  return timingSafeEqual(String(inputPassword || ''), String(env.ADMIN_PASSWORD));
}

/**
 * Секрет для служебных точек: досылка очереди Meta, запуск проверок,
 * диагностика, тестовое событие.
 *
 * Раньше каждая из девяти таких точек сравнивала секрет обычным `!==`.
 * Обычное сравнение строк прерывается на первом несовпавшем символе, то есть
 * время ответа зависит от того, сколько символов угадано. Здесь то же
 * сравнение постоянным временем, что и для пароля админки.
 *
 * Незаданный секрет означает отказ: точка не должна открываться сама собой,
 * если переменную окружения забыли.
 */
export function verifyDebugSecret(provided: string | null | undefined, env: Env): boolean {
  const expected = String(env.META_CAPI_DEBUG_SECRET || '');
  if (!expected) return false;
  return timingSafeEqual(String(provided || ''), expected);
}
