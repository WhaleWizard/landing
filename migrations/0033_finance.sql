-- Финансы: счета, расходы, время и настройки в одном разделе.
--
-- Три темы связаны одной логикой — деньги клиента от выставленного счёта до
-- прибыли в кармане и цена этих денег в часах жизни.
--
-- «Просрочен» нигде не хранится: это `status = 'issued'` и `due_at` в
-- прошлом. Хранимый статус пришлось бы пересчитывать по таймеру, и он
-- обязательно разъехался бы с реальностью.
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER,
  number TEXT NOT NULL DEFAULT '',
  period TEXT NOT NULL DEFAULT '',                    -- YYYY-MM, за какой месяц
  amount REAL NOT NULL DEFAULT 0
    CHECK (amount >= 0 AND amount <= 1000000000),
  currency TEXT NOT NULL DEFAULT 'USD'
    CHECK (length(currency) = 3 AND currency = upper(currency)),
  issued_at TEXT,
  due_at TEXT,
  paid_at TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'issued', 'paid', 'cancelled')),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status, due_at);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON invoices(client_id, period DESC);

-- Свои расходы: сервисы, подписки, реклама на себя. Ровно то, что вычитается
-- из дохода, чтобы прибыль была прибылью, а не выручкой.
CREATE TABLE IF NOT EXISTS finance_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0
    CHECK (amount >= 0 AND amount <= 1000000000),
  currency TEXT NOT NULL DEFAULT 'USD'
    CHECK (length(currency) = 3 AND currency = upper(currency)),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_finance_expenses_day ON finance_expenses(day DESC);

-- Часы по клиентам: единственный способ узнать реальную ставку в час и
-- увидеть, кто платит мало за много вашего времени.
CREATE TABLE IF NOT EXISTS time_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER,
  day TEXT NOT NULL,
  hours REAL NOT NULL DEFAULT 0
    CHECK (hours > 0 AND hours <= 24),
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_time_entries_day ON time_entries(day DESC, client_id);

-- Настройки раздела одной строкой. Ставка налога не угадывается: у режимов
-- она разная, а ошибка в проценте — это ошибка в отложенных деньгах.
-- `requisites` пока не используется: поле заложено, чтобы позже добавить
-- выгрузку счёта документом без новой миграции.
CREATE TABLE IF NOT EXISTS finance_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  tax_rate REAL NOT NULL DEFAULT 0
    CHECK (tax_rate >= 0 AND tax_rate <= 100),
  target_hourly_rate REAL NOT NULL DEFAULT 0
    CHECK (target_hourly_rate >= 0),
  main_currency TEXT NOT NULL DEFAULT 'USD',
  requisites TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
