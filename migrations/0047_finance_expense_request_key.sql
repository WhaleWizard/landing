-- 0047_finance_expense_request_key.sql: Повтор расхода после потерянного ответа не удваивает сумму
-- Форма «Финансов» отправляет ключ операции с каждым расходом, но сохранить его
-- было некуда: повтор того же запроса создавал второй расход на ту же сумму.
-- Пустой ключ (старые записи) уникальность не нарушает.
ALTER TABLE finance_expenses ADD COLUMN request_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_expenses_request ON finance_expenses(request_key) WHERE request_key IS NOT NULL;
