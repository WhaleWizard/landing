# План исправления находок аудита

Источник истины по каждой находке — `docs/handoff/audit-findings.json` (поля `fix`, `fixNotes`, `rulesNotes`: если уточнения проверяющих расходятся с `fix`, верить им, особенно `rulesNotes`). Человеческий вид — `audit-reports/AUDIT-2026-09-24.md`.

## Как работать

1. Группы идут по порядку ниже: сначала безопасность и потеря данных, потом всё остальное.
2. У каждой группы свой набор файлов — группы можно вести параллельно, правки не пересекутся. Файл вне своей группы не трогать; если нужно — записать в «Стыки» внизу.
3. По каждой находке: сверить с текущим кодом (после e55dce6 строки сдвинулись, часть могла исправиться) → исправить минимально → закрепить поведенческим тестом в `scripts/audit-<группа>.test.js` → прогнать связанные тесты.
4. Отметить в `audit-findings.json` поле `status`: `fixed: <дата>, <файлы>` / `already-fixed` / `not-reproducible` / `needs-owner: <почему>` / `changes-look: <почему>`. Поставить галочку здесь.
5. После группы: новый тест добавить в `package.json` (скрипт `test:audit-<группа>` и в цепочку `check`), `npm run check` (и `npm run test:meta-capi` для трекинга), коммит, push в main, проверка прода.
6. Нельзя: менять вид сайта (docs/DESIGN_LOCK.md), ослаблять согласие и Meta CAPI, выдумывать числа, трогать решения владельца (кнопка cookie на первом экране; повторная заявка переоткрывает сделку).

Недоделанные правки оборвавшихся исполнителей сохранены в `docs/handoff/partial-fixes-unverified.patch` (routing: AUD загрузки страниц и хранилища; admin-shell: часть Admin.tsx; admin-api-core: articles.ts/d1.ts). Их можно применить (`git apply`) как черновик и проверить, а можно написать заново. Внимание из перепроверки: в preloadable.ts ошибку загрузки НЕЛЬЗЯ сбрасывать при броске — иначе цикл остаётся (подробно в `rulesNotes` находки F-001).

Известные существующие тесты, которые закрепляют старое поведение и должны поменяться осознанно: `scripts/first-screen-preload.test.js` («a rejected component import remains retryable» — закрепляет зацикливание, F-001), `scripts/service-route-lifecycle.test.js` (то же для lazyServiceLanding).

## 1. admin-api-core — Сервер админки: вход, статьи, загрузки, доступ к страницам (17, открыто 0 — все исправлены 01.10)

Файлы группы: functions/api/admin/auth.ts, _middleware.ts, articles.ts, articles-featured.ts, articles-schedule.ts, upload.ts, media.ts, page-locks.ts, page-lock-preview.ts; functions/api/page-lock-notify.ts, meta-test-event.ts; functions/_lib/jsonbin.ts, d1.ts, page-lock-preview.ts, page-locks.ts, admin-session.ts, admin-2fa.ts, admin-totp.ts, auth.ts; scripts/import-articles.mjs, admin-client.mjs

- [x] **F-073** (критично) Двухфакторную защиту снимает один пароль: запрос «setup» без кода и без сессии стирает секрет и резервные коды — `functions/api/admin/auth.ts:218`
- [x] **F-075** (высокая) Повторный запуск импорта статей снимает с публикации уже вышедшие статьи и заменяет обложку заглушкой — `scripts/import-articles.mjs:148`
- [x] **F-019** (средняя) Смена адреса (slug) у существующей статьи создаёт вторую копию: старый адрес остаётся, новый дублирует текст — `functions/api/admin/articles.ts:427`
- [x] **F-020** (средняя) Сохранение молча обрезает SEO-заголовок до 70 знаков и описание до 160 посреди слова — 7 живых страниц с оборванным <title> — `functions/_lib/jsonbin.ts:202`
- [x] **F-024** (средняя) Черновик при публикации получает дату создания, а не дату выхода; «оставьте пустой для немедленной» не работает — `functions/_lib/jsonbin.ts:238`
- [x] **F-080** (средняя) «Открыть все» не сбрасывает дату закрытия: при повторном закрытии страница «закрыта N дней» с первого раза, а «Сегодня» бьёт тревогу — `functions/api/admin/page-locks.ts:265`
- [x] **F-081** (средняя) «Доступ к страницам»: любой сбой базы выдаётся за «Примените миграцию 0034», и раздел блокируется без кнопки повтора — `functions/api/admin/page-locks.ts:208`
- [x] **F-082** (средняя) Открытая переадресация: адрес вида //<число>?ww_preview=… уводит посетителя с whalewzrd.com на любой IP-адрес — `functions/_lib/page-lock-preview.ts:159`
- [x] **F-083** (средняя) Форма «Сообщить, когда откроется» не работает на статьях закрытого раздела: контакт не сохраняется, человека уводит на главную — `functions/api/page-lock-notify.ts:119`
- [x] **F-084** (средняя) Кнопка «Тестовое событие» в разделе Meta CAPI после перезагрузки админки всегда даёт 403 — `functions/api/meta-test-event.ts:248`
- [x] **F-090** (средняя) Каждая заблокированная попытка входа — отдельное сообщение владельцу в Telegram: аноним заваливает чат и сбивает уведомления о заявках — `functions/api/admin/auth.ts:152`
- [x] **F-091** (средняя) «Доступ к страницам»: любая ошибка базы подаётся как «Примените миграцию 0034», и раздел целиком заменяется этой заглушкой — `functions/api/admin/page-locks.ts:356`
- [x] **F-092** (средняя) Файл с русским именем не загружается: «Договор.pdf» и «Обложка.jpg» отклоняются с ошибкой «File extension .unknown» — `functions/api/admin/upload.ts:56`
- [x] **F-094** (средняя) Кнопка «Тестовое событие» в разделе Meta CAPI после перезагрузки админки всегда отвечает 403 со ссылкой на несуществующую проблему с секретом — `functions/api/meta-test-event.ts:248`
- [x] **F-095** (средняя) При включённой 2FA через 12 часов после входа все разделы админки падают с «session_required», повторный вход не предлагается — `functions/api/admin/_middleware.ts:48`
- [x] **F-111** (низкая) Загрузка или перенос больше ~30 файлов за раз в медиатеке обрывается на «Too many requests» — `functions/api/admin/upload.ts:108`
- [x] **F-129** (низкая) У запланированной статьи, которую правили до выхода, dateModified и lastmod оказываются раньше даты публикации — `functions/_lib/jsonbin.ts:253`

## 2. admin-shell — Оболочка админки, статьи, редактор сайта, медиатека (15, открыто 0 — все исправлены 02.10; F-009 закрыт стыком в `media.ts`)

Файлы группы: src/app/pages/Admin.tsx; src/app/components/admin/AdminFaqControl.tsx, AdminContentControl.tsx, SeoAssistant.tsx, ArticleCalendar.tsx, AdminMedia.tsx, PublishSchedulePanel.tsx, AdminCommandPalette.tsx, AdminSecurity.tsx; src/app/utils/publishSchedule.ts, prepareImageUpload.ts

