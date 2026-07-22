-- Atomic replay protection and aggregate visibility for signed tracking
-- requests. Apply after 0017_crm_correctness.sql.

CREATE TABLE IF NOT EXISTS tracking_request_nonces (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nonce_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS idx_tracking_request_nonces_expires
  ON tracking_request_nonces(expires_at);

-- The browser is intentionally kept in monitor mode until requests can be
-- signed by a trusted server-side component. This daily aggregate makes that
-- state visible without retaining request bodies, identifiers, or raw nonces.
CREATE TABLE IF NOT EXISTS tracking_signature_daily (
  day TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('off', 'monitor', 'enforce')),
  result TEXT NOT NULL CHECK (result IN ('valid', 'invalid', 'disabled')),
  reason TEXT NOT NULL DEFAULT '',
  count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  PRIMARY KEY (day, endpoint, mode, result, reason)
);

CREATE INDEX IF NOT EXISTS idx_tracking_signature_daily_day
  ON tracking_signature_daily(day DESC);

-- Keep nonce rows only for their short replay window. The modulo trigger
-- amortises cleanup cost and never stores the raw client nonce.
CREATE TRIGGER IF NOT EXISTS trg_tracking_request_nonces_retention
AFTER INSERT ON tracking_request_nonces
WHEN (NEW.id % 100) = 0
BEGIN
  DELETE FROM tracking_request_nonces
  WHERE expires_at < strftime('%s','now');
END;

-- Signature monitoring is operational telemetry, not long-term analytics.
CREATE TRIGGER IF NOT EXISTS trg_tracking_signature_daily_retention
AFTER INSERT ON tracking_signature_daily
WHEN (NEW.rowid % 50) = 0
BEGIN
  DELETE FROM tracking_signature_daily
  WHERE day < date('now', '-90 days');
END;

CREATE TRIGGER IF NOT EXISTS trg_tracking_signature_daily_retention_update
AFTER UPDATE OF count ON tracking_signature_daily
WHEN (NEW.count % 500) = 0
BEGIN
  DELETE FROM tracking_signature_daily
  WHERE day < date('now', '-90 days');
END;
