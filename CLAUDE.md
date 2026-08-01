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

Чего в проекте НЕТ (не предполагать): lint/ESLint, корневого tsconfig.json (типы проверяются только в functions/), CI (.github/workflows), мониторинга ошибок (Sentry). Поэтому `npm run build` — основная проверка любой правки; для всего, что касается трекинга (`_lib/meta-*`, `_lib/leads`, `_lib/lead-quality`, `api/meta-*`, `api/lead`, `api/pageview`, consent) — обязательно ещё `npm run test:meta-capi`.

## Архитектура

### SPA (src/) и edge-бэкенд (functions/)

- `src/app/` — React 18 + React Router 7. `routes.tsx` — дерево роутов, всё кроме Home лениво через `React.lazy`. `RouteErrorBoundary` ловит устаревшие чанки после деплоя и перезагружает страницу один раз.
  - `components/` — фичи: Hero, Navbar, ContactForm, LandingForm, калькуляторы, Blog, Cases, ArticleEditor (блочный редактор), admin/ (все разделы админки), SEO.tsx, cookie/ (баннер согласия), legal/.
  - `components/ui/` — shadcn/ui-примитивы, считать вендорными: не переписывать, следовать их паттернам.
  - `pages/` — по одной на роут; `BlogPage` обслуживает и /blog, и /cases.
  - `consent/consent.ts` — ядро трекинга: согласие, загрузка пикселей, track*-функции, сбор контекста для CAPI.
  - `utils/` — sanitizeHtml (DOMPurify для CMS-статей), phoneCountry (коды стран + buildFullPhone), leadRetryQueue (офлайн-очередь заявок в localStorage).
- `functions/` — Cloudflare Pages Functions, роутинг по файлам. `_middleware.ts` на каждом запросе: 301 с whalewzrd.com на www + security-заголовки/CSP. `functions/_lib/` — общая серверная логика (не роутится): articles, auth, d1, jsonbin, leads (заявки + статистика посещений), lead-quality (события качества лида в Meta), meta-capi, meta-diagnostics, meta-outbox, meta-pii, rate-limit, sanitize, seo, tracking-signature, cache, http, url-sanitize, types (контракт Env).
- `wrangler.toml` нет — все биндинги (D1 `DB`, R2 `BUCKET`, KV, секреты) настраиваются в Cloudflare Pages. Полный список — в `README.md` и `.env.example`.

### Статьи: два источника с fallback-цепочкой

Чтение (`_lib/articles.ts`): D1 (если `USE_D1_ARTICLES=true`) → JSONBin → статический `articles.seed.json` из сборки. `REQUIRE_FRESH_ARTICLES=true` валит сборку вместо устаревшего контента; `ALLOW_FALLBACK_BUILD=true` — аварийный обход. Черновики и будущие `publishedAt` отфильтровываются из публичных выдач. Миграции D1 — нумерованные файлы в `migrations/`, раннера нет — применять вручную по порядку.

### SEO: три уровня

- `scripts/generate-pages.js` пре-рендерит статический HTML для роутов из `scripts/config.js` (`STATIC_ROUTES`) — при добавлении индексируемого роута синхронизируй этот список с `routes.tsx`.
- `functions/blog/[slug].ts` и `functions/cases/[slug].ts` отдают ботам SEO-HTML статей на лету. Принадлежность к кейсам определяет ТОЛЬКО `isCaseArticle()` из `_lib/seo.ts` — не сравнивать категорию строкой.
- `sitemap.xml` и `feed.xml` генерируются динамически из живого хранилища статей.

### Трекинг: пиксели + серверный Meta CAPI

Meta CAPI и всё, что связано с доставкой и качеством событий Meta, — неприкосновенный приоритет проекта. Любые изменения сайта должны сохранять или улучшать трекинг: передавать для каждого реального события максимум полезных и разрешённых параметров, которые действительно доступны, но не собирать лишние данные, не придумывать сигналы и не отправлять запрещённые чувствительные категории. Обязательны согласие пользователя, корректное хеширование PII, общий `event_id` для дедупликации Pixel/CAPI, outbox-досылка и честная диагностика фактических ответов Meta. Для любых правок трекинга запускать `npm run test:meta-capi` и production-сборку; фактическую доставку после выкладки дополнительно проверять в диагностике сайта и Meta Events Manager.

