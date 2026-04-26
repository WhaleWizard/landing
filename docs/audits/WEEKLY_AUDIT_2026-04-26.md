# WEEKLY AUDIT — 2026-04-26

## Шапка
- **Дата аудита:** 2026-04-26.
- **Предыдущий аудит в `docs/audits/`:** `docs/audits/WEEKLY_AUDIT_2026-04-26.md` (предыдущая версия этого же weekly-файла, обновлена в рамках текущего прогона).
- **База для сравнения динамики:** `docs/TECH_AUDIT_2026-04-25.md` + прошлый weekly.
- **Окно изменений:** 2026-04-19 → 2026-04-26 (7 дней).

### Краткий summary изменений
За неделю проект активно менялся в зонах: контентный pipeline (JSONBin fallback + sync), SEO edge-логика, consent/analytics, UX/UI блога и админки, а также появились новые endpoint’ы (`/api/geo`, `/api/lead`, `/api/health/content`).

Крупнейшие изменения по частоте правок:
- `src/app/pages/BlogPage.tsx` (19 модификаций).
- `src/app/components/hooks/useArticlesApi.ts` (18 модификаций).
- `src/app/pages/Admin.tsx` (17 модификаций).
- `functions/_lib/seo.ts`, `functions/_lib/types.ts`, `functions/sitemap.xml.ts`, `functions/_lib/jsonbin.ts` (10+ модификаций).

Новых runtime dependency за неделю не добавлено (изменены только npm scripts: `test`, `check`).

---

## Изменения за неделю

| Файл/группа | Тип | Влияние |
|---|---|---|
| `functions/api/lead.ts` | Добавлен | Новый lead endpoint; критично для anti-abuse и reliability интеграции с Google Apps Script. |
| `functions/api/geo.ts`, `src/app/consent/consent.ts`, `src/app/components/cookie/CookieConsentManager.tsx` | Добавлен/модифицирован | Реализована consent-first geo-логика; влияет на legal compliance и загрузку трекеров. |
| `functions/_middleware.ts`, `public/_redirects`, `public/robots.txt`, `functions/_lib/seo.ts` | Добавлен/модифицирован | Усилена canonical host-политика и SEO-каноникализация. |
| `functions/_lib/sanitize.ts`, `src/app/utils/sanitizeHtml.ts`, `src/app/components/ArticleEditor.tsx` | Добавлен/модифицирован | Введена/расширена HTML sanitizer-логика для статей; зона security/контент-целостности. |
| `functions/_lib/jsonbin.ts`, `functions/api/articles.ts`, `src/app/components/hooks/useArticlesApi.ts`, `data/articles.local.json`, `public/articles.seed.json` | Модифицирован/добавлен | Повышена отказоустойчивость получения статей (несколько fallback-источников). |
| `functions/sitemap.xml.ts`, `functions/feed.xml.ts`, `functions/blog/[slug].ts`, `scripts/generate-pages.js` | Модифицирован | Улучшения SEO-инфраструктуры (sitemap/feed/бот-рендер/статические маршруты). |
| `src/app/pages/FAQPage.tsx`, `src/app/pages/MarketingGlossaryPage.tsx`, `src/app/routes.tsx` | Добавлен/модифицирован | Новый SEO-контент и маршруты для расширения органического охвата. |
| `src/app/pages/Admin.tsx`, `functions/api/admin/articles.ts` | Модифицирован | Улучшения UX и защит в админ-потоке, но модель bulk-overwrite остаётся. |
| `package.json` | Модифицирован | Добавлены scripts `test`/`check`; dependency surface не сокращён. |
| `docs/*` | Добавлен | Много отчётных документов; полезно для прозрачности, но дублирует артефакты анализа в репозитории. |

**Удалений существенных модулей не обнаружено** (в diff за период доминируют `A` и `M`, `D` отсутствуют).

---

## 1) Безопасность

