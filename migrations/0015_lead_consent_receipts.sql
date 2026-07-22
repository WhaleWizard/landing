-- Durable consent receipt used by delayed CRM -> Meta lead-quality events.
-- `consent_timestamp` is the client consent decision time in Unix milliseconds;
-- `consent_recorded_at` is the independent server-side D1 write time.
-- Existing rows are intentionally not backfilled: a receipt must not be invented.

ALTER TABLE leads ADD COLUMN consent_version INTEGER;
ALTER TABLE leads ADD COLUMN consent_source TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN consent_region TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN consent_timestamp INTEGER;
ALTER TABLE leads ADD COLUMN consent_recorded_at TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_consent_eligibility
  ON leads(marketing_consent, consent_timestamp);