Клиентские пиксели (GTM, GA4, Метрика, Meta, TikTok) + серверный CAPI (`api/meta-event`, `api/lead`, `api/pageview`), дедупликация с пикселем через общий `event_id`. Версия Graph API — `META_CAPI_API_VERSION` (сейчас v25.0, код менять не нужно при апдейте версии).

Недоставленные события попадают в D1-очередь `meta_outbox` (хранится готовое тело запроса к Graph API) и досылаются: фоном при каждом `/api/pageview` и через `POST /api/meta-outbox-process` (секрет в заголовке `x-meta-debug-secret`) для внешнего cron. «sent» ставится только при успешном ответе Meta. Подробности — `docs/META_CAPI_CLOUDFLARE_SETUP.md`.

Диагностика — `api/meta-diagnostics-*` (KV `META_CAPI_DIAGNOSTICS` / `META_CAPI_IDEMPOTENCY` / `META_CAPI_NONCE` + D1). Серверные события уходят только при `marketing_consent=true` — не ослаблять.

### Заявки и первичная статистика

`/api/lead`: заявка валидируется → пишется в D1 `leads` (`_lib/leads.ts`; дедупликация по email/телефону/telegram — повторная заявка поднимает существующую со счётчиком, а не создаёт дубль) → уведомление в Telegram напрямую через Bot API (секреты `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID`; если не заданы — fallback на старый Google Apps Script). `storeLead` определяет применённые миграции через PRAGMA и работает при любом их наборе. Признаки формы `form_id`/`form_variant` сохраняются с миграции 0022 — без неё разрезы «Форма» и «Вариант формы» в воронке отключаются, а не показывают нули.

Кнопки «целевой/нецелевой» в админке шлют в Meta CAPI события `QualifiedLead`/`UnqualifiedLead` (`_lib/lead-quality.ts`): только при marketing_consent, сохранённом с заявкой; PII — SHA-256 хеши + fbp/fbc; outbox-досылка и дедупликация по `event_id`. Consent-гейт не ослаблять.

`/api/pageview` дополнительно пишет агрегаты посещаемости в D1 (`page_stats_daily`, `visitor_hashes_daily` — суточный хеш IP+UA+соль, сырые IP/UA не хранятся, хеши чистятся через 90 дней). Дашборд админки читает их из `api/admin/stats`.

### Админка

`/admin` — SPA с разделами Сегодня / Планер / Воронка / Meta CAPI / Скорость / Статьи / Кейсы / Тексты сайта / Заявки / Медиатека / Проверка (компоненты в `src/app/components/admin/`), бэкенд `functions/api/admin/*` (articles, article-versions, upload, leads, crm-leads, lead-crm, crm-analytics, lead-trash, attribution, ad-spend, media, stats, today, planner, health, meta-center, performance, site-sections). Аутентификация — общий `ADMIN_PASSWORD` (`_lib/auth.ts`), передаётся в теле/заголовке `X-Admin-Password`, НИКОГДА в query string. Загрузки в R2: лимит 15 МБ, белый список MIME (JPEG/PNG/WebP/GIF/AVIF/PDF/ZIP/DOCX/XLSX/PPTX); SVG/HTML/JS/XML заблокированы намеренно против stored-XSS — не ослаблять. После сохранения статей кэш чистится локально + глобально через Cloudflare API, если заданы `CF_ZONE_ID` и `CF_CACHE_PURGE_TOKEN`. Настройка разделов v2 — `docs/ADMIN_SETUP_V2.md`.

**Воронка** (`AdminAttribution.tsx` + `api/admin/attribution.ts`): ступени с конверсиями, динамика по дням, сравнение с прошлым периодом, сортируемая таблица и выгрузка CSV. Денежные показатели (цена лида, цена целевого, ROMI) считаются только по вручную введённым расходам в таблице `ad_spend` (миграция 0023, `api/admin/ad-spend.ts`) — расходы, доход и окупаемость никогда не подставляются без источника, а разные валюты не суммируются, потому что курсов в системе нет.

