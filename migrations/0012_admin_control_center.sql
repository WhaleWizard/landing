-- Mini-CRM fields for the admin control center.
-- Apply this migration after 0011_leads_utm.sql.
-- Like the other ALTER TABLE migrations in this project, re-running the ALTER
-- statements after a successful apply will report "duplicate column name".

ALTER TABLE leads ADD COLUMN pipeline_stage TEXT NOT NULL DEFAULT 'new'
  CHECK (pipeline_stage IN ('new', 'contacted', 'discovery', 'proposal', 'won', 'lost', 'archived'));
ALTER TABLE leads ADD COLUMN next_action_at TEXT;
ALTER TABLE leads ADD COLUMN loss_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN notes TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN deal_value REAL
  CHECK (deal_value IS NULL OR (deal_value >= 0 AND deal_value <= 1000000000000));
ALTER TABLE leads ADD COLUMN deal_currency TEXT NOT NULL DEFAULT 'USD'
  CHECK (length(deal_currency) = 3 AND deal_currency = upper(deal_currency) AND deal_currency NOT GLOB '*[^A-Z]*');

-- Legacy `closed` не сообщает, была ли сделка выиграна или проиграна.
-- Сохраняем его как нейтральный терминальный архив, не выдумывая исход сделки.
UPDATE leads
SET pipeline_stage = CASE status
  WHEN 'in_progress' THEN 'contacted'
  WHEN 'closed' THEN 'archived'
  ELSE 'new'
END;

CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage_next_action
  ON leads(pipeline_stage, next_action_at);
CREATE INDEX IF NOT EXISTS idx_leads_next_action
  ON leads(next_action_at);

CREATE TABLE IF NOT EXISTS lead_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  "from" TEXT,
  "to" TEXT,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_lead_activity_lead_created
  ON lead_activity(lead_id, created_at DESC, id DESC);
