# Meta Conversions API + Cloudflare Pages setup

Дата обновления: 2026-07-22.

Этот проект отправляет Meta события двумя потоками:

1. **Browser / Pixel** — из `src/app/consent/consent.ts` через `fbq(...)`.
2. **Server / Conversions API** — из Cloudflare Pages Functions:
   - `POST /api/pageview`
   - `POST /api/meta-event`
   - `POST /api/lead`
   - `POST /api/meta-test-event` для ручной проверки Test Events.

Если в Meta Events Manager видны только browser events, это почти всегда означает одно из следующих:

- В Cloudflare не задан `META_CAPI_ACCESS_TOKEN`.
- `VITE_META_PIXEL_ID` в Cloudflare не совпадает с Pixel/Dataset ID в Meta.
- В старой реализации `META_CAPI_TEST_CODE` мог подмешиваться в обычные live CAPI события; тогда Meta показывала server events в **Test Events**, а в обычном Events Manager оставались только Browser events. Сейчас live handlers не используют `test_event_code`; он нужен только для `POST /api/meta-test-event`.
- Переменные заданы только в Preview или только в Build, а production Pages Function их не видит.
- Не применены D1/KV bindings, поэтому диагностика не пишет статусы и кажется, что сервер “молчит”.
- События отправлены с тем же `event_id`, и Meta дедуплицирует browser+server пару; для проверки server-side статуса смотри Test Events, Diagnostics и `fbtrace_id`, а не только главный список событий.

## 1. Что создать в Meta

1. Открой **Meta Events Manager**.
2. Выбери нужный **Pixel / Dataset**.
3. Скопируй **Dataset ID / Pixel ID** — это значение для `VITE_META_PIXEL_ID`.
4. Открой **Settings → Conversions API**.
5. Сгенерируй access token для Conversions API.
6. Для временной проверки открой **Test Events** и скопируй **test event code**.

> Важно: `META_CAPI_TEST_CODE` нужен только для ручного endpoint `/api/meta-test-event`. Обычные production handlers `/api/pageview`, `/api/meta-event` и `/api/lead` не добавляют `test_event_code`, чтобы live server events не уходили в Test Events вместо production-обработки.

## 2. Что добавить в Cloudflare Pages → Variables and Secrets

Открой:

**Cloudflare Dashboard → Workers & Pages → твой Pages project → Settings → Variables and Secrets**

Добавь переменные для **Production**. Если используешь Preview deploys — продублируй и в **Preview**.

### Обязательные переменные

| Name | Type | Example | Назначение |
| --- | --- | --- | --- |
| `META_CAPI_ACCESS_TOKEN` | Secret | `EAAB...` | Server-side token для отправки CAPI событий в Meta. |
| `VITE_META_PIXEL_ID` | Plaintext | `926332213606723` | Pixel/Dataset ID. Нужен и frontend build, и Pages Functions runtime. |
| `META_CAPI_API_VERSION` | Plaintext | `v25.0` | Версия Graph/Marketing API. |
| `META_CAPI_DEBUG_SECRET` | Secret | длинная случайная строка | Пароль для диагностических endpoints. |
| `SITE_URL` | Plaintext | `https://www.whalewzrd.com` | Production URL для fallback `event_source_url` и тестов. |
| `TRACKING_HMAC_SECRET` | Secret | 64 hex-символа | 32 случайных байта для проверки подписи tracking-запросов; не передаётся браузеру. |
| `TRACKING_SIGNATURE_MODE` | Plaintext | `monitor` | Оставить `monitor`, пока доверенный серверный клиент не отправляет подтверждённые валидные подписи. |
| `TRACKING_SIG_TTL_SEC` | Plaintext | `60` | Допустимое расхождение времени подписанного запроса; код ограничивает значение диапазоном 10–300 секунд. |

### Временная переменная для проверки Test Events

| Name | Type | Example | Назначение |
| --- | --- | --- | --- |
| `META_CAPI_TEST_CODE` | Plaintext или Secret | `TEST12345` | Используется только endpoint `/api/meta-test-event`, чтобы вручную увидеть server CAPI события в Meta → Test Events. |

### Опционально: Meta Limited Data Use / data processing options

Оставь пустыми, если не используешь LDU. Если нужно включить LDU с авто-геоопределением Meta:

| Name | Type | Value |
| --- | --- | --- |
| `META_CAPI_DATA_PROCESSING_OPTIONS` | Plaintext | `LDU` |
| `META_CAPI_DATA_PROCESSING_OPTIONS_COUNTRY` | Plaintext | `0` |
| `META_CAPI_DATA_PROCESSING_OPTIONS_STATE` | Plaintext | `0` |

## 3. Что добавить в Cloudflare Pages → Bindings

Открой:

**Cloudflare Dashboard → Workers & Pages → твой Pages project → Settings → Bindings**

### D1 binding

1. Создай или выбери D1 database.
2. Добавь binding:
   - Type: **D1 database**
   - Variable name: `DB`