**CRM** (`AdminLeads.tsx`): три режима — доска (`CrmBoard.tsx`, смена этапа перетаскиванием или стрелками на карточке, оптимистичное обновление с откатом при отказе сервера), список и аналитика (`CrmAnalytics.tsx` + `api/admin/crm-analytics.ts`). Выбранный режим хранится в localStorage.

**Медиатека** (`AdminMedia.tsx`): листает и меняет только префикс `uploads/`. Папки живут в ключе объекта — `uploads/<папка>/<дата>/<файл>`; старые загрузки `uploads/<дата>/<файл>` считаются файлами без папки (`_lib/media-folders.ts`). Пустая папка существует как объект-метка `.keep`. Перенос файла — это copy+delete в R2, то есть смена публичной ссылки, поэтому файлы, на которые ссылаются публикации, нельзя ни переносить, ни удалять.

## Грабли

- ВАЖНО: CSP собирается в `_middleware.ts` (`buildCsp()`). Любой новый сторонний скрипт/пиксель/embed требует добавления в `script-src`/`connect-src`/`frame-src` там же, иначе он молча не заработает только в production. Самая частая причина «в dev работает, в prod нет».
- HTML статей всегда через санитайзеры; их ТРИ и списки должны совпадать: `functions/_lib/sanitize.ts`, `src/app/utils/sanitizeHtml.ts`, конфиг в `scripts/generate-pages.js`.
- Алиас `@/` → `src/` (vite.config.ts). `figma:asset/...` — наследие Figma Make; для новых ассетов использовать обычные импорты.
- Смоук-тесты test:meta-capi проверяют наличие точных строк в исходниках — при рефакторинге трекинга они могут упасть на переименовании; это сигнал обновить и код, и тест осознанно.
- Код в статьях — только через блок «Код» редактора (содержимое экранируется). Вставка кода в «HTML (fallback)» молча вырежется санитайзером (`<script>` и теги удаляются, остаются пустые рамки).

## Качество интерфейса

Все новые и изменённые экраны проходят обязательный mobile-first UI quality gate из `docs/UI_QUALITY_CHECKLIST.md`. Проверять нужно не только общий макет, но и микродетали и открытые состояния: списки, поля, попапы, фокус, ошибки, disabled/loading, overlay/z-index, touch targets и адаптивность от 320 px. Публичные системные `<select>` и стрелки числовых полей, выбивающиеся из дизайна, не считаются готовым UI.

## Известные открытые проблемы

- Нет field RUM (Core Web Vitals никуда не отправляются).
- Нет документированной схемы dataLayer-событий — имена живут только в коде.
- `areaServed` заявляет RU/US/AE/TR/EU без hreflang и локализованного контента.
- Два локфайла (pnpm-lock.yaml + package-lock.json).

## Автономность и разрешения

Пользовательская команда на изменение, запуск или выкладку считается достаточным разрешением на все обычные действия внутри указанной задачи. Не задавать промежуточные вопросы и не просить отдельное подтверждение для локального редактирования, запуска или остановки dev-сервера, установки уже объявленных зависимостей, сборки, тестов, typecheck, `git add`, `git commit`, синхронизации ветки, `git push` и штатного деплоя.

- «Запусти localhost» или «запусти локальный сервер» — сразу запустить `pnpm dev` (либо подходящую команду проекта) в фоне, проверить HTTP-ответ и вернуть рабочий URL. Не спрашивать разрешение на запуск или открытие localhost.
- «Деплой в main» или «задеплой в main» — это явное разрешение проверить изменения, выполнить необходимые build/test, добавить относящиеся к задаче файлы, создать commit, синхронизировать `main`, отправить изменения в `origin/main` и проверить штатный production deploy. Не спрашивать отдельное подтверждение на каждом шаге.
- Если действие названо прямо (`commit`, `push`, `deploy`, удаление точно указанного объекта), считать его подтверждённым в указанном scope.
- Вопрос задавать только при объективной невозможности продолжить: отсутствует критически важный секрет или доступ, обнаружен конфликт чужих изменений, цель реально неоднозначна либо действие затрагивает данные или системы вне обозначенного scope.

## Правило документации

Этот файл — источник истины по проекту. `AGENTS.md` — его зеркало для других инструментов: меняешь один — синхронизируй второй. При значимом изменении структуры предложи обновление; не переписывай без подтверждения.
