export const meta = {
  name: 'article-serp-standard',
  description: 'Разбор топа выдачи по 40 запросам карты → docs/seo/SERP_ANALYSIS.md и черновик docs/ARTICLE_STANDARD.md',
  whenToUse: 'После article-map-merge: этап 2 программы статей (docs/SEO_PROGRAM.md)',
  phases: [
    { title: 'Select', detail: 'выбор 40 запросов из карты' },
    { title: 'SERP', detail: 'пачки по 5 запросов: поиск, чтение топа, разбор' },
    { title: 'Synthesis', detail: 'закономерности, черновик стандарта' },
    { title: 'Critique', detail: 'что упущено и что противоречит правилам' },
    { title: 'Final', detail: 'правки по критике' },
  ],
}

const WORK = 'docs/handoff/work/serp'
const RULES = `
Проект whalewzrd.com (ты в корне репозитория): блог таргетолога для его клиентов — владельцев бизнеса, русский язык, СНГ без России.
Главные ниши — приложения (Meta Apps) и инфобизнес. Правила текста: docs/SEO_PROGRAM.md, docs/BLOG_RULES.md, docs/VOICE.md,
решения владельца — docs/handoff/README.md. Не выдумывать цифры; без воды; первое лицо практика; граница Meta Apps — без пошагового
плейбука; чужой текст не копировать (только структура и приёмы, цитаты не длиннее 15 слов).
Инструменты: WebSearch и WebFetch (загрузи через ToolSearch "select:WebSearch,WebFetch").
`

const PICK = {
  type: 'object',
  properties: { batches: { type: 'array', items: { type: 'array', items: { type: 'object', properties: { slug: { type: 'string' }, target_query: { type: 'string' }, title: { type: 'string' }, cluster: { type: 'string' }, section: { type: 'string' }, intent: { type: 'string' } }, required: ['slug', 'target_query', 'title', 'cluster', 'section', 'intent'] } } } },
  required: ['batches'],
}
phase('Select')
const pick = await agent(`${RULES}
Прочитай docs/seo/article-map.csv. Выбери 40 строк для разбора выдачи: все строки волны 1 с коммерческим и доверительным намерением
в приоритете, затем по 3–5 из каждого кластера, чтобы были представлены все разделы; обязательно приложения и инфобизнес.
Разбей на 8 пачек по 5 строк. Верни по схеме.`, { label: 'select', phase: 'Select', schema: PICK })
const batches = pick ? pick.batches : []

const SERP_SCHEMA = {
  type: 'object',
  properties: {
    queries: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          query: { type: 'string' }, slug: { type: 'string' }, serpType: { type: 'string' },
          pages: { type: 'array', items: { type: 'object', properties: { url: { type: 'string' }, kind: { type: 'string' }, h1: { type: 'string' }, outline: { type: 'array', items: { type: 'string' } }, words: { type: 'integer' }, blocks: { type: 'array', items: { type: 'string' } }, experienceSignals: { type: 'string' }, weaknesses: { type: 'string' } }, required: ['url', 'kind', 'h1', 'outline', 'words', 'blocks', 'experienceSignals', 'weaknesses'] } },
          whatWinsHere: { type: 'string' }, gapForUs: { type: 'string' }, intentCheck: { type: 'string' },
        },
        required: ['query', 'slug', 'serpType', 'pages', 'whatWinsHere', 'gapForUs', 'intentCheck'],
      },
    },
  },
  required: ['queries'],
}

phase('SERP')
// Пачки идут по две, а не все сразу: так сессия реже упирается в лимит, и готовые пачки сохраняются.
const analysed = []
for (let i = 0; i < batches.length; i += 2) {
  const pair = batches.slice(i, i + 2)
  const res = await parallel(pair.map((batch, k) => () => agent(`${RULES}
Разбери выдачу по ${batch.length} запросам карты статей. Для каждого:
1) WebSearch по целевой фразе как есть; что в топе: статьи, страницы услуг, агрегаторы, видео, форумы.
2) WebFetch трёх лучших текстовых материалов: вид страницы, H1, план по подзаголовкам, объём в словах, блоки (краткий ответ, цены,
   кейс с цифрами, таблица, чек-лист, FAQ, калькулятор, автор с опытом, дата), чем показан опыт автора, слабости.
3) Вывод: что общего у топа, какой пробел закроет практик, совпадает ли намерение выдачи с нашим заголовком.
Строки карты: ${JSON.stringify(batch)}
Сырые заметки сохрани в ${WORK}/batch-${i + k + 1}.md, в ответ — структура по схеме.`,
    { label: `serp:${i + k + 1}`, phase: 'SERP', schema: SERP_SCHEMA })))
  analysed.push(...res.filter(Boolean).flatMap((r) => r.queries))
  log(`Разобрано запросов: ${analysed.length}`)
}

phase('Synthesis')
const synthesis = await agent(`${RULES}
По разбору выдачи ${analysed.length} запросов (JSON ниже) напиши:
1) docs/seo/SERP_ANALYSIS.md — что стоит в топе: типы выдачи по кластерам, объём и структура, блоки почти у всех, как показывают опыт,
   общие слабости топа, где практик выигрывает; таблица по каждому запросу; список строк карты, где намерение выдачи не совпадает
   с заголовком или углом, и что поправить.
2) docs/ARTICLE_STANDARD.md — ЧЕРНОВИК стандарта коммерческой статьи на согласование владельцу: структура и обязательные блоки
   (краткий ответ в начале, шаблон ниши из SEO_STRATEGY.md раздел 8), объём по типам статей (из разбора, не с потолка), требования к опыту
   (банк опыта — docs/seo/EXPERIENCE_BANK_QUESTIONS.md), правила цифр, внутренние ссылки, FAQ, заголовок и SEO-поля словами клиента,
   правило Meta Apps, русские признаки машинного текста (скилл ru-ai-tells, если есть; иначе docs/seo/REVIEW_GATES_NOTES.md), ворота
   приёмки (docs/seo/REVIEW_GATES_NOTES.md раздел 4) — проверяемыми критериями «да/нет». Вверху — «Черновик, ждёт согласования
   владельца» и 3–5 вопросов владельцу.
Простой язык, без воды, цифры только из разбора.
Данные: ${JSON.stringify(analysed)}
Верни 5–8 главных выводов.`, { label: 'synthesis', phase: 'Synthesis' })

phase('Critique')
const critique = await agent(`${RULES}
Строгий проверяющий: прочитай docs/seo/SERP_ANALYSIS.md и docs/ARTICLE_STANDARD.md. Найди выводы без опоры на разбор, цифры с потолка,
критерии, которые агент не проверит, противоречия с docs/SEO_PROGRAM.md, docs/BLOG_RULES.md, docs/VOICE.md, пропуски важного для
ранжирования, цитирования ИИ и заявки. Сырые заметки — ${WORK}/batch-*.md. Верни нумерованный список правок. Ничего не редактируй.`,
  { label: 'critic', phase: 'Critique' })

phase('Final')
const final = await agent(`${RULES}
Примени правки проверяющего к docs/seo/SERP_ANALYSIS.md и docs/ARTICLE_STANDARD.md (с чем не согласен — перечисли с причиной).
Правки: ${critique}
Верни: что изменено, что отклонено, итоговые вопросы владельцу.`, { label: 'final', phase: 'Final' })

return { analysedCount: analysed.length, synthesis, final }
