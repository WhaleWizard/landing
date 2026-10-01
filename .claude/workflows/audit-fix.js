export const meta = {
  name: 'audit-fix',
  description: 'Исправление открытых находок аудита по группам файлов: сверка с кодом → правка → независимое ревью → доработка → учёт статусов',
  whenToUse: 'Продолжить исправление находок из docs/handoff/audit-findings.json. args: { groups?: string[], waveSize?: number }',
  phases: [
    { title: 'Fix', detail: 'по исполнителю на группу: сверка, правка, тест' },
    { title: 'Review', detail: 'независимое ревью правок группы' },
    { title: 'Repair', detail: 'доработка по замечаниям' },
    { title: 'Bookkeeping', detail: 'статусы в audit-findings.json и галочки в FIX_PLAN.md' },
  ],
}

// Пути — от корня репозитория. Журналы правок — docs/handoff/work/fix-<группа>.md.
const FINDINGS = 'docs/handoff/audit-findings.json'
const WORK = 'docs/handoff/work'

const ORDER = ['admin-api-core', 'admin-shell', 'editor', 'routing', 'blog', 'forms', 'server-public', 'seo-build', 'admin-api-money', 'admin-crm-ui']
const OWNERSHIP = {
  'routing': 'src/app/utils/preloadable.ts, siteNavigation.ts, routeFocus.ts, scrollRestoration.ts, memoizedImport.ts; src/app/routes.tsx; src/app/components/Navbar.tsx',
  'blog': 'src/app/pages/BlogPage.tsx, CasesPage.tsx, MarketingGlossaryPage.tsx; src/app/context/ArticlesContext.tsx; src/app/components/Blog.tsx, CaseArticleView.tsx; src/app/utils/articleDate.ts, articleMeta.ts, articleCategory.ts, blogListing.ts, homeArticles.ts; src/app/data/blogSections.ts',
  'forms': 'src/app/utils/leadRetryQueue.ts, leadRetryConsent.ts, leadContext.ts, phoneCountry.ts, webVitals.ts, geoLookup.ts; src/app/components/ContactForm.tsx, LandingForm.tsx, MarketingCalculator.tsx, BudgetCalculator.tsx, CountryFlag.tsx; src/app/components/cookie/*; src/app/consent/consent.ts; src/app/calculator/engine.ts',
  'editor': 'src/app/components/ArticleEditor.tsx, CaseFieldsEditor.tsx',
  'admin-shell': 'src/app/pages/Admin.tsx; src/app/components/admin/AdminFaqControl.tsx, AdminContentControl.tsx, SeoAssistant.tsx, ArticleCalendar.tsx, AdminMedia.tsx, PublishSchedulePanel.tsx, AdminCommandPalette.tsx, AdminSecurity.tsx; src/app/utils/publishSchedule.ts, prepareImageUpload.ts',
  'admin-crm-ui': 'src/app/components/admin/AdminLeads.tsx, CrmAnalytics.tsx, CrmBoard.tsx, AdminFinance.tsx, caseFromClient.ts, AdminClients.tsx, AdminPlanner.tsx, TodayPlan.tsx, TodayNote.tsx, AdminAdSpend.tsx, AdminGoals.tsx, AdminReport.tsx, AdminToday.tsx, AdminAttribution.tsx',
  'admin-api-money': 'functions/api/admin/report.ts, crm-analytics.ts, clients.ts, crm-leads.ts, goals.ts, finance.ts, ad-spend.ts, attribution.ts, stats.ts, today.ts, performance.ts, lead-crm.ts, lead-trash.ts; functions/_lib/admin-alerts.ts, admin-crm.ts, local-day.ts, money.ts',
  'admin-api-core': 'functions/api/admin/auth.ts, _middleware.ts, articles.ts, articles-featured.ts, articles-schedule.ts, upload.ts, media.ts, page-locks.ts, page-lock-preview.ts; functions/api/page-lock-notify.ts, meta-test-event.ts; functions/_lib/jsonbin.ts, d1.ts, page-lock-preview.ts, page-locks.ts, admin-session.ts, admin-2fa.ts, admin-totp.ts, auth.ts; scripts/import-articles.mjs, admin-client.mjs',
  'server-public': 'functions/_lib/meta-request.ts, leads.ts, tracking-signature.ts, article-page.ts, seo.ts, articles.ts, article-cache.ts, meta-capi.ts, meta-outbox.ts; functions/api/articles.ts, pageview.ts, lead.ts, meta-event.ts; functions/blog/*, functions/cases/*, functions/sitemap.xml.ts, functions/feed.xml.ts',
  'seo-build': 'scripts/* (кроме import-articles.mjs и admin-client.mjs), public/*, vite.config.ts, src/app/pages/ServiceLandingPage.tsx, src/app/components/Footer.tsx, src/styles/*',
}

