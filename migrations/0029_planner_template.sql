-- Шаблон недели: повторяющиеся ритуалы, которые каждую неделю одни и те же
-- («понедельник — разбор кампаний», «пятница — отчёт клиенту»).
--
-- Строка ровно одна: CHECK (id = 1) физически не даёт создать второй шаблон,
-- а INSERT OR REPLACE по этому же id всегда переписывает существующий.
-- Привычки сюда не входят — они и так переносятся с прошлой недели.
CREATE TABLE IF NOT EXISTS planner_template (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  data_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
