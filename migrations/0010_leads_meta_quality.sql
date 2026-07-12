-- Контекст для событий качества лида в Meta CAPI (QualifiedLead / UnqualifiedLead):
-- клик-метки и согласие сохраняются при создании заявки, чтобы позже
-- привязать событие качества к тому же человеку и клику по рекламе.
-- ВНИМАНИЕ: повторный запуск даст ошибку "duplicate column name" — это нормально.
ALTER TABLE leads ADD COLUMN fbp TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN fbc TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN event_source_url TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN external_id TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN marketing_consent INTEGER NOT NULL DEFAULT 0;
