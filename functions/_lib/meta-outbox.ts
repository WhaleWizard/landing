import type { Env } from './types';

export type OutboxStatus = 'pending' | 'retry' | 'sent' | 'dead_letter';

export async function enqueueMetaEvent(env: Env, input: { id: string; event_name: string; event_id: string; payload_json: string }): Promise<void> {
  if (!env.DB) return;
  await env.DB.prepare(
    `INSERT OR IGNORE INTO meta_outbox (id, event_name, event_id, payload_json, status, attempts, next_retry_at, created_at, updated_at)
     VALUES (?, ?, ?, ?, 'pending', 0, strftime('%s','now'), strftime('%s','now'), strftime('%s','now'))`
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
