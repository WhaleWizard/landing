ALTER TABLE meta_capi_diagnostics ADD COLUMN event_source_url TEXT;
ALTER TABLE meta_capi_diagnostics ADD COLUMN page_path_normalized TEXT;
ALTER TABLE meta_capi_diagnostics ADD COLUMN lead_value REAL;
ALTER TABLE meta_capi_diagnostics ADD COLUMN lead_currency TEXT;
ALTER TABLE meta_capi_diagnostics ADD COLUMN score_identity INTEGER;
ALTER TABLE meta_capi_diagnostics ADD COLUMN score_attribution INTEGER;
ALTER TABLE meta_capi_diagnostics ADD COLUMN score_consent INTEGER;
ALTER TABLE meta_capi_diagnostics ADD COLUMN score_context INTEGER;

CREATE INDEX IF NOT EXISTS idx_meta_capi_diag_norm_path_created ON meta_capi_diagnostics(page_path_normalized, created_at);
CREATE INDEX IF NOT EXISTS idx_meta_capi_diag_value_created ON meta_capi_diagnostics(lead_value, created_at);
CREATE INDEX IF NOT EXISTS idx_meta_capi_diag_event_source_created ON meta_capi_diagnostics(event_source_url, created_at);
