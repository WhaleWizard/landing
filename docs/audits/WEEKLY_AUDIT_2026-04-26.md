# Weekly Audit — 2026-04-26

## Scope and method
- Reviewed frontend (`src/`), Cloudflare Pages Functions (`functions/`), build scripts (`scripts/`), and SEO/public assets (`public/`).
- Compared against latest prior baseline in `docs/TECH_AUDIT_2026-04-25.md` and current git activity.
- Executed runtime/build checks where possible (`npm run build`, `npm audit --json`).

---

## 1. БЕЗОПАСНОСТЬ

| Проблема | Где находится | Критичность | Как исправить |
|---|---|---|---|
| Админ-доступ построен на shared password без MFA, user-roles и audit trail | `/admin`, `functions/api/admin/articles.ts`, `functions/_lib/auth.ts` | 🔴 Критичная | Перейти на identity-based auth (Cloudflare Access/JWT/OAuth), добавить роли и журнал действий. |
| Нет отдельной защиты от brute-force кроме общего IP rate-limit | `functions/_lib/rate-limit.ts`, `functions/api/admin/articles.ts` | 🟡 Средняя | Добавить отдельные лимиты по endpoint + progressive backoff + временную блокировку по fingerprint/ASN. |
| `/api/lead` не rate-limited (уязвимость для spam/flood) | `functions/api/lead.ts` | 🔴 Критичная | Подключить `enforceRateLimit` + honeypot + CAPTCHA/Turnstile + server-side anti-abuse scoring. |
| CORS явно не управляется; security headers не централизованы | `functions/_lib/http.ts`, `functions/_middleware.ts` | 🟡 Средняя | Ввести единый security middleware: CORS whitelist, `Vary`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`. |
| CSP не настроен ни на edge, ни через `_headers` | проект целиком (`public/_headers` отсутствует, в middleware не добавляется CSP) | 🔴 Критичная | Добавить строгий CSP (nonce/hash для inline), отчётный режим -> enforce; ограничить script-src только нужными доменами. |
| Санитизация HTML основана на regex и разрешает `style`/сложные теги | `functions/_lib/sanitize.ts`, `src/app/utils/sanitizeHtml.ts` | 🔴 Критичная | Перейти на DOMPurify/OWASP sanitizer (на клиенте + server-side policy), удалить `style` и формы/инпуты из allowlist для blog content. |
| Публичный BIN_ID зашит в клиентском конфиге | `src/app/config.ts` | ⚪ Низкая | Для read-only это допустимо, но лучше держать через edge proxy, чтобы не зависеть от внешней схемы JSONBin в клиенте. |
| Наличие production console-логов с техническими деталями | `src/app/consent/consent.ts`, `src/app/components/hooks/useArticlesApi.ts`, `src/app/components/ContactForm.tsx` | ⚪ Низкая | Убрать или обернуть в debug-flag; исключить потенциальные диагностические утечки. |
| Лиды отправляются во внешний Google Apps Script без подписи/верификации источника | `functions/api/lead.ts` | 🟡 Средняя | Добавить HMAC подпись запроса, rotateable secret, retry+DLQ, алерты на non-2xx. |
| Контент хранится единым массивом статей (bulk overwrite риск) | `functions/api/admin/articles.ts`, `functions/_lib/jsonbin.ts` | 🟡 Средняя | Перейти на постатейное хранение (D1/KV), optimistic locking и версионирование. |

**Выводы и рекомендации по разделу:**
- Позитив: есть timing-safe compare, базовая валидация payload, защита от полного зануления блога, whitelist для IndexNow endpoint.
- Главный риск недели: сочетание shared password + отсутствие CSP + отсутствие rate-limit на лид-API.
- Приоритет: (1) закрыть `/api/lead` от abuse, (2) внедрить CSP/security headers, (3) заменить regex sanitizer.

---

## 2. ПРОИЗВОДИТЕЛЬНОСТЬ (Performance & Web Vitals)

| Проблема | Где находится | Критичность | Как исправить |
|---|---|---|---|
| Крупный основной JS chunk (`index` ~240KB + `vendor` ~229KB pre-gzip) | артефакты `npm run build` | 🟡 Средняя | Ужесточить code-splitting, вынести тяжёлые секции home в lazy blocks, проверка unused deps. |
| В `manualChunks` выделены MUI пакеты, но проект в основном на Radix/Tailwind (возможный избыточный вес) | `vite.config.ts`, `package.json` | 🟡 Средняя | Проверить фактическое использование MUI; удалить неиспользуемое или изолировать в админке. |
| Много Motion-анимаций без глобальной стратегии `prefers-reduced-motion` | `src/app/components/ContactForm.tsx`, `src/app/pages/BlogPage.tsx`, др. | 🟡 Средняя | Ввести motion policy hook и отключение тяжёлых анимаций для reduced-motion. |
| Нет подтверждённых Lighthouse/PSI метрик за неделю | не зафиксировано в репо | ⚪ Низкая | Добавить weekly Lighthouse CI (LCP/INP/CLS budget + regression gate). |
| Edge-cache TTL для статей всего 120s → возможная нагрузка на JSONBin | `functions/_lib/cache.ts`, `functions/api/articles.ts` | ⚪ Низкая | Для стабильного контента повысить s-maxage (например 10–30 мин) + explicit purge после админ-сохранения (уже есть). |
| Изображения в блоге без явных `width/height` (риск CLS) | `src/app/pages/BlogPage.tsx` | 🟡 Средняя | Добавить размеры/`aspect-ratio` и responsive `srcset`; подготовить WebP/AVIF. |
| Нет явного контроля шрифтовой загрузки/подмножеств | `src/styles/fonts.css` | ⚪ Низкая | Субсетинг, `font-display: swap`, ограничение вариантов. |

**Выводы и рекомендации по разделу:**
- Позитив: роуты (кроме Home) lazy-loaded, edge caching присутствует, build стабильно проходит.
- Узкое место: размер главного бандла и анимации на слабых устройствах.
- Следующий шаг: автоматизировать перф-мониторинг и ввести budget gates в CI.

---

## 3. SEO И ИНДЕКСАЦИЯ

| Проблема | Где находится | Критичность | Как исправить |
|---|---|---|---|
| SPA-мета управляются client-side; только `/blog/:slug` имеет bot-aware HTML | `src/app/components/SEO.tsx`, `functions/blog/[slug].ts` | 🟡 Средняя | Для критичных страниц внедрить pre-render/SSR-like HTML последовательно. |
| Нет hreflang (если планируется мультиязычность) | весь сайт | ⚪ Низкая | Добавить `hreflang` набор при запуске RU/EN зеркала. |
| Canonical host редирект есть, но нет  trailing slash policy на уровне edge | `functions/_middleware.ts`, `public/_redirects` | ⚪ Низкая | Определить canonical policy для slash/no-slash и закрепить redirect rules. |
| Сгенерированный sitemap lastmod для статических route — build date, не фактическая дата изменения | `scripts/generate-pages.js`, `functions/sitemap.xml.ts` | ⚪ Низкая | Для статических страниц брать timestamp из git/metadata. |
| Нет автоматической проверки битых внутренних ссылок в контенте | blog content JSON | 🟡 Средняя | Добавить линк-чекер в CI по статьям и glossary/faq cross-links. |

**Выводы и рекомендации по разделу:**
- Позитив: robots/sitemap/feed присутствуют, blog bot-render с JSON-LD есть, canonical host фиксирован.
- Риск: неполный SEO parity вне blog article route.
- Приоритет: link-check + расширение предрендера для высокоценных landing pages.

---

## 4. КОНТЕНТ И РЕДАКТОРСКИЙ WORKFLOW

| Проблема | Где находится | Критичность | Как исправить |
|---|---|---|---|
| Workflow сохранения статей bulk-массивом → риск конкурентной перезаписи | `src/app/pages/Admin.tsx`, `functions/api/admin/articles.ts` | 🔴 Критичная | Ввести ревизии (ETag/version), постатейные операции, optimistic concurrency. |
| Нет полноценной истории версий/rollback контента | JSONBin current model | 🟡 Средняя | Добавить журнал версий (D1 table или git-backed snapshots). |
| Fallback-цепочка сложная, но может отдавать «самый свежий» источник без прозрачного статуса на UI | `src/app/components/hooks/useArticlesApi.ts` | ⚪ Низкая | Показывать источник данных в админке/мониторинге для нештатных сценариев. |
| Размер массива статей пока ограничен 500, но рост = деградация update/read | `functions/api/admin/articles.ts` | 🟡 Средняя | План миграции на D1 (per-article rows, индексы по slug/date/category). |
| Проверка полноты SEO-полей не обязательна (часть полей генерируется fallback-логикой) | `functions/_lib/jsonbin.ts` | ⚪ Низкая | Ввести редакторские «quality gates» (min length для title/description, required image). |

**Выводы и рекомендации по разделу:**
- Позитив: есть защита от пустого overwrite и нормализация slug/seo-полей.
- Ключевая задача: перейти от monolithic массива к транзакционному контент-хранилищу.

---

## 5. АНАЛИТИКА И ТРЕКИНГ

| Проблема | Где находится | Критичность | Как исправить |
|---|---|---|---|
| Дефолтные ID аналитики/GTM захардкожены и могут случайно уйти в нецелевую среду | `src/app/consent/consent.ts` | 🟡 Средняя | Сделать env-only для production, fallback только для dev. |
| Отладочный `console.info` в analytics bootstrap в проде | `src/app/consent/consent.ts` | ⚪ Низкая | Удалить или ограничить debug режимом. |
| Возможные race-сценарии при одновременной загрузке GTM + GA (оба через googletagmanager.com) | `src/app/consent/consent.ts` | ⚪ Низкая | Явно документировать порядок и dedupe dataLayer init. |
| Нет серверной валидации «consent state» при отправке лида (только клиентские события) | `src/app/components/ContactForm.tsx`, `functions/api/lead.ts` | ⚪ Низкая | Добавить consent-state атрибут в payload (без PII) для quality analytics. |
| Потенциальный дубль событий lead (generate_lead + form_submit + dataLayer два события) | `src/app/consent/consent.ts` | ⚪ Низкая | Утвердить event taxonomy и mapping (single source for conversion). |

**Выводы и рекомендации по разделу:**
- Позитив: consent-first реализован, скрипты не грузятся до согласия/auto-region logic.
- Рекомендация: стандартизировать event schema и убрать production debug traces.

---

## 6. ДОСТУПНОСТЬ (ACCESSIBILITY / A11Y)

| Проблема | Где находится | Критичность | Как исправить |
|---|---|---|---|
| Во многих формах используются `<label>` без `htmlFor` + input без `id` | `src/app/components/ContactForm.tsx`, `src/app/pages/Admin.tsx` | 🟡 Средняя | Связать label/input через `htmlFor/id`, улучшить screen reader map. |
| Ошибки формы показываются через `alert()` — poor a11y UX | `src/app/components/ContactForm.tsx` | 🟡 Средняя | Использовать inline aria-live region + полевые сообщения. |
| Нет системной реализации reduced-motion для Motion-компонентов | компоненты с `motion` | 🟡 Средняя | Глобальный флаг `prefers-reduced-motion` + отключение pulse/parallax эффектов. |
| Часть кликабельных элементов — styled buttons/links без явных focus-outline стратегий | Blog/Admin/Contact UI | ⚪ Низкая | Добавить consistent focus-visible token на все интерактивные элементы. |

**Выводы и рекомендации по разделу:**
- Позитив: семантические `main/nav/article/section` используются во многих местах; есть aria-label в отдельных кнопках.
- Приоритет: перевести validation UX формы на доступный паттерн и внедрить reduced-motion.

---

## 7. UX/UI И КОНВЕРСИОННЫЕ ВОРОНКИ

| Проблема | Где находится | Критичность | Как исправить |
|---|---|---|---|
| ContactForm использует browser `alert` для ошибок и согласия — резкий UX | `src/app/components/ContactForm.tsx` | 🟡 Средняя | Inline error state, sticky summary ошибок, disable submit с подсказкой. |
| На thank-you редирект выполняется таймером (800ms), возможен race при медленном рендере/трекерах | `src/app/components/ContactForm.tsx` | ⚪ Низкая | Перейти на deterministic navigation после successful submission + event queue flush. |
| Возможны визуальные перегрузки от интенсивных glow/pulse эффектов на мобильных | Home/Blog/ThankYou/Contact sections | ⚪ Низкая | Упростить анимации на mobile breakpoint; урезать blur layers. |
| Для блога нет поиска/фильтра и явной навигации по категориям | `src/app/pages/BlogPage.tsx` | ⚪ Низкая | Добавить lightweight search+chips categories для глубины контентного воронки. |

**Выводы и рекомендации по разделу:**
- Позитив: базовый funnel (landing → submit → thank-you) реализован и сопровождается трекингом.
- Ближайшее улучшение: повысить ясность ошибок формы и мобильный UX формы/блога.

---

## 8. ЗАВИСИМОСТИ И ИНФРАСТРУКТУРА

| Проблема | Где находится | Критичность | Как исправить |
|---|---|---|---|
| `npm audit` не может выполняться без lockfile (`ENOLOCK`) | репозиторий (lockfile отсутствует) | 🟡 Средняя | Зафиксировать lockfile (`package-lock.json`), включить audit в CI. |
| Потенциально избыточный dependency surface (MUI + Radix + множество UI libs) | `package.json` | 🟡 Средняя | Провести dep-pruning: удалить неиспользуемые пакеты, сократить attack surface и bundle size. |
| Нет явного `_headers` файла для production security/cache policies | `public/` | 🟡 Средняя | Добавить `_headers` с CSP/HSTS/XFO/Referrer-Policy и cache stratification. |
| Build зависит от внешнего JSONBin; при сетевых ошибках используется fallback (сработал в проверке) | `scripts/fetch-articles.js` | ⚪ Низкая | Для CI включать strict mode в protected branches + мониторинг свежести контента. |
| Нет формализованной информации по Node version constraints | репозиторий (нет `.nvmrc`/engines) | ⚪ Низкая | Добавить `engines` в package.json + `.nvmrc` для воспроизводимости. |

**Выводы и рекомендации по разделу:**
- Позитив: build pipeline устойчив к падению JSONBin (fallback работает).
- Системный долг: отсутствие lockfile и слабая формализация инфраструктурных guardrails.

---

## 9. ОБЩАЯ АРХИТЕКТУРА И ЭВОЛЮЦИЯ

| Проблема | Где находится | Критичность | Как исправить |
|---|---|---|---|
| Отклонение от целевой эволюции: контент всё ещё на JSONBin bulk-модели, не на D1 | `functions/_lib/jsonbin.ts`, `scripts/fetch-articles.js` | 🟡 Средняя | Зафиксировать roadmap миграции D1 (schema + dual-write + cutover). |
| Дублирование sanitize-логики на client и edge | `functions/_lib/sanitize.ts`, `src/app/utils/sanitizeHtml.ts` | 🟡 Средняя | Вынести shared sanitizer policy в единый пакет/модуль. |
| Частичное смешение ответственности (часть business/infra логики в UI слое) | `src/app/components/hooks/useArticlesApi.ts`, `src/app/pages/Admin.tsx` | ⚪ Низкая | Выделить сервисный слой и унифицировать error/result contracts. |
| TypeScript strictness не зафиксирован (tsconfig отсутствует), присутствуют `any`-подобные зоны | репозиторий | 🟡 Средняя | Добавить `tsconfig` со strict-режимом и постепенно устранить implicit any. |
| Масштабируемость под multi-author/A-B tests ограничена текущей CMS-моделью | `/admin`, bulk update API | 🟡 Средняя | Ввести роли авторов, draft/publish lifecycle, experiment flags. |

**Выводы и рекомендации по разделу:**
- Позитив: архитектура остаётся понятной, контуры SEO/analytics/content разделены.
- Главный стратегический долг: контентная платформа и strict typing governance.

---

## Сравнение с прошлым аудитом
- За неделю изменения в репозитории были (по git history), поэтому это не «нулевая неделя».
- Позитивная динамика относительно `docs/TECH_AUDIT_2026-04-25.md`:
  - Сохраняется защита от пустого полного удаления статей и кеш-инвалидация после admin update.
  - Build-процесс по-прежнему устойчив при недоступном JSONBin (fallback сработал в реальной проверке).
- Без явной положительной динамики остались: CSP/security headers, lead anti-abuse, regex sanitizer, отсутствие lockfile.

---

## ИТОГОВЫЙ ВЫВОД

### Top-5 критических проблем (немедленно)
1. Отсутствие rate limiting/anti-bot на `/api/lead`.
2. Нет CSP и централизованных security headers.
3. Regex-based HTML sanitizer с широким allowlist.
4. Shared-password админка без полноценной IAM-модели.
5. Bulk overwrite контента без конкурентного контроля/версий.

### Top-3 стратегических улучшения (среднесрочно)
1. Миграция контента на D1 (постатейно, версии, rollback, multi-author).
2. Введение CI quality gates: Lighthouse CI + link checker + npm audit (с lockfile).
3. Архитектурная гигиена: strict TypeScript + единый shared sanitizer/security слой.

### Разделы с положительной динамикой
- **Контентная устойчивость сборки** (fallback в build-пайплайне подтверждён).
- **SEO-инфраструктура блога** (bot HTML + sitemap/feed остаются рабочими).
- **Consent-first аналитика** (базовая модель блокировки трекеров до согласия сохранена).
