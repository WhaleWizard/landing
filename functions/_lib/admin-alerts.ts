import { getLeadsColumns, hasLeadSoftDelete } from './leads';
import type { Env } from './types';

export const ADMIN_ALERTS_MIGRATION = '0028_admin_alerts.sql';

/** Сколько часов заявка может ждать первого ответа, прежде чем это повод. */
const NO_ANSWER_HOURS = 2;
/** С какой доли месяца отставание от плана перестаёт быть шумом. */
const PACE_CHECK_FROM = 0.4;

export interface AlertDraft {
  fingerprint: string;
  kind: string;
  severity: 'critical' | 'attention' | 'info';
  title: string;
  detail: string;
  destination: string;
}

export interface AlertRow extends AlertDraft {
  id: number;
  created_at: string;
  updated_at: string;
  notified_at: string | null;
  resolved_at: string | null;
}

export function isMissingAlertsTable(error: unknown): boolean {
  return /no such table:\s*admin_alerts/i.test(error instanceof Error ? error.message : String(error));
}

function number(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function plural(count: number, forms: [string, string, string]): string {
  const abs = Math.abs(count) % 100;
  const tail = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (tail > 1 && tail < 5) return forms[1];
  if (tail === 1) return forms[0];
  return forms[2];
}

async function tableExists(db: D1Database, name: string): Promise<boolean> {
  const row = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(name)
    .first<{ name: string }>();
  return Boolean(row?.name);
}

/**
 * Правила проверяются по фактической схеме: если нужной колонки или таблицы
 * нет, правило просто молчит. Тревога не должна зависеть от того, какие
 * миграции успели применить.
 */
export async function collectAlerts(env: Env): Promise<AlertDraft[]> {
  const db = env.DB;
  if (!db) return [];

  const drafts: AlertDraft[] = [];
  const columns = await getLeadsColumns(db);
  const activeCond = (await hasLeadSoftDelete(db)) ? 'deleted_at IS NULL' : '1=1';
  const hasLeads = columns.size > 0;

  // 1. Заявки, которые ждут первого ответа дольше допустимого.
  if (hasLeads && columns.has('created_at')) {
    const answeredCond = columns.has('first_response_at') ? 'first_response_at IS NULL' : '1=1';
    const stageCond = columns.has('pipeline_stage') ? "AND COALESCE(pipeline_stage, 'new') = 'new'" : '';
    const row = await db.prepare(`
      SELECT COUNT(*) AS total, MIN(created_at) AS oldest
      FROM leads
      WHERE ${activeCond} AND ${answeredCond} ${stageCond}
        AND datetime(created_at) < datetime('now', '-${NO_ANSWER_HOURS} hour')
    `).first<{ total: number; oldest: string }>();
    const total = number(row?.total);
    if (total > 0) {
      const hours = row?.oldest
        ? Math.floor((Date.now() - new Date(`${String(row.oldest).replace(' ', 'T')}Z`).getTime()) / 3_600_000)
        : NO_ANSWER_HOURS;
      drafts.push({
        fingerprint: 'leads-no-answer',
        kind: 'leads',
        severity: total >= 3 ? 'critical' : 'attention',
        title: `${total} ${plural(total, ['заявка ждёт', 'заявки ждут', 'заявок ждут'])} первого ответа`,
        detail: `Самая старая — уже ${hours} ч. Быстрый ответ сильнее всего влияет на то, дойдёт ли заявка до сделки.`,
        destination: 'leads',
      });
    }
  }

  // 2. Просроченные следующие шаги по сделкам.
  if (hasLeads && columns.has('next_action_at')) {
    const terminal = columns.has('pipeline_stage')
      ? "AND COALESCE(pipeline_stage, '') NOT IN ('won', 'lost', 'archived')"
      : '';
    const row = await db.prepare(`
      SELECT COUNT(*) AS total FROM leads
      WHERE ${activeCond} AND next_action_at IS NOT NULL AND next_action_at != ''
        AND datetime(next_action_at) < datetime('now') ${terminal}
    `).first<{ total: number }>();
    const total = number(row?.total);
    if (total > 0) {
      drafts.push({
        fingerprint: 'leads-overdue-steps',
        kind: 'leads',
        severity: 'critical',
        title: `${total} ${plural(total, ['сделка с просроченным', 'сделки с просроченными', 'сделок с просроченными'])} шагом`,
        detail: 'Срок следующего действия уже прошёл — клиенты ждут ответа.',
        destination: 'leads',
      });
    }
  }

  // 3. Доставка событий в Meta.
  if (await tableExists(db, 'meta_capi_diagnostics')) {
    const row = await db.prepare(`
      SELECT SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed, COUNT(*) AS total
      FROM meta_capi_diagnostics WHERE created_at >= datetime('now', '-1 day')
    `).first<{ failed: number; total: number }>();
    const failed = number(row?.failed);
    if (failed > 0) {
      drafts.push({
        fingerprint: 'meta-failed-24h',
        kind: 'meta',
        severity: failed >= 5 ? 'critical' : 'attention',
        title: `Meta отклонила ${failed} ${plural(failed, ['событие', 'события', 'событий'])} за сутки`,
        detail: 'Отклонённые события не участвуют в оптимизации: реклама учится на неполных данных.',
        destination: 'meta',
      });
    }
  }

  if (await tableExists(db, 'meta_outbox')) {
    const row = await db.prepare("SELECT COUNT(*) AS total FROM meta_outbox WHERE status = 'dead_letter'")
      .first<{ total: number }>();
    const total = number(row?.total);
    if (total > 0) {
      drafts.push({
        fingerprint: 'meta-dead-letter',
        kind: 'meta',
        severity: 'critical',
        title: `${total} ${plural(total, ['событие', 'события', 'событий'])} Meta остановлено навсегда`,
        detail: 'Попытки исчерпаны — событие уже никуда не уйдёт без ручного разбора.',
        destination: 'meta',
      });
    }
  }

  // 4. Цель месяца: расход выше потолка и отставание от плана по заявкам.
  if (await tableExists(db, 'admin_goals')) {
    const period = new Date().toISOString().slice(0, 7);
    const goal = await db.prepare('SELECT * FROM admin_goals WHERE period = ?')
      .bind(period)
      .first<{ leads_target: number; spend_cap: number; currency: string }>();

    if (goal) {
      const currency = String(goal.currency || 'USD');
      if (number(goal.spend_cap) > 0 && await tableExists(db, 'ad_spend')) {
        const spend = await db.prepare(`
          SELECT COALESCE(SUM(amount), 0) AS total FROM ad_spend
          WHERE day >= date('now', 'start of month') AND currency = ?
        `).bind(currency).first<{ total: number }>();
        const spent = number(spend?.total);
        if (spent > number(goal.spend_cap)) {
          drafts.push({
            fingerprint: `goal-spend-over:${period}`,
            kind: 'goals',
            severity: 'critical',
            title: 'Расход превысил потолок месяца',
            detail: `Потрачено ${Math.round(spent)} ${currency} при потолке ${Math.round(number(goal.spend_cap))} ${currency}.`,
            destination: 'goals',
          });
        }
      }

      if (number(goal.leads_target) > 0 && columns.has('created_at')) {
        const now = new Date();
        const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
        const elapsed = now.getUTCDate();
        const share = elapsed / daysInMonth;
        if (share >= PACE_CHECK_FROM) {
          const timeColumn = columns.has('last_submitted_at') ? 'COALESCE(last_submitted_at, created_at)' : 'created_at';
          const leads = await db.prepare(`
            SELECT COUNT(*) AS total FROM leads
            WHERE ${activeCond} AND date(${timeColumn}) >= date('now', 'start of month')
          `).first<{ total: number }>();
          const forecast = Math.round(number(leads?.total) / share);
          if (forecast < number(goal.leads_target) * 0.85) {
            drafts.push({
              fingerprint: `goal-pace:${period}`,
              kind: 'goals',
              severity: 'attention',
              title: 'Темпа не хватает на план по заявкам',
              detail: `При текущем темпе выйдет около ${forecast} заявок из ${number(goal.leads_target)}. Прошло ${elapsed} из ${daysInMonth} дней.`,
              destination: 'goals',
            });
          }
        }
      }
    }
  }

  // 5. Реальная скорость у посетителей.
  if (await tableExists(db, 'web_vitals_daily')) {
    const row = await db.prepare(`
      SELECT SUM(samples) AS samples, SUM(good) AS good
      FROM web_vitals_daily
      WHERE metric = 'LCP' AND day >= date('now', '-6 day')
    `).first<{ samples: number; good: number }>();
    const samples = number(row?.samples);
    if (samples >= 50) {
      const share = Math.round((number(row?.good) / samples) * 100);
      if (share < 60) {
        drafts.push({
          fingerprint: 'vitals-lcp-poor',
          kind: 'performance',
          severity: 'attention',
          title: `Загрузка «хорошо» только у ${share}% посетителей`,
          detail: 'Google оценивает страницы по реальным визитам — медленная загрузка тянет позиции вниз.',
          destination: 'performance',
        });
      }
    }
  }

  return drafts;
}

/**
 * Синхронизация: новые поводы создаются, исчезнувшие закрываются сами.
 * Пользователю не нужно вручную разгребать то, что уже неактуально.
 */
export async function syncAlerts(env: Env, drafts: AlertDraft[]): Promise<{ created: number; resolved: number }> {
  const db = env.DB;
  if (!db) return { created: 0, resolved: 0 };

  const open = await db.prepare('SELECT id, fingerprint FROM admin_alerts WHERE resolved_at IS NULL')
    .all<{ id: number; fingerprint: string }>();
  const openByFingerprint = new Map((open.results || []).map((row) => [row.fingerprint, row.id]));
  const active = new Set(drafts.map((draft) => draft.fingerprint));

  let created = 0;
  for (const draft of drafts) {
    if (openByFingerprint.has(draft.fingerprint)) {
      await db.prepare(`
        UPDATE admin_alerts SET title = ?, detail = ?, severity = ?, updated_at = datetime('now')
        WHERE fingerprint = ? AND resolved_at IS NULL
      `).bind(draft.title, draft.detail, draft.severity, draft.fingerprint).run();
      continue;
    }
    // Повод мог быть закрыт раньше и вернуться — тогда запись оживает.
    await db.prepare(`
      INSERT INTO admin_alerts (fingerprint, kind, severity, title, detail, destination)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(fingerprint) DO UPDATE SET
        severity = excluded.severity,
        title = excluded.title,
        detail = excluded.detail,
        destination = excluded.destination,
        updated_at = datetime('now'),
        resolved_at = NULL,
        notified_at = NULL
    `).bind(draft.fingerprint, draft.kind, draft.severity, draft.title, draft.detail, draft.destination).run();
    created += 1;
  }

  let resolved = 0;
  for (const [fingerprint] of openByFingerprint) {
    if (active.has(fingerprint)) continue;
    await db.prepare("UPDATE admin_alerts SET resolved_at = datetime('now') WHERE fingerprint = ? AND resolved_at IS NULL")
      .bind(fingerprint)
      .run();
    resolved += 1;
  }

  return { created, resolved };
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Отправка непоказанных поводов в Telegram — по одному сообщению на пачку. */
export async function notifyAlerts(env: Env): Promise<{ sent: number; error?: string }> {
  const db = env.DB;
  if (!db) return { sent: 0 };
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return { sent: 0, error: 'telegram_not_configured' };

  const pending = await db.prepare(`
    SELECT id, severity, title, detail FROM admin_alerts
    WHERE resolved_at IS NULL AND notified_at IS NULL
    ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'attention' THEN 1 ELSE 2 END, id
    LIMIT 10
  `).all<{ id: number; severity: string; title: string; detail: string }>();

  const items = pending.results || [];
  if (!items.length) return { sent: 0 };

  const lines = items.map((item) => {
    const mark = item.severity === 'critical' ? '🔴' : item.severity === 'attention' ? '🟡' : '⚪️';
    return `${mark} <b>${escapeHtml(item.title)}</b>\n${escapeHtml(item.detail)}`;
  });

  try {
    const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: `<b>Админка: требует внимания</b>\n\n${lines.join('\n\n')}`,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return { sent: 0, error: `telegram_http_${response.status}: ${body.slice(0, 200)}` };
    }
  } catch (error) {
    return { sent: 0, error: error instanceof Error ? error.message : 'telegram_network_error' };
  }

  // Отметка ставится только после подтверждённой отправки: иначе повод
  // молча исчезнет, так и не дойдя до Telegram.
  const ids = items.map((item) => item.id);
  await db.prepare(`UPDATE admin_alerts SET notified_at = datetime('now') WHERE id IN (${ids.map(() => '?').join(',')})`)
    .bind(...ids)
    .run();

  return { sent: items.length };
}

export async function listAlerts(db: D1Database): Promise<AlertRow[]> {
  const rows = await db.prepare(`
    SELECT * FROM admin_alerts
    WHERE resolved_at IS NULL
    ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'attention' THEN 1 ELSE 2 END, created_at DESC
    LIMIT 30
  `).all<AlertRow>();
  return rows.results || [];
}
