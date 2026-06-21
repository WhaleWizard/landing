# Файл: 02_аудит_аналитики_API_SEO.md

## 1. Общий вывод
Аналитика и SEO реализованы выше среднего для landing: есть consent manager, GA4/Yandex/Meta runtime, Meta CAPI, diagnostics, sitemap, robots, canonical redirect. Главные риски: намеренный fallback consent разрешает трекинг при ошибке гео (это бизнес-решение владельца, а не баг, но требует юридического описания и мониторинга), нет Google Consent Mode v2 default/update до загрузки GA, SEO meta/JSON-LD обновляются клиентом, preview/staging sitemap без `SITE_URL` может использовать request origin, Universal Analytics не установлен (и уже исторически закрыт), нет явной offline/retry queue для лидов на клиенте.

## 2. Яндекс.Метрика / GA / GTM / Meta / TikTok

### 2.1 Загрузка аналитики
- 🟢 `ensureAnalyticsLoaded()` поддерживает direct и GTM runtime, по умолчанию direct.
- 🟢 GA4 грузится через `gtag/js`, `send_page_view:false`, IP anonymization.
- 🟢 Yandex Metrika инициализируется с `webvisor`, `clickmap`, `ecommerce:'dataLayer'`, `trackLinks`.
- 🟡 Нет Universal Analytics. Если бизнес всё ещё требует UA, это невозможно как полноценный источник после sunset; нужно мигрировать отчёты в GA4/BigQuery.
- 🟠 Google Consent Mode v2 отсутствует как `gtag('consent','default', ...)` до загрузки GA. Это критично для EEA/UK трафика и Ads modeling.

Пример:
```ts
window.dataLayer = window.dataLayer || [];
function gtag(){ window.dataLayer.push(arguments); }
gtag('consent', 'default', {
  ad_storage: 'denied',
  analytics_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  wait_for_update: 500,
});
// после выбора пользователя:
gtag('consent', 'update', { analytics_storage: 'granted' });
```

### 2.2 Consent и приватность
- 🟢 Уточнение владельца: автоматическое включение cookies/analytics при невозможности определить регион задумано специально. В аудите это больше не классифицируется как ошибка реализации; это осознанная risk-based policy, которую нужно явно описать в cookie/privacy policy, логировать как `region_unknown_auto_enabled` и регулярно проверять долю таких случаев.
- 🟢 Consent хранится с version, timestamp, expiresAt, region, categories.
- 🟢 PII для Meta advanced matching хешируется SHA-256 до хранения.
- 🟡 `requiresConsentByDefault()` возвращает `false`, то есть при отказе `/api/geo` и `ipwho.is` сайт не блокирует аналитику. С учётом уточнения владельца это intentional fallback, но для GDPR/UK/FZ-152 остаётся юридическим риском, а не техническим багом.
- 🟡 Внешний fallback `https://ipwho.is/` до согласия передаёт IP третьей стороне; нужно оценить privacy basis и добавить в policy.
- 🟡 Consent cookie — только маркер `=1`, детали в localStorage; серверные функции не могут полноценно проверить категории.

Решение зависит от выбранной политики: либо оставить текущий fallback и документировать его в cookie policy, либо включить более строгий режим для EEA/UK. Минимальный безопасный компромисс — логировать неизвестный регион, показывать быстрый баннер настроек и не передавать PII/advanced matching до явного marketing consent.

