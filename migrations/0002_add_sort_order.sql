-- D1 migration: explicit manual ordering for admin drag/reorder controls
ALTER TABLE articles ADD COLUMN sort_order INTEGER;

-- Backfill existing rows deterministically so old content keeps stable order.
UPDATE articles
SET sort_order = COALESCE(sort_order, id)
WHERE sort_order IS NULL;

CREATE INDEX IF NOT EXISTS idx_articles_sort_order ON articles(sort_order);