- [x] **F-007** (высокая) Переход к другой статье без сохранения молча стирает правки, автосохранение затирается следующей статьёй — `src/app/pages/Admin.tsx:1173`
- [x] **F-009** (высокая) Регрессия: медиатека считает картинки из текста статей неиспользуемыми и разрешает их удалить или перенести — `src/app/components/admin/AdminMedia.tsx:146` — закрыто 02.10: сервер считает `usage` по полным текстам статей, 409 перед удалением и переносом (`functions/api/admin/media.ts`)
- [x] **F-074** (высокая) «Редактор сайта»: переход в другой раздел админки молча стирает несохранённые правки — `src/app/pages/Admin.tsx:1335`
- [x] **F-021** (средняя) Загрузка обложки откатывает всё, что владелец изменил, пока файл загружался — `src/app/pages/Admin.tsx:2033`
- [x] **F-025** (средняя) При 600 статьях каждое нажатие клавиши в редакторе и в поиске перерисовывает весь список (+15–20 мс на символ) — `src/app/pages/Admin.tsx:700`
- [x] **F-077** (средняя) Редактор FAQ не знает о несохранённом: «Обновить», восстановление версии и переключение на «Страницы» стирают правки без вопроса — `src/app/components/admin/AdminFaqControl.tsx:212`
- [x] **F-078** (средняя) После 12 часов сессии админка не предлагает войти заново: разделы показывают «session_required» или «Unauthorized» — `src/app/pages/Admin.tsx:959`
- [x] **F-079** (средняя) Вход через форму не проходит, если список статей не загрузился: «Ошибка сети», хотя пароль и код приняты — `src/app/pages/Admin.tsx:1007`
- [x] **F-058** (низкая) Палитра Ctrl+K ищет только по 60 самым старым публикациям — `src/app/pages/Admin.tsx:1436`
- [x] **F-060** (низкая) В поле slug нельзя набрать дефис: он стирается на каждом нажатии — `src/app/pages/Admin.tsx:1036`
- [x] **F-061** (низкая) Сохранение статьи возвращает старое закрепление на главной — `src/app/pages/Admin.tsx:1088`
- [x] **F-062** (низкая) Проверка «Ссылки на свои страницы» не видит ссылок на страницы услуг — `src/app/components/admin/SeoAssistant.tsx:70`
- [x] **F-063** (низкая) Календарь публикаций показывает черновики как вышедшие — `src/app/components/admin/ArticleCalendar.tsx:45`
- [x] **F-103** (низкая) Резервный код 2FA не набрать на iPhone: поле открывает цифровую клавиатуру, а код из букв и дефиса — `src/app/pages/Admin.tsx:1503`
- [x] **F-133** (низкая) Расписание с датой начала «сегодня» или в прошлом публикует статьи сразу и задним числом — `src/app/utils/publishSchedule.ts:117`

## 3. editor — Блочный редактор статей (6, открыто 0 — все исправлены 02.10)

Файлы группы: src/app/components/ArticleEditor.tsx, CaseFieldsEditor.tsx

- [x] **F-006** (высокая) Любая правка статьи в редакторе вырезает из текста ссылки, жирный и курсив — `src/app/components/ArticleEditor.tsx:255`
- [x] **F-008** (высокая) Текст, набранный в режиме Markdown, не попадает в сохранение — редактор закрывается, текст пропадает — `src/app/components/ArticleEditor.tsx:693`
- [x] **F-022** (средняя) Вставка текста в блок всегда уходит в конец абзаца, а текст с картинкой из буфера не вставляется вовсе — `src/app/components/ArticleEditor.tsx:414`
- [x] **F-023** (средняя) Режим Markdown переживает переход к другой статье: «Визуальный» перезаписывает её текстом предыдущей — `src/app/components/ArticleEditor.tsx:650`
- [x] **F-059** (низкая) Метрики кейса «прыгают» между полями, если заполнять не по порядку — `src/app/components/CaseFieldsEditor.tsx:37`
- [x] **F-064** (низкая) Подсказка редактора обещает горячие клавиши, которых нет — `src/app/components/ArticleEditor.tsx:858`

## 4. routing — Загрузка страниц, маршруты, навигация (4, открыто 4)

Файлы группы: src/app/utils/preloadable.ts, siteNavigation.ts, routeFocus.ts, scrollRestoration.ts, memoizedImport.ts; src/app/routes.tsx; src/app/components/Navbar.tsx

- [ ] **F-001** (высокая) Сбой загрузки куска кода страницы даёт бесконечный цикл: страница зависает, автоперезагрузка после выкладки не срабатывает — `src/app/utils/preloadable.ts:21`
- [ ] **F-002** (высокая) Если браузер запрещает сайту хранить данные, весь сайт показывает «Страница не загрузилась» — `src/app/utils/siteNavigation.ts:208`
- [ ] **F-003** (высокая) Сортировка, темы и поиск в блоге (и фильтры кейсов) прокручивают страницу в самый верх — `src/app/routes.tsx:333`
- [ ] **F-044** (низкая) Если закрыть /cases или /blog, кнопки «Кейсы», «Блог» и «Посмотреть кейсы» на главной перестают работать — `src/app/components/Navbar.tsx:241`

## 5. blog — Блог, кейсы, словарь (14, открыто 14)

Файлы группы: src/app/pages/BlogPage.tsx, CasesPage.tsx, MarketingGlossaryPage.tsx; src/app/context/ArticlesContext.tsx; src/app/components/Blog.tsx, CaseArticleView.tsx; src/app/utils/articleDate.ts, articleMeta.ts, articleCategory.ts, blogListing.ts, homeArticles.ts; src/app/data/blogSections.ts

- [ ] **F-004** (высокая) Блог: выбор темы, порядка, поиск и «Показать ещё» перекидывают страницу наверх — `src/app/pages/BlogPage.tsx:696`
- [ ] **F-010** (средняя) Кнопка «Назад» на кейс уводит на список кейсов: провайдер статей берёт устаревшие данные первой загрузки — `src/app/context/ArticlesContext.tsx:195`
- [ ] **F-011** (средняя) Словарь: при активном поиске ссылка на связанный термин ничего не открывает и сворачивает текущий — `src/app/pages/MarketingGlossaryPage.tsx:222`
- [ ] **F-012** (средняя) Кейсы: любой фильтр или смена порядка перекидывает страницу наверх — `src/app/pages/CasesPage.tsx:494`
- [ ] **F-013** (средняя) Поиск по блогу находит только точную словоформу, «е» и «ё» считает разными буквами — `src/app/pages/BlogPage.tsx:659`
- [ ] **F-014** (средняя) «Похожие статьи» при 600 статьях будут стоить около 110 мс на каждую перерисовку статьи — `src/app/pages/BlogPage.tsx:234`
- [ ] **F-096** (средняя) Словарь: после загрузки приложения из страницы пропадают все 119 определений терминов — `src/app/pages/MarketingGlossaryPage.tsx:453`
- [ ] **F-043** (низкая) Карусель статей на главной не тянется мышью: браузер начинает перетаскивать ссылку — `src/app/components/Blog.tsx:88`
- [ ] **F-045** (низкая) На /blog после запуска приложения пропадает разметка хлебных крошек (BreadcrumbList) — `src/app/pages/BlogPage.tsx:542`
- [ ] **F-046** (низкая) «Похожие статьи» сравнивают старые категории, а не разделы: у 11 статей бонус за тему не срабатывает ни разу — `src/app/pages/BlogPage.tsx:235`
- [ ] **F-048** (низкая) В JSON-LD статьи с обложкой, загруженной через админку, адрес картинки склеивается в неверный — `src/app/pages/BlogPage.tsx:268`
- [ ] **F-049** (низкая) Блог и кейсы пишут в адрес /blog?… и /cases?… без слеша, и каждая пересланная ссылка или перезагрузка идёт через лишний 308 — `src/app/pages/BlogPage.tsx:694`
- [ ] **F-050** (низкая) На телефоне после «Свернуть темы» остаётся включённой тема, плитку которой уже не видно — `src/app/pages/BlogPage.tsx:1178`
- [ ] **F-130** (низкая) Дата статьи на сайте считается по Гринвичу: вышедшая ночью по Ташкенту показывается вчерашним днём и расходится с админкой — `src/app/utils/articleDate.ts:18`

