# План переезда блога с JsonBin на Cloudflare D1 (админка, SEO, аналитика)

## 1) Почему сейчас ломаются обновления
- Сейчас запись/чтение статей завязана на JsonBin (`fetchArticlesFromJsonBin`, `writeArticlesToJsonBin`).
- После сохранения админка инвалидирует кэш (`/api/articles`, `/sitemap.xml`, `/feed.xml`, `/blog/:slug`) и триггерит IndexNow, но источник данных всё равно внешний (JsonBin), что повышает риск рассинхронизации.
- API статей кэшируется, и при проблеме с записью можно видеть «старое» состояние.

## 2) Целевая архитектура после переезда

### 2.1 Источник данных
- **Единый source of truth**: Cloudflare D1.
- Таблицы:
  - `articles` — основная статья.
  - `article_tags` — теги M:N.
  - `article_key_takeaways` — тезисы.
  - `article_faq` — FAQ блоки.
  - `article_revisions` — аудит изменений (кто/когда/что).
  - `analytics_article_events` (опционально) — server-side события просмотров/действий для сверки с внешней аналитикой.

### 2.2 API слой (Cloudflare Functions)
- `/api/articles` → чтение из D1 + кэш.
- `/api/admin/articles` → CRUD в D1, валидация, инвалидирование кэша, IndexNow.
- `/blog/:slug` → SSR/бот-рендер из D1 через текущий SEO рендер.
- `/sitemap.xml`, `/feed.xml` → генерация по D1.

### 2.3 Админка
- Список статей: фильтры, поиск, сортировка, статус публикации.
- Редактор: поля SEO, FAQ, key takeaways, теги, превью сниппета и OG.
- Workflow: draft → scheduled → published → archived.
- История версий + rollback.

## 3) Что станет лишним после переезда
- Весь модуль `functions/_lib/jsonbin.ts`.
- Переменные окружения `JSONBIN_*`.
- Скрипты/процедуры, которые синхронизируют статьи в JsonBin.

## 4) Что нужно доработать в текущем коде (по модулям)

### 4.1 Backend
1. Добавить `functions/_lib/d1.ts` с функциями:
   - `getArticles`, `getArticleBySlug`, `upsertArticle`, `deleteArticle`, `listRevisions`, `rollbackRevision`.
2. Переключить `functions/api/articles.ts` с `fetchArticlesWithFallback` на D1-репозиторий.
3. Переписать `functions/api/admin/articles.ts`:
   - вместо полной перезаписи массива — транзакционный upsert по статье;
   - сохранить текущую валидацию ограничений;
   - оставить invalidate cache + IndexNow.
4. Обновить `functions/blog/[slug].ts`, `functions/sitemap.xml.ts`, `functions/feed.xml.ts` — брать данные из D1.
5. Добавить endpoint ревизий `/api/admin/articles/revisions`.

### 4.2 Frontend админки/редактора
1. В `Admin.tsx`:
   - заменить модель «сохраняем весь массив статей» на «сохраняем 1 статью / батч»;
   - добавить optimistic UI + явный статус сохранения.
2. В `ArticleEditor.tsx`:
   - SEO health-check (длина title/description, пустой H1, каноникал);
   - preview SERP/OG;
   - подсветка schema-полей (FAQ/Article JSON-LD);
   - автосохранение черновика (local + server draft).
3. Добавить экран «История изменений».

### 4.3 SEO
1. Сохранить и усилить текущие механики:
   - canonical, OG, Twitter, JSON-LD Article/Breadcrumb/FAQ;
   - sitemap/feed на базе `updatedAt` из D1.
2. Добавить для редактора:
   - запрет публикации при критичных SEO-ошибках (без slug/seoTitle/seoDescription);
   - предупреждения при длинных мета-полях.
3. Добавить автоматическую генерацию:
   - fallback SEO description из контента;
   - автоген alt/og image policy.

### 4.4 Аналитика (чтобы трекались все статьи)
1. Ввести единый `article_id` + `slug` в событиях.
2. Клиентские события:
   - page_view_article
   - scroll_depth_article
   - article_cta_click
3. Серверные события:
   - расширить `/api/pageview` полями `article_id`, `slug`, `title`, `category`.
4. Интеграции:
   - GA4 (Measurement Protocol при необходимости серверной дозащиты)
   - Meta CAPI (уже есть базовый PageView, расширить custom_data)
   - (опционально) TikTok Events API
