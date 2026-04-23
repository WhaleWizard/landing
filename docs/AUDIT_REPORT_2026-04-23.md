# Полный аудит Whale Wzrd (обновлённый, 2026-04-23)

## Часть 1/5 — Корневая причина по «10 статьям не отображаются»

### C1. Fallback-данные ограничены 10 статьями (главная бизнес-причина)
**Проблема:** при деградации основного источника данных система показывает только seed/local набор (10 статей), что визуально воспринимается как «исчезли статьи».  
**Где:** `public/articles.seed.json`, `data/articles.local.json` (оба содержат 10 записей).  
**Доказательство по логике:**
- клиент: `/api/articles` → fallback `articles.seed.json` + public JSONBin + localStorage;  
- edge: JSONBin → fallback на `/articles.seed.json`;  
- если в fallback только 10 записей, больше контента физически некуда взять.

**Причина:** fallback-набор не является полным зеркалом прод-контента.  
**Последствия (10+ шагов):**
1) JSONBin временно недоступен или отвечает неконсистентно;  
2) edge уходит в fallback;  
3) клиент получает неполный список;  
4) list page `/blog` показывает только seed-объём;  
5) внутренние deep-links на отсутствующие slug начинают редиректить в `/blog`;  
6) часть переходов превращается в soft-404 сценарий;  
7) растёт bounce на листинге;  
8) падают article pageviews в GA/Метрике;  
9) падает SEO-траст к карточкам URL;  
10) бизнес теряет лиды с контента;  
11) кэш фиксирует деградацию на период TTL;  
12) оператор не видит явного алерта «мы в fallback-режиме».

**Влияние:** UI/UX (контент «пропал»), SEO (soft-404 паттерн), аналитика (просадка page_view), performance нейтрально, Cloudflare-cache усиливает эффект.  
**Варианты решения:**
- **A (безопасный приоритет):** синхронизировать `public/articles.seed.json` и `data/articles.local.json` до полного актуального набора; в CI проверять `articles_count >= expected_min`.  
- **B:** добавить runtime banner/health-флаг «fallback mode» для админа + алерт при `api_count < expected_count`.  
**Риски:** A — низкий, B — низкий/средний (нужна аккуратная UX-индикация).

### C2. Build «зелёный» даже при недоступном JSONBin
**Проблема:** прод-сборка не фейлится, когда JSONBin недоступен; silently используется local fallback.  
**Где:** `scripts/fetch-articles.js` + `scripts/config.js` (`STRICT_ARTICLES_FETCH` выключен по умолчанию).  
**Последствия:** в прод может уйти релиз с неполным контентом без блокировки pipeline.  
**Решения:**
- **A (безопасный):** для production CI включить `STRICT_ARTICLES_FETCH=true`.  
- **B:** fail build при числе статей ниже порога (`expected_min`).  
**Риск:** низкий, эффект высокий.

---

## Часть 2/5 — Критичные и серьёзные технические проблемы

### 🚨 C3. Баг сохранения в Admin: дубли вместо обновления по `id`
**Проблема:** при найденном `idIndex` используется `push`, а не update по индексу.  
**Где:** `src/app/pages/Admin.tsx` (ветка `if (idIndex !== -1)`).  
**Причина:** ошибка мутации массива.  
**Последствия:**
- дубли статей, дрейф `id/slug`,
- нестабильная нормализация на сервере,
- непредсказуемый контент для sitemap/feed/blog.

**Варианты решения:**
- **A (безопасный):** `updatedArticles[idIndex] = normalizedArticle` + защита от slug-коллизий перед сохранением.  
- **B:** перевести save-логику на `Map<slug|id, article>` с явной merge-стратегией.  
**Риск:** A — низкий/средний, B — средний (рефакторинг шире).

### ⚠️ S1. Риск дублей аналитики: GTM + прямой gtag
**Где:** инициализируется GTM и отдельно `gtag.js` + ручной `trackPageView`.  
**Последствия:** двойные `page_view`/события, искажённые CPL/CPA/ROAS.  
**Решения:**
- **A (безопасный):** единый ingest GA через GTM, прямой gtag оставить только как fallback.  
- **B:** оставить оба, но включить строгий dedupe guard (event_id/flag/session guard).

### ⚠️ S2. Неконсистентность роутов SPA vs static generator
**Где:** SPA имеет `/faq`, `/marketing-glossary`, `/roi-calculator`, `/offer`, `/cookie-policy`; генератор рендерит `/services` и не покрывает часть SPA-роутов.  
**Последствия:** дрейф индексации, разная SEO-картина по окружениям, риск битых canonical-ожиданий.  
**Решения:**
- **A (безопасный):** единый реестр маршрутов (single source of truth) для router+sitemap+generator.  
- **B:** отказаться от статического генератора для non-blog страниц и держать только edge SEO.

