# Ускорение и проверка сайта — 27.09.2026

## Цель и границы

Ускорить первую загрузку, переходы и прокрутку; исправить подтверждённые ошибки на публичных страницах и в общих механизмах. Сохранить смысл, изображения, характер дизайна и композицию hero. Пользователь явно разрешил облегчать или заменять тяжёлые анимации. SEO, согласие на аналитику, Pixel/CAPI event_id, доставка через outbox и приём заявок обязательны.

Работа ведётся локально. Реальные заявки, CMS и события Meta не изменяются. Существующие изменения `docs/SEO_PROGRAM.md` и старые незакоммиченные скриншоты принадлежат пользователю и сохраняются. Установка новых плагинов пока не требуется.

## Этапы

- [x] Прочитать инструкции, карту архитектуры и предыдущие отчёты; проверить состояние Git.
- [x] Разделить независимые области между агентами: сцены/анимации; публичные страницы; сервер/SEO/CAPI/админка.
- [x] Снять baseline: проверки, размеры production assets, браузерная загрузка и scroll, ошибки консоли/сети. Системный Node25 завершал Vite с libuv assertion; bundled Node24 прошёл полный check.
- [x] Исправить загрузку и передачу HTML → React на главной без вспышки другого оформления; cold/no-JS screenshots, CMS-текст и ссылки проверены.
- [x] Исправить подтверждённые ошибки каждой группы страниц, navigation/back/anchors, форм/калькуляторов, мобильных меню и диалогов.
- [x] Сократить постоянную работу canvas/эффектов, чтения layout, лишние запросы и рендеры.
- [x] Проверить серверные cache/read-path, SEO/canonical/status/structured data и неизменность tracking contracts.
- [x] Проверить авторизованные экраны админки в доступном локальном окружении; отдельно указать, что требует D1/R2/production.
- [x] Проверить production preview на 320/390/453/768/1440 px: все публичные routes, опубликованные статьи и кейсы; открытые состояния и ошибки.
- [x] Финальные full check + осознанный Meta CAPI smoke + дополнительные поведенческие регрессии + diff check. После I03 повторный полный прогон PASS: 332 теста, типы, build и SEO.
- [x] Сохранить итоги, измерения и оставшиеся внешние проверки; открыть отчёт пользователю. Локальная работа завершена, все найденные дефекты кода исправлены; ограничение desktop LCP и проверки production/физических iPhone перечислены отдельно.

## Журнал находок (дополняется)

