-- История замеров PageSpeed: раньше результаты жили только в localStorage
-- браузера и протухали через 12 часов, поэтому «стало быстрее или медленнее»
-- было не с чем сравнить.
--
-- Одна строка = один день на страницу и режим: перезапуск в тот же день
-- переписывает запись, а не плодит точки. Для тренда суточной точности хватает.
CREATE TABLE IF NOT EXISTS pagespeed_history (
  day TEXT NOT NULL,                 -- YYYY-MM-DD (UTC)
  url TEXT NOT NULL,
  strategy TEXT NOT NULL,            -- mobile | desktop
  performance INTEGER,
  accessibility INTEGER,
  best_practices INTEGER,
  seo INTEGER,
  lcp_ms REAL,
  cls REAL,
  tbt_ms REAL,
  total_bytes INTEGER,
  checked_at TEXT NOT NULL,
  PRIMARY KEY (day, url, strategy)
);

CREATE INDEX IF NOT EXISTS idx_pagespeed_history_day
  ON pagespeed_history(day DESC, strategy);