### ⚠️ S3. Кэширование `/api/articles` может закреплять деградацию
**Где:** `Cache-Control: public, s-maxage=120, stale-while-revalidate=300`.  
**Последствия:** в окно деградации пустой/неполный ответ размножается через edge cache.  
**Решения:**
- **A:** не кэшировать ответы с `articles.length === 0`;  
- **B:** добавить short TTL при fallback-режиме (например, 15–30 сек).

---

## Часть 3/5 — Средние и мелкие проблемы

### 🔧 M1. SEO non-blog страниц в основном клиентский
**Где:** `SEO.tsx` через `useEffect`; edge-HTML в основном покрывает `/blog/:slug`.  
**Риск:** часть ботов/парсеров может видеть базовый `index.html` до JS-гидратации.

### 🔧 M2. A11y/UX: интерактивные `div`/`li` вместо семантических элементов
**Где:** CTA в `Blog.tsx`, кликабельные `li` в `Footer.tsx`.  
**Риск:** хуже клавиатурная доступность, фокус, SR-навигация.

### 🔧 M3. Дублирование SEO-пайплайна
**Где:** `scripts/generate-pages.js` и `functions/_lib/seo.ts` параллельно формируют SEO-слой.  
**Риск:** расхождение мета/роутов при изменениях.

### 🧩 m1. Пустой портфолио-линк
**Где:** `href="#"` в `Footer.tsx`.  
**Риск:** UX/SEO-мусорный переход.

### 🧩 m2. Соцссылки ThankYou нужно регулярно валидировать
**Где:** `ThankYou.tsx` (`instagram`, `youtube`).  
**Риск:** 404/редиректы на невалидные профили.

### 🧩 m3. Производительность
**Факт сборки:** крупные чанки `vendor/index` (сотни KB до gzip), запас оптимизаций есть (более агрессивный lazy-load UI/analytics).

---

## Часть 4/5 — Безопасный план внедрения (без правок в код сейчас)

### P0 (контент/инцидент)
1. Синхронизировать seed/local с актуальным прод-набором.  
2. Включить CI guard (`STRICT_ARTICLES_FETCH=true` для production).  
3. Добавить health-check: `articles_count`, `fallback_mode`, `jsonbin_status`.

### P1 (целостность данных)
4. Исправить Admin update-by-id bug.  
5. Добавить anti-duplicate проверку slug/id до PUT.

### P1 (аналитика)
6. Выбрать единую модель отправки GA (через GTM или direct), включить dedupe-guard.  
7. Провести сверку в GA4 DebugView + GTM Preview + Метрика realtime.

### P2 (SEO архитектура)
8. Единый route-registry для router/sitemap/static-generator.  
9. Поэтапно расширить edge prerender для ключевых non-blog страниц.

### P3 (UX/A11y/perf)
10. Заменить интерактивные `div/li` на `button/a` без изменения стилей/анимаций.  
11. Оптимизировать тяжёлые чанки и third-party загрузку после consent.

---

## Часть 5/5 — Чеклист ручной проверки (35 пунктов)

1. `/blog` показывает ожидаемое количество статей.  
2. Каждая карточка открывает правильный `/blog/{slug}`.  
3. Deep-link `/blog/{slug}` работает после hard reload.  
4. Нет неожиданных редиректов на `/blog`.  
5. `/api/articles` status=200 + валидный JSON.  
6. Проверить `articles.length` vs expected.  
7. Проверить `CF-Cache-Status` для `/api/articles`.  
8. Проверить `CF-Cache-Status` для `/blog/{slug}`.  
9. `/sitemap.xml` содержит все slug.  
10. `/feed.xml` содержит нужные статьи.  
11. `robots.txt` указывает правильный sitemap.  
12. Canonical у статьи совпадает с URL.  
13. OG title/description/image корректны.  
14. JSON-LD Article валиден.  
15. JSON-LD FAQ валиден (где есть FAQ).  
16. При недоступном JSONBin включается fallback без падения UI.  
17. Пустой fallback не кэшируется надолго.  
18. `/api/admin/articles` имеет `no-store`.  
19. Cloudflare Rocket Loader не ломает GTM/GA/YM.  
20. Cloudflare Auto Minify JS не ломает события.  
21. Transform Rules не переписывают `/api/*` нежелательно.  
22. Нет 404/CORS ошибок в console/network на статьях.  
23. `virtual_pageview` отправляется один раз на переход.  
24. GA4 DebugView не показывает дубли page_view.  
25. GTM Preview: нет повторной отправки конфиг-тегов.  
26. Метрика goal `thank_you_page_view` срабатывает 1 раз.  
27. События lead/form_submit не дублируются.  
28. Cookie Reject блокирует analytics/marketing загрузки.  
29. Cookie Accept активирует нужные теги.  
30. Проверить keyboard navigation по CTA/карточкам.  
31. Проверить focus states интерактивных элементов.  
32. Проверить mobile layout cookie-banner и z-index.  
33. Проверить LCP/INP на `/` и `/blog/{slug}`.  
34. Проверить валидность ссылок соцсетей.  
35. Проверить, что после админ-сохранения нет дублей по `id/slug`.
