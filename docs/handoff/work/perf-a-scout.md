# Пакет A — разведка (scout), 06.10.2026

Задача: для маршрутов `/blog`, `/cases`, `/faq`, `/marketing-glossary`, `/calculator`, `/roi-calculator`,
`/offer`, `/privacy-policy`, `/cookie-policy`, `/thank-you` найти всё, что нарушит правило SSR-безопасности
первого рендера, проверить рендер через `renderRoute`-подобную точку входа и сверить тексты статики с React.
Ничего в проекте не правилось. Скрипты эксперимента — в scratchpad сессии (`scout-ssr.mjs`, `scout-ssr-2.mjs`):
esbuild-сборка `ssr-entry`-подобного входа (без охраны `SSR_ROUTES`, с предзагрузкой всех модулей маршрутов и
seed-ом списка для `/blog` и `/cases`), `renderToString` каждого маршрута, затем `hydrateRoot` в jsdom по образцу
`scripts/first-screen-hydration.test.js` (dev-React, телефонный `matchMedia`).

## 1. Итог эксперимента (рендер → гидратация)

| Маршрут | Серверный HTML | `opacity:0` узлов | Ленивая граница `<!--$!-->` | Гидратация |
|---|---|---:|---:|---|
| `/blog` (seed списка передан) | 38,7 КБ (5,8 КБ brotli), h1 ✔, navbar ✔ | 11 | 0 (Footer/паутинка уже в ClientOnly) | чисто |
| `/blog` (без seed — как `renderRoute` сегодня) | 1,8 КБ: **RouteSkeleton**, без h1 и navbar | 0 | 0 | React строит страницу заново |
| `/blog?topic=meta` (гидратация с параметром) | тот же HTML | — | — | **расхождение**: `Prop className did not match` на плитке темы, «Hydration failed», «Text content does not match» → полный клиентский рендер |
| `/cases` (seed с `caseData`) | 27 КБ, h1 ✔ | 1 | **1 (Footer)** | «The server did not finish this Suspense boundary» → граница Footer рендерится с клиента |
| `/faq` | 108 КБ (14,3 КБ brotli), все 39 вопросов/ответов/деталей в HTML | 2 | 1 (Footer) | то же |
| `/marketing-glossary` | 253 КБ (9,5 КБ brotli), 119 `id="term-…"`, **0 определений** (аккордеон закрыт) | 1 | 1 (Footer) | то же |
| `/calculator` | 27,5 КБ; 3 триггера Select **пустые** (`SelectValue` без детей) | 0 | 1 (Footer) | то же |
| `/roi-calculator` | 32,5 КБ; селекты пустые | 0 | 1 (Footer) | то же |
| `/offer` | 43 КБ | 0 | 1 (Footer) | то же; **повторный рендер той же страницы в том же процессе уже содержит `<footer>`** (React.lazy закэшировал модуль) → при гидратации «Suspense boundary received an update before it finished hydrating» |
| `/privacy-policy` | 26 КБ | 0 | 1 (Footer) | то же |
| `/cookie-policy` | 19 КБ | 0 | 1 (Footer) | то же |
| `/thank-you` (без контекста заявки) | 21 КБ | 9 (в т. ч. карточка первого экрана) | 1 (Footer) | то же |
| `/thank-you` (sessionStorage с контекстом заявки — реальный сценарий после формы + перезагрузка) | 25,5 КБ | 9 | — | **«Text content does not match» → полный клиентский рендер** |

Прочее измеренное: `useReducedMotion()` из motion на сервере отдаёт `null` (в браузере с «уменьшить движение» — `true`
на первом рендере); `Intl.NumberFormat('ru-RU').format(65000)` в Node = `65 000` с U+00A0 (как в Chrome).
Ни один маршрут не вывел `SSR_ASSET_PLACEHOLDER` и ни один не содержит `id="hero"` (генератор сейчас требует его
для гидратируемых страниц — `scripts/generate-pages.js:1901-1903`).

## 2. Нарушения правила SSR-безопасности — по маршрутам

Сквозные (несколько маршрутов):

