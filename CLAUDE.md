# CLAUDE.md — Landing (whalewzrd.com)

Правила для Claude Code при работе в этом репозитории.

## Что это

«Whale Wizard» (whalewzrd.com) — русскоязычный сайт performance-маркетолога: лендинги услуг (Google Ads / Meta Ads / консультации), блог и кейсы на CMS, лид-формы, калькуляторы бюджета и ROI, глоссарий/FAQ, юридические страницы, админка. Фронтенд — React SPA, бэкенд — Cloudflare Pages Functions. Исходно сгенерирован через Figma Make (`ATTRIBUTIONS.md`).

Git remote: `github.com/WhaleWizard/landing`, ветка по умолчанию `main`.

## Команды

Пакетный менеджер: **pnpm** — источник истины по локфайлу (`pnpm-lock.yaml`). `package-lock.json` тоже закоммичен — это известная несогласованность; не давай им расходиться дальше, для установки используй `pnpm install`.

```
pnpm dev                                 # dev-сервер vite
npm run build                            # fetch:articles && vite build && generate:pages — реальная production-сборка
npm run test                             # алиас npm run build — юнит-тестов нет
npm run check                            # test:meta-capi && build — самая полная проверка перед выкладкой
npm run test:meta-capi                   # смоук-тесты Meta CAPI (проверяют строки в исходниках, не поведение)
npm run fetch:articles                   # тянет статьи в data/articles.build.json перед сборкой
npm run generate:pages                   # статические SEO-страницы в dist/ после vite build
npx -p typescript tsc -p tsconfig.functions.json --noEmit   # проверка типов functions/ (typescript не в devDeps)
```

Чего в проекте НЕТ (не предполагать): lint/ESLint, корневого tsconfig.json (типы проверяются только в functions/), CI (.github/workflows), мониторинга ошибок (Sentry). Поэтому `npm run build` — основная проверка любой правки; для всего, что касается трекинга (`_lib/meta-*`, `api/meta-*`, `api/lead`, `api/pageview`, consent) — обязательно ещё `npm run test:meta-capi`.

## Архитектура

### SPA (src/) и edge-бэкенд (functions/)

- `src/app/` — React 18 + React Router 7. `routes.tsx` — дерево роутов, всё кроме Home лениво через `React.lazy`. `RouteErrorBoundary` ловит устаревшие чанки после деплоя и перезагружает страницу один раз.
  - `components/` — фичи: Hero, Navbar, ContactForm, LandingForm, калькуляторы, Blog, Cases, ArticleEditor (Tiptap), SEO.tsx, cookie/ (баннер согласия), legal/.
  - `components/ui/` — shadcn/ui-примитивы, считать вендорными: не переписывать, следовать их паттернам.
  - `pages/` — по одной на роут; `BlogPage` обслуживает и /blog, и /cases.
  - `consent/consent.ts` — ядро трекинга: согласие, загрузка пикселей, track*-функции, сбор контекста для CAPI.
  - `utils/` — sanitizeHtml (DOMPurify для CMS-статей), phoneCountry (коды стран + buildFullPhone), leadRetryQueue (офлайн-очередь заявок в localStorage).
- `functions/` — Cloudflare Pages Functions, роутинг по файлам. `_middleware.ts` на каждом запросе: 301 с whalewzrd.com на www + security-заголовки/CSP. `functions/_lib/` — общая серверная логика (не роутится): articles, auth, d1, jsonbin, meta-capi, meta-diagnostics, meta-outbox, meta-pii, rate-limit, sanitize, seo, tracking-signature, cache, http, url-sanitize, types (контракт Env).
- `wrangler.toml` нет — все биндинги (D1 `DB`, R2 `BUCKET`, KV, секреты) настраиваются в Cloudflare Pages. Полный список — в `README.md` и `.env.example`.

### Статьи: два источника с fallback-цепочкой

