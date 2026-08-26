import type { Env } from './types';
import {
  fetchMetaWithRetry,
  getMetaApiVersion,
  getMetaPixelId,
  isConfirmedMetaReceipt,
  isRetryableMetaResponse,
  parseMetaApiReceipt,
  type MetaApiReceipt,
} from './meta-capi';
import { markMetaEventSent, recordMetaDiagnostics, wasMetaEventAlreadySent } from './meta-diagnostics';

export type OutboxStatus = 'pending' | 'retry' | 'sending' | 'sent' | 'dead_letter';

const DEFAULT_MAX_OUTBOX_ATTEMPTS = 8;
// Meta принимает события action_source=website не старше 7 дней — дальше повтор бессмыслен.
const MAX_OUTBOX_AGE_SECONDS = 6 * 24 * 60 * 60;
// Свежие записи не трогаем: их ещё отправляет исходный запрос.
export const META_OUTBOX_CLAIM_GRACE_SECONDS = 180;
// Записи, зависшие в 'sending' (isolate умер посреди отправки), возвращаем в оборот.
const STUCK_SENDING_SECONDS = 600;

/**
 * Как часто разбор очереди заодно убирает просроченные записи.
 *
 * Раньше уборка выполнялась при КАЖДОМ разборе, а разбор запускается с каждого
 * десятого просмотра страницы. При этом подтверждённые события лежат в таблице
 * ещё неделю, то есть уборка каждый раз перебирала десятки тысяч строк, чтобы
 * найти среди них несколько просроченных. На бесплатном тарифе Cloudflare
 * лимит — 5 млн прочитанных строк в сутки, и съедала его именно эта уборка.
 *
 * Просроченные записи никуда не торопятся: их удаление — гигиена, а не работа
 * очереди. Тот же приём уже применён для чистки хешей посетителей в
 * `_lib/leads.ts`.
 */
const OUTBOX_CLEANUP_PROBABILITY = 0.02;

/** Подтверждённые события качества лида: их историю показывает карточка заявки. */
const QUALITY_EVENT_NAMES = "('QualifiedLead','UnqualifiedLead')";

const SENT_QUALITY_RETENTION_SECONDS = 180 * 24 * 60 * 60;
const SENT_DEFAULT_RETENTION_SECONDS = 7 * 24 * 60 * 60;
const DEAD_LETTER_RETENTION_SECONDS = 30 * 24 * 60 * 60;

/**
 * Уборка просроченных записей очереди.
 *
 * Три отдельных запроса вместо одного с `OR`: каждый опирается на индекс
 * `(status, updated_at)` и читает только те строки, которые действительно
 * удалит. Прежний вариант с `OR` и `NOT IN` заставлял SQLite перебирать все
 * записи со статусом `sent` — а это почти вся таблица.
 */
async function cleanupOutbox(env: Env, now: number): Promise<void> {
  const statements = [
    env.DB.prepare(
      `DELETE FROM meta_outbox
       WHERE status='sent' AND updated_at < ? AND event_name NOT IN ${QUALITY_EVENT_NAMES}`,
    ).bind(now - SENT_DEFAULT_RETENTION_SECONDS),
    env.DB.prepare(
      `DELETE FROM meta_outbox
       WHERE status='sent' AND updated_at < ? AND event_name IN ${QUALITY_EVENT_NAMES}`,
    ).bind(now - SENT_QUALITY_RETENTION_SECONDS),
    env.DB.prepare(
      `DELETE FROM meta_outbox WHERE status='dead_letter' AND updated_at < ?`,
    ).bind(now - DEAD_LETTER_RETENTION_SECONDS),
  ];

  try {
    await env.DB.batch(statements);
  } catch (error) {
    // Уборка не имеет права уронить разбор очереди: доставка событий важнее
    // порядка в таблице.
    console.error('[Meta CAPI] Outbox cleanup failed:', error);
  }
}

type OutboxRow = {
  id: string;
  event_name: string;
  event_id: string;
  payload_json: string;
  attempts: number;
  created_at: number;
};

