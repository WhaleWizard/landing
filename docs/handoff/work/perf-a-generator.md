# Пакет A — группа «generator», журнал (06.10.2026)

Файлы группы: `scripts/generate-pages.js`, `scripts/ssr-entry.tsx`, `scripts/content-entry.tsx`, `scripts/config.js`,
`scripts/first-screen-hydration.test.js`, `scripts/first-screen-render.test.js`, `scripts/generated-seo.test.js`,
`src/main.tsx`, `src/app/utils/firstScreen.ts`.

Одна строка на шаг: что сделано — что проверено.

- Прочитаны: perf-a-scout.md, PERF_PLAN, ssr-entry, generate-pages, main.tsx, firstScreen.ts, оба теста первого экрана,
  generated-seo.test.js, ArticlesContext, routePreload, routes.tsx, article-page.ts (подмена seed живой статьёй).
- План: (1) A5 — normalizeArticles сохраняет id/caseData/featuredOrder; (2) SSR_ROUTES на все STATIC_ROUTES + /thank-you,
  renderRoute принимает список статей для /blog и /cases; (3) generate-pages: renderRoute для всех маршрутов, проверка
  по маршруту вместо `id="hero"`, оболочка после #root — только нав + список ссылок на статьи (/blog, /cases) и
  словарь, если определений нет в React-разметке; (4) main.tsx — без гидратации /blog и /cases при фильтрах в адресе;
  (5) тесты: первый экран всех маршрутов, статья рендерится нормализованной и гидратируется сырой.
