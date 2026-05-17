ALTER TABLE meta_capi_diagnostics ADD COLUMN form_id TEXT;
ALTER TABLE meta_capi_diagnostics ADD COLUMN form_variant TEXT;
ALTER TABLE meta_capi_diagnostics ADD COLUMN contact_method TEXT;
ALTER TABLE meta_capi_diagnostics ADD COLUMN lead_source_page TEXT;
ALTER TABLE meta_capi_diagnostics ADD COLUMN match_quality_score INTEGER;

CREATE INDEX IF NOT EXISTS idx_meta_capi_diagnostics_form_created ON meta_capi_diagnostics(form_id, created_at);
CREATE INDEX IF NOT EXISTS idx_meta_capi_diagnostics_page_created ON meta_capi_diagnostics(page_path, created_at);
CREATE INDEX IF NOT EXISTS idx_meta_capi_diagnostics_quality ON meta_capi_diagnostics(match_quality_score, created_at);
