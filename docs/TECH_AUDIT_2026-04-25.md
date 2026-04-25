# Технический аудит проекта Whale Wzrd (2026-04-25)

## 1) Общее описание
- Тип: маркетинговый лендинг/сервисный сайт консультанта по performance-рекламе.
- Функции: презентация услуг, блог, FAQ, словарь терминов, калькуляторы, форма лидогенерации.
- Цель: приводить лиды в консультацию и давать контент для SEO/GEO/AEO.

## 2) Стек
- Frontend: React 18 + React Router 7 + Tailwind CSS v4 + Motion + Radix UI.
- Build: Vite 6.
- Backend: Cloudflare Pages Functions (edge-функции в `functions/`).
- Контент: JSONBin (основной источник статей) + локальные fallback (`data/articles.local.json`, `public/articles.seed.json`).
- Редактор контента: встроенная админка (`/admin`) на клиенте + API для сохранения.

## 3) Структура репозитория (по верхнему уровню)
- `src/` — SPA-клиент.
  - `src/app/pages` — страницы роутера.
  - `src/app/components` — секционные и UI-компоненты.
  - `src/app/context` — контекст статей.
  - `src/app/consent` — cookie/аналитика/трекеры.
  - `src/app/utils` — утилиты (например sanitize HTML).
- `functions/` — edge API/SEO endpoints для Cloudflare Pages.
  - `functions/api/*` — JSON API (статьи, админ, лиды, geo, health).
  - `functions/_lib/*` — общие функции (jsonbin, seo, cache, auth, sanitize).
  - `functions/blog/[slug].ts` — SSR-like HTML для ботов.
  - `functions/sitemap.xml.ts`, `functions/feed.xml.ts` — SEO фиды.
- `scripts/` — сборочные/контентные скрипты (fetch и prerender).
- `public/` — статические файлы (`robots.txt`, `_redirects`, `articles.seed.json`, `llms.txt`).
- `data/` — локальный fallback-контент.
- `docs/` — отчёты и аудиты.

## 4) Роутинг и рендеринг
- Клиентский роутинг: `createBrowserRouter`.
- Страницы: `/`, `/calculator`, `/roi-calculator`, `/thank-you`, `/blog`, `/blog/:slug`, `/admin`, `/privacy-policy`, `/offer`, `/cookie-policy`, `/faq`, `/marketing-glossary`.
- Модель рендеринга:
  - Для пользователя: SPA/CSR + lazy-loaded routes.
  - Для SEO-ботов: edge-рендер HTML по `/blog/:slug`.
  - На сборке: дополнительно генерируются статические HTML-страницы скриптом `generate-pages.js`.

## 5) Контент и статьи
- Формат статьи: JSON-объект (slug, title, category, description, content HTML, image, SEO-поля, tags, summary, keyTakeaways, faq).
- Основной источник: JSONBin (через edge API и через build-скрипты).
- Fallback-цепочка:
  - API: JSONBin -> `articles.seed.json`.
  - Клиент: `/api/articles` -> localStorage backup -> `/articles.seed.json` -> public JSONBin.
- Рендер:
  - Список/детальная страница в React.
  - HTML-контент проходит sanitize перед `dangerouslySetInnerHTML`.
- Добавление новой статьи:
  1. Открыть `/admin`.
  2. Авторизоваться паролем (`ADMIN_PASSWORD`).
  3. Создать/редактировать карточку, заполнить SEO/контент поля.
  4. Сохранить — запрос в `/api/admin/articles`.
  5. На backend: валидация + normalize + write в JSONBin + инвалидация cache + optional IndexNow ping.

## 6) API и данные
- `GET /api/articles` — выдача статей с edge-cache и fallback.
- `POST /api/admin/articles` — проверка пароля.
- `PUT /api/admin/articles` — обновление массива статей.
- `POST /api/lead` — отправка лида в Google Apps Script endpoint.
- `GET /api/geo` — страна и флаг необходимости consent.
- `GET /api/health/content` — health по доступности контента.
- SEO:
  - `GET /sitemap.xml` — динамический sitemap.
  - `GET /feed.xml` — RSS.
  - `GET /blog/:slug` — bot-aware html для индексации.

