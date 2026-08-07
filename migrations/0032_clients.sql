-- Клиенты: то, что начинается после выигранной сделки.
--
-- CRM доводит человека до «Выиграно» и на этом заканчивается, а работа с
-- абонентом только начинается: договор, отчёты каждый месяц, доступы,
-- продление. Раньше всё это жило в голове и переписке.
--
-- `lead_id` связывает клиента с заявкой, из которой он вырос, но может быть
-- пустым: клиента можно завести и руками, если он пришёл не через сайт.
-- Частичный уникальный индекс не даёт сделать двух клиентов из одной сделки.
CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER,
  name TEXT NOT NULL,
  company TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'finished')),
  started_at TEXT NOT NULL DEFAULT (date('now')),
  paused_until TEXT,
  finished_at TEXT,
  finish_reason TEXT NOT NULL DEFAULT '',
  contact_method TEXT NOT NULL DEFAULT '',
  contact_value TEXT NOT NULL DEFAULT '',
  -- Смещение часового пояса клиента в минутах от UTC: чтобы админка могла
  -- показать «сейчас у клиента 07:14» и удержать от звонка не вовремя.
  timezone_offset INTEGER,
  -- Услуги списком: [{"name":"Meta Ads","status":"active","since":"2026-08"}]
  services TEXT NOT NULL DEFAULT '[]',
  retainer_amount REAL NOT NULL DEFAULT 0
    CHECK (retainer_amount >= 0 AND retainer_amount <= 1000000000),
  retainer_currency TEXT NOT NULL DEFAULT 'USD'
    CHECK (length(retainer_currency) = 3 AND retainer_currency = upper(retainer_currency)),
  billing_day INTEGER CHECK (billing_day IS NULL OR (billing_day >= 1 AND billing_day <= 28)),
  contract_number TEXT NOT NULL DEFAULT '',
  contract_signed_at TEXT,
  contract_ends_at TEXT,
  contract_auto_renew INTEGER NOT NULL DEFAULT 0,
  contract_file_url TEXT NOT NULL DEFAULT '',
  scope_included TEXT NOT NULL DEFAULT '',
  scope_excluded TEXT NOT NULL DEFAULT '',
  next_touch_at TEXT,
  next_touch_text TEXT NOT NULL DEFAULT '',
  media_folder TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status, name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_clients_lead ON clients(lead_id) WHERE lead_id IS NOT NULL;

-- Месяц работы с клиентом одной строкой: и отметка об отправленном отчёте,
-- и его результаты. Это одна и та же сущность — «как прошёл август», —
-- и разносить её по двум таблицам значило бы дважды искать один месяц.
CREATE TABLE IF NOT EXISTS client_months (
  client_id INTEGER NOT NULL,
  month TEXT NOT NULL,                       -- YYYY-MM
  report_sent_at TEXT,
  report_url TEXT NOT NULL DEFAULT '',
  spend REAL,
  spend_currency TEXT NOT NULL DEFAULT '',
  leads INTEGER,
  sales INTEGER,
  revenue REAL,
  note TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (client_id, month)
);

CREATE INDEX IF NOT EXISTS idx_client_months_month ON client_months(month DESC, client_id);

-- Доступы: только факт наличия, без паролей. Пароли обязаны жить в менеджере
-- паролей, а не в вебе под одним общим паролем администратора.
CREATE TABLE IF NOT EXISTS client_access (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'granted', 'revoked')),
  note TEXT NOT NULL DEFAULT '',
  changed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_client_access_client ON client_access(client_id, name);

-- Памятки по клиенту: кто принимает решения, что не любит, как думает.
CREATE TABLE IF NOT EXISTS client_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  body TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_client_notes_client
  ON client_notes(client_id, pinned DESC, created_at DESC);
