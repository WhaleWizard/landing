import { CACHE_CONTROL } from '../_lib/cache';
import { collectAlerts, isMissingAlertsTable, notifyAlerts, syncAlerts } from '../_lib/admin-alerts';
import { json } from '../_lib/http';
import { enforceRateLimit } from '../_lib/rate-limit';
import type { Env } from '../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };

/**
 * Запуск проверки уведомлений извне (cron-сервис). Админка не открыта
 * круглосуточно, а заявка без ответа второй час — повод написать в Telegram
 * без участия человека.
 *
 * Защита — тем же секретом, что и досылка Meta-очереди: отдельная точка
 * без пароля админки, но и без доступа к данным, только запуск проверки.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  const secret = env.META_CAPI_DEBUG_SECRET;
  const provided = request.headers.get('x-meta-debug-secret') || undefined;
  if (!secret || provided !== secret) {
    return json(
      { success: false, error: 'META_CAPI_DEBUG_SECRET is required and must match x-meta-debug-secret' },
      { status: 403, headers: noStore },
    );
  }

  if (!env.DB) {
    return json({ success: false, error: 'D1 не подключена' }, { status: 503, headers: noStore });
  }

  try {
    const drafts = await collectAlerts(env);
    const sync = await syncAlerts(env, drafts);
    const notified = await notifyAlerts(env);
    return json({
      success: true,
      checked: drafts.length,
      created: sync.created,
      resolved: sync.resolved,
      notified: notified.sent,
      notifyError: notified.error,
    }, { headers: noStore });
  } catch (error) {
    if (isMissingAlertsTable(error)) {
      return json({ success: false, error: 'Примените миграцию 0028_admin_alerts.sql' }, { status: 503, headers: noStore });
    }
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'alerts run failed',
    }, { status: 500, headers: noStore });
  }
};
