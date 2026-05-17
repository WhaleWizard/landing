# Meta Conversions API + Cloudflare Pages setup

Дата обновления: 2026-05-17.

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
| `SITE_URL` | Plaintext | `https://whalewzrd.com` | Production URL для fallback `event_source_url` и тестов. |

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
3. На эту D1 базу примени миграции:
   - `migrations/0002_meta_capi_diagnostics.sql`
   - `migrations/0003_meta_capi_diagnostics_quality.sql`
   - `migrations/0004_meta_capi_diagnostics_enrichment.sql`

### KV bindings

Создай два KV namespace и привяжи их:

| Binding variable name | Для чего |
| --- | --- |
| `META_CAPI_IDEMPOTENCY` | Idempotency / защита от повторной server отправки того же `event_name + event_id`. |
| `META_CAPI_DIAGNOSTICS` | Резервная/быстрая диагностика CAPI статусов. |

## 4. Обязательный redeploy

После изменения Variables/Secrets/Bindings сделай новый deploy:

1. Cloudflare Pages → Deployments.
2. Нажми **Retry deployment** или запушь новый commit.
3. Убедись, что production deployment завершился после добавления переменных и bindings.

Без redeploy Pages Functions могут не видеть новые env/bindings.

## 5. Проверка, что Cloudflare всё видит

Открой в браузере, подставив свой secret:

```text
https://whalewzrd.com/api/meta-diagnostics-health?secret=YOUR_META_CAPI_DEBUG_SECRET&write=1
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
curl -X POST 'https://whalewzrd.com/api/meta-test-event?secret=YOUR_META_CAPI_DEBUG_SECRET' \
  -H 'Content-Type: application/json' \
  -d '{"event_name":"all","page_url":"https://whalewzrd.com/?meta_capi_test=1"}'
```

Успешный ответ должен содержать:

- `success: true`
- `status: 200`
- `meta.events_received` больше 0
- `meta.fbtrace_id`

После этого в Meta → Test Events должны появиться server events.

## 7. Проверка реальных событий сайта

1. Открой сайт в чистом браузере / incognito.
2. Прими marketing cookies.
3. Открой несколько страниц.
4. Открой форму, начни ввод, отправь тестовую заявку.
5. Проверь диагностику:

```text
https://whalewzrd.com/api/meta-diagnostics-summary?hours=24&secret=YOUR_META_CAPI_DEBUG_SECRET
```

Смотри:

- `sent` по `PageView`, `ViewContent`, `LeadFormView`, `FormStart`, `Contact`, `Lead`.
- `events_received` больше 0.
- `fbtrace_id` в latest events.
- `failed` и `error_message` — если есть ошибки Meta.
- `marketing_consent_rate` — должен быть ожидаемо высоким для тестов с accepted cookies.

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
2. Скрин Cloudflare **Bindings** с `DB`, `META_CAPI_IDEMPOTENCY`, `META_CAPI_DIAGNOSTICS`.
3. JSON ответа:
   - `/api/meta-diagnostics-health?secret=...&write=1`
   - `/api/meta-diagnostics-summary?hours=24&secret=...`
   - `/api/meta-diagnostics-coverage?hours=24&secret=...`
4. Ответ `/api/meta-test-event` с `fbtrace_id`.
5. Скрин Meta Events Manager → Test Events / Diagnostics / Event Match Quality.
