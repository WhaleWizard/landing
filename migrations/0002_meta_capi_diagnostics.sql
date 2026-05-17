CREATE TABLE IF NOT EXISTS meta_capi_diagnostics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_name TEXT NOT NULL,
  event_id TEXT,
  event_time INTEGER,
  status TEXT NOT NULL,
  events_received INTEGER,
  fbtrace_id TEXT,
  error_code TEXT,
  error_message TEXT,
  page_path TEXT,
  page_url TEXT,
  service TEXT,
  has_fbp INTEGER,
  has_fbc INTEGER,
  has_external_id INTEGER,
  has_email INTEGER,
  has_phone INTEGER,
  has_fbclid INTEGER,
  has_utm INTEGER,
  marketing_consent INTEGER,
  consent_version INTEGER,
  consent_source TEXT,
  consent_region TEXT,
  consent_timestamp INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_meta_capi_diagnostics_created_at ON meta_capi_diagnostics(created_at);
CREATE INDEX IF NOT EXISTS idx_meta_capi_diagnostics_event ON meta_capi_diagnostics(event_name, event_id);
CREATE INDEX IF NOT EXISTS idx_meta_capi_diagnostics_status ON meta_capi_diagnostics(status, created_at);