| Проблема | Где находится | Критичность | Как исправить | Связана с изменениями? |
|---|---|---|---|---|
| `POST /api/lead` не использует rate limit/бот-защиту и отправляет данные на внешний endpoint без origin proof | `functions/api/lead.ts` | 🔴 Критичная | Подключить `enforceRateLimit`, honeypot + Turnstile, HMAC подпись запроса во внешний скрипт, retry/DLQ. | Да |
| Санитайзер остаётся regex-based с широким allowlist (`style`, `form`, `input`, `iframe`) | `functions/_lib/sanitize.ts`, `src/app/utils/sanitizeHtml.ts` | 🔴 Критичная | Перейти на DOMPurify/более строгий parser-based sanitizer; сократить allowlist до безопасного editorial HTML. | Да |
| Нет централизованных security headers и CSP в edge middleware | `functions/_middleware.ts`, `public/_headers` (отсутствует) | 🔴 Критичная | Добавить CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS через `_headers`/middleware. | Частично |
| Shared password в админке без RBAC/MFA/audit trail | `src/app/pages/Admin.tsx`, `functions/api/admin/articles.ts` | 🟡 Средняя | Перейти на identity-based auth (Cloudflare Access/JWT), добавить журнал админ-действий. | Нет |

**Вывод/приоритет:** блокер №1 недели — hardening `api/lead` + CSP/security headers.

---

## 2) Производительность

| Проблема | Где находится | Критичность | Как исправить | Связана с изменениями? |
|---|---|---|---|---|
| Крупные JS-чанки: `index` 240.38 kB, `vendor` 229.54 kB, `motion` 96.65 kB (pre-gzip) | Артефакты `npm run build` | 🟡 Средняя | Дополнительный code-splitting, deferred hydration тяжёлых секций, audit неиспользуемых UI библиотек. | Да |
| CSS bundle 171.45 kB; накопление стилей после редизайна блога/админки | `src/styles/*.css` | 🟡 Средняя | Purge/сегментация стилей, исключить неиспользуемые utility-паттерны. | Да |
| Не удалось получить Lighthouse автоматически (ограничение среды: нельзя скачать `lighthouse` из npm registry) | CI/локальное окружение | ⚪ Низкая | Добавить Lighthouse CI в pipeline с preinstalled бинарём/кэшом или запускать в GitHub Action runner. | Да |
| В build fetch JSONBin падает 3 раза и всегда уходит в fallback (риск старого контента в статике) | `scripts/fetch-articles.js` + build лог | 🟡 Средняя | Добавить алерт, `STRICT_FETCH_ARTICLES=1` для protected branch, freshness SLA. | Да |

**Вывод/приоритет:** основная оптимизация — сократить `index/vendor/motion` и стабилизировать источник контента для build.

---

## 3) SEO

| Проблема | Где находится | Критичность | Как исправить | Связана с изменениями? |
|---|---|---|---|---|
| Улучшен canonical host redirect, но нет явной policy для trailing slash и параметров URL | `functions/_middleware.ts`, `public/_redirects` | 🟡 Средняя | Добавить нормализацию slash/utm-параметров на edge и тест-кейсы canonicalization. | Да |
| Генерация sitemap зависит от доступности контента во время build/fetch | `functions/sitemap.xml.ts`, `scripts/fetch-articles.js` | 🟡 Средняя | Вводить freshness-check и fail-fast в prod pipeline. | Да |
| Отсутствует автоматический линк-чек внутренних ссылок в статьях | Контент JSON/articles | ⚪ Низкая | Добавить job `linkinator`/custom checker в CI. | Нет |

**Вывод/приоритет:** SEO-инфраструктура выросла, но её надёжность всё ещё завязана на внешний JSONBin.

---

## 4) Контент и Workflow

| Проблема | Где находится | Критичность | Как исправить | Связана с изменениями? |
|---|---|---|---|---|
| Админ-обновление контента всё ещё bulk-массивом (overwrite risk при concurrent editing) | `functions/api/admin/articles.ts`, `src/app/pages/Admin.tsx` | 🔴 Критичная | Перейти на постатейные операции + optimistic locking (version/etag). | Да |
| Сложная цепочка fallback-источников затрудняет контроль source-of-truth | `src/app/components/hooks/useArticlesApi.ts`, `functions/_lib/jsonbin.ts`, `public/articles.seed.json`, `data/articles.local.json` | 🟡 Средняя | Ввести явный приоритет источников + статус источника в UI/admin/log. | Да |
| Нет версионирования/rollback контента на уровне API | `functions/api/admin/articles.ts` | 🟡 Средняя | Добавить revision history (D1/KV/Git snapshots). | Нет |

**Вывод/приоритет:** контент стал устойчивее к outage, но архитектурно усложнился; нужен контроль версий и конкуренции.

---

## 5) Аналитика

