-- Недельный планер админки.
-- Одна строка = одна неделя (понедельник в ISO-формате), состояние целиком в JSON:
-- цели недели, задачи и заметки по дням, трекер привычек и дневник.
CREATE TABLE IF NOT EXISTS planner_weeks (
  week_start TEXT PRIMARY KEY,
  data_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_planner_weeks_updated
  ON planner_weeks(updated_at DESC);
