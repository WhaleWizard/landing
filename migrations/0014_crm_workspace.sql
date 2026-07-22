-- Full single-owner CRM workspace for leads.
-- Apply after 0012_admin_control_center.sql (0013 is site content and independent).
-- ALTER TABLE statements are intentionally one-time, like the earlier lead migrations.

ALTER TABLE leads ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'
  CHECK (priority IN ('low', 'normal', 'high', 'urgent'));
ALTER TABLE leads ADD COLUMN lead_score INTEGER NOT NULL DEFAULT 0
  CHECK (lead_score BETWEEN 0 AND 100);
ALTER TABLE leads ADD COLUMN next_action_text TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN pipeline_changed_at TEXT;
ALTER TABLE leads ADD COLUMN last_contacted_at TEXT;
ALTER TABLE leads ADD COLUMN closed_at TEXT;
ALTER TABLE leads ADD COLUMN crm_revision INTEGER NOT NULL DEFAULT 0;

UPDATE leads
SET pipeline_changed_at = COALESCE(pipeline_changed_at, updated_at, created_at);

CREATE INDEX IF NOT EXISTS idx_leads_crm_priority_score
  ON leads(priority, lead_score DESC);
CREATE INDEX IF NOT EXISTS idx_leads_crm_pipeline_updated
  ON leads(pipeline_stage, updated_at DESC);

-- Extend the existing immutable-style timeline so every CRM mutation has context.
ALTER TABLE lead_activity ADD COLUMN actor TEXT NOT NULL DEFAULT 'admin';
ALTER TABLE lead_activity ADD COLUMN entity_type TEXT NOT NULL DEFAULT 'lead';
ALTER TABLE lead_activity ADD COLUMN entity_id INTEGER;
ALTER TABLE lead_activity ADD COLUMN action_id TEXT NOT NULL DEFAULT '';
ALTER TABLE lead_activity ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_lead_activity_action
  ON lead_activity(action_id);
CREATE INDEX IF NOT EXISTS idx_lead_activity_entity
  ON lead_activity(lead_id, entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS crm_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0 CHECK (pinned IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_crm_notes_lead_pinned_created
  ON crm_notes(lead_id, pinned DESC, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS crm_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'follow_up'
    CHECK (kind IN ('call', 'message', 'meeting', 'proposal', 'follow_up', 'other')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'completed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  due_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_status_due
  ON crm_tasks(status, due_at, priority);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_lead_status
  ON crm_tasks(lead_id, status, due_at);

CREATE TABLE IF NOT EXISTS crm_tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL DEFAULT '#8b5cf6',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS crm_lead_tags (
  lead_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (lead_id, tag_id),
  FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES crm_tags(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_crm_lead_tags_tag_lead
  ON crm_lead_tags(tag_id, lead_id);
