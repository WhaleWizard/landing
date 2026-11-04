-- Связанные клиенты, проекты, разовые услуги и поступления.
-- Применять после 0043. Исторические услуги/результаты не распределяются автоматически.
ALTER TABLE clients ADD COLUMN needs TEXT NOT NULL DEFAULT '';
ALTER TABLE clients ADD COLUMN interests TEXT NOT NULL DEFAULT '';
ALTER TABLE clients ADD COLUMN relationship_type TEXT NOT NULL DEFAULT 'ongoing';
ALTER TABLE clients ADD COLUMN workspace_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_workspace_key ON clients(workspace_key) WHERE workspace_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS client_work (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK(kind IN ('project','service')),
  title TEXT NOT NULL CHECK(length(trim(title)) > 0),
  service TEXT NOT NULL DEFAULT 'other',
  status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN ('proposed','active','paused','completed','cancelled')),
  billing TEXT NOT NULL DEFAULT 'one_off' CHECK(billing IN ('one_off','monthly')),
  amount REAL NOT NULL DEFAULT 0 CHECK(amount >= 0 AND amount <= 1000000000),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK(length(currency) = 3),
  billing_day INTEGER NOT NULL DEFAULT 1 CHECK(billing_day BETWEEN 1 AND 28),
  due_at TEXT,
  scope TEXT NOT NULL DEFAULT '',
  media_folder TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  request_key TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_client_work_client ON client_work(client_id, status, kind);

ALTER TABLE invoices ADD COLUMN work_id INTEGER REFERENCES client_work(id) ON DELETE RESTRICT;
ALTER TABLE invoices ADD COLUMN request_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_request ON invoices(request_key) WHERE request_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoice_work_month ON invoices(work_id, period)
  WHERE work_id IS NOT NULL AND kind = 'retainer' AND status != 'cancelled';
ALTER TABLE time_entries ADD COLUMN work_id INTEGER REFERENCES client_work(id) ON DELETE RESTRICT;
ALTER TABLE time_entries ADD COLUMN request_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_time_request ON time_entries(request_key) WHERE request_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_time_work ON time_entries(work_id, day);

CREATE TABLE IF NOT EXISTS invoice_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0 AND amount_cents <= 100000000000),
  paid_on TEXT,
  note TEXT NOT NULL DEFAULT '',
  request_key TEXT NOT NULL UNIQUE,
  voided_at TEXT,
  void_reason TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON invoice_payments(invoice_id, voided_at);
CREATE INDEX IF NOT EXISTS idx_payments_date ON invoice_payments(paid_on);

-- Не угадывать отсутствующую дату оплаты. Такой приход учитывается за всё
-- время, а в помесячном отчёте явно остаётся нераспределённым.
INSERT OR IGNORE INTO invoice_payments(invoice_id, amount_cents, paid_on, request_key, note)
  SELECT id, CAST(round(amount * 100) AS INTEGER), paid_at, 'migration-0044:' || id, 'Оплата до журнала поступлений'
  FROM invoices WHERE status = 'paid' AND amount > 0;

CREATE TABLE IF NOT EXISTS client_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  work_id INTEGER REFERENCES client_work(id) ON DELETE RESTRICT,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE RESTRICT,
  title TEXT NOT NULL CHECK(length(trim(title)) > 0),
  due_at TEXT,
  done INTEGER NOT NULL DEFAULT 0 CHECK(done IN (0,1)),
  note TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  request_key TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_client_tasks_due ON client_tasks(done, due_at, client_id);