| Проблема | Где находится | Критичность | Как исправить | Связана с изменениями? |
|---|---|---|---|---|
| В коде остались продовые default IDs GTM/GA/Yandex (риск ошибочного трекинга не в той среде) | `src/app/consent/consent.ts` | 🟡 Средняя | Сделать env-only для production; дефолты оставить только для dev/staging. | Да |
| В прод-коде присутствуют `console.info`/`console.warn` диагностические логи аналитики | `src/app/consent/consent.ts` | ⚪ Низкая | Обернуть в debug-flag и выключить в production build. | Да |
| Нет серверной привязки consent-state к lead submission telemetry | `src/app/components/ContactForm.tsx`, `functions/api/lead.ts` | ⚪ Низкая | Передавать агрегированный consent-state (без PII) в backend events. | Частично |

**Вывод/приоритет:** consent-first реализован лучше, но прод-конфиг аналитики ещё требует env-дисциплины.

---

## 6) Доступность (A11y)

| Проблема | Где находится | Критичность | Как исправить | Связана с изменениями? |
|---|---|---|---|---|
| Ошибки формы по-прежнему частично завязаны на `alert`/неполноценные aria-live паттерны | `src/app/components/ContactForm.tsx` | 🟡 Средняя | Перевести на inline validation + `aria-live=polite/assertive`. | Да |
| Не внедрена глобальная reduced-motion policy при активном использовании Motion | `src/app/components/*`, `src/app/pages/*` | 🟡 Средняя | Добавить `prefers-reduced-motion` hook и системно отключать тяжёлые эффекты. | Да |
| После UI-изменений нет регулярного automated a11y-прогона | Проект целиком | ⚪ Низкая | Запускать axe/Lighthouse A11y в CI минимум на ключевых маршрутах. | Да |

**Вывод/приоритет:** фокус на ContactForm + системный reduced-motion.

---

## 7) UX/UI

| Проблема | Где находится | Критичность | Как исправить | Связана с изменениями? |
|---|---|---|---|---|
| Много итераций UI (Blog/Admin/Modal), но нет формализованных визуальных regression checks | `src/app/pages/BlogPage.tsx`, `src/app/pages/Admin.tsx`, `src/app/components/Modal.tsx` | 🟡 Средняя | Подключить visual snapshot tests (Percy/Chromatic/Playwright screenshots). | Да |
| Воронка lead остаётся чувствительной к нестабильности внешнего Apps Script endpoint | `src/app/components/ContactForm.tsx`, `functions/api/lead.ts` | 🟡 Средняя | Добавить user-facing retry/status UX + fallback канал связи. | Да |
| Новые SEO-страницы (FAQ/Glossary) добавлены, но нет measurable KPI по конвертации из органики | `src/app/pages/FAQPage.tsx`, `src/app/pages/MarketingGlossaryPage.tsx` | ⚪ Низкая | Настроить события scroll-depth/CTA click и отдельные dashboard-срезы. | Да |

**Вывод/приоритет:** UX улучшился визуально, но нужна операционализация quality и конверсий.

---

## 8) Зависимости и инфраструктура

| Проблема | Где находится | Критичность | Как исправить | Связана с изменениями? |
|---|---|---|---|---|
| Lockfile отсутствует (`npm audit`/reproducible installs ограничены) | Корень репозитория | 🟡 Средняя | Зафиксировать `package-lock.json`, включить audit/update policy. | Нет |
| Dependency surface большой (MUI + Radix + прочие UI libs), но weekly не показал их сокращение | `package.json` | 🟡 Средняя | Сделать dep usage audit и убрать лишнее. | Да |
| Нет `.nvmrc`/`engines` для стабилизации версии Node в CI/CD | Корень репозитория | ⚪ Низкая | Добавить `.nvmrc` + `engines` в `package.json`. | Нет |

**Вывод/приоритет:** нужно повышать воспроизводимость и управляемость dependency рисков.

---

## 9) Общая архитектура

| Проблема | Где находится | Критичность | Как исправить | Связана с изменениями? |
|---|---|---|---|---|
| Архитектура контента всё ещё центрирована на JSONBin, D1-модель не внедрена | `functions/_lib/jsonbin.ts`, `scripts/fetch-articles.js`, `functions/api/admin/articles.ts` | 🟡 Средняя | Запланировать поэтапную миграцию в D1: schema, dual-write, cutover, rollback plan. | Да |
| Санитизация дублируется в двух местах (edge + client), риск расхождения правил | `functions/_lib/sanitize.ts`, `src/app/utils/sanitizeHtml.ts` | 🟡 Средняя | Вынести shared sanitizer policy/module и единые тесты. | Да |
| Рост fallback/SEO/analytics логики увеличил сложность без централизованной observability | `functions/*`, `scripts/*`, `src/app/consent/*` | ⚪ Низкая | Ввести health dashboard + structured logs + error budget для content pipeline. | Да |

