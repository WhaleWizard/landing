# Deep visual, motion and production audit

Этот регламент относится к текущей шлифовке Whale Wizard и используется для каждого прохода по сайту.

## Обязательный охват

- Каждая страница из `src/app/routes.tsx`, включая публичные страницы, статьи/кейсы, юридические документы, калькуляторы, 404 и `/admin`.
- Каждый связанный React/TypeScript/CSS-файл: страница, shared-компонент, hook, scene, токены, breakpoints, lazy boundary, generated/static SEO output и Vite/build-конфигурация.
- Построчная проверка, а не только визуальный smoke-test: для каждой строки, которая влияет на layout, paint, transform, transition, animation, scroll, focus, loading, responsive reflow или asset delivery, фиксировать связь «источник → потребитель → состояние». Без доказательства строку не менять.

## Цикл для каждого файла

1. Прочитать файл целиком и выписать все layout/motion/loading/interaction точки с номерами строк.
2. Найти связанные стили, импортирующие компоненты, роуты, lazy chunks и источники данных.
3. Проверить desktop и mobile минимум на 320, 390, 768, 1024 и 1440 px; отдельно portrait/landscape и узкие высоты.
4. Проверить первый рендер, lazy-loading, skeleton/error/empty states, возврат назад, hash-якоря, scroll restoration, модальные окна, fixed/sticky панели и смену ориентации.
5. Измерить overflow, bounding boxes, scrollWidth/clientWidth, z-index/stacking, CLS-подобные скачки, активные animation/rAF/observer loops и размер/порядок загружаемых чанков.
6. Если найден дефект — исправить минимально в исходном связанном файле, сохранив дизайн, контент, эффект и доступность. Ничего не удалять ради прохождения проверки.
7. Повторить проверку на соседних брейкпоинтах и на production-like сборке; только затем переходить к следующему файлу.

## Матрица доказательств

- Скриншот каждого важного route/state после стабилизации и после исправления.
- DOM/метрики для overflow и геометрии.
- Проверка движения: scroll forward/back, route transition, reduced-motion, tab/focus/Escape, offscreen/hidden tab.
- Проверка production: `npm run typecheck:app`, `npm run typecheck:functions`, `npm run check`, manifest/chunk/static HTML/cache parity.
- Каждое найденное место фиксируется как файл + строка + симптом + причина + минимальный патч + повторная проверка.

## Критерии готовности

- Нет непреднамеренного горизонтального overflow или обрезанных интерактивных элементов на матрице размеров.
- Назад/вперёд, hash и lazy route не дают скачков, двойного scroll или потери позиции.
- Motion остаётся плавным, не запускает лишние бесконечные циклы вне viewport и уважает `prefers-reduced-motion`.
- Градиенты, линии, glow и декоративные слои не выходят за intended bounds и не перекрывают контент/кнопки.
- Desktop fix не ломает mobile, mobile fix не ломает tablet/desktop; production output совпадает с локальным поведением.
- Полный `npm run check` зелёный; оставшиеся ограничения явно названы, а не скрыты.

## Порядок работы

1. Карта файлов и зависимостей.
2. Параллельные ревизии public layout, motion/performance и responsive/production.
3. Интерактивная IAB-проверка и свежие screenshots.
4. Интеграция патчей и повторный проход по затронутым связям.
5. Полный check/build и evidence-based отчёт.

## Фактический проход 2026-08-30

- Маршруты сверены с `src/app/routes.tsx`: `/`, сервисные лендинги, блог/статьи,
  кейсы/статьи, оба калькулятора, `/thank-you`, FAQ, словарь, юридические страницы,
  404, `/admin` и предпросмотр.
- Свежая IAB-матрица снята на мобильном 390 px и desktop; отдельно проверены
  320 px, короткая высота, landscape, открытое мобильное меню, диалоги и Back.
- Найденные подтверждённые дефекты исправлены в исходных связанных файлах:
  горизонтальное переполнение админского login/оверлеев, clamped scroll при lazy
  route, конфликт CSS/JS transform в canvas-сценах, лишние rAF/loop во время scroll,
  скрытые мобильные слайды в tab-order, обрезанные footer/filter/action-блоки,
  поздние form/hash таймеры и возврат из статьи без сохранения history-позиции.
- Повторная проверка: `npm run typecheck:app`, полный `npm run check`, production
  build (2372 модуля, 27 статических маршрутов), `git diff --check`; все зелёные.

## Повторный локальный scroll-проход 2026-08-30