const groups = (args && Array.isArray(args.groups) && args.groups.length ? args.groups : ORDER).filter((g) => OWNERSHIP[g])
// Меньше параллельных исполнителей — меньше шанс упереться в лимит сессии всем сразу.
const WAVE = (args && Number(args.waveSize)) || 3

const RULES = `
Проект whalewzrd.com (ты в корне репозитория). Владелец — маркетолог, не разработчик. Идёт исправление находок
аудита. Прочитай docs/handoff/README.md и docs/handoff/FIX_PLAN.md (раздел «Как работать»).
Находки — ${FINDINGS} (поля id, group, severity, title, file, line, scenario, fix, fixNotes, rulesNotes,
fixChangesLook, status). Бери только status = "open". fixNotes и rulesNotes — уточнения независимых проверяющих;
если они расходятся с fix, верь им (особенно rulesNotes).

Строки в находках — на момент аудита (23–24.09); после него вышел коммит e55dce6 и последующие. ПЕРВЫМ делом
для каждой находки проверь текущий код и реши, есть ли ещё проблема.

Нельзя нарушать (CLAUDE.md ты видел):
- docs/DESIGN_LOCK.md: вид и анимации не меняются (скриншот до/после совпадает) — иначе статус changes-look.
- Meta CAPI и согласие неприкосновенны; правил трекинг — прогони npm run test:meta-capi.
- Не выдумывать числа: «нет данных» вместо нуля, валюты не смешивать.
- Решения владельца не трогать: кнопка cookie на первом экране наезжает на кнопку; повторная заявка переоткрывает сделку.
- Раздел без миграции объясняет себя (MIGRATION_REQUIRED).
- Новое бизнес-правило или выбор за владельцем — не делай, статус needs-owner с объяснением.

Параллельно другие исполнители правят ДРУГИЕ файлы:
- Редактируй ТОЛЬКО файлы своей группы. Новый тест — один файл scripts/audit-<группа>.test.js (node:test, как соседние
  scripts/*.test.js; TS-модули собирать esbuild в памяти). Если файл уже есть — дописывай в него.
- НЕ трогай package.json, CLAUDE.md, AGENTS.md, ${FINDINGS}, docs/handoff/FIX_PLAN.md, чужие файлы и существующие тесты —
  нужные изменения опиши в existingTestsToUpdate / crossGroup.
- НЕ запускай npm run build, npm run check, генераторы, git stash/checkout/reset/commit/push.
- Можно: node --test scripts/<файл>.test.js, npm run test:meta-capi, typecheck
  (npx -p typescript tsc -p tsconfig.app.json --noEmit / tsconfig.functions.json) — ошибки в чужих файлах игнорируй.
- Не трогай production, не входи в админку, не шли заявки и события в Meta.
Работай по одной находке; после каждой дописывай строку в ${WORK}/fix-<группа>.md (id, статус, файлы, что сделано) —
если сессия оборвётся, следующая продолжит с этого места. Правка минимальная, в стиле окружающего кода.
`

const FIX_SCHEMA = {
  type: 'object',
  properties: {
    results: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, status: { type: 'string', enum: ['fixed', 'already-fixed', 'not-reproducible', 'needs-owner', 'changes-look', 'needs-cross-group', 'failed'] }, files: { type: 'array', items: { type: 'string' } }, note: { type: 'string' } }, required: ['id', 'status', 'files', 'note'] } },
    changedFiles: { type: 'array', items: { type: 'string' } },
    newTests: { type: 'array', items: { type: 'string' } },
    existingTestsToUpdate: { type: 'array', items: { type: 'object', properties: { file: { type: 'string' }, why: { type: 'string' } }, required: ['file', 'why'] } },
    crossGroup: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, file: { type: 'string' }, change: { type: 'string' } }, required: ['id', 'file', 'change'] } },
    testsRun: { type: 'string' },
  },
  required: ['results', 'changedFiles', 'newTests', 'existingTestsToUpdate', 'crossGroup', 'testsRun'],
}
const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    issues: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, file: { type: 'string' }, problem: { type: 'string' }, fix: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'major', 'minor'] } }, required: ['id', 'file', 'problem', 'fix', 'severity'] } },
    verdict: { type: 'string' },
  },
  required: ['issues', 'verdict'],
}