**Вывод/приоритет:** архитектура развивается быстро, но требует консолидации (content store + shared policies + observability).

---

## Метрики производительности

### Build и размеры чанков (pre-gzip)
Результаты `npm run build`:
- `dist/assets/index-Cwu0mCOO.js` — **240.38 kB**
- `dist/assets/vendor-BAMRqgRy.js` — **229.54 kB**
- `dist/assets/motion-CdSdFQ7S.js` — **96.65 kB**
- `dist/assets/Admin-B8ylYv9V.js` — **82.15 kB**
- `dist/assets/FAQPage-DPq-bgqG.js` — **57.52 kB**
- `dist/assets/MarketingGlossaryPage-D3HS3dHG.js` — **48.32 kB**
- CSS `dist/assets/index-D_UuGjcM.css` — **171.45 kB**

### Lighthouse
Автозапуск не выполнен: `npx lighthouse` завершился ошибкой `npm E403` (нельзя скачать пакет в текущем окружении).

**Нужен ручной прогон (цели):**
- Performance ≥ 85
- Accessibility ≥ 95
- Best Practices ≥ 95
- SEO ≥ 95
- LCP < 2.5s, INP < 200ms, CLS < 0.1

### Изображения и шрифты
В репозитории не найдено крупных локальных image/font assets в `public/` и `src/`; основные риски производительности сейчас в JS/CSS, а не в медиа.

---

## Динамика (сравнение с прошлым аудитом)

| Категория | Статус | Сравнение с прошлым аудитом |
|---|---|---|
| Canonical host/SEO redirect политика | Исправлена (частично) | Добавлен edge middleware redirect на `www` + согласованность canonical. |
| Отказоустойчивость контента | Улучшена | Реализованы fallback-цепочки и seed-источники для статей. |
| Consent-first аналитика | Улучшена | Добавлен geo endpoint и cookie consent manager; трекеры грузятся после согласия. |
| `/api/lead` anti-abuse | Появилась новая критичная зона | Endpoint добавлен, но без rate-limit/turnstile/подписи. |
| CSP/security headers | Осталась | По-прежнему нет централизованных заголовков и CSP policy. |
| Regex sanitizer риск | Осталась | Код санитайзера расширен, но подход по-прежнему regex-based. |
| Bulk overwrite контента | Осталась | Админ API всё ещё обновляет массив статей целиком. |

**Итоговый тренд:** **умеренное улучшение**, но с появлением нового критичного риска в lead API.
- Новые проблемы: **1 критичная** (`/api/lead` anti-abuse gap).
- Закрытые/улучшенные области: **3** (canonical host, content resilience, consent-flow).
- Устойчиво нерешённые: **3 ключевые** (CSP/headers, sanitizer, bulk content model).

---

## Сгенерированные задачи (GitHub Issues)

- **[Security] Harden `/api/lead` against abuse and spoofing**  
  Labels: `bug`, `security`, `backend`, `priority:high`  
  Действия: добавить rate-limit, Turnstile/honeypot, HMAC подпись во внешний endpoint, retries/alerting.

- **[Security] Add CSP and centralized security headers for Cloudflare Pages**  
  Labels: `security`, `infrastructure`, `seo`, `priority:high`  
  Действия: внедрить CSP + `_headers`/middleware policy, протестировать GTM/GA/Yandex allowlist.

- **[Security/Content] Replace regex sanitizer with parser-based sanitizer policy**  
  Labels: `security`, `content`, `backend`, `frontend`, `priority:high`  
  Действия: внедрить DOMPurify-like policy, унифицировать edge/client sanitizer, покрыть тестами XSS payloads.

- **[Architecture] Move admin article updates from bulk overwrite to versioned per-article writes**  
  Labels: `architecture`, `backend`, `cms`, `priority:medium`  
  Действия: добавить version field/ETag, PATCH per slug, conflict handling, rollback.

