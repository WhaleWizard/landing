-- Центр уведомлений: то, что требует вмешательства, но замечается поздно.
--
-- Заявка без ответа второй час, просроченный шаг, ошибки доставки в Meta,
-- расход выше потолка — всё это видно, только если самому открыть админку.
-- Здесь события собираются в одну таблицу и один раз уходят в Telegram.
--
-- `fingerprint` не даёт одному и тому же поводу дублироваться: правило
-- строит стабильный ключ (например, «lead-no-answer:42»), и повторная
-- проверка обновляет запись, а не плодит новые.
CREATE TABLE IF NOT EXISTS admin_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fingerprint TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'attention'
    CHECK (severity IN ('critical', 'attention', 'info')),
  title TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  destination TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  notified_at TEXT,
  resolved_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_admin_alerts_open
  ON admin_alerts(resolved_at, severity, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_admin_alerts_notify
  ON admin_alerts(notified_at, resolved_at);