| ID | Проблема / доказательство | Ответственный | Статус |
|---|---|---|---|
| L01 | HTML-оболочка генерируется отдельной разметкой, затем заменяется createRoot; видимая смена первого экрана | root | исправлено: общие Hero/Navbar, CMS seed, no-JS/CSR screenshots и 5 regression PASS с L05/I03 |
| N01 | Blog/Cases меняют query при фильтрации; общий scroll restoration сбрасывает позицию при REPLACE | root + pages | исправлено, browser history/query PASS |
| P01 | Blog URL/state не синхронизируются при back/forward | pages | исправлено, browser PASS |
| P02 | Связанный термин глоссария остаётся скрыт текущим поиском | pages | исправлено, browser PASS |
| M01 | Canvas Thanks/Consult работают на частоте экрана; скорость частиц Thanks зависит от Hz | motion | исправлено, scene tests PASS |
| M02 | Resize стирает canvas в paused/reduced режиме; reduced-motion читается однократно | motion | исправлено, scene tests PASS |
| M03 | Plexus измеряет geometry вне экрана на mousemove | motion | исправлено |
| S01 | API статей создаёт разные cache keys для игнорируемых query; лишнее D1-чтение и неполная инвалидация | server | исправлено, API tests PASS |
| P03 | Холодный lazy-кейс не получал обработчик ZIP/ссылок; content ref был пуст при первом effect | pages | исправлено, browser fixture PASS |
| P04 | Карусель отзывов использовала старую длину списка после CMS-загрузки | pages | исправлено |
| P05 | Вложенные/отсутствующие main и ранний focus до загрузки lazy-route | pages + root | исправлено; delayed-chunk browser проверка корректного focus PASS |
| L02 | Повторные одинаковые binary-search замеры заголовков по таймерам/чужим шрифтам; geometry reads в ResizeObserver | motion | исправлено, 4 regression PASS, font-size writes 27→9 с тем же кеглем |
| L03 | Root first-screen marker не учитывал history key при reload после SPA | root + motion review | исправлено, regression PASS |
| R01 | Формы зависали при подготовке payload; localStorage failure терял ввод с ложным подтверждением | server | исправлено, 22 lead regressions PASS |
| S02 | Сбой HTML assets существующей статьи превращался в200/404 | server | исправлено, статусы/CacheAPI/MIME regression PASS |
| S03 | При одновременном отказе D1/CacheAPI терялся последний список закрытых страниц | server | исправлено,14 page-locks tests PASS |
| A01 | CMS preview читал layout и вызывал setState из ResizeObserver; portal-expanded не имел нужных CSS | server | исправлено; 48 browser-конфигураций PASS |
| A02 | Browser QA обнаружил ResizeObserver loop при открытии editor; запись размеров внутри callback меняла наблюдаемый stage | server | CSS-записи перенесены в один RAF; повтор 8 конфигураций без ошибки |
| A03 | Fullscreen admin preview на телефоне смещался за экран: transform:none не сбрасывает individual translate Tailwind4; у крестика отсутствовал data-slot | server | исправлено; modal geometry, close44px, focus/scrolllock PASS |
| I01 | WebKit26.5: главный кит невидим при готовой картинке и правильной геометрии, включая reduced-motion | motion | причина: большие двойные drop-shadow при первом paint; исправлено и проверено на финальной сборке |
| I02 | FAQ/Cases и landscape-формы имеют 14–15px текст: iOS увеличивает viewport при вводе | pages + server | поля16px; финальная public matrix44/44 и admin36/36 PASS |
| F01 | Consult скачивает 8 файлов Commissioner, хотя 4 веса каждого subset побайтово одинаковы | pages | финальная сеть8→2 файла; −188664байт, метрики пяти весов прежние; старые файлы сохраняются |
| L04 | В промежуточном cold-run Home FCP/LCP хуже исходного; полноценный SSR раньше открывает сеть декоративным картинкам | root + motion | low priority/SSR pause/compact внесены. Итоговый mobile LCP3.304→3.080с; desktop2.948→3.372с. Ограничение и все12замеров раскрыты в RESULT; требуется контроль реальных Web Vitals |
| L05 | Мобильные сферы/кристаллы скачиваются в desktop-размерах; 6 файлов около210KB при отображении30–74CSSpx | root + pages | исправлено: 6 DPR3-копий, 210160→74828 байт; визуальная проверка и alpha PASS, исходники сохранены, source/размеры проверяются тестом |
| I03 | Только WebKit при React mount скачивает6оригиналов img.src (210160 лишних байт), хотя currentSrc выбираетcompact; вSSR безJS иChromium дублей нет | motion | исправлено; regression и full check PASS. На4179 WebKit/Chromium375:6compact и0original requests;375→932→375 корректно меняет6→12→6pieces без повторных лишних запросов |

## Дополнительные условия пользователя

Мобильная версия приоритетна: размеры iPhone11 и новее. Расширена матрица portrait360/375/390/393/402/414/428/430/440/453 и landscape812/896; дополнительно320,768,1440. Запущен WebKit26.5/DPR3 (это не физический iPhone).

Пароль админки использован только для входа, не сохранён. Production потребовал2FA; код недоступен пока пользователь спит. Реальные данные/события не изменялись. Локальная админка проверяется отдельно с guard на записи и явно обозначенными fixtures.

## Текущее подтверждение