### 2.3 Фактические production-переменные Cloudflare для аналитики и SEO
- 🟢 `VITE_ANALYTICS_RUNTIME=direct` соответствует коду: GA/Yandex грузятся напрямую, а не через GTM. Поэтому риск дублирования через GTM ниже, но контейнер `GTM-T88BWXVV` всё равно нужно проверить, чтобы там не было параллельных GA/YM/Meta тегов.
- 🟢 `VITE_GA_MEASUREMENT_ID=G-ZV18R9DLVC`, `VITE_YANDEX_METRIKA_ID=108699980`, `VITE_META_PIXEL_ID=926332213606723` совпадают с дефолтами в коде; это снижает риск staging/prod mismatch.
- 🟢 `META_CAPI_API_VERSION=v25.0` явно задан; при обновлениях Meta API нужно планово проверять breaking changes.
- 🟢 `META_OUTBOX_MAX_ATTEMPTS=8`, KV `META_CAPI_DIAGNOSTICS`, `META_CAPI_IDEMPOTENCY`, `META_CAPI_NONCE` подтверждают production-контур retry/idempotency/diagnostics.
- 🟡 `TRACKING_SIGNATURE_MODE=monitor` означает, что подписи отслеживания мониторятся, но не блокируют невалидные запросы. Для production lead endpoint лучше перейти в `enforce` после периода наблюдения.
- 🟢 `SITE_URL=https://www.whalewzrd.com` закрывает замечание о sitemap origin в production. Preview/staging всё равно стоит проверять отдельно.
- 🟢 `REQUIRE_FRESH_ARTICLES=true` и `USE_D1_ARTICLES=true` повышают актуальность контента относительно JSONBin fallback.

## 3. API-конверсии и сквозная аналитика

### 3.1 Lead API
- 🟢 `/api/lead` проверяет trusted origin, подпись tracking request в enforce mode, rate limit, honeypot.
- 🟢 Нормализует и ограничивает длины полей.
- 🟢 Meta CAPI формирует `event_id` для deduplication, `fbp/fbc`, hashed email/phone/name/location, mobile/device context.
- 🟢 Есть diagnostics и outbox imports; нужно проверить фактическую очередь ниже по файлу и миграции.
- 🟡 `JSON.parse(rawBody || '{}')` без try/catch может вернуть 500 на битом JSON. Нужно отдавать 400.

Пример:
```ts
let parsed: LeadPayload;
try { parsed = JSON.parse(rawBody || '{}'); }
catch { return json({ success:false, error:'invalid_json' }, { status:400 }); }
```

### 3.2 Потери данных
- 🟠 В ContactForm нет клиентской очереди retry при offline/poor 3G. Если мобильный пользователь потерял сеть после заполнения формы, лид может потеряться.
- 🟡 Нет `navigator.sendBeacon`/Background Sync для pageview/engagement.
- 🟢 CAPI server retry реализован через `fetchMetaWithRetry` и diagnostics; production `META_OUTBOX_MAX_ATTEMPTS=8` подтверждает многократные попытки доставки в Meta.

### 3.3 Client ID / внутренний ID
- 🟢 Есть `external_id`, session_id, first/last touch, UTM/gclid/wbraid/gbraid/yclid.
- 🟡 Нет явной связки GA4 `client_id`/Yandex `clientID` с CRM lead_id. Нужно добавлять `gtag('get', GA_ID, 'client_id', cb)` и `ym(id,'getClientID', cb)`.

## 4. SEO-фокус

### 4.1 Техническое SEO
- 🟢 `robots.txt`: разрешает всё, закрывает `/admin`, указывает sitemap.
- 🟢 `_redirects`: non-www -> www 301, SPA fallback.
- 🟡 `_redirects` fallback `/* /index.html 200` может отдавать 200 для несуществующих URL на edge fallback, если Cloudflare Function/React 404 не сработает для ботов. Нужны реальные проверки status code.
- 🟢 sitemap в production должен генерироваться с canonical origin, потому что `SITE_URL=https://www.whalewzrd.com` задан в Cloudflare. 🟡 Для preview/staging без SITE_URL риск request-origin sitemap остаётся.
- 🟡 Нет hreflang для EN/other locales; SEO.tsx ставит только `ru` и `x-default` на тот же URL.

### 4.2 Meta-теги
- 🟢 Базовые title/description/OG/Twitter/canonical есть в HTML.
- 🟠 Пер-страничные meta теги выставляются в `useEffect`, то есть после hydration. Боты и social scrapers могут увидеть дефолтные meta.
- 🟡 Description слишком длинный для сниппета; нужно уникализировать по маршрутам.
- 🟡 Не найдено централизованной проверки H1 uniqueness.

