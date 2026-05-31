-- Preserve draft/published state for D1-backed articles and enable private article version history.
ALTER TABLE articles ADD COLUMN status TEXT NOT NULL DEFAULT 'published';

CREATE INDEX IF NOT EXISTS idx_articles_status_published_at ON articles(status, published_at);

CREATE TABLE IF NOT EXISTS article_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  version_data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE INDEX IF NOT EXISTS idx_article_versions_slug_created_at ON article_versions(slug, created_at DESC);
