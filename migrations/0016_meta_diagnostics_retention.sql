-- Keep Meta CAPI diagnostics useful without allowing the D1 table to grow
-- forever. KV records already expire after 30 days; D1 keeps a longer
-- 90-day operational window for the admin dashboard and incident review.

DELETE FROM meta_capi_diagnostics
WHERE created_at < datetime('now', '-90 days');

-- Cloudflare Pages has no built-in migration runner or database cron. Run the
-- lightweight cleanup once per 100 inserted diagnostics rows instead of on
-- every event. The created_at index from migration 0002 makes the delete cheap.
CREATE TRIGGER IF NOT EXISTS trg_meta_capi_diagnostics_retention
AFTER INSERT ON meta_capi_diagnostics
WHEN (NEW.id % 100) = 0
BEGIN
  DELETE FROM meta_capi_diagnostics
  WHERE created_at < datetime('now', '-90 days');
END;