- **A. Ленивый `Footer` без `ClientOnly`.** `renderToString` на первом рендере в процессе отдаёт fallback
  (`<!--$!-->`), на следующем — уже готовый `<footer>` (React.lazy закэшировал), в браузере первый рендер Footer
  не содержит никогда → граница перерисовывается с клиента (recoverable error в обоих случаях, проверено).
  Файлы: `src/app/pages/CasesPage.tsx:814-816`, `FAQPage.tsx:825-827`, `MarketingGlossaryPage.tsx:586-588`,
  `Calculator.tsx:28-30`, `RoiPage.tsx:28-30`, `Offer.tsx:49-51`, `PrivacyPolicy.tsx:50-52`,
  `CookiePolicy.tsx:49-51`, `ThankYou.tsx:375-377`.
  Исправление: `<ClientOnly><Suspense fallback={null}><Footer /></Suspense></ClientOnly>` — как в
  `BlogPage.tsx:1456-1460`.
- **B. `m.*` с `initial={{ opacity: 0, … }}` без `settledEntrance`** → в HTML `style="opacity:0"`, текст невидим
  до JavaScript (нарушает проверку `first-screen-render`: «SSR must not hide content pending JS»).
  Файлы: `BlogPage.tsx:1147` (вводный блок списка) и `:1370-1375` (карточки ленты, `whileInView`);
  `CasesPage.tsx:643-646` (вводный блок); `FAQPage.tsx:638-641` (шапка) и `:798-802` (CTA);
  `MarketingGlossaryPage.tsx:271-275`; `ThankYou.tsx:169-173` (карточка первого экрана — это LCP, задержка 0,35 с),
  `:241-245`, `:260-266`, `:294-298`, `:309-315`.
  Исправление: `const settledEntrance = hasGeneratedFirstScreen(location.pathname, location.key)` и
  `initial={settledEntrance ? false : {…}}` — так уже сделано в режиме статьи (`BlogPage.tsx:453, 849, 874, 892`).
  Появление «из прозрачности» при холодной загрузке не играет — допустимо по условию задачи.
- **C. `useReducedMotion()` в начальном состоянии.** `CasesPage.tsx:393` → `:643-645` и `:303, 313-316`:
  `initial={reduceMotion ? false : {…}}`. Сервер отдаёт `null`, браузер пользователя с «уменьшить движение» —
  `true` → разные `style` на первом рендере → расхождение (тест гидратации этого не ловит: его `matchMedia`
  отвечает `false` на `prefers-reduced-motion`). Исправление: решать по `settledEntrance`, а не по `reduceMotion`
  (`MotionConfig reducedMotion="user"` в `AppFrame` уже гасит движение сам).
- **D. Radix `SelectValue` без детей** рендерит на сервере пустой триггер (текст выбранного пункта попадает в
  него порталом только после layout-эффекта в браузере): первый кадр `/calculator` (вкладка «Ведение»: цель,
  рынки, аналитика), `/roi-calculator` (рынок, валюта, период) и `/cases` (сортировка ×2) показывает пустые поля,
  текст появляется после JS. Не расхождение гидратации, но скриншот «до/после» не совпадает.
  Файлы: `src/app/components/MarketingCalculator.tsx:170`, `CasesPage.tsx:710` и `:749`.
  Исправление: передавать подпись выбранного пункта детьми: `<SelectValue>{options.find(o => o.value === value)?.label}</SelectValue>`
  (Radix при `children` не делает портал — `valueNodeHasChildren`).
