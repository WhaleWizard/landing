CREATE TABLE IF NOT EXISTS meta_outbox (
  id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  last_error TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  sent_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_meta_outbox_status_next_retry ON meta_outbox(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_meta_outbox_event ON meta_outbox(event_name, event_id);
