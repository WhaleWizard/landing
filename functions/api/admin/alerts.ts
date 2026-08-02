import { verifyAdminPassword } from '../../_lib/auth';
import { CACHE_CONTROL } from '../../_lib/cache';
import {
  ADMIN_ALERTS_MIGRATION,
  collectAlerts,
  isMissingAlertsTable,
  listAlerts,
  notifyAlerts,
  syncAlerts,
} from '../../_lib/admin-alerts';
import { json } from '../../_lib/http';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };

function migrationResponse(): Response {
  return json({
    success: false,
    code: 'MIGRATION_REQUIRED',
    migration: ADMIN_ALERTS_MIGRATION,
    error: `Примените миграцию ${ADMIN_ALERTS_MIGRATION} — до неё уведомления негде хранить.`,
  }, { status: 503, headers: noStore });
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;
  if (!verifyAdminPassword(request.headers.get('X-Admin-Password') || '', env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.DB) {
    return json({ success: false, code: 'D1_NOT_BOUND', error: 'Уведомления хранятся в D1 и доступны на production.' }, { status: 503, headers: noStore });
  }

  try {
    // Открытие раздела заодно пересчитывает поводы: иначе список показывал бы
    // состояние на момент последнего запуска cron, а не на сейчас.
    const drafts = await collectAlerts(env);
    await syncAlerts(env, drafts);
    return json({
      success: true,
      checkedAt: new Date().toISOString(),
      alerts: await listAlerts(env.DB),
      telegramConfigured: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
    }, { headers: noStore });
  } catch (error) {
    if (isMissingAlertsTable(error)) return migrationResponse();
    return json({ success: false, error: error instanceof Error ? error.message : 'Не удалось собрать уведомления' }, { status: 500, headers: noStore });
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => ({})) as { password?: string; action?: string; id?: number };
  if (!verifyAdminPassword(request.headers.get('X-Admin-Password') || body.password || '', env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.DB) {
    return json({ success: false, code: 'D1_NOT_BOUND', error: 'Уведомления хранятся в D1 и доступны на production.' }, { status: 503, headers: noStore });
  }

  try {
    if (body.action === 'dismiss') {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) {
        return json({ success: false, error: 'Некорректный идентификатор' }, { status: 400, headers: noStore });
      }
      // Скрытый повод вернётся, если ситуация повторится: правило создаст его заново.
      await env.DB.prepare("UPDATE admin_alerts SET resolved_at = datetime('now') WHERE id = ?").bind(id).run();
      return json({ success: true, alerts: await listAlerts(env.DB) }, { headers: noStore });
    }

    if (body.action === 'notify') {
      const result = await notifyAlerts(env);
      return json({ success: true, ...result, alerts: await listAlerts(env.DB) }, { headers: noStore });
    }

    return json({ success: false, error: 'Неизвестное действие' }, { status: 400, headers: noStore });
  } catch (error) {
    if (isMissingAlertsTable(error)) return migrationResponse();
    return json({ success: false, error: error instanceof Error ? error.message : 'Не удалось обновить уведомления' }, { status: 500, headers: noStore });
  }
};
