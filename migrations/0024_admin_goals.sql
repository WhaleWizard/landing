-- Цели на месяц: план по заявкам, целевым заявкам, выручке и потолку расхода.
-- Без них админка отвечает только на вопрос «сколько было», но не на вопрос
-- «успеваю ли». Одна строка — один месяц.
CREATE TABLE IF NOT EXISTS admin_goals (
  period TEXT PRIMARY KEY,                         -- YYYY-MM
  leads_target INTEGER NOT NULL DEFAULT 0
    CHECK (leads_target >= 0 AND leads_target <= 1000000),
  qualified_target INTEGER NOT NULL DEFAULT 0
    CHECK (qualified_target >= 0 AND qualified_target <= 1000000),
  revenue_target REAL NOT NULL DEFAULT 0
    CHECK (revenue_target >= 0 AND revenue_target <= 1000000000),
  spend_cap REAL NOT NULL DEFAULT 0
    CHECK (spend_cap >= 0 AND spend_cap <= 1000000000),
  currency TEXT NOT NULL DEFAULT 'USD'
    CHECK (length(currency) = 3 AND currency = upper(currency) AND currency NOT GLOB '*[^A-Z]*'),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_admin_goals_period
  ON admin_goals(period DESC);
