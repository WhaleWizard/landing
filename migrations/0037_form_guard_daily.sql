-- Счётчик отказов на форме заявки, по одной строке на день и причину.
--
-- Нужен ровно для одного вопроса: не отсекает ли защита живых людей. Без него
-- «Turnstile иногда ошибается» остаётся ощущением, а не числом.
--
-- Суточный агрегат, а не запись на каждый отказ: на бесплатном тарифе
-- Cloudflare лимит записей в D1 конечный, а поток ботов — это как раз тот
-- случай, когда подробный журнал стоил бы дороже самой атаки.
CREATE TABLE IF NOT EXISTS form_guard_daily (
  day TEXT NOT NULL,

  -- missing_token — виджет не отработал (повод проверить сайт),
  -- invalid_token — Cloudflare отклонил (обычная работа защиты),
  -- verification_unavailable — не удалось спросить Cloudflare.
  reason TEXT NOT NULL,

  count INTEGER NOT NULL DEFAULT 0,

  -- Дневной бюджет записей исчерпан: значит, был всплеск и настоящее число
  -- больше сохранённого. Интерфейс обязан показывать такой день как «не
  -- меньше N», а не как точное значение.
  throttled INTEGER NOT NULL DEFAULT 0,

  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),

  PRIMARY KEY (day, reason)
);
