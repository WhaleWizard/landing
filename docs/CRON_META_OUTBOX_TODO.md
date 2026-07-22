# TODO: крон для очереди Meta CAPI (meta-outbox)

Статус: **не настроен** (обсуждали 17.07.2026, отложено). Не срочно — страховка, а не необходимость.

## Зачем

Недоставленные события Meta (заявки, QualifiedLead) складываются в очередь `meta_outbox` и досылаются.
Сейчас очередь разбирается **только при заходе посетителя** на любую страницу (фоном в `/api/pageview`)
плюс вручную кнопкой в Meta-центре админки. Если событие застряло ночью без трафика — долетит до Meta
с опозданием на часы. Крон пингует очередь по расписанию и убирает эту задержку.

Дублей крон НЕ создаёт: claim записи атомарным UPDATE в `sending`, проверка `wasMetaEventAlreadySent`
по `event_id`, плюс дедуп на стороне Meta по тому же `event_id`. Крон только запускает обработку,
событий сам не порождает.

Реально ошибок доставки не было с середины мая — очередь почти всегда пустая. Поэтому и отложили.

## Эндпоинт

`POST https://www.whalewzrd.com/api/meta-outbox-process?limit=25`
Заголовок: `x-meta-debug-secret: <META_CAPI_DEBUG_SECRET>` (тот же секрет, что задан в Cloudflare для сайта).
Метод строго POST, иначе 405. Неверный секрет → 403.

## Вариант, который выбрали: Cloudflare Cron Trigger (без сторонних сервисов)

Бесплатно, лимит с запасом (нужно ~96 запусков/день при 100 000 бесплатных).

1. dash.cloudflare.com → Workers & Pages → Create → Create Worker → имя `meta-outbox-cron` → Deploy.
2. Edit code → вставить код ниже → Deploy.
3. Settings → Variables and Secrets → Add → Secret `META_CAPI_DEBUG_SECRET` = значение секрета сайта.
4. Settings → Triggers → Cron Triggers → Add → выражение `*/15 * * * *` (каждые 15 минут).
5. Проверка: через 15-20 мин вкладка Logs воркера → должны быть записи со статусом 200. 403 = секрет не совпал.

```js
export default {
  async scheduled(event, env, ctx) {
    const res = await fetch('https://www.whalewzrd.com/api/meta-outbox-process?limit=25', {
      method: 'POST',
      headers: { 'x-meta-debug-secret': env.META_CAPI_DEBUG_SECRET },
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

## Альтернатива (отклонена): сторонний пингер cron-job.org

Пользователь не хочет сторонние сервисы. Оставлено для справки: тот же POST-запрос с заголовком,
расписание Every 15 minutes.

## Если секрет `META_CAPI_DEBUG_SECRET` потерян

Cloudflare не показывает значения секретов обратно. Если не найти в менеджере паролей —
задать новое значение в двух местах (переменная сайта в Cloudflare Pages + секрет воркера),
значения должны совпадать. Провести пользователя пошагово.