const out = []
for (let i = 0; i < groups.length; i += WAVE) {
  const wave = groups.slice(i, i + WAVE)
  log(`Волна ${i / WAVE + 1}: ${wave.join(', ')}`)
  const done = await pipeline(
    wave,
    (group) => agent(`${RULES}
ТВОЯ ГРУППА: «${group}» — записи с group = "${group}" и status = "open" в ${FINDINGS}.
Файлы, которые можно править: ${OWNERSHIP[group]}.
Если ${WORK}/fix-${group}.md уже есть — это журнал прошлой оборвавшейся попытки: продолжи с первой необработанной находки,
сделанное сверь с кодом. Для каждой находки: сверка → правка → тест в scripts/audit-${group}.test.js → связанные тесты.
Верни результат по схеме; changedFiles — все изменённые и созданные файлы.`,
      { label: `fix:${group}`, phase: 'Fix', schema: FIX_SCHEMA }).then((fix) => ({ group, fix })),
    (prev) => {
      if (!prev.fix || prev.fix.changedFiles.length === 0) return { ...prev, review: null }
      return agent(`${RULES}
Ты — НЕЗАВИСИМЫЙ РЕВЬЮЕР правок группы «${prev.group}». Ничего не редактируй.
Отчёт исполнителя: ${JSON.stringify(prev.fix)}
Посмотри git diff -- ${prev.fix.changedFiles.join(' ')} и исходные находки группы в ${FINDINGS}.
По каждой правке: устранена ли проблема (воспроизведи node-скриптом во временной папке, если можно); не сломаны ли вызывающие
места (grep); нет ли новых ошибок (гонки, null, типы, часовой пояс Ташкента, кэш); не меняется ли вид; не ослаблен ли трекинг;
не нарушено ли «не выдумывать числа». Проверь и статусы already-fixed / not-reproducible. Прогони scripts/audit-${prev.group}.test.js
и связанные тесты. blocker — правка неверна или ломает; major — неполная; minor — мелочь. Пустой список, если всё хорошо.`,
        { label: `review:${prev.group}`, phase: 'Review', schema: REVIEW_SCHEMA }).then((review) => ({ ...prev, review }))
    },
    (prev) => {
      const issues = prev.review ? prev.review.issues.filter((x) => x.severity !== 'minor') : []
      if (!issues.length) return { ...prev, repair: null }
      return agent(`${RULES}
ТВОЯ ГРУППА: «${prev.group}». Можно править: ${OWNERSHIP[prev.group]} и scripts/audit-${prev.group}.test.js.
Ревьюер нашёл замечания к правкам группы — исправь (с чем не согласен — объясни в note и не меняй).
Замечания: ${JSON.stringify(issues)}
Отчёт исполнителя: ${JSON.stringify(prev.fix)}
Верни результат по той же схеме: results — по id находок из замечаний; changedFiles — что изменил сейчас.`,
        { label: `repair:${prev.group}`, phase: 'Repair', schema: FIX_SCHEMA }).then((repair) => ({ ...prev, repair }))
    },
  )
  out.push(...done.filter(Boolean))
}

phase('Bookkeeping')
const summary = out.map((g) => ({
  group: g.group,
  results: [...(g.fix ? g.fix.results : []), ...(g.repair ? g.repair.results : [])],
  newTests: g.fix ? g.fix.newTests : [],
  existingTestsToUpdate: g.fix ? g.fix.existingTestsToUpdate : [],
  crossGroup: [...(g.fix ? g.fix.crossGroup : []), ...(g.repair ? g.repair.crossGroup : [])],
  reviewVerdict: g.review ? g.review.verdict : null,
  openReviewIssues: g.review ? g.review.issues.filter((x) => x.severity === 'minor') : [],
}))
const book = await agent(`${RULES}
Ты ведёшь учёт (правки кода не делаешь). По итогам групп ниже:
1) В ${FINDINGS} обнови поле status у затронутых находок: «fixed: <сегодняшняя дата>, <файлы>», «already-fixed», «not-reproducible»,
   «needs-owner: <почему>», «changes-look: <почему>», «needs-cross-group: <что и где>», «failed: <почему>». Остальное не трогай, JSON валидный.
2) В docs/handoff/FIX_PLAN.md поставь [x] у исправленных и уже исправленных, допиши в «Стыки» все crossGroup и existingTestsToUpdate.
3) В package.json добавь для каждого нового scripts/audit-<группа>.test.js скрипт "test:audit-<группа>" и вставь его в цепочку "check"
   перед "npm run build". Ничего больше в package.json не меняй.
Итоги: ${JSON.stringify(summary)}
Верни коротко: сколько находок в каком статусе и что осталось сделать руками.`, { label: 'bookkeeping', phase: 'Bookkeeping' })

return { summary, bookkeeping: book }
