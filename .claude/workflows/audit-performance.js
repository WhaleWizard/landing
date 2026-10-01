export const meta = {
  name: 'audit-performance',
  description: 'Аудит скорости и лагов (не отработал в аудите 23–24.09): поиск → перепроверка → запись находок в audit-findings.json',
  whenToUse: 'Довести аудит до конца по скорости после исправления основных находок',
  phases: [
    { title: 'Find', detail: 'бандлы, кэш, лаги в коде, живые замеры' },
    { title: 'Verify', detail: 'перепроверка каждой находки' },
    { title: 'Record', detail: 'запись подтверждённого в audit-findings.json и FIX_PLAN.md' },
  ],
}

const FINDINGS = 'docs/handoff/audit-findings.json'

const RULES = `
Проект whalewzrd.com (ты в корне репозитория). Это фаза ПОИСКА: код не править, не делать git-операции, не входить в админку,
не слать заявки и события; production — только GET, не больше ~100 запросов. docs/DESIGN_LOCK.md: вид и анимации не меняются —
находка допустима, только если её исправление делает то же самое дешевле (владелец уже отклонял снятие backdrop-filter ради скорости).
Сначала прочитай audit-reports/PERFORMANCE-2026-09-27-*.md — это оптимизация владельца после аудита; сделанное там не повторяй.
Уже известные находки — ${FINDINGS}; не повторяй их.
Качество: только подтверждённое — файл и строка или замер/вывод команды, сценарий «что делает человек → что тормозит», конкретная правка.
`

const FINDING = {
  type: 'object',
  properties: {
    title: { type: 'string' }, severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low'] },
    file: { type: 'string' }, line: { type: 'integer' }, evidence: { type: 'string' }, scenario: { type: 'string' },
    fix: { type: 'string' }, fixChangesLook: { type: 'boolean' },
  },
  required: ['title', 'severity', 'file', 'line', 'evidence', 'scenario', 'fix', 'fixChangesLook'],
}
const FINDINGS_SCHEMA = { type: 'object', properties: { findings: { type: 'array', items: FINDING }, coverage: { type: 'string' } }, required: ['findings', 'coverage'] }
const VERDICT = { type: 'object', properties: { verdict: { type: 'string', enum: ['confirmed', 'refuted', 'intentional', 'unclear'] }, reasoning: { type: 'string' }, fixNotes: { type: 'string' } }, required: ['verdict', 'reasoning', 'fixNotes'] }

phase('Find')
const found = await agent(`${RULES}
Область: скорость и лаги.
1) Собери проект один раз (npm run build) и разбери dist/: начальный JS и CSS главной и других страниц (какие чанки грузятся сразу —
   dist/index.html и статические HTML роутов), что зря попало в начальный бандл (motion целиком, админские модули и иконки, большие
   данные, lucide целиком, jsdom/linkedom), дубли модулей между чанками, блокирующие стили, шрифты и preload, вес картинок.
2) Заголовки кэша на production для HTML, /assets/*, картинок, шрифтов, /api/* (curl -I).
3) В коде — источники лагов: тяжёлые вычисления в рендере без memo, эффекты без зависимостей, setState на scroll/resize без
   троттлинга, ResizeObserver с чтением геометрии (запрещено правилом проекта), длинные списки без ограничения (админка на 600 статей,
   заявки), canvas-сцены (PlexusBackdrop, CosmicHeroScene, ThanksCosmicScene, ConsultDeskScene) — батчинг, пауза вне экрана и
   в фоновой вкладке, prefers-reduced-motion.
4) Если есть встроенный браузер — замерь на production LCP/CLS/long tasks (PerformanceObserver) для главной, /meta-ads/, /blog/, статьи.`,
  { label: 'find:performance', phase: 'Find', schema: FINDINGS_SCHEMA })

const list = found ? found.findings : []
log(`Найдено: ${list.length}`)

phase('Verify')
const verified = await parallel(list.map((f) => () => agent(`${RULES}
Ты — СКЕПТИК. Попробуй опровергнуть находку: прочитай код целиком, при возможности замерь. Затем проверь правила проекта
(задумано ли так, не меняет ли исправление вид). Задумано — intentional; не подтвердилось — refuted; подтвердилось — confirmed
и уточни в fixNotes, как чинить, не меняя вида.
Находка: ${JSON.stringify(f)}`, { label: `verify:${String(f.file).split('/').pop()}:${f.line}`, phase: 'Verify', schema: VERDICT })
  .then((v) => ({ ...f, verdict: v }))))
const confirmed = verified.filter(Boolean).filter((f) => f.verdict && f.verdict.verdict === 'confirmed')
log(`Подтверждено: ${confirmed.length}`)

phase('Record')
const record = confirmed.length ? await agent(`Ты ведёшь учёт, код не правишь. Допиши подтверждённые находки скорости в ${FINDINGS}
(валидный JSON-массив; id «P-001», «P-002»…; category "performance"; status "open"; group — по владению файлами из docs/handoff/FIX_PLAN.md,
файлы вне всех групп — group "seo-build"; fixNotes — из verdict.fixNotes; rulesNotes пусто). В docs/handoff/FIX_PLAN.md добавь их
пунктами [ ] в свои группы и в audit-reports/AUDIT-2026-09-24.md — раздел «Скорость (добор 2026)» тем же форматом, что остальные находки.
Находки: ${JSON.stringify(confirmed)}
Покрытие проверки: ${found ? found.coverage : ''}
Верни коротко, что записал.`, { label: 'record', phase: 'Record' }) : 'нечего записывать'

return { found: list.length, confirmed: confirmed.length, coverage: found ? found.coverage : null, record }
