-- D1 migration: primary table for blog articles
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER NOT NULL,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Блог',
  read_time TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  content TEXT NOT NULL,
  image TEXT NOT NULL DEFAULT '/og-image.jpg',
  seo_title TEXT,
  seo_description TEXT,
  published_at TEXT,
  updated_at TEXT,
  tags_json TEXT NOT NULL DEFAULT '[]',
  summary TEXT,
  key_takeaways_json TEXT NOT NULL DEFAULT '[]',
  faq_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  PRIMARY KEY (slug)
);

CREATE INDEX IF NOT EXISTS idx_articles_updated_at ON articles(updated_at);
CREATE INDEX IF NOT EXISTS idx_articles_date ON articles(date);