5. Сверка:
   - ежедневная витрина в D1/BI: просмотры по slug vs GA4 vs Meta.

## 5) Пошаговый runbook «куда нажимать и что создавать»

### Шаг 0. Подготовка (Cloudflare)
1. Cloudflare Dashboard → **Workers & Pages** → ваш проект.
2. Включить D1 в проекте.
3. Создать БД: `landing-prod` и `landing-stage`.
4. Создать migration files в репозитории (папка `migrations/`).
5. Применить миграции в stage, затем prod.

### Шаг 1. Схема БД
Создать таблицы:
- `articles` (id, slug unique, title, content_html, summary, description, seo_title, seo_description, category, image, read_time, status, published_at, updated_at, created_at, author, version)
- `article_tags` (article_id, tag)
- `article_key_takeaways` (article_id, sort_order, text)
- `article_faq` (article_id, sort_order, question, answer)
- `article_revisions` (revision_id, article_id, editor, snapshot_json, changed_at, change_note)

### Шаг 2. Доступы и секреты
1. Dashboard → Settings → Variables/Secrets.
2. Добавить/проверить:
   - `ADMIN_PASSWORD_HASH`
   - `SITE_URL`
   - `INDEXNOW_KEY`
   - `META_CAPI_ACCESS_TOKEN`
   - `VITE_META_PIXEL_ID`
3. Удалить `JSONBIN_*` после финального cutover.

### Шаг 3. Импорт существующих статей
1. Экспорт текущих статей из `/api/articles`.
2. Подготовить скрипт маппинга JSON → D1 schema.
3. Залить в stage.
4. Сверить:
   - количество статей;
   - slug уникальность;
   - не пустой `content_html`;
   - корректные `published_at/updated_at`.

### Шаг 4. Переключение API на D1
1. Реализовать D1 repository.
2. Обновить API и SSR endpoints.
3. Прогнать тест-кейсы:
   - create/edit/delete;
   - cache invalidation;
   - sitemap/feed refresh;
   - bot HTML рендер.

### Шаг 5. Улучшение админки
1. В админке добавить:
   - статус публикации;
   - отложенную публикацию;
   - дублирование статьи;
   - история версий;
   - кнопка rollback.
2. В редакторе добавить:
   - SEO score;
   - live preview;
   - checklist перед publish.

### Шаг 6. Аналитика end-to-end
1. На странице статьи отправлять событие с `article_id + slug`.
2. На сервере enrich события geo/utm/device.
3. Настроить dashboard:
   - просмотры по статье;
   - CTR внутренних CTA;
   - дочитывание (scroll 75/100).
4. Создать alert, если по статье 0 событий > 24ч после публикации.

### Шаг 7. SEO-проверка перед prod
1. Проверить:
   - `/sitemap.xml` содержит новые slug;
   - `/feed.xml` содержит новые статьи;
   - `rel=canonical` корректен;
   - JSON-LD валиден (Article/FAQ/Breadcrumb).
2. Запустить submit:
   - GSC sitemap submit;
   - IndexNow ping.

### Шаг 8. Cutover на production
1. Freeze публикации на старой схеме.
2. Финальный delta-import.
3. Переключить API на D1.
4. Очистить кэш.
5. Smoke test:
   - открыть 3 случайные статьи;
   - изменить 1 статью из админки;
   - проверить что изменение видно сразу в `/api/articles`, `/blog/:slug`, sitemap/feed.

### Шаг 9. Пост-релиз мониторинг (48 часов)
- Ошибки API 4xx/5xx.
- Время ответа `/api/articles`, `/blog/:slug`.
- Пропуски событий аналитики.
- Индексация новых URL.

## 6) Критерии готовности (Definition of Done)
- Любое редактирование в админке отражается на странице статьи ≤ 60 секунд.
- Новая статья попадает в sitemap/feed сразу после публикации.
- Для каждой опубликованной статьи есть события в GA4 + Meta CAPI.
- Есть rollback версии статьи из UI.
- JsonBin полностью отключен, `JSONBIN_*` secrets удалены.

## 7) Риски и как закрыть
- Риск: потеря контента при миграции → двойной backup + dry-run на stage.
- Риск: битые slug → preflight validator + unique index.
- Риск: просадка SEO при cutover → чек canonical/JSON-LD/sitemap перед релизом.
- Риск: неполная аналитика → обязательные поля `article_id/slug` и daily reconciliation отчёт.
