# Анимации и фоновые сцены — 27.09.2026

## Границы

Сохраняем композицию, изображения и основной характер движения. В текущем задании владелец разрешил удешевлять и заменять тяжёлые эффекты. SEO, формы и аналитика не меняются. Общий `npm run check` и проверку страниц выполняет основной агент.

## План и найденные дефекты

- [x] Ограничить обновления canvas пыли в Cosmic / Consult / Thanks до 60 кадров на desktop и 24 на компактных экранах. Сейчас Consult и Thanks следуют частоте монитора, включая 120–144 Гц; Thanks ещё и перемещает пыль на фиксированную величину за кадр.
- [x] Перевести сглаживание параллакса на прошедшее время, чтобы оно не менялось с частотой экрана.
- [x] Сохранить узор пыли при изменении размеров Consult / Thanks; перерисовать статичный кадр после resize, в том числе при reduced motion и во время паузы. Сейчас присваивание canvas.width очищает изображение без последующего paint.
- [x] Реагировать на изменение prefers-reduced-motion без перезагрузки во всех трёх сценах.
- [x] Убрать измерение getBoundingClientRect у невидимых Plexus: глобальный mousemove сейчас продолжает измерять каждый смонтированный фон за экраном.
- [x] Приостановить CSS-сцены в скрытой вкладке. useAmbientVisibility сейчас учитывает только IntersectionObserver; собственный data-ambient сцены .ths / .cds не подходит под существующий селектор с отдельным предком.
- [x] Удешевить повторяющуюся filter-анимацию ноутбука и проверить свечение капсулы без изменения композиции.
- [x] Проверить поведение кадра, resize, паузы, reduced motion и освобождение слушателей тестами; передать основной команде ограничения визуальной проверки.
- [x] Найдено при подготовке первого экрана SSR: скрытые на телефоне cosmic pieces могли скачиваться из статической desktop-разметки. Добавлен picture/source с прозрачным GIF до 900 px; реальные изображения и классы остаются на img.

## Доказательства до исправления

- `ThanksCosmicScene.tsx`: `m.y -= m.sp`, без привязки ко времени; RAF без ограничения частоты.
- `ConsultDeskScene.tsx`: RAF без ограничения частоты; `build()` в ResizeObserver не вызывает paint.
- Все три сцены: `matchMedia(...).matches` прочитан однократно внутри effect.
- `PlexusBackdrop.tsx`: `handleMove` не проверяет inViewRef/document.hidden до чтения геометрии.
- `useAmbientVisibility.ts`: нет подписки visibilitychange.

## Что изменено

- Общий `createSceneFrameClock` сохраняет остаток дробного интервала, поэтому 24 fps на мониторе 60 Hz не превращаются в 20 fps. После паузы clock сбрасывается, без прыжка частиц.
- Три canvas пыли ограничены DPR 1.25 на компактных устройствах, desktop остаётся до DPR 2. В сравнении с прежним DPR 2 bitmap содержит 39% прежнего числа пикселей; это расчёт размера, а не замер ускорения сайта.
- Resize берёт размеры из ResizeObserver, не читает в его callback геометрию страницы; статичный кадр перерисовывается сразу. Cosmic теперь также замечает изменение размера самой сцены при изменении контента, а не только window.resize.
- Ноутбук сохраняет тень, появление и окружение, но больше не пульсирует brightness/blur. Капсула сохраняет парение и тёплое свечение; свечение статичное. Это две осознанные упрощённые детали в рамках разрешения пользователя.
- Сетка Plexus продолжает двигаться, но игнорирует глобальный mousemove вне экрана, в скрытой вкладке и во время прокрутки.

## Проверки и границы результата

- `node --test scripts/scene-performance.test.js` — 17/17 PASS: реальный mount компонентов в React, счетчик canvas paints, 60/120/144 Hz clock, preserved resize pattern, live reduced motion, hidden tab и очистка наблюдателей/таймеров.
- `node --test scripts/audit-regressions.test.js` — 15/15 PASS.
- `npm run typecheck:app` — PASS.
- `git diff --check` — PASS (только обычные предупреждения LF/CRLF).
- Это проверки логики и DOM, не визуальная приёмка в настоящем браузере. Проверить в основном прогоне главную, `/consult` и `/thank-you` на 320/390/453 и desktop, включая reduced motion и поворот экрана. Числа общего ускорения/LCP/FPS без браузерного замера не заявляются.

## Независимое ревью первого экрана SSR

