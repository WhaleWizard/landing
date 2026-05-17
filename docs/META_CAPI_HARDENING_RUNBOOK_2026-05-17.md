# Meta CAPI Hardening Runbook (Cloudflare Pages/Workers) — End-to-End

Ниже — пошаговый план, чтобы закрыть критичные дыры: durable outbox, decoupled lead pipeline, подпись payload, EMQ hardening, dedup/monitoring.

---

## 0) Что будет в итоге

После внедрения у тебя будет:
1. D1 outbox-очередь для CAPI событий (без потерь при tab close / network jitter).
2. Retry worker по cron (1–5 мин) с exponential backoff.
3. Lead CAPI отправка независимо от CRM webhook.
4. HMAC + nonce защита endpoint’ов (`/api/pageview`, `/api/meta-event`, `/api/lead`).
5. Единый PII normalizer/hash модуль + EMQ telemetry.
6. Dead-letter и алерты по критичным отказам.

---

## 1) Cloudflare: что добавить в Dashboard / wrangler

## 1.1 D1

Добавь (или используй текущую `landing-prod`) новые таблицы:

```sql
CREATE TABLE IF NOT EXISTS meta_outbox (
  id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending|retry|sent|dead_letter
  attempts INTEGER NOT NULL DEFAULT 0,
  next_retry_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  last_error TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  sent_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_meta_outbox_status_next_retry ON meta_outbox(status, next_retry_at);
CREATE INDEX IF NOT EXISTS idx_meta_outbox_event ON meta_outbox(event_name, event_id);

CREATE TABLE IF NOT EXISTS meta_dead_letter (
  id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  event_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  attempts INTEGER NOT NULL,
  last_error TEXT,
  failed_at INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
```

## 1.2 KV

Нужны KV bindings:
- `META_CAPI_IDEMPOTENCY` (у тебя уже есть)
- `META_CAPI_DIAGNOSTICS` (у тебя уже есть)
- `META_CAPI_NONCE` (**новый**, для anti-replay)

## 1.3 Cron Trigger

Для Pages Functions используй отдельный Worker consumer (рекомендуется) или scheduled handler в workers-проекте.

Cron:
- `*/2 * * * *` (каждые 2 минуты)

## 1.4 Secrets / Vars

Добавь:
- `TRACKING_HMAC_SECRET` (32+ random bytes)
- `TRACKING_SIG_TTL_SEC=60`
- `META_OUTBOX_MAX_ATTEMPTS=8`
- `META_OUTBOX_BATCH_SIZE=50`
- `META_OUTBOX_BASE_BACKOFF_MS=1500`
- `META_OUTBOX_MAX_BACKOFF_MS=900000` (15 мин)

---

## 2) Файлы в репо: что добавить/изменить

## 2.1 Новый модуль outbox

Создай: `functions/_lib/meta-outbox.ts`

Минимальные функции:
- `enqueueMetaEvent(env, {event_name,event_id,payload})`
- `markOutboxSent(env, id)`
- `markOutboxRetry(env, id, attempts, next_retry_at, error)`
- `moveToDeadLetter(env, row)`
- `pullDueOutboxBatch(env, nowSec, limit)`

Статусы:
- `pending` → первая попытка
- `retry` → после фейла
- `sent` → успех
- `dead_letter` → attempts >= max

## 2.2 Новый модуль подписи

Создай: `functions/_lib/tracking-signature.ts`

Функции:
- `verifyTrackingSignature(request, env, bodyText)`
- Проверка заголовков:
  - `x-track-ts` (unix sec)
  - `x-track-nonce`
  - `x-track-signature`
- HMAC: `sha256(ts + '.' + nonce + '.' + body)`
- Проверка TTL (`TRACKING_SIG_TTL_SEC`)
- Nonce one-time через KV `META_CAPI_NONCE` (TTL 120 сек)

При fail возвращать причину: `invalid_signature|expired_timestamp|replayed_nonce|missing_headers`.

## 2.3 Единый PII модуль

Создай: `functions/_lib/meta-pii.ts`

Функции:
- `normalizeEmail`, `normalizePhone`, `normalizeName`, `normalizeLocation`
- `sha256Hex`
- `isSha256Hex`
- `hashOrValidatePrehashed`

Использовать в:
- `functions/api/pageview.ts`
- `functions/api/meta-event.ts`
- `functions/api/lead.ts`

## 2.4 Интеграция outbox в endpoints

