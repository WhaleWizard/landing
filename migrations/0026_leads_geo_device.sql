-- Страна и тип устройства заявки.
--
-- «Мобильный трафик конвертит хуже?» — один из самых частых вопросов при
-- разборе кампаний, но ответить на него было нечем. Страна берётся из
-- заголовка Cloudflare CF-IPCountry (двухбуквенный код, без города и без
-- IP), тип устройства — грубо из user-agent: телефон, планшет или компьютер.
-- Ни IP, ни полная строка user-agent не сохраняются.
-- ВНИМАНИЕ: повторный запуск даст ошибку "duplicate column name" — это нормально.
ALTER TABLE leads ADD COLUMN country TEXT NOT NULL DEFAULT '';
ALTER TABLE leads ADD COLUMN device TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_leads_country_created
  ON leads(country, created_at);
CREATE INDEX IF NOT EXISTS idx_leads_device_created
  ON leads(device, created_at);
