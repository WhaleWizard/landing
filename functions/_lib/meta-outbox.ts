import type { Env } from './types';
import { fetchMetaWithRetry, isRetryableMetaStatus } from './meta-capi';
import { markMetaEventSent, wasMetaEventAlreadySent } from './meta-diagnostics';

export type OutboxStatus = 'pending' | 'retry' | 'sending' | 'sent' | 'dead_letter';

const DEFAULT_MAX_OUTBOX_ATTEMPTS = 8;
// Meta принимает события action_source=website не старше 7 дней — дальше повтор бессмыслен.
const MAX_OUTBOX_AGE_SECONDS = 6 * 24 * 60 * 60;
// Свежие записи не трогаем: их ещё отправляет исходный запрос.
const CLAIM_GRACE_SECONDS = 180;
// Записи, зависшие в 'sending' (isolate умер посреди отправки), возвращаем в оборот.
const STUCK_SENDING_SECONDS = 600;

type OutboxRow = {
  id: string;
  event_name: string;
  event_id: string;
  payload_json: string;
  attempts: number;
  created_at: number;
};

export type OutboxProcessSummary = {
  processed: number;
  sent: number;
  retried: number;
  dead: number;
};

function getMaxOutboxAttempts(env: Env): number {
  const raw = Number(env.META_OUTBOX_MAX_ATTEMPTS || DEFAULT_MAX_OUTBOX_ATTEMPTS);
  if (!Number.isFinite(raw)) return DEFAULT_MAX_OUTBOX_ATTEMPTS;
  return Math.min(20, Math.max(1, Math.floor(raw)));
}

export function getOutboxRetryDelaySeconds(attempts: number): number {
  const base = Math.min(3600, 60 * 2 ** Math.max(0, attempts - 1));
  return base + Math.floor(Math.random() * 30);
}

// payload_json — это готовое тело запроса к Graph API ({ data: [event] }),
// чтобы повторная отправка не требовала контекста исходного HTTP-запроса.
export async function enqueueMetaEvent(env: Env, input: { id: string; event_name: string; event_id: string; payload_json: string }): Promise<void> {
  if (!env.DB) return;
  await env.DB.prepare(
    `INSERT OR IGNORE INTO meta_outbox (id, event_name, event_id, payload_json, status, attempts, next_retry_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', 0, strftime('%s','now') + ${CLAIM_GRACE_SECONDS}, strftime('%s','now'), strftime('%s','now'))`
  ).bind(input.id, input.event_name, input.event_id, input.payload_json).run();
}

export async function markOutboxSent(env: Env, id: string): Promise<void> {
  if (!env.DB) return;
  await env.DB.prepare(`UPDATE meta_outbox SET status='sent', sent_at=strftime('%s','now'), updated_at=strftime('%s','now') WHERE id=?`).bind(id).run();
}

export async function markOutboxRetry(env: Env, id: string, attempts: number, nextRetryAt: number, error: string): Promise<void> {
  if (!env.DB) return;
  await env.DB.prepare(`UPDATE meta_outbox SET status='retry', attempts=?, next_retry_at=?, last_error=?, updated_at=strftime('%s','now') WHERE id=?`)
    .bind(attempts, nextRetryAt, error.slice(0, 1000), id).run();
}

export async function markOutboxDeadLetter(env: Env, id: string, error: string): Promise<void> {
  if (!env.DB) return;
  await env.DB.prepare(`UPDATE meta_outbox SET status='dead_letter', last_error=?, updated_at=strftime('%s','now') WHERE id=?`)
    .bind(error.slice(0, 1000), id).run();
}

// Повторная отправка событий, не дошедших до Meta с первого раза.
// Вызывается из /api/meta-outbox-process (внешний cron/пингер) и фоном из /api/pageview.
export async function processMetaOutbox(env: Env, limit = 10): Promise<OutboxProcessSummary> {
  const summary: OutboxProcessSummary = { processed: 0, sent: 0, retried: 0, dead: 0 };
  if (!env.DB) return summary;

  const token = env.META_CAPI_ACCESS_TOKEN;
  const pixelId = env.VITE_META_PIXEL_ID;
  if (!token || !pixelId) return summary;
  const apiVersion = env.META_CAPI_API_VERSION || 'v25.0';

  const now = Math.floor(Date.now() / 1000);
  const maxAttempts = getMaxOutboxAttempts(env);

  const claimed = await env.DB.prepare(
    `UPDATE meta_outbox SET status='sending', updated_at=strftime('%s','now')
     WHERE id IN (
       SELECT id FROM meta_outbox
       WHERE (status IN ('pending','retry') AND next_retry_at <= ?1)
          OR (status = 'sending' AND updated_at <= ?1 - ${STUCK_SENDING_SECONDS})
       ORDER BY next_retry_at ASC
       LIMIT ?2
     )
     RETURNING id, event_name, event_id, payload_json, attempts, created_at`
  ).bind(now, limit).all<OutboxRow>();

  const rows = claimed.results || [];

  for (const row of rows) {
    summary.processed += 1;
    const attempts = Number(row.attempts || 0) + 1;

    if (now - Number(row.created_at || now) > MAX_OUTBOX_AGE_SECONDS) {
      await markOutboxDeadLetter(env, row.id, 'expired: event older than 6 days');
      summary.dead += 1;
      continue;
    }

    if (await wasMetaEventAlreadySent(env, row.event_name, row.event_id)) {
      await markOutboxSent(env, row.id);
      summary.sent += 1;
      continue;
    }

    try {
      const response = await fetchMetaWithRetry(
        `https://graph.facebook.com/${apiVersion}/${pixelId}/events?access_token=${token}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: row.payload_json,
        },
        env,
      );

      if (response.ok) {
        await markMetaEventSent(env, row.event_name, row.event_id);
        await markOutboxSent(env, row.id);
        summary.sent += 1;
        continue;
      }

      const errorText = `HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`;
      // Постоянные 4xx (кроме retriable вроде 429) повторять бессмысленно.
      if (response.status >= 400 && response.status < 500 && !isRetryableMetaStatus(response.status)) {
        await markOutboxDeadLetter(env, row.id, errorText);
        summary.dead += 1;
        continue;
      }
      throw new Error(errorText);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempts >= maxAttempts) {
        await markOutboxDeadLetter(env, row.id, message);
        summary.dead += 1;
      } else {
        await markOutboxRetry(env, row.id, attempts, now + getOutboxRetryDelaySeconds(attempts), message);
        summary.retried += 1;
      }
    }
  }

  // Уборка: отправленные записи старше 7 дней и dead-letter старше 30 дней.
  await env.DB.prepare(
    `DELETE FROM meta_outbox WHERE (status='sent' AND updated_at < ?) OR (status='dead_letter' AND updated_at < ?)`
  ).bind(now - 7 * 24 * 60 * 60, now - 30 * 24 * 60 * 60).run();

  return summary;
}