### `functions/api/pageview.ts`
1. Прочитать raw body text.
2. Проверить подпись (`verifyTrackingSignature`).
3. Если consent=false → skip diagnostics (как сейчас).
4. Если consent=true:
   - собрать Meta payload
   - `enqueueMetaEvent(...)`
   - попытаться отправить сразу (best effort fast-path)
   - при fail оставить в очереди

### `functions/api/meta-event.ts`
Аналогично pageview:
- verify signature
- enqueue
- immediate send attempt
- retry через outbox cron

### `functions/api/lead.ts`
Изменить порядок:
1. validate + honeypot + consent check
2. **если consent=true: enqueue CAPI lead немедленно**
3. CRM webhook запускать параллельно (`waitUntil`) и не блокировать CAPI
4. diagnostics писать отдельно:
   - `lead_meta_status`
   - `lead_crm_status`

---

## 3) Scheduled retry worker

Вынеси consumer в Worker (рекомендуется):
- `workers/meta-outbox-consumer.ts`

Алгоритм:
1. `pullDueOutboxBatch(now, batchSize)` где status IN (`pending`,`retry`) и `next_retry_at <= now`.
2. Для каждой записи:
   - отправка в Meta API
   - если 2xx → `sent`
   - если transient error → attempts+1, backoff
   - если attempts >= max → dead_letter + alert
3. Backoff:
   - `delayMs = min(maxBackoff, baseBackoff * 2^attempt + jitter)`

Transient считаем:
- 408, 409, 425, 429, 5xx

---

## 4) Frontend подпись payload (куда вставить)

Файл: `src/app/consent/consent.ts`

Где отправка:
- `sendServerPageView`
- `sendServerMetaEvent`
- lead submit flow (где POST `/api/lead`)

Добавить helper:
- `buildTrackingHeaders(body: string)`
- генерировать `ts`, `nonce`, `signature`

⚠️ Важный момент: HMAC secret нельзя хранить в клиенте. Для браузера делай двухступенчато:
1. Клиент получает короткоживущий signed token с backend `/api/tracking-token`.
2. Клиент подписывает не секретом, а этим токеном/derived key (или вообще backend-proxy подпись на edge).

Проще и безопаснее:
- не подписывать на клиенте секретом,
- вместо этого использовать server-issued nonce token + server-side validation chain.

---

## 5) Диагностика и алерты

Расширь `recordMetaDiagnostics` полями:
- `lead_crm_status` (`sent|failed|skipped`)
- `lead_meta_status` (`queued|sent|failed|dead_letter`)
- `invalid_em_hash`, `invalid_ph_hash`
- `missing_fbp`, `missing_fbc`
- `outbox_attempts`, `outbox_status`

Добавь алерты:
1. Dead-letter > 0 за 15 мин = critical.
2. Lead meta sent rate drop > 30% (1h vs 24h baseline) = critical.
3. Missing fbc rate > 40% = warning.

---

## 6) Пошаговый rollout (без даунтайма)

1. Деплой миграции D1 (таблицы outbox/dead_letter).
2. Добавь `META_CAPI_NONCE` KV + env vars.
3. Задеплой backend с outbox enqueue + old direct send (dual-mode).
4. Включи cron consumer в dry-run (только лог).
5. Переключи consumer в active mode.
6. Включи signature verify сначала в monitor mode (не блокировать, только лог).
7. Через 24–48h включи hard fail 403 на invalid signature.
8. Отвязать lead webhook от CAPI и проверить diagnostics split.

---

## 7) Acceptance criteria (обязательно)

1. При выключенном интернете на клиенте события не теряются, а догружаются cron-воркером позже.
2. При падении CRM webhook, `Lead` в Meta всё равно уходит.
3. Replayed request с тем же nonce получает 403.
4. В диагностике видно отдельные статусы `lead_crm_status` и `lead_meta_status`.
5. Dead-letter всегда алертится.

---

## 8) Быстрые команды для Cloudflare (пример)

```bash
# D1 migration
wrangler d1 execute landing-prod --file=./migrations/0005_meta_outbox.sql

# KV namespace create (if needed)
wrangler kv:namespace create META_CAPI_NONCE

# Secret set
wrangler secret put TRACKING_HMAC_SECRET

# Deploy pages/worker
wrangler deploy
```

---

## 9) Что особенно важно не сломать

1. `event_id` должен оставаться одинаковым browser + server (dedup).
2. Consent gate не обходится outbox-процессом (в очередь кладём только consent=true).
3. Не клади PII raw в outbox, только уже нормализованные/хешированные поля.
4. Не блокируй пользовательский response ожиданием Meta API.