- **E. Подгонка кегля h1 после гидратации → сдвиг (CLS) на телефоне.** `useManagedTitleFit` стоит на h1, но
  атрибута `data-ww-title-fit` нет, поэтому генератор не вставит `scripts/title-prefit.js`, и длинный заголовок
  ужмётся только после JavaScript (как было у статей: CLS 0,06). Реально длинные: «Политика конфиденциальности
  и обработки персональных данных», «Калькулятор окупаемости ROI и ROMI», «Ответы на вопросы о рекламе и
  аналитике», «Словарь маркетинга без лишнего жаргона».
  Файлы/значения: `MarketingCalculator.tsx:1046` (`"2/0"`, min 20), `FAQPage.tsx:648` (`"2/0"`, 20),
  `MarketingGlossaryPage.tsx:278` (`"2/0"`, 20) и `:570` (h2, 16), `Offer.tsx:38`, `PrivacyPolicy.tsx:39`,
  `CookiePolicy.tsx:38` (`"2/0"`, 16), `CasesPage.tsx:648` (`"2/2"`, 22), `BlogPage.tsx:1152` (`"2/1"`, 22).
  Формат как у статьи: `data-ww-title-fit="<mobile>/<desktop>" data-ww-title-fit-min="<minFontSize>"`
  (`BlogPage.tsx:855`).

По маршрутам:

### `/blog` (`src/app/pages/BlogPage.tsx`, режим списка)
1. `scripts/ssr-entry.tsx:124` — `primeArticleSeed` принимает только одну статью; для `/blog` seed пустой →
   `ArticlesProvider` стартует с `loading=true` → `BlogPage.tsx:763` отдаёт `<RouteSkeleton />` (проверено:
   1,8 КБ без h1). Нужно: `renderRoute('/blog', { articleSeed: <массив summaries> })` ровно из тех объектов, что
   уедут в `ww-article-seed` (`toInlineArticleSummary`, JSON-round-trip), как у статей.
2. `BlogPage.tsx:473-487` — фильтры читаются из `location.search` в начальном состоянии (это правильно для
   совпадения сервер/браузер без параметров), но с `?topic=`/`?search=`/`?sort=`/`?page=` первый рендер
   браузера отличается от HTML → расхождение (проверено на `?topic=meta`). Нужно в `src/main.tsx:53-67`
   `canHydrateGeneratedRoute()` возвращать `false` при непустом `window.location.search` (хотя бы для `/blog`,
   лучше для всех) — тогда страница с параметрами монтируется поверх оболочки как сегодня.
3. `opacity:0` ×11 — пункт B.
4. После гидратации живой список (`fetchArticles`) дополняет seed (`mergePublicArticleSummaries`): счётчик
   «Практический блог · N статей» и лента вырастут после ответа API — это не расхождение, предусмотрено A1.
5. Низкое: `BlogPage.tsx:736-761` после монтирования делает `navigate('/blog', { replace: true })` с адреса
   `/blog/` (Cloudflare отдаёт каталог со слешем) — `location.key` меняется, `settledEntrance` после этого
   `false`, но `initial` motion читает только при монтировании, DOM не пересоздаётся. Существующее поведение.

### `/cases` (`src/app/pages/CasesPage.tsx`)
1. Seed списка — то же, что у `/blog` (без него `CasesPage.tsx:759-760` рисует «Загружаю опубликованные
   кейсы…», и первый экран без карточек).
2. `scripts/generate-pages.js:565-611` `normalizeArticles` теряет `caseData`/`id`/`featuredOrder` → в seed нет
   `caseData` → первый кадр показывает «—» в статистике и «Разбор / проекта» на карточках (проверено), а после
   ответа API появляются цифры → видимая перерисовка. Это A5 (генератор): сохранить поля.
3. `:643-646`, `:303-316` — пункты B и C.
4. `:814-816` — пункт A. `:710`, `:749` — пункт D.
5. Низкое: `:168-171` `Intl.NumberFormat('ru-RU')` в статистике первого экрана; Node и Chrome сейчас дают один
   разделитель (U+00A0), но при расхождении ICU это текстовое расхождение. Надёжнее форматировать вручную.
6. `?from=…` и фильтры из адреса применяются эффектом (`:423-463`) → первый рендер совпадает, но список
   пересортируется после монтирования; правило из `main.tsx` про параметры закрывает и это.

