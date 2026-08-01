-- Рекламные расходы, которые владелец вводит вручную (или загружает CSV).
-- Без них воронка не может честно посчитать цену лида и окупаемость, а
-- выдумывать эти числа нельзя. Одна строка = расход за день по источнику
-- (и, если нужно, по конкретной кампании).
--
-- `source` совпадает с utm_source заявки (google, facebook, instagram…),
-- `campaign` — с utm_campaign; пустая строка означает «весь источник целиком».
CREATE TABLE IF NOT EXISTS ad_spend (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,                                  -- YYYY-MM-DD (UTC)
  source TEXT NOT NULL DEFAULT '',
  campaign TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0
    CHECK (amount >= 0 AND amount <= 1000000000),
  currency TEXT NOT NULL DEFAULT 'USD'
    CHECK (length(currency) = 3 AND currency = upper(currency) AND currency NOT GLOB '*[^A-Z]*'),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Повторный ввод того же дня и источника обновляет сумму, а не плодит строки.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ad_spend_slot
  ON ad_spend(day, source, campaign, currency);

CREATE INDEX IF NOT EXISTS idx_ad_spend_day
  ON ad_spend(day DESC);
