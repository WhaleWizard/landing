-- UTM-метки заявки: откуда пришёл лид (сохраняются вместе с заявкой,
-- показываются в админке и в Telegram-уведомлении).
-- ВНИМАНИЕ: повторный запуск даст ошибку "duplicate column name" — это нормально.
ALTER TABLE leads ADD COLUMN utm_source TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN utm_medium TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN utm_campaign TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN utm_content TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN utm_term TEXT NOT NULL DEFAULT '';