- Первый полный `npm run check` на Node24 завершился успешно, включая production build и15 SEO-output проверок.
- Финальный повтор `npm run check` после WebKit-fix PASS: 332 Node tests, обе проверки типов, сборка и 15 SEO-output внутри общего числа. Отдельный `npm run test:meta-capi` PASS. Логи: `check-final3-2026-09-27.log`, `meta-capi-final-2026-09-27.log`.
- Интерактивный Chromium gate44/44:11 ширин, glossary related/search, blog query/history, calculator/select/Escape, mobile menu/body unlock. Холодный case ZIP fixture также прошёл.
- Chromium: 203/203 основных layouts +90/90 phone/landscape layouts. Нет runtime/navigation errors, document overflow, битых изображений, duplicate IDs; в каждом один main.
- WebKit: 62/62 загрузок, runtime errors/overflow/broken images — 0. В одном измерении пойман промежуточный skeleton до появления main; отдельная проверка после полной готовности PASS (один main, правильный H1). Визуально найден I01: HTML-проверка изображения сама по себе его не ловит.
- Дополнительные 13/13 интерактивных сценариев: ZIP/FAQ/calculator select на 320×568, 390×380 (низкий viewport), 896×414; возврат focus и history к contact. Суммарно 57/57. Отзывы после delayed CMS fixture растут с15 до18 карточек, 18-я достижима.
- Локальная админка: 18 разделов ×4 ширины ×2 темы =144 открытия без горизонтального переполнения. Несохранённые изменения Hero доходят до iframe на всех5 страницах; 0 запросов записи. Production D1/R2 остаётся отдельной проверкой.
- Проверка файлов: eager import graph и реальные cold requests пяти главных маршрутов не включают Admin, ArticleEditor, admin CSS, чужие hero или бинарники всей библиотеки шрифтов. Найденный реальный дубль загрузки Commissioner исправляется как F01; удаление архивов/исходников само по себе стартовый граф не ускоряет.
- Проверены прямые #contact на Home и четырёх услугах: верх блока остаётся ниже Navbar. Delayed lazy chunk 1800ms: focus получает новый H1, скрытый старый заголовок не найден.
- Неизменяемый финальный снимок4177: public поля44/44, Commissioner2/2 viewport, WebKit9/9 (normal/reduced/no-JS/landscape/desktop) PASS. Скриншоты normal/no-JS главной375px просмотрены: кит и текст совпадают.
- Заключительный снимок4179 после compact/WebKit-fix: сетевой и визуальный gate Chromium/WebKit, mobile/desktop/no-JS/reduced/resize PASS. Мобильные originals не запрашиваются, скрытые картинки не скачиваются; кит с high priority виден. Скриншот WebKit375 просмотрен основным агентом.
- В44 горизонтальных лентах Home/услуг на320/390 все отложенные картинки проверены после прокрутки до конца: broken/pending0.
- ArticleEditor:8 viewport/theme состояний и unsaved-текст→preview PASS; font dialog4 состояния,88 вариантов+emptysearch, закрытие/scrolllock/focus PASS. Реальных записей0.
- Дополнительно прочитаны509 внутренних ссылок из31 HTML-документа: отсутствующих targets0.
- Заключительный cold-run на том же Vite4173 завершён: все12загрузок без pageerror/overflow, CLS≤0.003; mobile LCP всех6routes ниже исходного. Home resources739→609KiB, Consult1034→849KiB. Desktop Home LCP вырос2.948→3.372с; это явно оставлено в отчёте, общий процент ускорения не заявлен.
- Vite preview без завершающего слеша отдаёт Home HTML вместо нужной статики. Для достоверной финальной проверки используются отдельные immutable snapshots на4174/4176 с корректной маршрутизацией статических страниц и статей. Это локальный стенд, не Cloudflare backend.

## Карта покрытия

Главная; Meta Ads; Google Ads; Meta Apps; консультация; блог; каждый опубликованный материал; кейсы; каждый кейс; калькулятор бюджета; ROI; FAQ; глоссарий; privacy; offer; cookie policy; thank-you; 404; admin login; content preview; разделы админки по доступности данных.

Подробные журналы: `PERFORMANCE-2026-09-27-MOTION.md`, `PERFORMANCE-2026-09-27-PAGES.md`, `PERFORMANCE-2026-09-27-SERVER.md`. Браузерные артефакты и машинные результаты: `output/playwright/performance-2026-09-27/`.

## Условия честного завершения

Не объявлять идеальность или отсутствие всех возможных ошибок. Отделять чтение кода от проверки поведения, локальный Chromium от реального Safari, симуляцию API от Cloudflare D1/R2 и production. Измерения сравнивать при одинаковых условиях; не выдавать старые замеры за новые. Не удалять файлы только потому, что они кажутся лишними, без проверки потребителей.
