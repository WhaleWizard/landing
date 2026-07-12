-- Повторные заявки и качество лида.
-- ВНИМАНИЕ: повторный запуск даст ошибку "duplicate column name" — это
-- нормально, значит колонки уже добавлены.
ALTER TABLE leads ADD COLUMN submissions_count INTEGER NOT NULL DEFAULT 1;
ALTER TABLE leads ADD COLUMN last_submitted_at TEXT;
ALTER TABLE leads ADD COLUMN quality TEXT NOT NULL DEFAULT ''; -- '' | target | nontarget
UPDATE leads SET last_submitted_at = created_at WHERE last_submitted_at IS NULL;
