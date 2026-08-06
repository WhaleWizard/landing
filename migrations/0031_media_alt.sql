-- Alt-тексты картинок медиатеки.
--
-- Хранить их в метаданных R2 нельзя без перезаливки файла: объектное
-- хранилище не умеет менять customMetadata на месте, пришлось бы копировать
-- объект и менять публичную ссылку. Поэтому подпись живёт отдельной строкой,
-- а ключ объекта связывает её с файлом.
CREATE TABLE IF NOT EXISTS media_alt (
  object_key TEXT PRIMARY KEY,
  alt TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