### `/faq` (`src/app/pages/FAQPage.tsx`)
1. `FAQPage.tsx:531` → `src/app/hooks/useFaqContent.ts:67-75`: на клиенте читает `ww-site-content-seed`
   (`readInlineSiteContentSeed('site:faq')`), на сервере — ничего (без `document` отдаёт `undefined`) и
   **не смотрит в кэш `primeSiteContent`** (`useServiceContent.ts:130`). Генератор же кладёт в seed
   `site:faq` (`generate-pages.js:1816`). Сегодня в `data/site-content.build.json` ключа `site:faq` нет, поэтому
   эксперимент чист; но как только владелец опубликует FAQ из админки, сервер отрисует `faqs` из кода, а браузер
   — из CMS → расхождение. Нужно: серверный источник для `useFaqContent` (например, `primeFaqContent()` из
   `ssr-entry`, или перевести хук на кэш `useSiteContent('site:faq')`).
2. `:638-641`, `:798-802` — пункт B. `:825-827` — пункт A. `:648` — пункт E.
3. Вся текстовая часть (39 вопросов, ответы, детали, `id="faq-…"`, ссылки на термины) уже в React-разметке →
   статическая оболочка после `#root` для `/faq` не нужна (иначе HTML ~190 КБ и дублирующиеся `id="faq-…"`
   до снятия оболочки).

### `/marketing-glossary` (`src/app/pages/MarketingGlossaryPage.tsx`)
1. Radix Accordion закрыт → в React-разметке есть 119 якорей `id="term-…"`, но **0 определений, формул,
   оговорок и источников** (проверено). Текст для поисковика живёт только в оболочке `renderGlossaryListHtml`
   (227 КБ, 23,5 КБ brotli), а React-разметка — 253 КБ (9,5 КБ brotli: классы Tailwind сжимаются). Варианты:
   (а) оставить оболочку после `#root` только здесь — HTML ≈ 480 КБ сырых / ≈ 33 КБ brotli; (б) `forceMount`
   на `AccordionContent` — Radix рендерит содержимое с `hidden` при закрытом элементе (вид не меняется),
   определения попадают в React-разметку, оболочка не нужна, заодно закрывается F-096 («словарь теряет
   определения после JS»). Решение — группе pages вместе с generator.
2. `:271-275` — пункт B. `:586-588` — пункт A. `:278`, `:570` — пункт E.
3. Хеш `#term-…` обрабатывается эффектом (`:176-193`) — безопасно.

### `/calculator`, `/roi-calculator` (`Calculator.tsx`, `RoiPage.tsx`, `components/MarketingCalculator.tsx`)
1. `Calculator.tsx:28-30`, `RoiPage.tsx:28-30` — пункт A.
2. `MarketingCalculator.tsx:170` — пункт D (пустые селекты в первом кадре).
3. `MarketingCalculator.tsx:1046` — пункт E.
4. Состояние детерминировано (значения по умолчанию), `Intl` только в результатах, которые в первом кадре —
   «Заполните ключевые поля» / смета по умолчанию (`quote` на `/calculator`: суммы в USD без дробей —
   одинаковый формат в Node и Chrome). Гидратация в эксперименте чистая.

### `/offer`, `/privacy-policy`, `/cookie-policy`
1. `Offer.tsx:49-51`, `PrivacyPolicy.tsx:50-52`, `CookiePolicy.tsx:49-51` — пункт A.
2. `Offer.tsx:38`, `PrivacyPolicy.tsx:39`, `CookiePolicy.tsx:38` — пункт E.
3. `components/legal/LegalDoc.tsx` — только эффекты, `<details open={index === 0}>` детерминирован; весь текст
   документа в React-разметке (нативные `details`) → оболочка `renderLegalSection` после `#root` дублирует тот
   же компонент и не нужна.

### `/thank-you` (`src/app/pages/ThankYou.tsx`)
1. `:102` `useState(() => readLeadContext())` читает `sessionStorage` в инициализаторе → имя в h1 (`:181-183`),
   чип «Принято сегодня в …» (`:177`, плюс `toLocaleTimeString` `:123-125`), текст шага (`:138-140`), лид
   (`:188-190`), плитки «Пока ждёте» (`:112 → :308`), возврат/`Navbar sectionsPath` (`:117-118, :158, :341-343`),
   подсказка про «Спам» (`:281`) — всё отличается от серверного варианта. Проверено: с контекстом в хранилище
   «Text content does not match», страница строится заново — а это ровно сценарий «отправил форму → обновил
   страницу». Исправление по образцу `useReturnTo` (`siteNavigation.ts:276-279`): при гидратации стартовать с
   `null` и читать контекст эффектом (имя и канал появятся в том же кадре после гидратации); при переходах
   внутри сайта (`hasGeneratedFirstScreen` = false) читать как сейчас, чтобы не мигать на SPA-переходе.
