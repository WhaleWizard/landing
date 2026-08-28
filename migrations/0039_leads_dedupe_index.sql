-- Поиск дублей заявки по индексу вместо перебора последних 500.
--
-- Как было: приём заявки читал 500 свежих строк и сравнивал контакты в коде.
-- Контакт старше этих пятисот не находился — человек, писавший год назад,
-- создавал новую заявку вместо того, чтобы поднять существующую. Счётчик
-- обращений начинался заново, история терялась, в CRM появлялся дубль.
--
-- Почему нельзя было искать прямо по email и phone: они хранятся так, как их
-- набрал человек. «+7 999 123-45-67» и «8 (999) 123-45-67» — один номер,
-- «Ivan@Mail.ru» и «ivan@mail.ru» — одна почта. Сравнение шло по приведённым
-- значениям, а приведение жило в коде, и SQL о нём не знал.
--
-- Теперь приведённые ключи хранятся рядом и покрыты индексами. Правило
-- приведения — то же, что в коде (`contactKeys` в functions/_lib/leads.ts):
--   почта    — без пробелов по краям, строчными;
--   телефон  — только цифры, последние десять;
--   телеграм — без ведущей собаки, строчными.
--
-- Пусто хранится как NULL, а не пустая строка. Это принципиально: иначе все
-- заявки без телефона имели бы одинаковый ключ '' и склеились бы в одну.

ALTER TABLE leads ADD COLUMN dedupe_email TEXT;
ALTER TABLE leads ADD COLUMN dedupe_phone TEXT;
ALTER TABLE leads ADD COLUMN dedupe_telegram TEXT;

-- Индексы частичные: строки без ключа в них не попадают и места не занимают.
CREATE INDEX IF NOT EXISTS idx_leads_dedupe_email
  ON leads (dedupe_email) WHERE dedupe_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_dedupe_phone
  ON leads (dedupe_phone) WHERE dedupe_phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_dedupe_telegram
  ON leads (dedupe_telegram) WHERE dedupe_telegram IS NOT NULL;

-- Заполнение уже существующих заявок.
--
-- У SQLite нет регулярных выражений, поэтому цифры из телефона выбираются
-- вложенными заменами. Перечислены те знаки, которыми люди на самом деле
-- разделяют номер: плюс, пробел, дефис, скобки, точка и неразрывный пробел.
UPDATE leads
SET
  dedupe_email = NULLIF(LOWER(TRIM(COALESCE(email, ''))), ''),

  dedupe_telegram = NULLIF(
    LOWER(TRIM(
      CASE
        WHEN SUBSTR(TRIM(COALESCE(telegram_username, '')), 1, 1) = '@'
          THEN SUBSTR(TRIM(COALESCE(telegram_username, '')), 2)
        ELSE TRIM(COALESCE(telegram_username, ''))
      END
    )),
    ''
  ),

  dedupe_phone = (
    SELECT
      CASE
        WHEN LENGTH(digits) >= 10 THEN SUBSTR(digits, LENGTH(digits) - 9, 10)
        WHEN LENGTH(digits) > 0 THEN digits
        ELSE NULL
      END
    FROM (
      SELECT REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
        COALESCE(leads.phone, ''),
        '+', ''), ' ', ''), '-', ''), '(', ''), ')', ''), '.', ''), CHAR(160), '') AS digits
    )
  );
