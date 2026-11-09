-- 0046_campaign_stats.sql: Сквозная аналитика UTM-кампаний
CREATE TABLE IF NOT EXISTS campaign_stats (
  id TEXT PRIMARY KEY,
  utm_source TEXT NOT NULL,
  utm_medium TEXT NOT NULL DEFAULT '',
  utm_campaign TEXT NOT NULL,
  utm_content TEXT NOT NULL DEFAULT '',
  utm_term TEXT NOT NULL DEFAULT '',
  channel TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  spend REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_campaign_stats_date ON campaign_stats (date);
CREATE INDEX IF NOT EXISTS idx_campaign_stats_source_campaign ON campaign_stats (utm_source, utm_campaign);