2. `:169-173` и далее — пункт B (карточка первого экрана с `opacity:0` и задержкой 0,35 с — это LCP).
3. `:375-377` — пункт A.
4. `trackThankYouConversion()` в эффекте (`:107-109`) — не трогать, согласие/Meta CAPI не затрагиваются.

## 3. Что ломается в генераторе и тестах (группе generator / main.tsx)

- `scripts/ssr-entry.tsx:35` — `SSR_ROUTES`; `:113-115` — охрана; `:60-72` — предзагрузка модулей: добавить
  `loadCasesPage`, `loadCalculator`, `loadRoiPage`, `loadThankYou`, `loadFaqPage`, `loadMarketingGlossaryPage`,
  `loadOffer`, `loadPrivacyPolicy`, `loadCookiePolicy` (иначе `preloadable` бросает промис → fallback);
  `:116-124` — seed списка для `/blog` и `/cases` (массив), проверки статьи только для статейных маршрутов.
- `scripts/generate-pages.js:1901-1903` — требование `id="hero"` в гидратируемой разметке: ни у одной страницы
  пакета A его нет → генератор упадёт. Заменить на маркер по маршруту (`<main` + ровно один `<h1`).
- `:1949-1983` `renderArticleListPage` — рендер через `content.renderRoute`, `hydratable: true`, полный список
  ссылок на статьи — в `renderStaticShellAfterRoot` как `sections` (React отдаёт только первую страницу из 24).
- `:2206-2209` `validateGeneratedOutput` требует в `/cases` текст **«Проекты с цифрами и контекстом»** — это h1
  оболочки, в React его нет (h1 = «Найдите кейс, похожий на ваш проект»). Поправить проверку или оставить строку
  в оболочке после `#root` (не как h1 — `test:seo-output` требует ровно один `<h1`).
- `:565-611` `normalizeArticles` — сохранить `caseData`/`id`/`featuredOrder` (A5), иначе первый кадр `/cases`
  без цифр.
- `:1936-1938` — какие `sections` оставлять после `#root`: словарь — да (или `forceMount`), `/blog` и `/cases` —
  полный список ссылок, FAQ и юридические — нет (текст уже в React), калькуляторы и `/thank-you` — только
  навигация `renderShellNavHtml` (в React-шапке нет ссылок на калькуляторы и словарь).
- `scripts/first-screen-render.test.js:57` (`deepEqual` списка из 5 маршрутов) и `:75-77` («`/blog` отказывает»)
  и `scripts/first-screen-hydration.test.js:114-118` (ключи `service:*` для всех `SSR_ROUTES`) перестанут
  проходить при расширении списка — обновлять осознанно, с seed-ами для `/blog`/`/cases` и `site:faq` для `/faq`.
- `src/main.tsx:53-67` — не гидратировать при непустом `location.search` (см. `/blog` п. 2).
- Сквозной риск, не только пакета A: `functions/_middleware.ts:181-183` вписывает `<meta name="ww-page-locks">`
  на запросе, `Navbar.tsx:216-253` на первом рендере убирает пункты закрытых страниц, а разметка сборки их
  содержит → при закрытой через админку `/blog`, `/cases` или `/faq` любая гидратируемая страница (и нынешние
  пять) получит расхождение в шапке. Отдельная задача.

## 4. Тексты статики: что проверяют тесты и есть ли они в React

