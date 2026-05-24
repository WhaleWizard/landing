# Facebook CAPI: текущий статус vs рекомендации

Дата проверки: 2026-05-24

## Уже реализовано
- Dedup через `event_id` + защита от повторной отправки (`wasMetaEventAlreadySent`).
- `client_ip_address` и `client_user_agent` передаются.
- Есть `fbp`/`fbc` + fallback сборка `fbc` из `fbclid`.
- Есть `external_id` (хешируется из session/идентификаторов).
- В `user_data` уже есть `em`, `ph`, `fn`, `ln`, `country`, `ct`, `st`.
- Есть retry для Meta с backoff по 429/5xx (и другим retryable статусам), timeout и jitter.
- Есть outbox таблица и статус retry/sent.

## Чего не хватает для 10/10 (приоритетно по Meta)

### 1) Не хватает customer info параметров в `user_data`
Добавить поддержку и хеширование:
- `zp` (postal/zip)
- `dobd`, `dobm`, `doby`
- `ge`
- `madid` (если источник данных реально есть)

### 2) Не хватает явного consent флага для Meta
- Добавить передачу `opt_out` (или эквивалентный объект согласия, если используете Meta Consent API).
- Привязать к текущему `marketing_consent`.

### 3) `custom_data` для Lead и event можно расширить
Добавить (где уместно по типу события):
- `value`, `currency`, `order_id`
- `contents`, `num_items`
- `search_string` (только для Search)
- `predicted_ltv`, `status`

## Примечания по текущему коду
- В проекте уже есть хорошая база контекста (`utm`, click IDs, device/browser context, form metadata).
- Расширения лучше делать поэтапно и только при наличии валидных first-party данных из формы/CRM.