- **[Performance] Reduce critical JS/CSS payload (index/vendor/motion + global CSS)**  
  Labels: `performance`, `frontend`, `priority:medium`  
  Действия: анализ зависимостей, route-level chunking, a11y-friendly motion policy, CSS pruning.

### Готовые команды `gh issue create`
```bash
gh issue create --title "[Security] Harden /api/lead against abuse and spoofing" --label "bug,security,backend,priority:high" --body "Context: functions/api/lead.ts introduced this week without endpoint-specific anti-abuse controls.\n\nTasks:\n1) Add enforceRateLimit for POST /api/lead.\n2) Add Turnstile (or honeypot + server scoring).\n3) Add HMAC signature when forwarding payload to external Apps Script endpoint.\n4) Add retry/backoff + alerting for non-2xx responses.\n\nDoD:\n- Abuse attempts are throttled and logged.\n- Endpoint rejects unsigned or malformed forwarded payloads."

gh issue create --title "[Security] Add CSP and centralized security headers for Cloudflare Pages" --label "security,infrastructure,seo,priority:high" --body "Context: no centralized CSP/security headers despite multiple external trackers.\n\nTasks:\n1) Add public/_headers and/or middleware header injection.\n2) Configure CSP script-src/connect-src/frame-src for GTM/GA/Yandex/Meta/TikTok domains.\n3) Add Referrer-Policy, X-Content-Type-Options, Permissions-Policy, HSTS.\n4) Run compatibility test on /, /blog/:slug, /admin."

gh issue create --title "[Security/Content] Replace regex sanitizer with parser-based sanitizer policy" --label "security,content,backend,frontend,priority:high" --body "Context: sanitizer in functions/_lib/sanitize.ts and src/app/utils/sanitizeHtml.ts is regex-based and too permissive.\n\nTasks:\n1) Replace with parser-based sanitizer policy (shared module).\n2) Remove high-risk tags/attrs (style/form/input/unsafe iframe attrs) unless explicitly needed.\n3) Add unit tests for common XSS vectors and rich-content regression fixtures.\n4) Ensure identical policy on edge + client rendering."

gh issue create --title "[Architecture] Move admin article updates to versioned per-article writes" --label "architecture,backend,cms,priority:medium" --body "Context: admin API still writes full articles array, high overwrite risk.\n\nTasks:\n1) Add per-article update endpoints (PATCH by slug/id).\n2) Add optimistic concurrency (version/etag).\n3) Add conflict response UX in Admin UI.\n4) Add revision history for rollback."

gh issue create --title "[Performance] Reduce critical JS/CSS payload" --label "performance,frontend,priority:medium" --body "Context: build reports index/vendor/motion + CSS as primary payload contributors.\n\nTasks:\n1) Audit and remove unused dependencies/chunks.\n2) Add route-level lazy loading for non-critical blocks.\n3) Introduce reduced-motion policy and lighter animations for low-power devices.\n4) Add Lighthouse CI budgets for Performance/LCP/INP/CLS."
```

---

## План действий на следующую неделю (3–5 задач)

1. **Закрыть критический риск лид-формы.**  
   Что сделать: hardening `functions/api/lead.ts` (rate limit + anti-bot + подпись).  
   Ожидаемый эффект: снижение спама/фрода и отказов внешнего endpoint.

2. **Внедрить CSP + security headers.**  
   Что сделать: добавить `public/_headers` и/или расширить `functions/_middleware.ts`.  
   Ожидаемый эффект: снижение XSS/инъекционных рисков, улучшение security posture.

3. **Унифицировать и ужесточить санитизацию HTML.**  
   Что сделать: заменить regex sanitizer в `functions/_lib/sanitize.ts` и `src/app/utils/sanitizeHtml.ts` на единый parser-based модуль.  
   Ожидаемый эффект: меньше расхождений edge/client и меньше XSS-риск.

4. **Снизить вес критических бандлов.**  
   Что сделать: оптимизация `index/vendor/motion` и CSS (`src/styles/*`), ревизия dependency surface в `package.json`.  
   Ожидаемый эффект: улучшение LCP/INP и user-perceived speed.

5. **Подготовить migration plan JSONBin → D1.**  
   Что сделать: blueprint для `functions/_lib/jsonbin.ts`/`functions/api/admin/articles.ts` с dual-write этапом.  
   Ожидаемый эффект: контроль версий, более безопасный multi-editor workflow, меньше downtime-рисков.