Чтение (`_lib/articles.ts`): D1 (если `USE_D1_ARTICLES=true`) → JSONBin → статический `articles.seed.json` из сборки. `REQUIRE_FRESH_ARTICLES=true` валит сборку вместо устаревшего контента; `ALLOW_FALLBACK_BUILD=true` — аварийный обход. Черновики и будущие `publishedAt` отфильтровываются из публичных выдач. Миграции D1 — нумерованные файлы в `migrations/`, раннера нет — применять вручную по порядку.

### SEO: три уровня

- `scripts/generate-pages.js` пре-рендерит статический HTML для роутов из `scripts/config.js` (`STATIC_ROUTES`) — при добавлении индексируемого роута синхронизируй этот список с `routes.tsx`.
- `functions/blog/[slug].ts` и `functions/cases/[slug].ts` отдают ботам SEO-HTML статей на лету. Принадлежность к кейсам определяет ТОЛЬКО `isCaseArticle()` из `_lib/seo.ts` — не сравнивать категорию строкой.
- `sitemap.xml` и `feed.xml` генерируются динамически из живого хранилища статей.

### Трекинг: пиксели + серверный Meta CAPI

Клиентские пиксели (GTM, GA4, Метрика, Meta, TikTok) + серверный CAPI (`api/meta-event`, `api/lead`, `api/pageview`), дедупликация с пикселем через общий `event_id`. Версия Graph API — `META_CAPI_API_VERSION` (сейчас v25.0, код менять не нужно при апдейте версии).

Недоставленные события попадают в D1-очередь `meta_outbox` (хранится готовое тело запроса к Graph API) и досылаются: фоном при каждом `/api/pageview` и через `POST /api/meta-outbox-process` (секрет в заголовке `x-meta-debug-secret`) для внешнего cron. «sent» ставится только при успешном ответе Meta. Подробности — `docs/META_CAPI_CLOUDFLARE_SETUP.md`.

Диагностика — `api/meta-diagnostics-*` (KV `META_CAPI_DIAGNOSTICS` / `META_CAPI_IDEMPOTENCY` / `META_CAPI_NONCE` + D1). Серверные события уходят только при `marketing_consent=true` — не ослаблять.

### Админка

`/admin` — клиентская CMS статей (Tiptap), бэкенд `functions/api/admin/*`. Аутентификация — общий `ADMIN_PASSWORD` (`_lib/auth.ts`), передаётся в теле/заголовке, НИКОГДА в query string. Загрузки в R2: лимит 15 МБ, белый список MIME (JPEG/PNG/WebP/GIF/AVIF/PDF/ZIP/DOCX/XLSX/PPTX); SVG/HTML/JS/XML заблокированы намеренно против stored-XSS — не ослаблять. После сохранения статей кэш чистится локально + глобально через Cloudflare API, если заданы `CF_ZONE_ID` и `CF_CACHE_PURGE_TOKEN`.

## Грабли

- ВАЖНО: CSP собирается в `_middleware.ts` (`buildCsp()`). Любой новый сторонний скрипт/пиксель/embed требует добавления в `script-src`/`connect-src`/`frame-src` там же, иначе он молча не заработает только в production. Самая частая причина «в dev работает, в prod нет».
- HTML статей всегда через санитайзеры; их ТРИ и списки должны совпадать: `functions/_lib/sanitize.ts`, `src/app/utils/sanitizeHtml.ts`, конфиг в `scripts/generate-pages.js`.
- Алиас `@/` → `src/` (vite.config.ts). `figma:asset/...` — наследие Figma Make; для новых ассетов использовать обычные импорты.
- Смоук-тесты test:meta-capi проверяют наличие точных строк в исходниках — при рефакторинге трекинга они могут упасть на переименовании; это сигнал обновить и код, и тест осознанно.

## Известные открытые проблемы

- Нет field RUM (Core Web Vitals никуда не отправляются).
- Нет документированной схемы dataLayer-событий — имена живут только в коде.
- `areaServed` заявляет RU/US/AE/TR/EU без hreflang и локализованного контента.
- Два локфайла (pnpm-lock.yaml + package-lock.json).

## Правило документации

Этот файл — источник истины по проекту. `AGENTS.md` — его зеркало для других инструментов: меняешь один — синхронизируй второй. При значимом изменении структуры предложи обновление; не переписывай без подтверждения.
