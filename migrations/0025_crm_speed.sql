-- Скорость работы с заявкой: время первого ответа и шаблоны сообщений.
--
-- `first_response_at` фиксируется один раз — при первом реальном касании
-- (заметка, задача, смена этапа с «Новая»). Существующий `last_contacted_at`
-- для этого не годится: он перезаписывается при каждом касании, поэтому по
-- нему нельзя посчитать, за сколько ответили в первый раз. А именно это
-- сильнее всего влияет на конверсию заявки в сделку.
-- ВНИМАНИЕ: повторный запуск даст ошибку "duplicate column name" — это нормально.
ALTER TABLE leads ADD COLUMN first_response_at TEXT;

CREATE INDEX IF NOT EXISTS idx_leads_first_response
  ON leads(first_response_at);

-- Готовые ответы: приветствие, запрос брифа, отправка КП, напоминание.
-- В тексте можно использовать подстановки {имя}, {услуга}, {бюджет}.
CREATE TABLE IF NOT EXISTS crm_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_crm_templates_sort
  ON crm_templates(sort_order, id);
