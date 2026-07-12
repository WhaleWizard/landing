# Админка v2: дашборд, заявки, медиатека — настройка

Что появилось в коде (июль 2026):

- **Дашборд** (`/admin` → Дашборд): уникальные посетители и просмотры за 7/14 дней, топ страниц, последние заявки, здоровье Meta CAPI. Данные — `GET /api/admin/stats`.
- **Заявки** (`/admin` → Заявки): все лиды с форм со статусами `new / in_progress / closed`. Данные — `GET/POST /api/admin/leads`. Заявки продолжают приходить в Telegram.
- **Медиатека** (`/admin` → Медиатека): список файлов из R2 (`uploads/…`), копирование ссылки, загрузка, удаление. Данные — `GET/POST /api/admin/media`.
- **Telegram напрямую из Cloudflare**: `/api/lead` шлёт уведомление через Bot API, если заданы секреты `TELEGRAM_BOT_TOKEN` и `TELEGRAM_CHAT_ID`. Пока секреты не заданы — работает старый прокси на Google Apps Script (fallback, менять ничего не нужно).
- **Статистика посещений**: `/api/pageview` пишет дневные агрегаты в D1 (`page_stats_daily`, `visitor_hashes_daily`). Без cookies; хранится только суточный хеш IP+UA+соль, сырые IP/UA не сохраняются, хеши старше 90 дней удаляются.

## Что нужно сделать один раз

### 1. Миграция D1 (обязательно для заявок и статистики)

Cloudflare Dashboard → Storage & Databases → D1 → база сайта → вкладка **Console** → вставить содержимое `migrations/0008_leads_and_page_stats.sql` → Execute. Безопасно выполнять повторно (`IF NOT EXISTS`).

### 2. Telegram-секреты (для отправки заявок без Google Apps Script)

1. В @BotFather: `/mybots` → выбрать бота → API Token → **Revoke** (старый токен засвечен) → скопировать новый.
2. Cloudflare Pages → проект сайта → Settings → Environment variables → добавить для Production:
   - `TELEGRAM_BOT_TOKEN` = новый токен (тип Secret)
   - `TELEGRAM_CHAT_ID` = ID чата, куда бот шлёт заявки (тот же, что был в Apps Script)
3. Redeploy. После этого Google Apps Script можно отключить (Deployments → Archive).

Проверка chat_id: если уведомления не приходят, убедитесь, что бот состоит в чате/группе и ID указан со знаком минус для групп.

### 3. Ничего больше

Медиатека и дашборд работают на существующих биндингах (`BUCKET`, `DB`). Все admin-эндпоинты защищены `ADMIN_PASSWORD` (заголовок `X-Admin-Password`) и rate-limit'ом.

## Качество лидов → Meta (QualifiedLead / UnqualifiedLead)

Кнопки «целевой»/«нецелевой» в разделе «Заявки» отправляют в Meta CAPI события
`QualifiedLead` / `UnqualifiedLead` (`functions/_lib/lead-quality.ts`):

- только если посетитель дал marketing_consent вместе с заявкой (флаг хранится в leads);
- PII уходит как SHA-256 хеши (email/phone/external_id) + fbp/fbc клика;
- `action_source: system_generated`, `event_id: lq:<quality>:<lead_id>` — повторные клики дедуплицируются;
- при сбое событие лежит в `meta_outbox` и досылается фоном, статус ответа Meta показывается в админке.

Требуются миграции 0009 (метка quality) и 0010 (fbp/fbc/consent-контекст).
Снятие метки событие не отправляет — «отозвать» событие в Meta нельзя.

Использование в рекламе: Events Manager → пиксель → события появятся после
первой отметки; далее Custom Conversions на QualifiedLead для отчётов и,
при достаточном объёме (~10+/нед на кампанию), оптимизации кампаний.

## Поведение без настройки

- Нет миграции → разделы «Дашборд»/«Заявки» показывают понятную заглушку (503), сайт работает как раньше.
- Нет Telegram-секретов → заявки идут через старый Apps Script.
- Локальный dev (vite) → функций нет, разделы показывают заглушку.