Решение: генерировать статические HTML для ключевых маршрутов с server-side meta или использовать SSR/SSG.

### 4.3 Микроразметка
- 🟢 SEO.tsx добавляет Organization/ProfessionalService и WebSite SearchAction JSON-LD.
- 🟡 Для FAQ, BreadcrumbList, Article, Service/Product schema нужно проверить/добавить per-route JSON-LD.
- 🟠 JSON-LD инжектится клиентом, что слабее для краулеров без JS.

### 4.4 Индексация JS-контента
- 🟠 SPA зависит от JS для контента маршрутов. Есть `generate-pages.js`, но нужно проверить содержимое generated HTML: есть ли полноценный текст и meta или только root.
- 🟡 Blog/articles берутся из JSONBin fallback; сбои JSONBin при build уже наблюдались, используется local fallback. Нужно мониторить freshness.

### 4.5 Core Web Vitals
- 🟠 Initial JS+vendor около 174 kB gzip плюс CSS 27.67 kB gzip и motion/admin chunks. Для мобильных INP риск.
- 🟡 Hero image external `i.ibb.co`; CDN/resize/cache не под контролем сайта.
- 🟡 Нет field RUM для LCP/INP/CLS в коде.

## 5. Поведенческие факторы и события
- 🟢 Form view, form start, engaged view, lead events есть.
- 🟡 Нет явной глубины скролла 25/50/75/90 и CTA click taxonomy во всех секциях.
- 🟡 Yandex ecommerce включён через dataLayer, но e-commerce объекты для сайта услуг не подтверждены.

## 6. Утечки данных
- 🟢 В CAPI бюджет и free-text problem не отправляются в custom_data.
- 🟡 `page_url`, UTM и referrer могут содержать email/phone в query от внешних кампаний. Нужен sanitizer query params перед отправкой в GA/Yandex/Meta.
- 🟡 `console.error(error)` на клиенте может вывести payload/PII при расширении ошибок.

## 7. Мобильная версия
- 🟢 В CAPI передаются `screen_width/height`, `viewport_width/height`, DPR, platform, `Sec-CH-UA-Mobile`.
- 🟢 Yandex Webvisor включён, но нужно проверить, что cookie consent разрешает запись сессий на mobile.
- 🟠 Consent banner lazy-loaded; важно проверить, не стартуют GA/YM до выбора на EEA mobile при медленном 3G.
- 🟡 Нет отдельных mobile funnel events: keyboard open abandonment, tap CTA, click-to-whatsapp/telegram, orientation.
- 🟡 Mobile SEO: нет AMP/MIP; это допустимо, но нужно явно указать в Search Console. Interstitial cookie banner должен не перекрывать основной контент полностью на 320px.

## 8. Сводная таблица приоритетов
| Приоритет | Критичность | Проблема | Где | Решение |
|---|---|---|---|---|
| P0 | 🔴 Критичный | Нет Consent Mode v2 default/update | consent.ts | Добавить consent calls до GA/GTM |
| P1 | 🟡 Средний | Гео fallback разрешает аналитику намеренно | consent.ts/legal | Документировать policy, логировать unknown-region, не отправлять PII до marketing consent |
| P1 | 🟠 Высокий | Tracking signature пока monitor | Cloudflare env/API | После диагностики перевести `TRACKING_SIGNATURE_MODE` в `enforce` |
| P2 | 🟠 Высокий | Пер-страничный SEO только client-side | SEO.tsx | SSR/SSG meta/JSON-LD |
| P3 | 🟠 Высокий | Нет client retry queue для лидов | ContactForm | IndexedDB/localStorage queue + retry |
| P4 | 🟡 Средний | Нет GA/YM client_id в CRM | consent + lead | Получать и отправлять IDs |