## 7) Формы и лидогенерация
- Главная форма: `ContactForm` (name/email/phone/budget/message + method telegram/whatsapp + consent checkbox).
- Отправка: `fetch('/api/lead', POST)`.
- При успехе: трекинг `trackLead()` и редирект на `/thank-you`.
- Серверный endpoint пересылает payload в Google Apps Script URL.

## 8) Аналитика
- Consent-first загрузка аналитики и маркетинга.
- Поддерживаемые системы:
  - GTM
  - GA4 (gtag)
  - Yandex Metrika
  - Meta Pixel
  - TikTok Pixel
- События:
  - pageview по смене роутов;
  - faq_open;
  - lead_submitted/form_submit/generate_lead;
  - thank_you_page_view.

## 9) SEO
- SPA-мета задаются runtime-компонентом `SEO` (title, description, canonical, OG/Twitter, JSON-LD Organization/WebSite).
- На FAQ — JSON-LD FAQPage.
- На bot article endpoint — полноценный SSR-like HTML + JSON-LD BlogPosting/Breadcrumb/FAQ.
- Sitemap + RSS генерируются edge-эндпоинтами.
- `robots.txt` в public + rewrite rules в `_redirects`.

## 10) Производительность
- Lazy routes с `React.lazy` + Suspense fallback.
- Vite manualChunks (vendor, motion, ui, tiptap).
- Caching в edge через `caches.default` для API/sitemap/feed/bot article.
- Горизонтальный скролл/анимации в ряде компонентов могут нагружать слабые устройства.

## 11) Стили и UI
- Tailwind CSS v4 + CSS variables тема (`theme.css`).
- Большой набор Radix-based UI primitive-компонентов в `src/app/components/ui`.
- Тема фактически всегда тёмная через `<div className="dark">` в App.

## 12) Конфигурация и окружение
- Vite config: custom plugin для `figma:asset/*`, alias `@`, manualChunks.
- Build pipeline: `fetch:articles` -> `vite build` -> `generate:pages`.
- Основные env: JSONBIN_*, ADMIN_PASSWORD, SITE_URL, INDEXNOW_*, VITE_* tracking ids.

## 13) Поток данных
1. User открывает SPA route.
2. `ArticlesProvider` запрашивает `/api/articles`.
3. Edge читает JSONBin (или fallback), кеширует ответ.
4. Клиент рендерит список/статью, очищая HTML через sanitize.
5. При сабмите формы клиент шлёт `/api/lead`.
6. Edge endpoint нормализует и проксирует лид в Google Script.
7. Клиент вызывает conversion events и переводит пользователя на `/thank-you`.

## 14) Риски и слабые места
- `ADMIN_PASSWORD` — простая схема shared password (без пользователей/ролей, MFA, audit-log).
- Rate limit только на admin API; lead endpoint без rate-limit/anti-bot.
- Контент хранится единым массивом JSONBin: при росте объёма возможны сложности редакторского workflow и конкурентной записи.
- sanitize реализован regex-подходом (не DOM parser), что потенциально менее надёжно на edge-кейсах XSS.
- Client-side SEO-мета в SPA не равны полноценному SSR для всех страниц (кроме bot-route для блога).

## 15) Архитектурная карта (кратко)
- UI (React SPA, роуты, формы, калькуляторы, блог) -> Cloudflare Pages Functions API -> JSONBin/Google Script/3rd-party analytics.
- Контентный контур:
  - Admin UI -> `/api/admin/articles` -> JSONBin -> `/api/articles` -> Blog/SEO endpoints.
- SEO контур:
  - `/sitemap.xml`, `/feed.xml`, `/blog/:slug` (для ботов), `robots.txt`, `_redirects`.
- Analytics контур:
  - Consent Manager -> conditional loading GA/GTM/YM/Meta/TikTok -> events по route/form/faq/thank-you.