- [x] Проверены `first-screen-entry.tsx`, `generate-pages.js`, `Hero`, `Home`, `firstScreen.ts`, связанные CSS и bootstrap.
- [x] Передан основному агенту P2: `locationKey === 'default'` не учитывает reload главной после SPA-перехода. React Router сохраняет history.state.key; SSR уже показывает текст, а CSR повторно скрывает его entrance-анимацией. Основной агент исправил фиксацией исходного history key; войдёт в следующую сборку.
- [x] Chromium: статичный первый экран без JavaScript и после mount сравнен на 320/390/1440. Текущий заголовок, сетка и композиция совпадают. Произвольные будущие CMS-заголовки всё равно нуждаются в проверке: `useManagedTitleFit` выполняется только в браузере.
- Генератор использует настоящие компоненты Hero/Navbar и готовую inline CMS seed. `settled` CSS раскрывает символы/слова/typewriter, поэтому намеренного скрытого H1 в новом SSR не найдено.
- Собственный `picture/source` для wide-only cosmic pieces сохраняет классы на img и позволяет браузеру выбрать прозрачный GIF ещё до React на ширинах до 900 px.

## Реальный браузер и дополнительная подгонка заголовков

- Chromium, свой сеанс `motion-review`, production preview4173: визуально просмотрены Home/Consult/Thanks на 320/390/453/1440. Изображения, композиция и читаемость сохранены. Артефакты: `output/playwright/performance-2026-09-27/motion-review/`.
- После уточнения пользователя добавлена отдельная приемка iPhone-размеров 375/390/414/430/440 portrait, 812×375 / 896×414 landscape, DPR3 и reduced motion. Она пока выполняется; это эмуляция, не физический iPhone.
- [x] Найден повторный дорогой расчёт `useManagedTitleFit`: на MetaApps390 DPR3 с CPU×4 за 6 секунд после DOMContentLoaded один H1 повторил три одинаковых поиска размера до 16.6px — 27 записей font-size, 15 чтений Range. Реальный браузерный отчёт: `titlefit-before.txt`.
- [x] В `contentTypography.ts` добавлен cache входов подгонки (геометрия, вычисленная типографика, ревизии текста и шрифтов). Повторные таймеры больше не сбрасывают готовый кегль при прежних входах. Размеры в ResizeObserver берутся из события; неподходящие к заголовку font loadingdone игнорируются. Изменение CMS текста/стилей, ширины или используемого шрифта сбрасывает cache.
- [x] `node --test scripts/title-fit-performance.test.js` — 4/4 PASS: повторные guards без font-size writes, RO без layout reads, восстановление исходного размера при расширении, реальные и посторонние шрифты, редактирование текста.
- [x] Повторён тот же инструментированный профиль на immutable preview v2 (4176). Font-size writes 27 → 9, итоговый размер 16.6px сохранён; повторные одинаковые binary searches устранены. LayoutCount 41 → 24, LayoutDuration 3.734 → 2.089s, TaskDuration 9.241 → 6.544s. Это один синтетический прогон Chromium390/DPR3/CPU×4, с параллельной нагрузкой машины; общие времена не приписываются только этой правке и не являются production Core Web Vitals. Данные: `titlefit-before.txt`, `titlefit-after.txt`.

## iPhone viewport и WebKit

- [x] Chromium: Home/Consult/Thanks на 375/390/414/430/440 portrait, 812×375 / 896×414 landscape, DPR3 и reduced motion390. На всех 24 сочетаниях нет pageerror, горизонтального overflow или сломанных изображений сцены. На главной скрытые desktop-only moon4/5 и shard2/4/6/7 не запрашиваются. `iphone-qa-report.txt` и `iphone-*.png`.
- [x] Найден дополнительный дефект в WebKit26.5: центральный кит не рисуется, хотя img.complete=true, naturalWidth=1195, размеры и opacity корректны. Воспроизводится после 5 секунд, reduced motion и без JavaScript — это не сбой React handoff. Изображение декодируется в canvas нормально.
- [x] Изолирована причина: последовательные drop-shadow blur42px/70px на img при **первом** layout. Удаление filter после загрузки не восстанавливает уже потерянный слой; первоначальный тест runtime CSS поэтому дал ложный отрицательный результат. CSS interception до первого layout воспроизводимо возвращает кита с filter:none, одиночной тенью или небольшой двойной тенью; перенос больших теней на обёртку не помогает.
- [x] `cosmic-hero.css`: двойная тень уменьшена до16px/20px с прежними цветами. Изображение, его положение/размеры и парение сохранены. WebKit показывает кита на всех указанных мобильных размерах, в normal/reduced motion, no-JS SSR, после portrait→landscape resize и изменения reduced motion на лету. Desktop1440 DPR3 также просмотрен, композиция сохранена.
- Проверка кандидата выполнена подменой только итогового CSS на snapshot4176 **до paint**: `webkit-whale-verify.mjs`, `webkit-whale-verify.json`, `webkit-fixed-*.png`. Источник затем приведён к тому же проверенному CSS. Итоговую production-сборку выполняет основной агент. Это Playwright WebKit на Windows, не физический iPhone/Safari; ограничение явно сохраняется.

## Поздний performance gate: контролируемые эксперименты без правок сайта