export type MetaOutboxEventState = {
  id: string;
  event_name: string;
  event_id: string;
  status: OutboxStatus;
  attempts: number;
  last_error?: string | null;
  sent_at?: number | null;
  updated_at?: number;
};

export type EnqueueMetaEventResult = {
  durable: boolean;
  inserted: boolean;
  state?: MetaOutboxEventState;
};

export type OutboxProcessSummary = {
  processed: number;
  sent: number;
  retried: number;
  dead: number;
  persistence_failed: number;
  configuration_error?: 'db_not_configured' | 'access_token_not_configured' | 'outbox_not_configured';
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
export async function enqueueMetaEvent(env: Env, input: { id: string; event_name: string; event_id: string; payload_json: string }): Promise<EnqueueMetaEventResult> {
  if (!env.DB) return { durable: false, inserted: true };
  try {
    const result = await env.DB.prepare(
      `INSERT INTO meta_outbox (id, event_name, event_id, payload_json, status, attempts, next_retry_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending', 0, strftime('%s','now') + ${META_OUTBOX_CLAIM_GRACE_SECONDS}, strftime('%s','now'), strftime('%s','now'))
       ON CONFLICT(id) DO UPDATE SET
         event_name=excluded.event_name,
         event_id=excluded.event_id,
         payload_json=excluded.payload_json,
         status='pending',
         attempts=0,
         next_retry_at=strftime('%s','now') + ${META_OUTBOX_CLAIM_GRACE_SECONDS},
         last_error=NULL,
         created_at=strftime('%s','now'),
         updated_at=strftime('%s','now'),
         sent_at=NULL
       WHERE meta_outbox.status='dead_letter'`
    ).bind(input.id, input.event_name, input.event_id, input.payload_json).run() as { meta?: { changes?: number } };
    const state = await getMetaOutboxEvent(env, input.id);
    return {
      durable: true,
      inserted: Number(result.meta?.changes || 0) > 0,
      state,
    };
  } catch (error) {
    // Очередь повышает надёжность, но её миграция не должна блокировать
    // непосредственную отправку события в Meta.
    console.error('[Meta CAPI] Failed to persist event in outbox:', error);
    return { durable: false, inserted: true };
  }
}

export async function getMetaOutboxEvent(env: Env, id: string): Promise<MetaOutboxEventState | undefined> {
  if (!env.DB) return undefined;
  const row = await env.DB.prepare(
    `SELECT id, event_name, event_id, status, attempts, last_error, sent_at, updated_at
     FROM meta_outbox WHERE id = ? LIMIT 1`
  ).bind(id).first<MetaOutboxEventState>();
  return row || undefined;
}

export async function markOutboxSent(env: Env, id: string, attempts?: number): Promise<boolean> {
  if (!env.DB) return false;
  try {
    // После подтверждения повторная отправка не нужна: удаляем готовый payload,
    // чтобы не хранить хешированные match keys дольше операционной необходимости.
    if (attempts === undefined) {
      await env.DB.prepare(`UPDATE meta_outbox SET status='sent', payload_json='{}', sent_at=strftime('%s','now'), updated_at=strftime('%s','now') WHERE id=?`).bind(id).run();
    } else {
      const safeAttempts = Number.isFinite(attempts) ? Math.max(0, Math.floor(attempts)) : 0;
      await env.DB.prepare(`UPDATE meta_outbox SET status='sent', payload_json='{}', attempts=MAX(attempts, ?), sent_at=strftime('%s','now'), updated_at=strftime('%s','now') WHERE id=?`)
        .bind(safeAttempts, id).run();
    }
    return true;
  } catch (error) {
    console.error('[Meta CAPI] Failed to mark outbox event as sent:', error);
    return false;
  }
}

export async function markOutboxRetry(env: Env, id: string, attempts: number, nextRetryAt: number, error: string): Promise<boolean> {
  if (!env.DB) return false;
  try {
    await env.DB.prepare(`UPDATE meta_outbox SET status='retry', attempts=?, next_retry_at=?, last_error=?, updated_at=strftime('%s','now') WHERE id=?`)
      .bind(attempts, nextRetryAt, error.slice(0, 1000), id).run();
    return true;
  } catch (outboxError) {
    console.error('[Meta CAPI] Failed to schedule outbox retry:', outboxError);
    return false;
  }
}

export async function markOutboxDeadLetter(env: Env, id: string, attempts: number, error: string): Promise<boolean> {
  if (!env.DB) return false;
  try {
    const safeAttempts = Number.isFinite(attempts) ? Math.max(0, Math.floor(attempts)) : 0;
    // После окончательной остановки повторов готовый payload больше не нужен.
    // Оставляем только безопасную операционную ошибку и счётчик попыток.
    await env.DB.prepare(`UPDATE meta_outbox SET status='dead_letter', payload_json='{}', attempts=MAX(attempts, ?), last_error=?, updated_at=strftime('%s','now') WHERE id=?`)
      .bind(safeAttempts, error.slice(0, 1000), id).run();
    return true;
  } catch (outboxError) {
    console.error('[Meta CAPI] Failed to mark outbox dead letter:', outboxError);
    return false;
  }
}

function parseOutboxPayload(row: OutboxRow): {
  event_time?: number;
  event_source_url?: string;
  page_path?: string;
  service?: string;
  has_email: boolean;
  has_phone: boolean;
  has_fbp: boolean;
  has_fbc: boolean;
  has_external_id: boolean;
  has_utm: boolean;
} {
  try {
    const payload = JSON.parse(row.payload_json) as {
      data?: Array<{
        event_time?: number;
        event_source_url?: string;
        user_data?: Record<string, unknown>;
        custom_data?: Record<string, unknown>;
      }>;
    };
    const event = payload.data?.[0];
    const user = event?.user_data || {};
    const custom = event?.custom_data || {};
    return {
      event_time: event?.event_time,
      event_source_url: typeof event?.event_source_url === 'string' ? event.event_source_url : undefined,
      page_path: typeof custom.page_path === 'string'
        ? custom.page_path
        : typeof custom.lead_source_page === 'string' ? custom.lead_source_page : undefined,
      service: typeof custom.service === 'string' ? custom.service : undefined,
      has_email: Boolean(user.em),
      has_phone: Boolean(user.ph),
      has_fbp: Boolean(user.fbp),
      has_fbc: Boolean(user.fbc),
      has_external_id: Boolean(user.external_id),
      has_utm: Boolean(custom.utm_source || custom.utm_medium || custom.utm_campaign || custom.utm_id),
    };
  } catch {
    return { has_email: false, has_phone: false, has_fbp: false, has_fbc: false, has_external_id: false, has_utm: false };
  }
}

async function recordOutboxDelivery(
  env: Env,
  row: OutboxRow,
  input: { status: 'sent' | 'failed'; receipt?: MetaApiReceipt | null; error_code?: number | string; error_message?: string },
): Promise<void> {
  const context = parseOutboxPayload(row);
  await recordMetaDiagnostics(env, {
    event_name: row.event_name,
    event_id: row.event_id,
    event_time: context.event_time,
    status: input.status,
    events_received: input.receipt?.events_received,
    fbtrace_id: input.receipt?.fbtrace_id,
    error_code: input.error_code,
    error_message: input.error_message,
    event_source_url: context.event_source_url,
    page_url: context.event_source_url,
    page_path: context.page_path,
    service: context.service,
    has_email: context.has_email,
    has_phone: context.has_phone,
    has_fbp: context.has_fbp,
    has_fbc: context.has_fbc,
    has_external_id: context.has_external_id,
    has_utm: context.has_utm,
    marketing_consent: true,
  });
}

// Повторная отправка событий, не дошедших до Meta с первого раза.
// Вызывается из /api/meta-outbox-process (внешний cron/пингер) и фоном из /api/pageview.
export async function processMetaOutbox(env: Env, limit = 10): Promise<OutboxProcessSummary> {
  const summary: OutboxProcessSummary = { processed: 0, sent: 0, retried: 0, dead: 0, persistence_failed: 0 };
  if (!env.DB) return { ...summary, configuration_error: 'db_not_configured' };

  const token = env.META_CAPI_ACCESS_TOKEN;
  const pixelId = getMetaPixelId(env);
  if (!token) return { ...summary, configuration_error: 'access_token_not_configured' };
  const apiVersion = getMetaApiVersion(env);

  const now = Math.floor(Date.now() / 1000);
  const maxAttempts = getMaxOutboxAttempts(env);

  let rows: OutboxRow[];
  try {
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
    rows = claimed.results || [];
  } catch (error) {
    if (/no such table|no such column/i.test(error instanceof Error ? error.message : String(error))) {
      return { ...summary, configuration_error: 'outbox_not_configured' };
    }
    throw error;
  }

  for (const row of rows) {
    summary.processed += 1;
    const attempts = Number(row.attempts || 0) + 1;

    if (now - Number(row.created_at || now) > MAX_OUTBOX_AGE_SECONDS) {
      const message = 'expired: event older than 6 days';
      const persisted = await markOutboxDeadLetter(env, row.id, attempts, message);
      await recordOutboxDelivery(env, row, { status: 'failed', error_message: message });
      if (persisted) summary.dead += 1;
      else summary.persistence_failed += 1;
      continue;
    }

    if (await wasMetaEventAlreadySent(env, row.event_name, row.event_id)) {
      const persisted = await markOutboxSent(env, row.id, attempts);
      if (persisted) summary.sent += 1;
      else summary.persistence_failed += 1;
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

      const responseText = await response.text();
      const receipt = parseMetaApiReceipt(responseText);

      if (response.ok && isConfirmedMetaReceipt(receipt)) {
        await markMetaEventSent(env, row.event_name, row.event_id);
        const persisted = await markOutboxSent(env, row.id, attempts);
        await recordOutboxDelivery(env, row, { status: 'sent', receipt });
        if (persisted) summary.sent += 1;
        else summary.persistence_failed += 1;
        continue;
      }

      const errorText = response.ok
        ? `Meta 2xx without events_received confirmation: ${responseText.slice(0, 300) || 'empty response'}`
        : `HTTP ${response.status}: ${responseText.slice(0, 300)}`;
      // Graph can encode a transient failure inside HTTP 400. Destroy the
      // payload only after the structured body confirms a permanent 4xx.
      if (response.status >= 400 && response.status < 500 && !isRetryableMetaResponse(response.status, receipt)) {
        const persisted = await markOutboxDeadLetter(env, row.id, attempts, errorText);
        await recordOutboxDelivery(env, row, { status: 'failed', receipt, error_code: response.status, error_message: errorText });
        if (persisted) summary.dead += 1;
        else summary.persistence_failed += 1;
        continue;
      }
      throw new Error(errorText);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempts >= maxAttempts) {
        const persisted = await markOutboxDeadLetter(env, row.id, attempts, message);
        await recordOutboxDelivery(env, row, { status: 'failed', error_message: message });
        if (persisted) summary.dead += 1;
        else summary.persistence_failed += 1;
      } else {
        const persisted = await markOutboxRetry(env, row.id, attempts, now + getOutboxRetryDelaySeconds(attempts), message);
        await recordOutboxDelivery(env, row, { status: 'failed', error_message: `retry_scheduled: ${message}` });
        if (persisted) summary.retried += 1;
        else summary.persistence_failed += 1;
      }
    }
  }

  // Историю событий качества держим дольше: она нужна для постоянного статуса
  // доставки в карточке заявки. Остальные подтверждённые события — 7 дней.
  // Сама уборка запускается редко — см. OUTBOX_CLEANUP_PROBABILITY.
  if (Math.random() < OUTBOX_CLEANUP_PROBABILITY) {
    await cleanupOutbox(env, now);
  }

  return summary;
}
