-- Индекс под уборку очереди досылки событий Meta.
--
-- Зачем. Уборка ищет записи по паре «статус + когда обновлена»:
--
--   DELETE FROM meta_outbox WHERE status='sent' AND updated_at < ...
--
-- Существующие индексы — (status, next_retry_at) и (event_name, event_id) —
-- по `updated_at` не помогают. Поэтому база отбирала все записи со статусом
-- `sent` (а это почти вся таблица) и у каждой проверяла дату вручную.
-- На бесплатном тарифе Cloudflare это съедало суточный лимит в 5 млн
-- прочитанных строк.
--
-- С этим индексом уборка читает ровно те строки, которые удалит.

CREATE INDEX IF NOT EXISTS idx_meta_outbox_status_updated
  ON meta_outbox(status, updated_at);
