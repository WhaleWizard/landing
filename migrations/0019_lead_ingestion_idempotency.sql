-- Durable idempotency ledger for lead submissions.
-- A lead row keeps only the latest event_id after contact deduplication, so a
-- separate history is required to recognize retries of every prior submission.

CREATE TABLE IF NOT EXISTS lead_ingestions (
  event_id TEXT PRIMARY KEY,
  claim_token TEXT NOT NULL UNIQUE,
  lead_id INTEGER,
  submission_kind TEXT NOT NULL DEFAULT ''
    CHECK (submission_kind IN ('', 'new', 'repeat', 'legacy')),
  received_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lead_ingestions_lead_received
  ON lead_ingestions(lead_id, received_at DESC);

-- Preserve idempotency for the latest submission already stored on each lead.
INSERT OR IGNORE INTO lead_ingestions (
  event_id,
  claim_token,
  lead_id,
  submission_kind,
  received_at
)
SELECT
  event_id,
  'legacy:' || event_id,
  id,
  'legacy',
  COALESCE(last_submitted_at, created_at, datetime('now'))
FROM leads
WHERE event_id IS NOT NULL AND event_id != '';
