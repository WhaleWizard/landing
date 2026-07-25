# Крон для очереди Meta CAPI (meta-outbox) — НАСТРОЕН

Статус: **работает с 25.07.2026**. Проверено вручную: `meta-outbox-process: 200 {"success":true,...}`.

## Что настроено

Cloudflare Worker **`meta-outbox-cron`** (аккаунт shoshinruslan97) каждые 15 минут
(`*/15 * * * *`, запуски в :00/:15/:30/:45 UTC) дергает
`POST https://www.whalewzrd.com/api/meta-outbox-process?limit=25`
с заголовком `x-meta-debug-secret` из секрета воркера `META_CAPI_DEBUG_SECRET`.

Зачем: недоставленные события Meta (заявки, QualifiedLead) лежат в очереди `meta_outbox`.
Без крона очередь разбиралась только при заходе посетителя (`/api/pageview`) — ночью без
трафика события ждали часами. Теперь максимум 15 минут.

Дублей крон не создаёт: атомарный claim (`sending`), `wasMetaEventAlreadySent` и дедуп Meta
по `event_id`.

## Код воркера (актуальный)

```js
export default {
  async scheduled(event, env, ctx) {
    const res = await fetch('https://www.whalewzrd.com/api/meta-outbox-process?limit=25', {
      method: 'POST',
      headers: { 'x-meta-debug-secret': (env.META_CAPI_DEBUG_SECRET || '').trim() },
    });
    console.log('meta-outbox-process:', res.status, (await res.text()).slice(0, 300));
  },
  async fetch() {
    return new Response('meta-outbox-cron работает по расписанию.', {
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  },
};
```

## Грабли, на которые уже наступили

- **Невидимый символ в секрете.** При вставке значения секрета в воркер в конец прилип
  неразрывный пробел (`\xc2\xa0`) — сайт отвечал 403, а в логах воркера появлялся warn
  «contains non-ASCII characters». Поэтому в коде стоит `.trim()` — не убирать.
- Логи воркера: вкладка **Observability** (не «Logs»). Запись запуска по расписанию имеет
  `eventType: cron`; записи `GET …` — это просто открытия страницы воркера браузером.
- Мгновенная проверка без ожидания 15 минут: Edit code → вкладка **Schedule** →
  **Trigger scheduled event** → строка `meta-outbox-process: <status>` в CONSOLE.

## Если понадобится сменить секрет

Значение должно быть одинаковым в двух местах:
1. Cloudflare Pages (сайт) → Settings → Variables and Secrets → `META_CAPI_DEBUG_SECRET`,
   затем **Retry deployment** последнего деплоя (иначе сайт не увидит новое значение);
2. Worker `meta-outbox-cron` → Settings → Variables and Secrets → `META_CAPI_DEBUG_SECRET`.

Проверка после смены — Trigger scheduled event (см. выше): 200 = ок, 403 = значения разные.
