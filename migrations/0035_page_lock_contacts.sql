-- Телефон и телеграм на заглушке рядом с почтой + отдельное согласие на
-- маркетинг, по которому уходит событие в Meta.
--
-- Отдельной миграцией, а не правкой 0034: та могла быть уже применена, и
-- новые колонки в ней молча не появились бы.
ALTER TABLE page_lock_subscribers ADD COLUMN phone TEXT NOT NULL DEFAULT '';

ALTER TABLE page_lock_subscribers ADD COLUMN telegram TEXT NOT NULL DEFAULT '';

-- Согласие на маркетинг — отдельная галочка, по умолчанию снятая. Без неё
-- в Meta не уходит ничего: серверные события в этом проекте отправляются
-- только при явном согласии, и это правило не ослабляется.
ALTER TABLE page_lock_subscribers ADD COLUMN marketing_consent INTEGER NOT NULL DEFAULT 0;

-- Квитанция согласия: когда и из какой страны его дали. Нужна, чтобы согласие
-- можно было предъявить, а не утверждать на словах.
ALTER TABLE page_lock_subscribers ADD COLUMN consent_at TEXT;

ALTER TABLE page_lock_subscribers ADD COLUMN consent_region TEXT NOT NULL DEFAULT '';

-- Повторов не должно быть ни по почте, ни по телефону, ни по телеграму, но
-- человек оставляет что-то одно. Обычный уникальный индекс по паре считал бы
-- все записи с пустым полем одним и тем же контактом, поэтому индексы
-- частичные: каждый следит только за заполненным полем.
DROP INDEX IF EXISTS idx_page_lock_subscribers_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_page_lock_subscribers_email
  ON page_lock_subscribers(path, email) WHERE email <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_page_lock_subscribers_phone
  ON page_lock_subscribers(path, phone) WHERE phone <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_page_lock_subscribers_telegram
  ON page_lock_subscribers(path, telegram) WHERE telegram <> '';
