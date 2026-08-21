-- Доступ к страницам: закрытая страница отдаёт заглушку вместо содержимого,
-- но остаётся на месте — её по-прежнему можно редактировать и смотреть в
-- предпросмотре редактора.
--
-- Строк здесь ровно столько, сколько у сайта страниц (десятки, не тысячи):
-- проверка «закрыта ли страница» выполняется на каждом запросе к сайту и
-- читает эту таблицу через кэш, поэтому таблица обязана оставаться крошечной.
CREATE TABLE IF NOT EXISTS page_locks (
  path TEXT PRIMARY KEY,
  locked INTEGER NOT NULL DEFAULT 0
    CHECK (locked IN (0, 1)),
  -- Закрывать вместе с вложенными адресами: /blog закрывает и /blog/<статья>.
  include_children INTEGER NOT NULL DEFAULT 0
    CHECK (include_children IN (0, 1)),
  preset TEXT NOT NULL DEFAULT 'development'
    CHECK (preset IN ('development', 'update', 'soon', 'custom')),
  title TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL DEFAULT '',
  eta TEXT,                                           -- YYYY-MM-DD, необязательно
  hide_in_nav INTEGER NOT NULL DEFAULT 1
    CHECK (hide_in_nav IN (0, 1)),
  show_subscribe INTEGER NOT NULL DEFAULT 1
    CHECK (show_subscribe IN (0, 1)),
  cta_path TEXT NOT NULL DEFAULT '/',                 -- вторая кнопка заглушки
  locked_at TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_page_locks_locked ON page_locks(locked, path);

-- Журнал изменений: когда и какая страница закрывалась и открывалась.
-- Сырые IP и user-agent не хранятся — только хеш, как в остальной статистике.
-- Нужен ровно для одного: изменение доступа не должно быть незаметным.
CREATE TABLE IF NOT EXISTS page_lock_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  action TEXT NOT NULL
    CHECK (action IN ('lock', 'unlock', 'update', 'preview')),
  actor_hash TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_page_lock_events_created ON page_lock_events(created_at DESC);

-- Кто оставил почту на заглушке «сообщить, когда откроется».
--
-- Намеренно отдельно от `leads`: это не заявка. Попади такая запись в общую
-- таблицу — она посчиталась бы в воронке, цене лида и ROMI, а показывать
-- выдуманные цифры в этом проекте нельзя.
CREATE TABLE IF NOT EXISTS page_lock_subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  notified_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_page_lock_subscribers_unique
  ON page_lock_subscribers(path, email);
CREATE INDEX IF NOT EXISTS idx_page_lock_subscribers_created
  ON page_lock_subscribers(created_at DESC);
