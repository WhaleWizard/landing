-- Recoverable lead removal ("корзина") for spam, duplicates and junk submissions.
-- A removed lead keeps its row and every related record, so a restore is lossless;
-- only an explicit purge deletes data for good.
-- `deleted_at` is the server-side D1 removal time; NULL means the lead is active.
-- Existing rows are intentionally left active.

ALTER TABLE leads ADD COLUMN deleted_at TEXT;
ALTER TABLE leads ADD COLUMN deleted_reason TEXT NOT NULL DEFAULT '';

-- Every list, counter and deduplication scan filters on `deleted_at IS NULL`,
-- so this partial index keeps the active-lead path from scanning removed rows.
CREATE INDEX IF NOT EXISTS idx_leads_active_recent
  ON leads(id DESC) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_leads_deleted_at
  ON leads(deleted_at DESC) WHERE deleted_at IS NOT NULL;