- Локальный Vite-сервер оставлен запущенным на `http://127.0.0.1:5173/`; каждый
  маршрут из матрицы (публичные страницы, калькуляторы, legal, `/admin`,
  content-preview и 404) проверен на desktop 1280, mobile 390 и узком 320 px.
- Для каждого маршрута выполнена последовательность «низ → верх → вправо →
  влево». На всех страницах `scrollX` оставался `0`, а `document/body`
  `scrollWidth` не превышал ширину viewport; вертикальный scroll возвращался в
  `y=0`, длинные страницы доходили до вычисленного `maxY` с учётом поздней
  загрузки контента.
- Отдельно проверены намеренные горизонтальные контейнеры: карусели главной и
  Google Ads, mobile testimonials-scroller и FAQ-фильтр. Каждый контейнер
  дошёл до своего `scrollLeft=max` и вернулся в `scrollLeft=0`; это не page-level
  overflow.
- После браузерного прохода повторён `npm run check`: typecheck, smoke-тесты,
  production build (2372 модуля), 27 статических маршрутов и SEO-контракт 11/11
  прошли без ошибок. Вкладка оставлена на главной странице сверху.

## Live production pass 2026-08-30

- Production обновлён из `main` через существующий Cloudflare Pages GitHub-пайплайн;
  live HTML и JS-бандл содержат актуальные маркеры шлифовки (`reducedMotion`,
  `ww_scroll_positions_v2`, `useDialogFocus`).
- В живом браузере повторно открыты все 18 маршрутов матрицы на desktop 1280 px и
  mobile 390 px, включая `/admin`, `/admin/content-preview` и 404. Для страниц
  проверены scroll вниз/вверх и попытки вправо/влево: page-level `scrollX=0`,
  `document/body.scrollWidth` не выходят за ширину viewport, возврат вверх даёт
  `scrollY=0`; заголовки и canonical redirect корректны.
- На production отдельно прогнаны Home и Meta Apps: вертикальный scroll до 900 px
  и обратно, горизонтальный жест страницы, overflow fixed/canvas-слоёв и мобильные
  snap-карусели. Декоративные слои остаются внутри `overflow:hidden/clip`, карусели
  являются намеренными внутренними scroller-ами, page-level overflow не найден.
- После прохода `tab.dev.logs({levels:["error","warn"]})` вернул пустой список;
  битых загруженных изображений нет. Вкладка production возвращена на Home сверху.

## Cold-load production pass 2026-08-30

- Свежая production-вкладка была снята по таймкодам 100/300/600/1000 мс и
  после стабилизации; принятые кадры сохранены в `audit-reports/` как
  `live-load-*.png` и просмотрены вручную. На первом проходе был виден
  тройной hand-off: сгенерированный SEO-shell, затем общий `RouteSkeleton`,
  затем настоящий Home с cosmic hero. Это и было причиной рывка, а не сам
  scroll-loop.
- Корень проблемы в связке `src/main.tsx` + `src/app/utils/routePreload.ts`:
  bootstrap ждал сетевую revalidation CMS до hand-off, а Home загружал
  `CosmicHeroScene` через вложенный `React.lazy`, не включая его в preload.
  На production это оставляло generic skeleton между shell и первым экраном.
- Исправление: CMS revalidation перенесена после hand-off (статический seed
  остаётся первым валидным содержимым), Home и `CosmicHeroScene` готовятся
  параллельно, а generator добавляет JS/CSS cosmic-сцены в критические
  `modulepreload` для `/`. Дизайн, motion-эффекты и контент не удалялись.
- `npm run check` после патча прошёл полностью; `test:seo-output` подтвердил
  наличие критического preload. Локальный `vite dev` отдельно не считается
  production-доказательством: его `index.html` не содержит сгенерированный
  SEO-shell, поэтому cold-load проверяется после выкладки собранного output.
- В раннем live-кадре дополнительно обнаружен focus-ring на `h1`: общий
  `RouteFocusManager` фокусировал заголовок даже на первом POP-заходе. Для
  первичной загрузки это не добавляет доступности, но визуально рисует рамку
  поверх hero; условие в `src/app/routes.tsx` теперь пропускает только этот
  стартовый фокус и сохраняет его для SPA-навигаций/истории.
- Повторный production-like sweep выявил ещё один общий источник короткого
  skeleton-кадра на Blog/Thank You/Offer: bootstrap ждал один `import()`-
  promise, а `React.lazy` создавал второй. Все route/hero loaders в
  `src/app/utils/routePreload.ts` переведены на общий memoized promise с
  безопасным сбросом при сетевой ошибке; это убирает waterfall для всех
  страниц, не меняя их разметку.