**`test:seo-output` (`scripts/generated-seo.test.js`) по этим маршрутам проверяет только:** один `<title>`,
одно описание ≥ 20 символов, canonical/alternate/og:url/twitter:url = канонический адрес со слешем,
robots (`/thank-you` — noindex, остальные — index), **ровно один `<h1` во всём HTML**, валидный JSON-LD с
уникальными `id`, схемы `ProfessionalService` + `WebSite` (кроме noindex), для `/faq` — `FAQPage`, для
`/marketing-glossary` — `DefinedTermSet`, для `/blog` и `/cases` — ровно один `ww-article-seed` (массив summaries),
sitemap = индексируемые канонические адреса, noindex-страницы без JSON-LD, modulepreload-граф юридических и
`/thank-you` без чужих модулей, `/blog` — modulepreload чанка `BlogPage`. Текст тела не проверяется, кроме счётчика h1.
`validateGeneratedOutput` внутри `generate:pages` дополнительно: `/faq` — `"@type":"FAQPage"`;
`/marketing-glossary` — `id="ld-marketing-glossary"`, `"@type":"DefinedTermSet"`, `id="term-meta-app-event-optimization"`,
`id="term-app-tracking-transparency"` (якоря есть в React — `AccordionItem id`); `/cases` — `${SITE_URL}/cases/` и
текст «Проекты с цифрами и контекстом» (**в React нет**); `/thank-you` — noindex + адрес.
`test:seo-content` (`site-content-sync.test.js`) к этим маршрутам не относится (организация в JSON-LD, слияние CMS).

**Тексты `renderGeneratedShell` / `renderArticleListPage` против React-разметки:**

| Маршрут | h1 оболочки → React | Лид | Остальной текст |
|---|---|---|---|
| `/blog` | «Решения для реальных задач» = React ✔ | ✔ совпадает (`BlogPage.tsx:1161`) | оболочка: ссылки на **все** статьи; React: первые 24 |
| `/cases` | «Проекты с цифрами и контекстом» ✘ → «Найдите кейс, похожий на ваш проект» | ✘ «Фильтруйте по нише и каналу…» → «Выберите канал, нишу или результат…» | оболочка: все кейсы; React: все кейсы ✔ (карточки с описанием) |
| `/faq` | = `FAQ_SEO.h1` ✔ (разбит span-ом) | ✔ `FAQ_SEO.lead` | вопросы/ответы/детали/термины ✔ все в React |
| `/marketing-glossary` | = `MARKETING_GLOSSARY_SEO.h1` ✔ | ✔ | определения/формулы/источники ✘ (закрытый аккордеон), якоря `term-…` ✔ |
| `/calculator` | «Калькулятор рекламного бюджета» ✔ (`PAGE_COPY`) | ✔ дословно | — |
| `/roi-calculator` | «Калькулятор окупаемости ROI и ROMI» ✔ | ✔ дословно | — |
| `/privacy-policy` | «Политика конфиденциальности» → «…и обработки персональных данных» (богаче) | ✘ «Условия обработки… Редакция от …» → «Дата последнего обновления: …» | тело ✔ тот же компонент |
| `/offer` | «Публичная оферта» ✔ | ✘ то же | тело ✔ |
| `/cookie-policy` | «Политика cookie» → «Политика использования файлов cookie» (богаче) | ✘ то же | тело ✔ |
| `/thank-you` | «Спасибо за заявку» → «Заявка у меня» (noindex, не важно) | — | — |

Ссылки на разделы (`SHELL_NAV_LINKS`) остаются в `renderStaticShellAfterRoot` на всех маршрутах — в React-шапке
контентных страниц нет ссылок на калькуляторы и словарь.

## 5. Порядок, который я бы предложил исполнителям

1. generator: seed списков в `renderRoute`, предзагрузка модулей, снятие требования `#hero`, A5, `main.tsx`
   без гидратации при параметрах, обновление двух тестов первого экрана.
2. pages: ClientOnly для Footer (9 файлов), `settledEntrance` (6 файлов), `/thank-you` — контекст эффектом,
   `/cases` — `useReducedMotion` из начального состояния, `SelectValue` с детьми, `useFaqContent` на сервере,
   атрибуты `data-ww-title-fit`.
3. Решение по словарю (оболочка или `forceMount`) и по оболочкам FAQ/юридических (убрать).
