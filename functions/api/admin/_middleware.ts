/**
 * Общая проверка доступа для всех разделов админки.
 *
 * Каждый эндпоинт `/api/admin/*` по-прежнему проверяет пароль сам — это не
 * трогается намеренно, иначе пришлось бы переписать три десятка обработчиков
 * ради одной правки. Здесь решается ровно один вопрос: как этот пароль до них
 * доходит.
 *
 * - есть действующая сессия → пароль подставляется на месте, из окружения, и
 *   по сети больше не ходит вообще;
 * - сессии нет, а двухфакторная защита включена → запрос отклоняется до
 *   обработчика: иначе один только пароль в заголовке обходил бы второй
 *   фактор целиком, и вся защита была бы декоративной;
 * - сессии нет и защита не включена → всё работает по-старому, по заголовку.
 *
 * Сам вход (`/api/admin/auth`) обязан оставаться открытым, иначе войти
 * будет нечем.
 */

import { json } from '../../_lib/http';
import { CACHE_CONTROL } from '../../_lib/cache';
import { hasValidAdminSession } from '../../_lib/admin-session';
import { isAdmin2faEnabled } from '../../_lib/admin-2fa';
import type { Env } from '../../_lib/types';

const AUTH_PATH = '/api/admin/auth';

export const onRequest: PagesFunction<Env> = async ({ request, env, next }) => {
  if (new URL(request.url).pathname === AUTH_PATH) return next();

  if (await hasValidAdminSession(request, env)) {
    const headers = new Headers(request.headers);
    headers.set('X-Admin-Password', String(env.ADMIN_PASSWORD || ''));
    try {
      return await next(new Request(request, { headers }));
    } catch (error) {
      // Пересборка запроса с телом — единственное место здесь, где среда может
      // повести себя иначе, чем ожидается. Ронять из-за этого весь раздел
      // нельзя: пропускаем запрос дальше, обработчик сам ответит 401, и это
      // будет понятная ошибка доступа, а не пустой экран.
      console.error('[Admin auth] Не удалось передать запрос дальше:', error);
      return next();
    }
  }

  if (await isAdmin2faEnabled(env)) {
    return json(
      { success: false, error: 'session_required' },
      { status: 401, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }

  return next();
};
