-- История версий перестаёт расти без конца: хранятся последние 50 на объект.
--
-- Каждое сохранение статьи и каждое сохранение блока текстов сайта добавляли
-- строку, и ничто их не удаляло. У активно редактируемой страницы это сотни
-- снимков целого документа — на бесплатном тарифе Cloudflare D1 размер базы
-- ограничен, и первым делом он кончился бы именно здесь.
--
-- Пятьдесят версий покрывают любую реальную потребность откатиться: это
-- несколько месяцев правок даже при ежедневной работе. Кто откатывается на
-- пятьдесят первую версию назад, тот берёт текст не из истории, а из головы.
--
-- Почему триггер, а не уборка в коде: писать историю может не только админка
-- (перенос контента с production, восстановление версии), и правило должно
-- держаться в самой базе, а не в одном из путей записи.

-- Индекс под условие удаления: без него триггер на каждой вставке читал бы всю
-- историю объекта. Для статей нужный индекс уже есть (миграция 0006), здесь —
-- только по идентификатору, чтобы отбор «пятидесятая сверху» шёл по нему.
CREATE INDEX IF NOT EXISTS idx_article_versions_slug_id
  ON article_versions(slug, id DESC);
CREATE INDEX IF NOT EXISTS idx_site_section_versions_key_id
  ON site_section_versions(section_key, id DESC);

-- Отсчёт по id, а не по created_at: время в SQLite пишется с точностью до
-- секунды, и несколько сохранений подряд получают одинаковую метку — порядок
-- удаления стал бы неопределённым, и триггер мог бы срезать не ту версию.
CREATE TRIGGER IF NOT EXISTS trg_article_versions_retention
AFTER INSERT ON article_versions
BEGIN
  DELETE FROM article_versions
  WHERE slug = NEW.slug
    AND id <= (
      SELECT id FROM article_versions
      WHERE slug = NEW.slug
      ORDER BY id DESC
      LIMIT 1 OFFSET 50
    );
END;

CREATE TRIGGER IF NOT EXISTS trg_site_section_versions_retention
AFTER INSERT ON site_section_versions
BEGIN
  DELETE FROM site_section_versions
  WHERE section_key = NEW.section_key
    AND id <= (
      SELECT id FROM site_section_versions
      WHERE section_key = NEW.section_key
      ORDER BY id DESC
      LIMIT 1 OFFSET 50
    );
END;

-- Разовая уборка того, что уже накопилось. Триггеры срабатывают только на
-- новых вставках и старые строки сами не тронут.
DELETE FROM article_versions
WHERE id NOT IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY slug ORDER BY id DESC) AS position
    FROM article_versions
  )
  WHERE position <= 50
);

DELETE FROM site_section_versions
WHERE id NOT IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY section_key ORDER BY id DESC) AS position
    FROM site_section_versions
  )
  WHERE position <= 50
);
