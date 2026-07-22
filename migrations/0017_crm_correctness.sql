-- Concurrency and idempotency guards for CRM mutations and Meta lead-quality state.
-- Apply once after 0014_crm_workspace.sql and 0015_lead_consent_receipts.sql.

ALTER TABLE leads ADD COLUMN crm_action_id TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN quality_revision INTEGER NOT NULL DEFAULT 0
  CHECK (quality_revision >= 0);
ALTER TABLE leads ADD COLUMN quality_updated_at TEXT;
ALTER TABLE leads ADD COLUMN quality_action_id TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN quality_processing INTEGER NOT NULL DEFAULT 0
  CHECK (quality_processing IN (0, 1));

UPDATE leads
SET quality_updated_at = COALESCE(quality_updated_at, updated_at, created_at)
WHERE COALESCE(quality, '') != '';

CREATE INDEX IF NOT EXISTS idx_leads_quality_revision
  ON leads(id, quality_revision);

ALTER TABLE crm_notes ADD COLUMN revision INTEGER NOT NULL DEFAULT 0
  CHECK (revision >= 0);
ALTER TABLE crm_notes ADD COLUMN action_id TEXT NOT NULL DEFAULT '';

ALTER TABLE crm_tasks ADD COLUMN revision INTEGER NOT NULL DEFAULT 0
  CHECK (revision >= 0);
ALTER TABLE crm_tasks ADD COLUMN action_id TEXT NOT NULL DEFAULT '';

-- Empty action ids belong to rows created before this migration. New writes use
-- a stable client action id so a retried request cannot create a duplicate.
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_notes_action_id
  ON crm_notes(action_id) WHERE action_id != '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_tasks_action_id
  ON crm_tasks(action_id) WHERE action_id != '';

CREATE INDEX IF NOT EXISTS idx_crm_notes_lead_revision
  ON crm_notes(lead_id, id, revision);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_lead_revision
  ON crm_tasks(lead_id, id, revision);