## 6. forms — Формы заявок, согласие, трекинг в браузере, калькуляторы (13, открыто 13)

Файлы группы: src/app/utils/leadRetryQueue.ts, leadRetryConsent.ts, leadContext.ts, phoneCountry.ts, webVitals.ts, geoLookup.ts; src/app/components/ContactForm.tsx, LandingForm.tsx, MarketingCalculator.tsx, BudgetCalculator.tsx, CountryFlag.tsx; src/app/components/cookie/*; src/app/consent/consent.ts; src/app/calculator/engine.ts

- [ ] **F-005** (высокая) Отложенная заявка при ответе сервера 503/429 досылается только при следующем заходе на сайт — `src/app/utils/leadRetryQueue.ts:140`
- [ ] **F-015** (средняя) Номер с национальным «0» (Украина, Беларусь, Германия, Турция, Великобритания) превращается в несуществующий: +3800501234567 — `src/app/utils/phoneCountry.ts:148`
- [ ] **F-016** (средняя) Очередь удаляет заявку навсегда, если при досылке не удалось получить свежий токен Turnstile — `src/app/utils/leadRetryQueue.ts:114`
- [ ] **F-017** (средняя) Без сети офлайн-очередь недостижима: форма пишет «не удалось подтвердить, что вы не робот» и советует обновить страницу — `src/app/components/ContactForm.tsx:244`
- [ ] **F-018** (средняя) Реальный INP собирается только с медленных визитов: быстрые клики (<104 мс) не видны наблюдателю — `src/app/utils/webVitals.ts:97`
- [ ] **F-051** (низкая) crypto.randomUUID без запасного варианта: на iOS 14–15.3 со второго захода весь сайт показывает «Страница не загрузилась» — `src/app/consent/consent.ts:1607`
- [ ] **F-052** (низкая) CLS копится суммой за всю жизнь вкладки, а метрики всех страниц визита записываются на страницу входа — `src/app/utils/webVitals.ts:72`
- [ ] **F-053** (низкая) Повторное «Сохранить» в настройках cookie шлёт второй PageView и ViewContent на ту же страницу — `src/app/components/cookie/CookieConsentManager.tsx:206`
- [ ] **F-054** (низкая) Калькулятор ведения: без галочки «Первый месяц» сумма подписана «Ориентир за первый месяц» — `src/app/components/MarketingCalculator.tsx:993`
- [ ] **F-055** (низкая) Калькулятор стирает скопированные суммы («1 234,56 $», «10,000.50»), а «10,000» читает как 10 — `src/app/components/MarketingCalculator.tsx:142`
- [ ] **F-056** (низкая) Если хранилище браузера запрещено, «заявка не потеряна» — неправда: очередь не сохранилась, а форма уже очищена — `src/app/utils/leadRetryQueue.ts:33`
- [ ] **F-057** (низкая) Для страны не из списка (Кипр, Черногория, Катар…) код телефона молча остаётся +1 — `src/app/utils/phoneCountry.ts:7`
- [ ] **F-117** (низкая) Флаг страны в форме весит до 179 КБ: ради значка 18×13 форма качает тяжёлый SVG — `src/app/components/CountryFlag.tsx:47`

## 7. server-public — Публичный сервер: заявки, статистика, Meta CAPI, страницы статей, RSS (15, открыто 2 — ждут стыков)

Файлы группы: functions/_lib/meta-request.ts, leads.ts, tracking-signature.ts, article-page.ts, seo.ts, articles.ts, article-cache.ts, meta-capi.ts, meta-outbox.ts; functions/api/articles.ts, pageview.ts, lead.ts, meta-event.ts; functions/blog/*, functions/cases/*, functions/sitemap.xml.ts, functions/feed.xml.ts

- [x] **F-086** (средняя) Город, регион и часовой пояс для Meta CAPI берутся только из заголовков, которых Cloudflare по умолчанию не присылает — `functions/_lib/meta-request.ts:130`
- [x] **F-087** (средняя) Уведомление о заявке с длинным сообщением (больше ~3 830 знаков) не приходит в Telegram — `functions/_lib/leads.ts:692`
- [x] **F-088** (средняя) Повторная заявка без UTM стирает рекламный источник первой: сделка из рекламы переезжает в «не указан» — `functions/_lib/leads.ts:394`
- [ ] **F-089** (средняя) Статистика посещений считает только посетителей с согласием на маркетинг, а конверсия в админке считается так, будто это все визиты — `functions/api/pageview.ts:428` — своя часть сделана 01.10 (pageview.ts), ждёт оговорок в чужих файлах и решения владельца (см. «Стыки»)
- [ ] **F-104** (низкая) Каждый запрос трекинга пишет в D1 строку аудита подписи, которой браузер никогда не ставит: +1 запись на событие — `functions/_lib/tracking-signature.ts:198` — своя часть сделана 01.10 (tracking-signature.ts), закрывается только вместе с health.ts (см. «Стыки»)
- [x] **F-105** (низкая) Статья, перенесённая между блогом и кейсами, по старому адресу отвечает 404 вместо 301 — `functions/_lib/article-page.ts:211`
- [x] **F-106** (низкая) HEAD-запросы получают другой ответ, чем GET: статья уходит в 308 на адрес со слешем, /feed.xml и /api/articles отвечают 404 — `functions/blog/[slug].ts:3`
- [x] **F-107** (низкая) В бот-версии статьи ссылки «Блог/Кейсы» ведут на адрес без слеша, который отвечает 308 — `functions/_lib/seo.ts:287`
- [x] **F-108** (низкая) RSS отбирает и сортирует статьи по дате правки, а не публикации: при 100+ материалах свежая статья может не попасть в ленту — `functions/_lib/seo.ts:374`
- [x] **F-109** (низкая) ИИ-агент Claude-User (разрешён в robots.txt) не распознаётся как бот: статьи, вышедшие после последней сборки, он получает с пустым телом — `functions/_lib/seo.ts:8`
- [x] **F-110** (низкая) Защита кэша /api/articles не работает: любой новый параметр в адресе заново читает все статьи из D1 и перезаписывает снимок в R2 — `functions/api/articles.ts:55`
- [x] **F-113** (низкая) Несуществующая статья отдаёт человеку оболочку главной: заголовок и canonical главной плюс 280 КБ картинок хиро. Строковый тест этого не видит — `functions/_lib/article-page.ts:219`
- [x] **F-121** (низкая) Несуществующая статья отдаёт человеку оболочку главной: грузится хиро с китом, мелькает главная, потом выброс в список блога — `functions/_lib/article-page.ts:219`
- [x] **F-128** (низкая) RSS: порядок и отбор 100 материалов идут по дате правки, а не публикации — `functions/_lib/seo.ts:374`
- [x] **F-131** (низкая) «— повторная заявка ДАТА» дописывается в текст заявки по Гринвичу: ночью по Ташкенту это вчерашнее число — `functions/_lib/leads.ts:274`

## 8. seo-build — Сборка, статика для поиска, llms.txt, стили (15, открыто 15)

Файлы группы: scripts/* (кроме import-articles.mjs и admin-client.mjs), public/*, vite.config.ts, src/app/pages/ServiceLandingPage.tsx, src/app/components/Footer.tsx, src/styles/*

- [ ] **F-076** (высокая) Страницы услуг после загрузки JS теряют почти весь текст: Google видит только первый экран и блок «Что входит в работу» — `src/app/pages/ServiceLandingPage.tsx:866`
- [ ] **F-097** (средняя) llms.txt и llms-full.txt собираются один раз при сборке: новые и вышедшие по расписанию статьи туда не попадают, удалённые и закрытые остаются с полным текстом — `scripts/generate-pages.js:2215`
- [ ] **F-098** (средняя) llms.txt описывает контент, которого нет: «20+ статей», 12 несуществующих тем, H2 и внутренние ссылки «в каждой статье», подробные кейсы по четырём проектам — `public/llms.txt:96`
- [ ] **F-047** (низкая) Встроенный в /blog список отбирается по дате правки, а блог сортирует по дате публикации — `scripts/generate-pages.js:2203`
- [ ] **F-101** (низкая) Зелёные, жёлтые и синие статусы админки не попадают в CSS: «Готово», «Подтверждён», оценки 90+ и метки статей без цвета — `src/styles/admin-tailwind.css:6`
- [ ] **F-102** (низкая) Тёмная тема: белый текст на светло-фиолетовом (2,7:1) — номер активного блока в «Редакторе сайта» и кнопка «Восстановить» автосохранения — `src/styles/admin-ui.css:1157`
- [ ] **F-112** (низкая) Согласие на маркетинг для серверных событий Meta тесты проверяют только поиском строки: отправка без согласия проходит `npm run check` — `scripts/meta-capi-smoke-tests.js:121`
- [ ] **F-114** (низкая) Тест карты сайта проверяет статический sitemap.xml, который сайт не отдаёт. Список страниц живой карты не сверяется ни с чем — `scripts/generated-seo.test.js:245`
- [ ] **F-115** (низкая) В пре-рендере статьи время чтения без единиц: «Время чтения: 11» — `scripts/generate-pages.js:1890`
- [ ] **F-116** (низкая) Иконки админки едут общим файлом на каждую публичную страницу — `vite.config.ts:568`
- [ ] **F-118** (низкая) Регрессия: в статике услуг поясняющая строка снова внутри <h1> и сразу повторяется в лиде, строки заголовка склеены без пробела — `scripts/generate-pages.js:1211`
- [ ] **F-119** (низкая) На /cases/ и юридических страницах title, description и H1 в HTML не совпадают с тем, что рисует React — `scripts/generate-pages.js:1722`
- [ ] **F-120** (низкая) Внутренние ссылки ведут на адреса без слеша, и каждая проходит через 308-редирект — `src/app/components/Footer.tsx:139`
- [ ] **F-122** (низкая) Раздел «Canonical URLs» в llms.txt: 11 из 14 адресов не канонические и отвечают редиректом 308 — `public/llms.txt:159`
- [ ] **F-123** (низкая) llms-full.txt теряет короткий ответ, тезисы и FAQ, а подзаголовки сливаются с текстом в одну строку — `scripts/generate-pages.js:2136`

## 9. admin-api-money — Сервер админки: деньги, CRM, отчёты, сводки (17, открыто 1 — ждёт стыка)

Файлы группы: functions/api/admin/report.ts, crm-analytics.ts, clients.ts, crm-leads.ts, goals.ts, finance.ts, ad-spend.ts, attribution.ts, stats.ts, today.ts, performance.ts, lead-crm.ts, lead-trash.ts; functions/_lib/admin-alerts.ts, admin-crm.ts, local-day.ts, money.ts

- [x] **F-028** (средняя) Расходы не введены: «Расход 0», «Цена заявки 0 $» и «Прибыль = выручка» в «Отчёте», «Целях» и «Воронке» — `functions/api/admin/report.ts:95`
- [x] **F-029** (средняя) «Средний чек», «Выиграно» и «В работе» в CRM-аналитике считают сделки без суммы нулём — `functions/api/admin/crm-analytics.ts:196`
- [x] **F-032** (средняя) Клиент, заведённый после 10-го числа, сразу «требует действий» за отчёт, которого не должно быть — `functions/api/admin/clients.ts:177`
- [x] **F-033** (средняя) Дата завершения клиента нигде не ставится, «Средний срок жизни» растёт у ушедших клиентов — `functions/api/admin/clients.ts:314`
- [x] **F-034** (средняя) «Просрочено» в CRM и аналитике считает закрытые сделки и расходится с экраном «Сегодня» — `functions/api/admin/crm-leads.ts:105`
- [ ] **F-036** (средняя) Скрытое уведомление возвращается при следующем открытии и снова уходит в Telegram — `functions/_lib/admin-alerts.ts:260` — своя часть сделана 01.10 (admin-alerts.ts), ждёт миграции 0043 и вызова dismissAlert из alerts.ts (см. «Стыки»)
- [x] **F-038** (средняя) Выручка месяца в «Целях» и «Отчёте» привязана к дате заявки, а не к дате выигрыша — `functions/api/admin/goals.ts:89`
- [x] **F-042** (средняя) Неоплаченный счёт старше года исчезает из «Ждём оплаты» — `functions/api/admin/finance.ts:139`
- [x] **F-085** (средняя) «Meta отклонила N событий за сутки» и счётчики CAPI в «Сегодня» и «Проверке» считают до 48 часов вместо 24 — `functions/_lib/admin-alerts.ts:126`
- [x] **F-093** (средняя) Поиск в CRM и в корзине заявок не находит русские слова в другом регистре: «анна» не находит «Анна» — `functions/api/admin/crm-leads.ts:183`
- [x] **F-099** (средняя) «Meta CAPI за сутки» на «Сегодня», в «Проверке» и в уведомлении считает события за срок до 48 часов — `functions/api/admin/stats.ts:127`
- [x] **F-100** (средняя) Повтор одного ключа в CSV расходов затирает сумму: «Загружено строк: 2», а в базе одна строка с последней суммой — `functions/api/admin/ad-spend.ts:271`
- [x] **F-124** (низкая) «Выручка по месяцам» в CRM-аналитике 29–31 числа теряет самый старый из 12 месяцев — `functions/api/admin/crm-analytics.ts:118`
- [x] **F-125** (низкая) «Когорты по неделям» в «Воронке»: самая старая когорта всегда неполная, а неделя на стыке лет делится на две — `functions/api/admin/attribution.ts:546`
- [x] **F-126** (низкая) График «Сегодня»: заявки за первый из 14 дней считаются не за весь день — `functions/api/admin/stats.ts:135`
- [x] **F-127** (низкая) «Фокус дня»: из новых заявок попадают пять самых свежих, а те, что ждут ответа дольше всех, выпадают — `functions/api/admin/today.ts:409`
- [x] **F-132** (низкая) История PageSpeed пишет день по Гринвичу: ночной замер затирает вечерний и попадает во вчерашнюю точку — `functions/api/admin/performance.ts:327`

## 10. admin-crm-ui — Интерфейс админки: заявки, клиенты, финансы, планер (17, открыто 0 — все исправлены 02.10)

Файлы группы: src/app/components/admin/AdminLeads.tsx, CrmAnalytics.tsx, CrmBoard.tsx, AdminFinance.tsx, caseFromClient.ts, AdminClients.tsx, AdminPlanner.tsx, TodayPlan.tsx, TodayNote.tsx, AdminAdSpend.tsx, AdminGoals.tsx, AdminReport.tsx, AdminToday.tsx, AdminAttribution.tsx

- [x] **F-026** (средняя) Счёт, отмеченный «оплачен» в форме, не попадает в «Получено», «Прибыль» и «По месяцам» — `src/app/components/admin/AdminFinance.tsx:605`
- [x] **F-027** (средняя) Сумма сделки в формате «1,234.56» или «1.500,50» молча стирается при сохранении — `src/app/components/admin/AdminLeads.tsx:842`
- [x] **F-030** (средняя) «Откуда выигранные сделки» показывает число сделок как деньги — `src/app/components/admin/CrmAnalytics.tsx:323`
- [x] **F-031** (средняя) «Собрать кейс» считает цену заявки, ROMI и конверсию по месяцам, у которых нет пары — `src/app/components/admin/caseFromClient.ts:160`
- [x] **F-035** (средняя) «Отправил КП» не переводит сделку в «Предложение», если она уже не «Новая» — `src/app/components/admin/AdminLeads.tsx:711`
- [x] **F-037** (средняя) «Финансы → По месяцам»: у месяца, где были только расходы, прибыль показана «—» — `src/app/components/admin/AdminFinance.tsx:771`
- [x] **F-039** (средняя) Перенос задач с воскресенья может записать содержимое другой недели поверх текущей — `src/app/components/admin/AdminPlanner.tsx:999`
- [x] **F-040** (средняя) Доска CRM молча показывает не больше 300 сделок — `src/app/components/admin/CrmBoard.tsx:276`
- [x] **F-041** (средняя) Правка месяца клиента со сменой месяца создаёт дубль, а удалить месяц в интерфейсе нельзя — `src/app/components/admin/AdminClients.tsx:588`
- [x] **F-065** (низкая) «Рекламные расходы»: при ошибке сервера введённая сумма и вставленный CSV стираются — `src/app/components/admin/AdminAdSpend.tsx:128`
- [x] **F-066** (низкая) Плитки «Просрочено / На сегодня / Без следующего шага» не работают в режиме доски, который открывается по умолчанию — `src/app/components/admin/AdminLeads.tsx:1464`
- [x] **F-067** (низкая) «Связаться сегодня» не переносит просроченный срок на сегодня — `src/app/components/admin/AdminLeads.tsx:611`
- [x] **F-068** (низкая) Даты по умолчанию берутся по UTC: с 00:00 до 05:00 по местному времени это «вчера» — `src/app/components/admin/AdminAdSpend.tsx:30`
- [x] **F-069** (низкая) План и заметка дня на «Сегодня» перезаписывают неделю планера целиком, параллельные правки теряются — `src/app/components/admin/TodayPlan.tsx:61`
- [x] **F-070** (низкая) Повторное нажатие создаёт дубли доступов клиента и шаблонов ответов — `src/app/components/admin/AdminClients.tsx:669`
- [x] **F-071** (низкая) Подставленный шаблон недели пропадает после перелистывания — `src/app/components/admin/AdminPlanner.tsx:1088`
- [x] **F-072** (низкая) Серия выполненных дней на «Сегодня» пишется с ошибкой: «21 дней подряд» — `src/app/components/admin/TodayPlan.tsx:128`

## Стыки между группами

- `AdminSecurity.tsx`: текст ошибки `disable_first` для F-073 — сделано 01.10.
- (дописывать сюда изменения, которые одной группе нужны в файлах другой)

### Итоги 01.10: группы admin-api-core, admin-api-money, server-public

Тесты групп: `scripts/audit-admin-api-core.test.js` (21), `scripts/audit-admin-api-money.test.js` (17), `scripts/audit-server-public.test.js` (17) — все зелёные; скрипты `test:audit-admin-api-core`, `test:audit-admin-api-money`, `test:audit-server-public` добавлены в `package.json` и в цепочку `check`. В таблицу тестов CLAUDE.md/AGENTS.md нужно дописать две строки для новых скриптов.

Три находки закрыты только наполовину и ждут правок в чужих файлах: **F-036** (миграция 0043 + alerts.ts), **F-104** (health.ts), **F-089** (оговорки в UI/доках + решение владельца). Остальные 44 исправлены.

#### Владельцу (руками)

- **F-020**, консоль D1, одной командой: `UPDATE articles SET seo_title = title WHERE length(seo_title) = 70 AND length(title) > 70 AND substr(title, 1, 70) = seo_title;` — затем очистить кэш (пересохранить любую статью или Cloudflare → Purge). Описания кейсов 12 и 13 дописать в редакторе: исходный полный текст не сохранился.
- **F-036**, после того как появится `migrations/0043_admin_alerts_dismissed.sql`, применить в консоли D1: `ALTER TABLE admin_alerts ADD COLUMN dismissed_at TEXT;`
- **F-089**, решение: считать ли посещаемость шире — облегчённый запрос `/api/pageview` при согласии только на аналитику (сейчас знаменатель конверсии — только согласившиеся на маркетинг). Без решения оставляем как есть, с оговорками в интерфейсе.
- **F-033**, по желанию (меняет вид): поле «Закончили» (`<input type=date>`) рядом с «Почему закончили» в карточке клиента при статусе «завершён».

#### Из admin-api-core → другие группы

- admin-shell, `src/app/pages/Admin.tsx` (**F-019**): при `editingArticle.id > 0` поле slug `readOnly` с подсказкой «Адрес сохранённой статьи не меняется — смена = потеря позиций и 404»; у новой статьи и копии (id 0) оставить редактируемым; в `handleTitleChange` у сохранённой статьи с пустым slug не подставлять слаг из заголовка. Сервер отвечает 409 `{ code: 'SLUG_CHANGE_FORBIDDEN', currentSlug }` — показать `error` тостом (saveArticle уже бросает payload.error).
- admin-shell, `src/app/pages/Admin.tsx` (**F-020**, мелочь из ревью): счётчики «…/70 · …/170 · …/160» (строка ~1932) — подписать как рекомендацию для сниппета («в выдаче видно ~70/~160») или заменить знаменатели на лимиты валидатора 120/220/2000. Сервер больше не обрезает.
- seo-build, `scripts/generate-pages.js` ~540 (**F-020**): описание статьи режется `.slice(0, 160)` посреди слова — резать по границе слова (как `cutAtWord` в `functions/_lib/jsonbin.ts`) или не резать вовсе.
- admin-shell, `src/app/components/admin/ArticleCalendar.tsx` (**F-024**): новые черновики без даты (`publishedAt` теперь `undefined`) не попадают в сетку — ожидаемо; компонент уже пропускает статьи без даты (проверено ревью), правка не нужна.
- server-public / seo-build / blog (**F-129**): страховка для уже записанных данных — `dateModified`/`lastmod`/сортировка RSS = `max(updatedAt, publishedAt)`: `functions/_lib/seo.ts` (~143, 236, 249, 375), `functions/sitemap.xml.ts:27`, `scripts/generate-pages.js` (~185, 666, 1874), `src/app/pages/BlogPage.tsx` (~276, 726, 769).
- admin-shell, `src/app/components/admin/AdminPageLocks.tsx` (**F-081/F-091**): в `load()` и `post()` ставить `setMigration` только при `payload?.code === 'MIGRATION_REQUIRED'` (иначе `''`), в тип ответа `post` добавить `code`; на экран миграции — кнопка «Проверить снова» (`load()`). Сервер при сбое базы теперь отвечает 503 `{ code: 'DB_ERROR', error }` без поля `migration`, так что ложный экран миграции уже исчез.
- CLAUDE.md, AGENTS.md (**F-084**): строка «Допуск двойной» у `POST /api/meta-test-event` → тройной: секрет `META_CAPI_DEBUG_SECRET`, действующая сессия админки (cookie), пароль в `X-Admin-Password` только при выключенной двухфакторной защите. По желанию в `AdminMetaCenter.tsx` переводить 403 во фразу «сессия админки не принята — выйдите и войдите заново».
- admin-shell, `src/app/pages/Admin.tsx` (**F-095**, это же **F-078**): общий обработчик ответа 401 с `code: 'SESSION_EXPIRED'` (и `Unauthorized` без пароля в памяти): форма входа модальным окном поверх раздела без `setIsAuthenticated(false)`, чтобы не терять несохранённые правки; `checkAdminSession()` на `visibilitychange`/`focus` и раз в 5 минут. Окно из AdminFeedback/AdminUI, обе темы, 320 px. — **сделано 02.10** в рамках F-078 (окно поверх раздела, проверка статуса на `visibilitychange`; таймера раз в 5 минут нет намеренно — сессия сама не продлевается).
- вне групп, `functions/_lib/rate-limit.ts` (**F-111**): профиль `admin_media: { windowSeconds: 60, maxRequests: 240 }` с комментарием (загрузка и перенос пачки файлов в медиатеке; сорок картинок с копиями — двадцать запросов переноса подряд). `upload.ts` и `media.ts` уже используют scope `'admin_media'`; без профиля действует default 30/мин.
- admin-shell, `src/app/components/admin/AdminMedia.tsx` (**F-111**): перенос выделенных одним `post({ action: 'move', keys, folder })` до 50 ключей; сервер сам режет пачку по бюджету подзапросов и отвечает `{ moved, failed, skipped, error }` — повторять запрос с `keys = skipped`, пока не пуст (картинки с копиями едут по две за запрос); при непустом `failed` остановиться, показать `error` и обязательно `await load()` в `finally` — файл мог остаться в обеих папках. Проверку `mediaUsage` делать до отправки и называть пропущенные. `uploadFiles`: при 429 ждать `retry_after`/`Retry-After` и повторять файл; сообщение «Загружено N из M, сервер просит подождать минуту» вместо сырого Too many requests.
- Существующие тесты (не обязательно): `scripts/migration-guard.test.js` — проверка исходника `functions/api/admin/page-locks.ts`: каждый `migrationRequiredResponse(` под `isMissingSchemaError(` (по образцу строк 182–183; сейчас закреплено поведенческим тестом группы); `scripts/meta-capi-smoke-tests.js` — по желанию добавить `'hasValidAdminSession'` и `'isAdmin2faEnabled'` в `mustContain` для `files.metaTestEvent`.

#### Из admin-api-money → другие группы

- Новая миграция `migrations/0043_admin_alerts_dismissed.sql` (**F-036**): `ALTER TABLE admin_alerts ADD COLUMN dismissed_at TEXT;` затем `npm run build:migration-map` (сгенерированные `_lib/migration-tables.ts`, `_lib/migration-signatures.ts`) и строка «0043 | скрытие уведомления не возвращается, пока повод тот же» в таблице миграций CLAUDE.md и AGENTS.md. Файл миграции не создан намеренно: без регенерации карты упал бы `test:migration-map`.
- `functions/api/admin/alerts.ts` (**F-036**): в `action=dismiss` заменить прямой UPDATE на `await dismissAlert(env.DB, id)` из `../../_lib/admin-alerts` (ставит resolved_at, dismissed_at и notified_at=COALESCE(notified_at, now) при наличии колонки; без колонки — прежний UPDATE).
- `functions/api/admin/health.ts` ~390 (**F-085/F-099**): `created_at >= datetime('now', '-1 day')` → `created_at >= ?` с `.bind(isoSince(1))` (импорт `isoSince` из `../../_lib/local-day`); фильтр по `service` оставить. `meta-center.ts` может заменить свой локальный `isoSince` на общий.
- admin-crm-ui, `src/app/components/admin/CrmAnalytics.tsx` (**F-029**): тип `totals`: `openValue` и `wonValue` → `number | null`; в подписях плиток использовать `wonPriced`/`wonWithoutValue`/`openPriced`/`openWithoutValue` («По N сделкам с суммой; у M сумма не заполнена»). `formatMoney` уже выводит «—» для null, без правки ничего не ломается. — **сделано 02.10** (`valueCoverage`).
- admin-crm-ui, `CrmBoard.tsx` ~117 и `AdminLeads.tsx` ~1624 (**F-034**): «просрочено» только для открытых этапов — `!['won','lost','archived'].includes(lead.pipeline_stage) && isOverdue(lead.next_action_at)`, чтобы закрытая карточка не горела красным. — **сделано 02.10** (`isOverdue(raw, stage)`, `isOpenStage()`).
- admin-crm-ui, `AdminAdSpend.tsx` ~134 (**F-100**): к уведомлению дописать `, объединено: ${payload.merged}`, если `payload.merged > 0` (поле приходит с сервера) — **сделано 02.10**..
- вне групп, `src/app/components/admin/AdminPerformance.tsx` (**F-132**): в функции `audit` (~489–492) `endpoint.searchParams.set('timezone_offset', String(new Date().getTimezoneOffset()))`; в подписи оси (~739) `timeZone: 'UTC'` в опциях `toLocaleDateString`. Без первого пункта день истории остаётся по UTC.
- admin-crm-ui, `AdminClients.tsx` ~222 (**F-033**): POST `/api/admin/clients` не передаёт `timezone_offset` — добавить `?timezone_offset=${new Date().getTimezoneOffset()}`, иначе дата завершения ставится по UTC. Поле «Закончили» — см. «Владельцу». — **сделано 02.10** (timezone_offset; поле «Закончили» не делалось).
- Мелочи из ревью в файлах самой группы (не блокируют): `functions/_lib/admin-crm.ts` — добавить пары `ЎҒҚҲ` → `ўғқҳ` в `CYRILLIC_UPPER`/`CYRILLIC_LOWER` и проверку «ғафур» находит «Ғафур Алиев» в тест F-093; `functions/api/admin/ad-spend.ts` — при переполнении `MAX_AMOUNT` после сложения отбрасывать слот целиком (`bySlot.delete(key)`) или писать в ошибке, что в базу ушла только часть суммы.

#### Из server-public → другие группы

- admin-api-core, `functions/api/meta-test-event.ts` (**F-086**): `getRequestGeo` заменить на `extractRequestContext` из `_lib/meta-request` (регион как `regionCode || region`, как в `lead.ts`), чтобы «Тестовое событие» показывало те же ct/st, что настоящие события.
- admin-api-money, `functions/api/admin/attribution.ts` (**F-089**): в массив `limitations` добавить: «Просмотры и посетители считаются только у тех, кто разрешил маркетинговые cookie. Посетители из ЕС/UK/CH, которые отказались или не ответили на баннер, в знаменатель не попадают, заявки же считаются у всех. Поэтому конверсия страниц может быть завышена».
- `functions/api/admin/content-stats.ts` + `src/app/components/admin/ContentPerformance.tsx` (**F-089**): та же оговорка; для страницы, где есть заявки и нет просмотров, отдавать «нет данных» (`null`), а не `views: pageViews || 0`; UI рисует прочерк с объяснением. — сервер `content-stats.ts` сделан 01.10 (журнал `work/fix-cross-group.md`), **`ContentPerformance.tsx` ещё нет**: `views: number | null` → прочерк с подсказкой, `conversion` null → прочерк, не суммировать null, null в конец при сортировке, вывести `payload.notes`.
- admin-crm-ui, `AdminToday.tsx` (~352, ~675) и `AdminReport.tsx` (**F-089**): к формулировке «без cookies» добавить «только посетители, давшие согласие на маркетинговые cookie». — **сделано 02.10** в `AdminToday.tsx` (плитка и примечание); в `AdminReport.tsx` такой формулировки нет.
- `docs/ADMIN_SETUP_V2.md`, CLAUDE.md/AGENTS.md раздел «Заявки и первичная статистика» (**F-089**): строка про `/api/pageview` — оговорка, что просмотры и посетители считаются только у согласившихся на маркетинговые cookie.
- `functions/api/admin/health.ts` (**F-104**, без этого находка не закрыта): ветка `monitor` (~288–300) — `tracking_signature_daily` теперь содержит только попытки с подписью, поэтому «lead: N, meta-event: N, pageview: N» больше не объём трафика. Заменить строку traffic текстом «неподписанные запросы (все с настоящего сайта) не журналируются, чтобы не тратить лимит записей D1; подписанных попыток за сутки: валидных X, невалидных Y», объём трафика брать из `page_stats_daily` (SUM(views) за сутки, как в проверке `stats`); не показывать «lead: 0, meta-event: 0, pageview: 0» как данные. Если `audit.disabled > 0` (строка с `reason = AUDIT_BUDGET_EXHAUSTED_REASON` из `_lib/tracking-signature.ts`, экспортируется) — «невалидных: не меньше Y — суточный бюджет 200 записей аудита исчерпан, день неполный». SQL агрегата менять не нужно: отметка лежит под `endpoint = AUDIT_BUDGET_MARKER_ENDPOINT` (`'all'`) и в суммы по точкам/valid/invalid не попадает; строку `updated_at >= strftime('%s','now','-1 day')` оставить — её требует `scripts/meta-capi-smoke-tests.js:435`. Ветка `enforce` (valid === 0 && invalid > 0 → fail) остаётся верной.
- `docs/CLOUDFLARE_LIMITS.md`, `docs/SECURITY.md` ~156 (**F-104**): убрать `tracking_signature_daily` из расчёта записей D1 на визит (для неподписанных запросов теперь 0); в SECURITY.md отметить: журналируются только попытки с подписью, суточный бюджет 200 записей на дата-центр, при исчерпании — одна отметка `disabled`/`audit_budget_exhausted` под endpoint `'all'`.
- вне групп, `functions/_lib/http.ts` и `functions/_middleware.ts` (**F-106**, по желанию): перенести `headFromGet` из `_lib/article-page.ts` в общий помощник HTTP; поправить комментарий над `ensureApiNotFound`: для HEAD Cloudflare Pages не отвечает 405, а отдаёт статику.
- seo-build, `scripts/generate-pages.js` ~178 (**F-108**, это же **F-047**): отбор и сортировку материалов привести к ключу публикации `renderFeedXml` (publishedAt → date → updatedAt), чтобы лента и блог отбирали одинаково.
- Существующие тесты: `scripts/generated-seo.test.js` — в `mustMatch` теста 'crawlers that verify indexing are recognised as bots' добавить `'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-User/1.0; +Claude-User@anthropic.com)'` (**F-109**); строковая проверка `/status: 404/` в 'article routes are served with their own meta' проходит, поведенческая версия живёт в `scripts/audit-server-public.test.js` (**F-113**) — можно заменить.
- Мелочь из ревью в файле группы: `functions/_lib/meta-request.ts` — JSDoc про запасной источник из `request.cf` стоит над `cfText`, а не над `extractRequestContext`; перенести объявление `cfText` выше комментария.

### Стыки второй волны закрыты 02.10 (вечер)

Отдельным исполнителем, журнал `docs/handoff/work/fix-cross-group-2.md`: F-009 (`media.ts`), F-061 (`articles.ts` PATCH + dev-заглушка), F-103 (`admin-totp.ts`), F-133 (`articles-schedule.ts`), F-026 (`finance.ts`), F-030 (`crm-analytics.ts`), F-070 (`clients.ts` seed_access, `crm-templates.ts`, `CrmQuickActions.tsx`), F-068 (`report.ts` today, `clients.ts`), F-031 (`CaseBuilderDialog.tsx`), F-089 (`ContentPerformance.tsx`; `AdminToday.tsx` уже содержал оговорку, в `AdminReport.tsx` формулировки «без cookies» нет). Не сделано намеренно: F-069 (необязательное усиление планера), F-033 (решение владельца). Тесты: audit-admin-api-core 30, audit-admin-api-money 25.

### Итоги 02.10: группы admin-shell, admin-crm-ui, editor

Тесты групп: `scripts/audit-admin-shell.test.js` (19), `scripts/audit-admin-crm-ui.test.js` (26, собирает ESM-бандлы в gitignored `tmp/`), `scripts/audit-editor.test.js` (15) — все зелёные; скрипты `test:audit-admin-shell`, `test:audit-admin-crm-ui`, `test:audit-editor` добавлены в `package.json` и в цепочку `check` перед `npm run build`. Полный `npm run check` после этой волны ещё не прогонялся. В таблицу тестов CLAUDE.md/AGENTS.md дописать три строки (ниже, по группам).

Исправлено 37 из 38: admin-shell 14/15 (**F-009** — needs-cross-group), admin-crm-ui 17/17, editor 6/6. Попутно в файлах admin-crm-ui закрыты стыки прошлой волны: F-029, F-033 (timezone_offset), F-034, F-089 (`AdminToday.tsx`), F-100; стык F-095 закрыт в F-078. У F-061, F-078, F-103, F-133 (admin-shell) и F-026, F-030, F-031, F-070 (admin-crm-ui) клиентская половина полная, серверная — ниже.

#### Владельцу (руками)

- **F-026**, консоль D1, одной командой — после выкладки правки `finance.ts` (ниже), чтобы старые счета «оплачен» без даты попали в «Получено» и «Прибыль»: `UPDATE invoices SET paid_at = COALESCE(issued_at, date(created_at)) WHERE status = 'paid' AND paid_at IS NULL;`
- **F-133**, до серверного заслона (ниже): собирать расписание непосредственно перед «Запланировать» — план, собранный заранее и подтверждённый через полчаса, уведёт первую статью задним числом (панель проверяет слоты при сборке, а не при сохранении).

#### Из admin-shell → другие группы

- admin-api-core, `functions/api/admin/media.ts` (**F-009**, без этого находка не закрыта): сервер — единственный источник правды об использовании файла. В GET `/api/admin/media` отдавать каждому файлу `usage: string[]` (заголовки статей), посчитанный одним запросом `SELECT slug, title, image, content` (и `case_data_json`, если колонка есть) `FROM articles` по публичному адресу `publicUploadUrl(host, key)` и по самому `key`; включать черновики, запланированные и кейсы; копии `-<ширина>.webp` считать по оригиналу. Перед `delete` и `move` проверять каждый ключ тем же способом (`instr` или `LIKE` с `ESCAPE`, не голый `LIKE`: в ключах бывают `_` и `%`) и отвечать 409 с перечнем заголовков, ничего не удаляя и не перенося; без D1 — `fetchArticlesWithFallback` по полному `content`; если проверка не удалась (D1 недоступна) — отказывать, а не пропускать. **Если D1 недоступна или запрос по статьям упал, в GET поле `usage` не отдавать вовсе (`undefined`), а не `[]`** — клиент верит `usage` даже пустому, и `[]` пометило бы все файлы кандидатами на удаление; без поля он уходит в запасной разбор по списку. Поправить комментарий «это проверяет интерфейс». Клиент (`AdminMedia.tsx`) уже читает `file.usage` и показывает 409 через `setError`.
- admin-api-core, `functions/api/admin/articles.ts` (**F-061**): `onRequestPatch`, обе ветки при сборке `article`: `featuredOrder: existing?.featuredOrder ?? undefined` вместо значения из тела — закреплением управляет только `PUT articles-featured`; без этого JSONBin-ветка заменяет статью целиком вместе со старым порядком. Тот же принцип в dev-заглушке `vite.config.ts:248` (`incoming.featuredOrder ?? existing?.featuredOrder` → `existing?.featuredOrder`). Клиент уже отправляет `featuredOrder: undefined`.
- admin-api-core, `functions/_lib/admin-totp.ts` (**F-103**): `normalizeBackupCode` — после trim/toLowerCase удалить пробелы и дефисы, и если получилось ровно 10 символов `[0-9a-f]`, вернуть `${s.slice(0,5)}-${s.slice(5)}`, иначе строку как раньше. Форма совпадает с уже сохранёнными хешами (посчитаны от кода с дефисом), а код «без дефиса» и «с пробелом» принимается. `generateBackupCodes`/`hashBackupCode` и одноразовость в `consumeBackupCode` не меняются. Проверка: `hashBackupCode('7cd5ca5978') === hashBackupCode('7cd5c-a5978')`.
- admin-api-core, `functions/api/admin/articles-schedule.ts` (**F-133**): в `parseItems` или перед `writeScheduleToD1` (и в JSONBin-ветке) элементы с `publishedAt <= nowIso` (допуск около минуты на рассинхрон часов) не записывать, а класть в `skipped` и отдельно в `skippedPast: string[]` — иначе старый клиент или ручной запрос обходят клиентскую проверку. Панель может потом разделить текст «пропущены» по причинам.
- CLAUDE.md/AGENTS.md, таблица тестов: `test:audit-admin-shell — находки аудита по оболочке админки: уход из редактора статьи и редактора сайта с вопросом, FAQ знает о несохранённом, окно повторного входа, палитра по всем публикациям, slug с дефисом, календарь без черновиков, расписание не в прошлое`.
- Существующие тесты (не обязательно): `scripts/publish-schedule.test.js` — сейчас не ломается, проверка «сейчас» включается только при переданном `now`; если сделать `now = Date.now()` по умолчанию, в `base` передавать фиксированный `now` (например `Date.UTC(2026, 8, 20)`), иначе `startDate 2026-10-01` станет «прошлой».
- Мелочи из ревью в файлах группы (не блокируют): `AdminFaqControl.tsx` (**F-077**) — сразу после успешного ответа `save()` ставить `setBaseline(faqSignature(savedItems, seo))`, не дожидаясь `load(true)`; `PublishSchedulePanel.tsx` (**F-133**) — в `savePlan` перед `confirmDialog` проверить `Date.parse(first.publishedAt) <= Date.now()` и вместо отправки `notify.error('Расписание устарело', …)` + `resetPlan()`; `Admin.tsx` (**F-007**) — в `openArticleFromPalette` перед `setAdminSectionFilter` та же проверка `confirmLeaveEditor`, что в `openArticleForEdit`; `AdminContentControl.tsx` (**F-074**) — при несохранённом в обеих вкладках один вопрос вместо двух подряд.

#### Из admin-crm-ui → другие группы

- admin-api-money, `functions/api/admin/finance.ts` save_invoice (~206–219) (**F-026**): `const status = cleanInvoiceStatus(body.status); const paidAt = status === 'paid' ? (cleanDate(body.paid_at) || cleanDate(body.issued_at) || localTodayIso(request)) : null;` подставить `paidAt` и `status` в values. Разовый SQL владельцу — см. «Владельцу».
- admin-api-money, `functions/api/admin/crm-analytics.ts` (**F-030**): в `sourceRows` (~129–139) добавить `SUM(CASE WHEN deal_value > 0 AND deal_currency != ? THEN 1 ELSE 0 END) AS other_currency` (по образцу запроса этапов) и отдавать `otherCurrencyDeals: number(row.other_currency)` в `wonBySource` — UI уже показывает «сумма в другой валюте» по этому полю.
- вне групп, `src/app/components/admin/CaseBuilderDialog.tsx` (**F-031**): рядом с абзацем «Пропущено без цифр» (~178) вывести `result.ratioGaps`: «Цена заявки посчитана без {cpl.join(', ')}: нет пары расход+заявки», то же для `romi` (расход+выручка) и `conversion` (продажи+заявки), только если список непуст.
- admin-api-money, `functions/api/admin/planner.ts` (**F-069**, по желанию): принимать `expectedUpdatedAt`; при его наличии `UPDATE planner_weeks … WHERE week_start=? AND updated_at=?` (INSERT только при отсутствии строки), 0 изменённых строк → 409; `TodayPlan`/`TodayNote` при 409 повторяют цикл один раз. Проверка должна остаться необязательной (автосохранение AdminPlanner и `sendBeacon`).
- admin-api-money, `functions/api/admin/clients.ts` и `functions/api/admin/crm-templates.ts`; вне групп `src/app/components/admin/CrmQuickActions.tsx` (**F-070**): `clients.ts` — действие `seed_access` одним `db.batch` с `INSERT INTO client_access (client_id, name, status) SELECT ?, ?, 'waiting' WHERE NOT EXISTS (SELECT 1 FROM client_access WHERE client_id = ? AND name = ?)`; `crm-templates.ts` seed — `INSERT … SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM crm_templates WHERE title = ?)` внутри одного batch (не проверять пустоту всей таблицы); `CrmQuickActions.tsx` — флаг `saving`, `disabled` на «Создать стандартные» и «Сохранить», сброс в `finally`.
- admin-api-money, `functions/api/admin/report.ts` и `clients.ts` ~374 (**F-068**): `report.ts` — `today: localTodayIso(request)` в ответе (UI сможет блокировать «›» по нему, как в «Целях»); `clients.ts` — запасное `started_at` через `localTodayIso(request)`, а не `new Date()` по UTC.
- CLAUDE.md/AGENTS.md, таблица тестов: `test:audit-admin-crm-ui — находки аудита по интерфейсу админки: заявки, клиенты, финансы, планер, «Сегодня»`. Тесту нужен каталог `tmp/` (gitignored) для ESM-бандлов (react-dnd — ESM-only).
- Решение владельца (**F-033**): поле «Закончили» в форме клиента — уже в «Владельцу» итогов 01.10; не делалось.
- Мелочи из ревью в файлах группы (не блокируют): `AdminPlanner.tsx` (**F-039**) — хранить промис идущего `flush()` и перед `rewriteWeek` ждать его, чтобы GET недели читал её после последней записи; в `catch` различать «W+1 не записана» и «записана, но не убрана из исходной» — во втором случае сказать, что задачи уже в понедельнике следующей недели и остались в воскресенье; `scripts/audit-admin-crm-ui.test.js` (**F-068**) — проверки «Цели/Отчёт на местном месяце» закрепить на границе месяца (подменить время так, чтобы UTC-месяц и местный расходились), тест F-039 перевести с реальных таймеров на промисы.

#### Из editor → другие группы

- editor, `scripts/audit-editor.test.js:141` (**F-006**, **важно для `check`**): `readFileSync('../data/articles.build.json')` на верхнем уровне модуля без запасного источника; файл в `.gitignore` и появляется только после `fetch:articles`/сборки, а `test:audit-editor` в `check` стоит раньше `build` — на свежем клоне падает весь набор до первой проверки, и с ним `npm run check`. Повторить цепочку соседей (`scripts/blog-sections.test.js:66`): `['data/articles.build.json', 'public/articles.seed.json', 'data/articles.local.json'].find(existsSync)` внутри проверки «на живых статьях», остальные 14 проверок от снимка не зависят.
- admin-shell, `src/app/pages/Admin.tsx` (**F-006**, по желанию): обернуть `handleContentChange` (~1343) в `useCallback([])` — он пишет через функциональный `setEditingArticle`; с флагом `blocksTouchedRef` для корректности уже не требуется, но убирает лишние перезапуски эффекта onChange при каждом рендере Admin.
- admin-shell, `src/app/pages/Admin.tsx` (**F-059**, по желанию, аккуратнее для D1): в `handleSave` пропустить `caseData.metrics` через `.filter((m) => m.value.trim() && m.label.trim())`, пустой массив → `undefined`; либо вызвать `normalizeCaseData` на запись в `functions/api/admin/articles.ts` рядом с проверкой размера (~105). Сервер уже отбрасывает неполные метрики при чтении.
- **F-008**: ранее предложенный стык «`flush()` через ref для `handleSave`» снят — HTML из Markdown уходит в `setEditingArticle` синхронно внутри события, `handleSave` читает актуальный `editingArticle.content`.
- CLAUDE.md/AGENTS.md, таблица тестов: `test:audit-editor — находки аудита по блочному редактору: ссылки и жирный переживают круг HTML → блоки → HTML, текст из Markdown доходит до сохранения, вставка по курсору, смена статьи закрывает Markdown, метрики кейса, горячие клавиши`.
