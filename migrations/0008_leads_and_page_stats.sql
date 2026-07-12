-- Заявки с форм сайта: копия того, что уходит в Telegram,
-- плюс статус обработки для раздела «Заявки» в админке.
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  email TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  telegram_username TEXT NOT NULL DEFAULT '',
  contact_method TEXT NOT NULL DEFAULT 'telegram',
  budget TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  service TEXT NOT NULL DEFAULT '',
  page_path TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new', -- new | in_progress | closed
  telegram_delivered INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_leads_status_created ON leads(status, created_at);
CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);

-- Дневные счётчики просмотров по страницам (без личных данных).
CREATE TABLE IF NOT EXISTS page_stats_daily (
  day TEXT NOT NULL,        -- YYYY-MM-DD (UTC)
  page_path TEXT NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, page_path)
);

-- Уникальные посетители за день: хранится только обезличенный хеш
-- (IP + браузер + дата + соль), восстановить человека по нему нельзя.
-- Хеши старше 90 дней удаляются автоматически при записи статистики.
CREATE TABLE IF NOT EXISTS visitor_hashes_daily (
  day TEXT NOT NULL,
  visitor_hash TEXT NOT NULL,
  PRIMARY KEY (day, visitor_hash)
);

CREATE INDEX IF NOT EXISTS idx_visitor_hashes_day ON visitor_hashes_daily(day);