3. ✅ Выполнено: на production применены все миграции до `0020` включительно
   (17.07 и 23.07.2026). При восстановлении окружения: сделай резервную копию
   production D1 и примени все ещё не применённые
   миграции строго по номеру. Не выбирай только отдельные
   CAPI-файлы: более поздние схемы зависят от предыдущих. Для Meta особенно важны:
   - `0002`–`0004` — диагностика и качество сопоставления;
   - `0005` — надёжная очередь `meta_outbox`;
   - `0008`–`0011` и `0015` — лиды, consent и attribution-контекст;
   - `0016` — 90-дневное хранение диагностических записей;
   - `0018` — атомарная D1-защита подписей от повторного воспроизведения;
   - `0019` — устойчивый журнал приёма заявок по `event_id`.

`0019` примени до выкладки нового `/api/lead` или в том же окне обслуживания
до поступления трафика. Если таблицы нет, endpoint намеренно отвечает retryable
`503`, чтобы клиент повторил отправку и не получил ложный успех.

### KV bindings

Привяжи три KV namespace:

| Binding variable name | Для чего |
| --- | --- |
| `META_CAPI_IDEMPOTENCY` | Idempotency / защита от повторной server отправки того же `event_name + event_id`. |
| `META_CAPI_DIAGNOSTICS` | Резервная/быстрая диагностика CAPI статусов. |
| `META_CAPI_NONCE` | Только совместимый fallback в режиме `monitor`; не является атомарной replay-защитой. |

### Почему подписи пока остаются в `monitor`

Миграция `0018` делает атомарный nonce-claim через уникальное ограничение D1 и
хранит только хеш nonce. KV `get` → `put` неатомарен, поэтому
`META_CAPI_NONCE` используется лишь как совместимый fallback в `monitor`.
В режиме `enforce` код требует доступную D1 replay-защиту.

Текущий публичный браузерный клиент не должен знать общий HMAC-секрет, поэтому
`TRACKING_SIGNATURE_MODE=enforce` включать нельзя. Сначала нужен доверенный
серверный подписывающий клиент, затем в production-диагностике должны появиться
валидные подписанные запросы. Только после этого можно отдельно планировать
переход на `enforce`.

## 4. Обязательный redeploy

После изменения Variables/Secrets/Bindings сделай новый deploy:

1. Cloudflare Pages → Deployments.
2. Нажми **Retry deployment** или запушь новый commit.
3. Убедись, что production deployment завершился после добавления переменных и bindings.

Без redeploy Pages Functions могут не видеть новые env/bindings.

## 5. Проверка, что Cloudflare всё видит

Проверь из терминала, передав secret только в заголовке (не вставляй его в URL,
историю браузера или скриншот):

```bash
curl -X POST 'https://www.whalewzrd.com/api/meta-diagnostics-health?write=1' \
  -H 'x-meta-debug-secret: YOUR_META_CAPI_DEBUG_SECRET'
```

Ожидаемые признаки:

- `success: true`
- `environment.has_DB_binding: true`
- `environment.has_META_CAPI_ACCESS_TOKEN: true`
- `environment.has_META_CAPI_DEBUG_SECRET: true`
- `environment.has_META_CAPI_IDEMPOTENCY: true`
- `environment.has_META_CAPI_DIAGNOSTICS: true`
- `diagnostics_table_before.exists: true`
- `write_probe.inserted: true`

Если `has_META_CAPI_TEST_CODE: false` — это нормально для live production events. Для ручной проверки `/api/meta-test-event` поставь `META_CAPI_TEST_CODE` и redeploy; обычные live handlers при этом всё равно не будут добавлять `test_event_code`.

## 6. Ручная проверка server CAPI в Meta Test Events

1. В Meta Events Manager → **Test Events** скопируй test code.
2. В Cloudflare поставь `META_CAPI_TEST_CODE=<код>`.
3. Redeploy.
4. Выполни запрос:

```bash
curl -X POST 'https://www.whalewzrd.com/api/meta-test-event' \
  -H 'x-meta-debug-secret: YOUR_META_CAPI_DEBUG_SECRET' \
  -H 'Content-Type: application/json' \
  -d '{"event_name":"all","page_url":"https://www.whalewzrd.com/?meta_capi_test=1"}'
```

Успешный ответ должен содержать:

- `success: true`
- `status: 200`
- `meta.events_received` больше 0
- `meta.fbtrace_id`

После этого проверь, что server events действительно появились в Meta → Test
Events. Успешный HTTP-ответ приложения сам по себе не заменяет эту внешнюю
проверку.

## 7. Проверка реальных событий сайта

1. Открой сайт в чистом браузере / incognito.
2. Прими marketing cookies.
3. Открой несколько страниц.
4. Открой форму, начни ввод, отправь тестовую заявку.
5. Проверь диагностику:

```bash
curl 'https://www.whalewzrd.com/api/meta-diagnostics-summary?hours=24' \
  -H 'x-meta-debug-secret: YOUR_META_CAPI_DEBUG_SECRET'
```

Смотри:

- `sent` по `PageView`, `ViewContent`, `LeadFormView`, `FormStart`, `Contact`, `Lead`.
- `events_received` больше 0.
- `fbtrace_id` в latest events.
- `failed` и `error_message` — если есть ошибки Meta.
- `marketing_consent_rate` — должен быть ожидаемо высоким для тестов с accepted cookies.

