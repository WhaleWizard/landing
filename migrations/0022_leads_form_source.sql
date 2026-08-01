-- Какая именно форма и какой её вариант принесли заявку.
-- Сайт отправляет эти признаки в /api/lead с самого начала (ContactForm →
-- home_contact_form, LandingForm → service_landing_form), но в leads их
-- негде было хранить, поэтому разрезы «Форма» и «Вариант формы» в разделе
-- «Воронка» были отключены. Это внутренние идентификаторы форм, не персональные
-- данные и не рекламные метки, поэтому они сохраняются независимо от согласия.
-- ВНИМАНИЕ: повторный запуск даст ошибку "duplicate column name" — это нормально.
ALTER TABLE leads ADD COLUMN form_id TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN form_variant TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_leads_form_created
  ON leads(form_id, created_at);
