# Журнал: пакет A, группа page-lists (06.10.2026)

Файлы группы: `src/app/pages/BlogPage.tsx`, `src/app/pages/CasesPage.tsx`, `src/app/context/ArticlesContext.tsx`,
`src/app/components/Blog.tsx`, `src/app/components/CaseArticleView.tsx`, `src/app/utils/blogListing.ts`.
Задание: режим списка `/blog` и `/cases` пригоден к серверному рендеру и гидратации (A1) + аудит F-003/F-004/F-012.
Одна строка на шаг: что сделано, что проверено.

## Записи

- Прочитаны: `perf-a-scout.md` целиком, CLAUDE.md «Первый экран приходит из HTML», `ssr-entry.tsx`, `main.tsx`,
  `firstScreen.ts`, `ClientOnly`, оба теста первого экрана, генератор (`toInlineArticleSummary`, `listSeeds`,
  `renderArticleListPage`), находки F-003/F-004/F-012. Решения: порядок seed-а блога = порядок React (новые по дате,
  при равной дате по `id`, как отдаёт API) — выношу в `blogListing.ts`, чтобы генератор брал ту же функцию.
