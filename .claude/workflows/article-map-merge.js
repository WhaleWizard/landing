export const meta = {
  name: 'article-map-merge',
  description: 'Карта статей: свести черновик 8 кластеров в docs/seo/article-map.csv → два критика → правка',
  whenToUse: 'Когда вернёмся к статьям. Черновик — docs/seo/article-map-draft/, отчёт исполнителей — clusters-report.json',
  phases: [
    { title: 'Merge', detail: 'сведение, повторы, нынешние статьи, проверка формата и реальности запросов' },
    { title: 'Critique', detail: 'каннибализация и массовость; язык клиента, Meta Apps, Россия, разделы' },
    { title: 'Fix', detail: 'правки критиков и повторная проверка' },
  ],
}

const DRAFT = 'docs/seo/article-map-draft'
const HEADER = 'slug;target_query;related_queries;cluster;section;intent;markets;title;angle;wave;source;notes'

// Нынешние статьи блога, которые переписываются первыми: слаги не меняются (у адресов есть возраст).
// Опорную статью kak-meta-ads-i-google-ads-sozdayut-effektivnuyu-voronku-prodazh не трогаем.
const REWRITE = [
  'plan-zapuska-reklamy-na-30-dney-meta-ads-google-ads-pod-klyuch',
  'b2b-lidogeneratsiya-cherez-google-ads-i-meta-ads-kak-poluchat-sql-a-ne-prosto-lidy',
  'analitika-i-atributsiya-v-2026-kak-perestat-sporit-o-lidah-i-schitat-pribyl',
  'antikrizisnyy-kontrol-reklamy-chto-delat-kogda-cpa-rastet-kazhdyy-den',
  'lokalnyy-biznes-i-geo-reklama-v-2026-kak-privesti-klientov-v-tochku-prodazh',
  'masshtabirovanie-e-commerce-v-meta-i-google-bez-poteri-rentabelnosti',
  'retargeting-v-2026-kak-rabotat-na-first-party-dannyh-bez-sliva-byudzheta',
  'polnaya-voronka-prodazh-2026-meta-ads-google-ads-ot-pervogo-kasaniya-do-sdelki',
  'google-ads-v-2026-kak-svyazka-search-performance-max-daet-stabilnyy-roi',
  'kak-snizit-cpa-v-meta-ads-v-2026-rabochaya-sistema-a-ne-magiya',
]

const CONTEXT = `
Проект whalewzrd.com (ты в корне репозитория). Блог таргетолога (Meta Ads, Google Ads) для его клиентов — владельцев бизнеса,
от первого лица владельца, на русском, рынки СНГ без России. Главные ниши — приложения (Meta Apps) и инфобизнес.
Прочитай: docs/handoff/README.md (решения владельца по статьям), docs/SEO_STRATEGY.md раздел 8, docs/SEO_PROGRAM.md,
docs/SEO_PRESENCE.md, src/app/data/blogSections.ts (колонка section — точно одно из семи полных названий разделов блога),
docs/seo/semantic-core-v2.csv (реальные фразы), ${DRAFT}/clusters-report.json (почему исполнители недобрали строки).

Правила строки карты (формат «;», заголовок: ${HEADER}, в конце колонка status = план | перепись):
- target_query — реальная фраза: из ядра (source=core) или из подсказок Google (source=suggest:<gl>). Журналы подсказок черновика
  утеряны; строки с source=suggest:* проверь выборочно (каждую пятую) запросом
  curl -s "https://suggestqueries.google.com/complete/search?client=firefox&hl=ru&gl=<gl>&q=<urlencoded>" — не подтвердилась фраза
  ни в одном из рынков kz, uz, by, ua — замени на реальную или убери строку. Частотности не писать нигде.
- одна статья = одна ситуация клиента; вариации, страны и города — в related_queries, не отдельными статьями;
- title — словами клиента, до 75 знаков, без «в 2026»; angle — что конкретно отличает статью от соседних; slug — транслит, до 60 знаков, уникальный;
- граница Meta Apps: раскрывать экономику, боли, ошибки, подготовку, оценку, кейсы; закрыт только пошаговый плейбук настроек;
- без России (Директ, VK, рубли).
`

phase('Merge')
const merged = await agent(`${CONTEXT}
Сведи черновик (${DRAFT}/cluster-*.csv) в docs/seo/article-map.csv:
1) склей строки, добавь колонку status;
2) убери повторы между кластерами (одинаковый slug, target_query или та же ситуация другими словами): оставь строку там, где намерение
   точнее, фразы второй перенеси в related_queries;
3) нынешние статьи для переписи: ${JSON.stringify(REWRITE)} (заголовки — в public/articles.seed.json). Для каждой найди строку с тем же
   намерением и поставь её slug старым, status=перепись, wave=1, в notes «перепись: старый заголовок …»; нет подходящей — добавь строку;
4) проверь скриптом node: 13 полей, slug-регулярка и длина, уникальность slug и target_query, section из семи названий, нет «;» в полях;
5) все 40 заголовков волны 1 из SEO_STRATEGY.md раздел 8 должны быть в карте с wave=1 — недостающие добавь, если есть реальная фраза;
6) вверху файла строки-комментарии «# …»: что это, дата, источники, правила колонок, что частотности нет намеренно, итоги по кластерам.
Верни: итог строк, по кластерам, по разделам, по волнам, сколько повторов снято, чего не хватило из волны 1.`, { label: 'merge', phase: 'Merge' })

const ISSUES = {
  type: 'object',
  properties: { issues: { type: 'array', items: { type: 'object', properties: { slugs: { type: 'array', items: { type: 'string' } }, problem: { type: 'string' }, fix: { type: 'string' }, severity: { type: 'string', enum: ['high', 'medium', 'low'] } }, required: ['slugs', 'problem', 'fix', 'severity'] } } },
  required: ['issues'],
}
phase('Critique')
const LENSES = [
  'КАННИБАЛИЗАЦИЯ И МАССОВОСТЬ: строки, которые будут соревноваться за одно намерение («реклама для <ниша>» против «где найти клиентов <ниша>»), вариации одной фразы, статьи под страну или город, шаблонные ниши с общим angle.',
  'ПРАВИЛА И ЯЗЫК КЛИЕНТА: жаргон в заголовках, несовпадение target_query и заголовка по намерению, неверный раздел, утечки плейбука Meta Apps, Россия, пустой или общий angle, intent и wave не по правилам.',
]
const critiques = await parallel(LENSES.map((lens, i) => () => agent(`${CONTEXT}
Ты — строгий проверяющий docs/seo/article-map.csv (прочитай целиком). Ищи: ${lens}
Только то, что реально навредит ранжированию или нарушит правила; до 60 пунктов, важные первыми. Ничего не редактируй.`,
  { label: `critic:${i + 1}`, phase: 'Critique', schema: ISSUES })))
const issues = critiques.filter(Boolean).flatMap((c) => c.issues)
log(`Замечаний: ${issues.length}`)

phase('Fix')
const fixed = await agent(`${CONTEXT}
Примени замечания к docs/seo/article-map.csv (с чем не согласен — не применяй и перечисли с причиной). Слаги строк status=перепись не меняй.
Новые target_query — только реальные. Обнови итоги в строках-комментариях. Повтори проверку скриптом node и положи скрипт в
scripts/validate-article-map.mjs, чтобы её можно было запускать повторно (в npm run check не добавляй).
Замечания: ${JSON.stringify(issues)}
Верни: что изменено, что отклонено, итоговые числа.`, { label: 'fix', phase: 'Fix' })

return { merged, issuesCount: issues.length, fixed }