Основной агент обнаружил ухудшение FCP/LCP главной в финальном matched-server замере. Выполнены два отдельных A/B на **Vite4173**, Chrome, CSS viewport390/1440×900, DPR1, CPU×4, 1.6Mbps/100ms, cache disabled. По три прогона каждой ветки на каждом viewport, порядок current/candidate чередуется. Обе ветки одинаково перехватывают HTML через route.fetch/fulfill; остальные запросы идут на тот же Vite. Это сравнение внутри эксперимента; абсолютные времена не следует напрямую подменять ими matched-server метрики без перехвата документа. Другие агенты не запускали браузеры/resize изображений во время измерений.

1. Только `fetchpriority="low"` у moon/shard в SSR; eager сохранён, whale/sky не затронуты.

| CSS width | Медиана FCP current → low | Медиана LCP current → low |
| --- | --- | --- |
| 390 | 2376 → 2244ms | 3460 → 3364ms |
| 1440 | 2232 → 2128ms | 3500 → 3412ms |

Фактические CDP priorities подтверждают, что moons с Medium и последующим High переходят в Low, shards остаются Low без повышения. Эффект небольшой относительно разброса: mobile low LCP3352/3364/4324ms. Sky responseEnd в медиане3428→3330ms mobile и3345→3336ms desktop. Это разумное распределение приоритетов, но не основное исправление задержки.

2. Только `data-hero-ambient="off"` в SSR у `#hero` до первого layout. React затем заменяет разметку обычным живым Hero.

| CSS width | Медиана FCP current → pause | Медиана LCP current → pause | Сумма longtasks, медиана |
| --- | --- | --- | --- |
| 390 | 2816 → 2532ms | 3664 → 3644ms | 1596 → 1516ms |
| 1440 | 2808 → 2692ms | 4260 → 3736ms | 2125 → 1618ms |

Начальная пауза выглядит полезнее на desktop; mobile LCP почти не изменяется и остаётся связан с загрузкой sky. Эти результаты не складываются с эффектом low: это отдельные A/B, комбинация здесь не измерялась.

Дополнительное свидетельство: в плохом mobile low прогоне sky был загружен на3467ms, но нарисован как LCP только на4324ms. В промежутке main thread занят longtask3468–4132ms (664ms), то есть часть задержки — ожидание отрисовки после доставки изображения. Critical CSS в этих опытах заканчивает загрузку примерно1.1–1.25s. Шесть видимых mobile декораций дают211960B transfer, поэтому мобильные варианты меньшего разрешения имеют конкретный резерв сокращения сети; их подготовку и дальнейшее решение берёт основной агент.

Артефакты: `motion-review/home-priority-experiment.{mjs,json,log}`, `home-pause-experiment.{mjs,json,log}`, `home-experiments-summary.json`. В JSON сохранены полные resource timings, LCP element/load/render, longtasks и CDP priorities. Production-исходники во время экспериментов не менялись. Оба браузерных прогона закончены, измерительные контексты закрыты.

## Приёмка финальной сборки с compact images

- Actual source build4178: Chromium и WebKit, DPR3,375×812/430×932/896×414/1440×900, reduced и no-JS375, поворот430→932 и live reduced. Кит виден, заголовок виден, горизонтального overflow и pageerror нет. Reduced отключает анимации сцены; SSR сохраняет ambient=off, после обычного React mount движение возобновляется. Все6 видимых мобильных currentSrc выбирают `*-compact.webp`, whale сохраняет priority=high.
- Найден дополнительный сетевой дефект **WebKit с JavaScript**: после шести compact-файлов браузер скачивал ещё и все шесть desktop-оригиналов (210160B body). Это подтверждено requestfinished, responseBodySize и resource timings, а не только request events. В no-JS и Chromium дубликатов нет. Причина: `img.src` может начать загрузку во время создания detached img в React, до присоединения к picture/source.
- По поручению основного агента внесён узкий фикс: `Layer` получает уже существующий `compactScene`; src шести видимых картинок на первом client render сразу использует compact. SSR оставляет picture и desktop fallback; resize>900 переключает src обратно вместе существующим состоянием сцены.
- `first-screen-render.test.js` дополнен viewport regression375/430/896/932/1440, проверяет fallback src до присоединения picture и сохранение SSR. First-screen+scene tests22/22 PASS, typecheck:app PASS.
- Артефакты actual-source gate: `final-actual-gate.{mjs,json,log}`, `final-actual-*.png`; доказательство лишних body bytes: `webkit-compact-requests.json`.
- [x] Actual-source4179 после исправления: WebKit и Chromium375/DPR3 с JavaScript и без него запрашивают только6 compact-файлов (74828B body), **ни одного** desktop-оригинала. При resize375→932 загружаются12 оригиналов широкой сцены; обратно375 снова6 compact, новых original requests нет. Desktop1440 и reduced после возврата проверены; нет pageerror, overflow или сломанных изображений, кит виден/high priority. Скриншоты просмотрены.
- Финальные артефакты: `final3-network-gate.{mjs,json,log}`, `final3-*.png`. Измерительные браузеры и старый CLI `motion-review` закрыты; основной агент получил разрешение по координации начать отдельные cold-load замеры.
