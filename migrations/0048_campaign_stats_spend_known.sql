-- 0048_campaign_stats_spend_known.sql: Пустой расход кампании — «не введён», а не ноль
-- Колонка spend в campaign_stats не допускает пустого значения, и запись с кликами
-- без расхода превращалась в бесплатные клики с ценой клика 0. Признак отделяет
-- «расход не введён» от настоящего нуля; старые записи считаются введёнными.
ALTER TABLE campaign_stats ADD COLUMN spend_known INTEGER NOT NULL DEFAULT 1;