CREATE INDEX IF NOT EXISTS idx_client_tasks_work ON client_tasks(work_id, done);
CREATE UNIQUE INDEX IF NOT EXISTS idx_client_task_reminder ON client_tasks(invoice_id) WHERE invoice_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS client_work_resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_id INTEGER NOT NULL REFERENCES client_work(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK(kind IN ('file','link','access','note')),
  title TEXT NOT NULL,
  url TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT 'waiting' CHECK(state IN ('waiting','granted','revoked')),
  revision INTEGER NOT NULL DEFAULT 1,
  request_key TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_work_resources ON client_work_resources(work_id, kind);

CREATE TABLE IF NOT EXISTS client_work_months (
  work_id INTEGER NOT NULL REFERENCES client_work(id) ON DELETE RESTRICT,
  month TEXT NOT NULL,
  spend REAL CHECK(spend IS NULL OR spend >= 0),
  currency TEXT NOT NULL DEFAULT 'USD',
  leads INTEGER CHECK(leads IS NULL OR leads >= 0),
  sales INTEGER CHECK(sales IS NULL OR sales >= 0),
  revenue REAL CHECK(revenue IS NULL OR revenue >= 0),
  report_url TEXT NOT NULL DEFAULT '',
  report_sent_at TEXT,
  note TEXT NOT NULL DEFAULT '',
  revision INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(work_id, month)
);
CREATE TABLE IF NOT EXISTS client_work_activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  work_id INTEGER,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  request_key TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_work_activity ON client_work_activity(client_id, work_id, id DESC);

CREATE TRIGGER IF NOT EXISTS work_created_history AFTER INSERT ON client_work
BEGIN
  INSERT INTO client_work_activity(client_id,work_id,kind,text) VALUES(NEW.client_id,NEW.id,'work','Создано: '||NEW.title);
END;
CREATE TRIGGER IF NOT EXISTS work_changed_history AFTER UPDATE ON client_work
BEGIN
  INSERT INTO client_work_activity(client_id,work_id,kind,text) VALUES(NEW.client_id,NEW.id,'work','Обновлены настройки: '||NEW.title);
END;
CREATE TRIGGER IF NOT EXISTS task_created_history AFTER INSERT ON client_tasks
BEGIN
  INSERT INTO client_work_activity(client_id,work_id,kind,text) VALUES(NEW.client_id,NEW.work_id,'task','Добавлена задача: '||NEW.title);
END;
CREATE TRIGGER IF NOT EXISTS task_changed_history AFTER UPDATE ON client_tasks
BEGIN
  INSERT INTO client_work_activity(client_id,work_id,kind,text) VALUES(NEW.client_id,NEW.work_id,'task',CASE WHEN NEW.done=1 THEN 'Завершена задача: ' ELSE 'Обновлена задача: ' END||NEW.title);
END;
CREATE TRIGGER IF NOT EXISTS invoice_reminder_links AFTER UPDATE OF client_id,work_id ON invoices
BEGIN
  UPDATE client_tasks SET client_id=NEW.client_id,work_id=NEW.work_id,revision=revision+1 WHERE invoice_id=NEW.id AND NEW.client_id IS NOT NULL;
END;
CREATE TRIGGER IF NOT EXISTS time_work_guard_insert BEFORE INSERT ON time_entries
WHEN NEW.work_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM client_work WHERE id=NEW.work_id AND client_id=NEW.client_id)
    THEN RAISE(ABORT, 'WORK_CLIENT_MISMATCH') END;
END;
CREATE TRIGGER IF NOT EXISTS time_work_guard_update BEFORE UPDATE OF client_id,work_id ON time_entries
WHEN NEW.work_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM client_work WHERE id=NEW.work_id AND client_id=NEW.client_id)
    THEN RAISE(ABORT, 'WORK_CLIENT_MISMATCH') END;
END;

-- Ограничение проверяется в самой базе: два параллельных запроса не могут
-- принять больше денег, чем осталось по счёту.
CREATE TRIGGER IF NOT EXISTS payment_amount_guard BEFORE INSERT ON invoice_payments
WHEN NOT EXISTS (SELECT 1 FROM invoice_payments WHERE request_key = NEW.request_key)
BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM invoices WHERE id = NEW.invoice_id AND status IN ('issued','paid'))
    THEN RAISE(ABORT, 'PAYMENT_INVOICE_NOT_ISSUED') END;
  SELECT CASE WHEN NEW.amount_cents + COALESCE((SELECT sum(amount_cents) FROM invoice_payments
    WHERE invoice_id = NEW.invoice_id AND voided_at IS NULL),0) > (SELECT CAST(round(amount * 100) AS INTEGER) FROM invoices WHERE id = NEW.invoice_id)
    THEN RAISE(ABORT, 'PAYMENT_EXCEEDS_BALANCE') END;