Статус `sent`, `events_received > 0` и `fbtrace_id` подтверждают ответ Graph API,
но production-доставка и дедупликация считаются окончательно проверенными только
после появления того же события в Meta Events Manager.

## 8. Почему в Events Manager может казаться, что есть только Browser

- **`META_CAPI_TEST_CODE` в live payload**: если обычные server events отправляются с `test_event_code`, Meta показывает их в Test Events, а production overview может выглядеть как Browser-only. Live handlers теперь не добавляют `test_event_code`; для тестов есть отдельный `/api/meta-test-event`.
- **Deduplication**: если browser и server имеют одинаковые `event_name + event_id`, Meta считает это одной конверсией. Это правильно; проверяй breakdown/diagnostics, а не только количество строк.
- **Не тот Pixel ID**: браузер может стрелять в один pixel, а CAPI — в другой dataset, если env отличается между build/runtime.
- **Нет token/invalid token**: browser работает, server получает ошибку OAuth/API; точный текст будет в `/api/meta-diagnostics-summary`.
- **Consent**: server события не отправляются без `marketing_consent=true`.
- **Ad blockers / privacy tools**: могут менять browser поток, но CAPI должен оставаться в diagnostics, если endpoint получает запрос и token валиден.

## 9. Что прислать для финальной проверки

Без секретов, можно маскировать значения:

1. Скрин Cloudflare **Variables and Secrets** с наличием переменных.
2. Скрин Cloudflare **Bindings** с `DB`, `META_CAPI_IDEMPOTENCY`,
   `META_CAPI_DIAGNOSTICS` и `META_CAPI_NONCE` (значения/идентификаторы можно
   замаскировать).
3. JSON ответа:
   - `POST /api/meta-diagnostics-health?write=1`
   - `GET /api/meta-diagnostics-summary?hours=24`
   - `GET /api/meta-diagnostics-coverage?hours=24`
   Во всех трёх запросах secret передаётся заголовком `x-meta-debug-secret`.
4. Ответ `/api/meta-test-event` с `fbtrace_id`.
5. Скрин Meta Events Manager → Test Events / Diagnostics / Event Match Quality.

## 10. Outbox: повторная доставка событий при сбоях Meta

Каждое server-событие перед отправкой записывается в таблицу D1 `meta_outbox` (готовое тело запроса к Graph API). Если Meta ответила ошибкой или запрос упал, запись остаётся со статусом `retry` и досылается позже с экспоненциальной задержкой (до 8 попыток, затем `dead_letter`; события старше 6 дней не досылаются — Meta не принимает их для `action_source=website`).

Очередь обрабатывается двумя путями:

- автоматически: при каждом запросе `/api/pageview` фоном досылается до 3 записей;
- вручную/по расписанию: `POST /api/meta-outbox-process?limit=25` с заголовком `x-meta-debug-secret: <META_CAPI_DEBUG_SECRET>` — ✅ внешний cron настроен 25.07.2026: Cloudflare Worker `meta-outbox-cron` дергает этот endpoint каждые 15 минут (см. `docs/CRON_META_OUTBOX_TODO.md`).

Ответ эндпоинта: `{ processed, sent, retried, dead, persistence_failed }`. При отсутствии D1, таблицы `meta_outbox` или токена endpoint отвечает `503` с `configuration_error`, а не маскирует проблему пустым успешным ответом. `persistence_failed > 0` означает, что переход состояния не удалось надёжно записать в D1 и его нельзя считать подтверждённым состоянием панели. Дедупликация повторной отправки — через `META_CAPI_IDEMPOTENCY`, сохранённый статус outbox и `event_id` (Meta дополнительно дедуплицирует на своей стороне в течение 48 часов).

Статус `sent` ставится только когда Meta вернула `events_received > 0`. Сам HTTP 2xx без этого подтверждения считается неподтверждённой попыткой и остаётся на повторную отправку. После подтверждения готовый payload удаляется из строки outbox; для событий качества сохраняется только операционный статус доставки.

## 11. Целевой / нецелевой лид из админки

Кнопки в разделе «Заявки» отправляют custom website-сигналы `QualifiedLead` и `UnqualifiedLead` только для заявок с сохранённым `marketing_consent=1`. Событие содержит хешированные match keys (`email`, `phone`, `first name`, `last name`, `external_id` при наличии), `fbp`/`fbc`, а также `original_event_data` исходного `Lead`. Бюджет, сообщение и другие свободные ответы формы в Meta не передаются.

В карточке заявки показывается постоянный статус: «в очереди», «повторная отправка», «доставлено» или «не доставлено». Зелёный статус означает, что Meta подтвердила приём, а не только что запрос был запущен.

Это custom website events, а не специализированная **Conversion Leads Integration** для Meta Instant Forms: последняя требует Meta Lead ID из формы внутри Meta. Чтобы использовать website-сигналы для отчётности или оптимизации, после проверки доставки настрой соответствующие Custom Conversions / цели в Events Manager и Ads Manager.
