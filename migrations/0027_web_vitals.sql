-- Реальные Core Web Vitals посетителей (field data).
--
-- В проекте была измеряемая только лабораторная скорость через PageSpeed, а
-- Google ранжирует по данным реальных пользователей. Метрики складываются
-- сразу в суточные агрегаты: ни отдельных визитов, ни идентификаторов,
-- ни IP тут не хранится — только счётчики по дню, метрике, типу устройства
-- и странице.
CREATE TABLE IF NOT EXISTS web_vitals_daily (
  day TEXT NOT NULL,                 -- YYYY-MM-DD (UTC)
  metric TEXT NOT NULL,              -- LCP | CLS | INP | TTFB
  device TEXT NOT NULL DEFAULT '',   -- mobile | tablet | desktop
  page_path TEXT NOT NULL DEFAULT '',
  samples INTEGER NOT NULL DEFAULT 0,
  value_sum REAL NOT NULL DEFAULT 0,
  good INTEGER NOT NULL DEFAULT 0,
  needs_improvement INTEGER NOT NULL DEFAULT 0,
  poor INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (day, metric, device, page_path)
);

CREATE INDEX IF NOT EXISTS idx_web_vitals_day
  ON web_vitals_daily(day DESC, metric);