END;
CREATE TRIGGER IF NOT EXISTS invoice_ledger_guard BEFORE UPDATE OF amount,currency,status,client_id,work_id ON invoices
WHEN EXISTS(SELECT 1 FROM invoice_payments WHERE invoice_id = OLD.id AND voided_at IS NULL)
BEGIN
  SELECT CASE WHEN CAST(round(NEW.amount * 100) AS INTEGER) < (SELECT sum(amount_cents) FROM invoice_payments WHERE invoice_id = OLD.id AND voided_at IS NULL)
    OR NEW.currency != OLD.currency OR NEW.status IN ('draft','cancelled')
    THEN RAISE(ABORT, 'INVOICE_HAS_PAYMENTS') END;
  SELECT CASE WHEN NEW.client_id IS NOT OLD.client_id AND OLD.client_id IS NOT NULL
    THEN RAISE(ABORT, 'PAID_INVOICE_CLIENT_LOCKED') END;
END;
CREATE TRIGGER IF NOT EXISTS invoice_work_guard_insert BEFORE INSERT ON invoices
WHEN NEW.work_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM client_work WHERE id=NEW.work_id AND client_id=NEW.client_id)
    THEN RAISE(ABORT, 'WORK_CLIENT_MISMATCH') END;
END;
CREATE TRIGGER IF NOT EXISTS invoice_work_guard_update BEFORE UPDATE OF work_id,client_id ON invoices
WHEN NEW.work_id IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM client_work WHERE id=NEW.work_id AND client_id=NEW.client_id)
    THEN RAISE(ABORT, 'WORK_CLIENT_MISMATCH') END;
END;
CREATE TRIGGER IF NOT EXISTS payment_sync_invoice AFTER INSERT ON invoice_payments
BEGIN
  UPDATE invoices SET status = CASE WHEN CAST(round(amount*100) AS INTEGER) <=
      (SELECT COALESCE(sum(amount_cents),0) FROM invoice_payments WHERE invoice_id=NEW.invoice_id AND voided_at IS NULL)
      THEN 'paid' ELSE 'issued' END,
    paid_at = CASE WHEN CAST(round(amount*100) AS INTEGER) <=
      (SELECT COALESCE(sum(amount_cents),0) FROM invoice_payments WHERE invoice_id=NEW.invoice_id AND voided_at IS NULL)
      THEN (SELECT max(paid_on) FROM invoice_payments WHERE invoice_id=NEW.invoice_id AND voided_at IS NULL) ELSE NULL END,
    updated_at=datetime('now') WHERE id=NEW.invoice_id;
  UPDATE client_tasks SET done=1, revision=revision+1, updated_at=datetime('now') WHERE invoice_id=NEW.invoice_id
    AND done=0 AND EXISTS(SELECT 1 FROM invoices WHERE id=NEW.invoice_id AND status='paid');
END;
CREATE TRIGGER IF NOT EXISTS payment_void_sync AFTER UPDATE OF voided_at ON invoice_payments
WHEN OLD.voided_at IS NULL AND NEW.voided_at IS NOT NULL
BEGIN
  UPDATE invoices SET status='issued', paid_at=NULL, updated_at=datetime('now') WHERE id=NEW.invoice_id;
END;
-- Совместимость со старой вкладкой счетов и уже открытым браузером владельца.
CREATE TRIGGER IF NOT EXISTS invoice_paid_insert AFTER INSERT ON invoices
WHEN NEW.status='paid' AND NEW.amount>0
BEGIN
  INSERT INTO invoice_payments(invoice_id,amount_cents,paid_on,request_key)
    VALUES(NEW.id,CAST(round(NEW.amount*100) AS INTEGER),NEW.paid_at,'invoice-created-paid:'||NEW.id);
END;
CREATE TRIGGER IF NOT EXISTS invoice_paid_update AFTER UPDATE OF status ON invoices
WHEN NEW.status='paid' AND CAST(round(NEW.amount*100) AS INTEGER) >
  (SELECT COALESCE(sum(amount_cents),0) FROM invoice_payments WHERE invoice_id=NEW.id AND voided_at IS NULL)
BEGIN
  INSERT INTO invoice_payments(invoice_id,amount_cents,paid_on,request_key)
    SELECT NEW.id,CAST(round(NEW.amount*100) AS INTEGER)-COALESCE(sum(amount_cents),0),NEW.paid_at,
      'invoice-mark-paid:'||NEW.id||':'||lower(hex(randomblob(16)))
    FROM invoice_payments WHERE invoice_id=NEW.id AND voided_at IS NULL;
END;
