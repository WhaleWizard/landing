-- Типизированные текстовые секции публичных страниц.
-- В базе хранятся только plain-text поля; HTML/CSS/JS не принимаются API.
CREATE TABLE IF NOT EXISTS site_sections (
  section_key TEXT PRIMARY KEY,
  page_path TEXT NOT NULL,
  label TEXT NOT NULL,
  draft_json TEXT NOT NULL DEFAULT '{}',
  published_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  published_version INTEGER CHECK (published_version IS NULL OR published_version >= 1),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_at TEXT
);

CREATE TABLE IF NOT EXISTS site_section_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  section_key TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'draft' CHECK (source IN ('draft', 'published')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (section_key) REFERENCES site_sections(section_key) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_site_sections_status_updated
  ON site_sections(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_site_section_versions_key_created
  ON site_section_versions(section_key, created_at DESC);
