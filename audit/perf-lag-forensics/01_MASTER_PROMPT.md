# 01_MASTER_PROMPT.md — Master Audit Prompt: Performance, Lags & Loading Forensics

**Цель**: Тотальная проверка производительности, плавности (FPS/jank), загрузки ресурсов, гидратации и отзывчивости интерфейса на всех страницах whalewzrd.com. Локализация причин, по которым «сайт будто подлагивает и прогружает плохо». Выяснение, является ли это проблемой сети/edge/провайдера, перегрузки графического процессора (GPU blur/compositing), блокировок главного потока (Long Tasks / TBT), сбоев гидратации, фоновых таймеров/циклов или тяжёлых сторонних скриптов.

---

## 1. Контрольная матрица маршрутов (Route Matrix)
1. `/` — Главная (Home + Cosmic Hero + 8 отложенных секций + формы + калькулятор).
2. `/meta-ads` — Услуга Meta Ads (MetaAdsEditorialHero + карточки + кейсы + формы).
3. `/meta-apps` — Услуга Meta Apps (MetaAppsHeroVisual + анимация чеков + интерактив).
4. `/google-ads` — Услуга Google Ads (Hero с RightPanel + графики + метрики).
5. `/consult` — Консультация (ConsultStudioHero / 3D Scene + сценарии).
6. `/about` — Страница «Обо мне» (фото, таймлайн, стек, референсы).
7. `/cases` — Витрина кейсов (сетка проектов, фильтрация по нишам).
8. `/cases/prodvizhenie-premialnogo-konserzh-servisa-klienty-i-trafik-dlya-konserzh-servisa-cherez-targetirovannuyu-reklamu` — Статья-кейс (CMS контент, санитизация, WebP-картинки, блоки).
9. `/blog` — Витрина блога (фильтры по 8 темам, карточки статей).
10. `/blog/kak-meta-ads-i-google-ads-sozdayut-effektivnuyu-voronku-prodazh` — Страница статьи (блочный рендер, оглавление, разметка).
11. `/faq` — FAQ (аккордеоны, поиск, динамические вопросы).
12. `/marketing-glossary` — Маркетинговый глоссарий (алфавитный указатель, десятки терминов).
13. `/calculator` — Калькулятор юнит-экономики (ползунки, динамические формулы).
14. `/roi-calculator` — Калькулятор окупаемости рекламы (интерактивные поля).
15. `/privacy-policy` — Политика конфиденциальности (статика).
16. `/offer` — Оферта (статика).
17. `/cookie-policy` — Политика cookie (статика).
18. `/thank-you` — Страница благодарности (анимация конфетти, Cosmic Scene).
19. `/admin` — Защищённая админка (экран авторизации, гейт).

---

## 2. Диагностические векторы (Forensic Vectors)

### Вектор 1: Сетевая загрузка и Edge-поведение («прогружает плохо»)
- **TTFB и CDN Edge Cache**: `x-ww-static-cache: hit` vs `miss`, время первого байта с Cloudflare Pages Functions.
- **Протоколы**: HTTP/3 (QUIC) vs HTTP/2. Влияние блокировок/замедления протокола QUIC и IP-диапазонов Cloudflare в РФ провайдерами (ERR_QUIC_PROTOCOL_ERROR, TCP fallback, packet retransmissions).
- **Размер и цепочки ресурсов**: HTML -> CSS -> JS chunks -> шрифты -> WebP-изображения -> API-запросы (`/api/site-content`, `/api/articles`).
- **Сбои и задержки запросов**: статус 4xx/5xx, таймауты, конкуренция за полосу (bandwidth saturation) при одновременной загрузке 14 фрагментов сцены CosmicHero.

### Вектор 2: Runtime JavaScript, блокировки и гидратация («подлагивает на старте»)
- **Чистота гидратации React 18**: проверка отсутствия предупреждений `[app] hydration fell back to client render`, Minified React error #425, #418 на всех страницах.
- **Длина Long Tasks (>50ms) и TBT (Total Blocking Time)** при начальном парсинге и исполнении скриптов.
- **Очередь bootstrap**: задержка `prepareRoute()` и `ROUTE_PREPARE_TIMEOUT_MS` (2000ms race) в `main.tsx`.
- **SPA-клиентские переходы**: проверка плавности перехода между страницами без подвисаний и скачков интерфейса.

### Вектор 3: Скролл, FPS и анимационная нагрузка («подлагивает при скролле»)
- **Частота кадров (FPS) и дропы при скролле**: замер просадок ниже 60 fps (Long Animation Frames / LoAF) при непрерывной прокрутке от верха до низа.
- **GPU Rasterization & Compositing Stress**:
  - Нагрузка от множественных наложенных `backdrop-filter: blur(...)` (до `blur-[150px]` и `blur-2xl`) в карточках `RightPanel`, орбах `BackgroundOrbs`, модалках и плашках.
  - Отрисовка холста `<canvas className="cosmic-dust">` в `CosmicHeroScene`.
- **DOM / Layout Thrashing**:
  - Обработчики скролла в `ScrollExperience.tsx` (`root.dataset.wwScrolling = 'true'`, мутации DOM, чтение `scrollHeight`).
  - Слушатели `pointerdown` и `click` в `StableScrollPositionRestoration` (синхронные `JSON.parse` и `sessionStorage.setItem`).
  - `RouteIntentPreloader` (динамический импорт и fetch по любому `pointerover`/`focusin`).

### Вектор 4: Интерактивность и отзывчивость ввода (INP / Input Delay)
- Отзывчивость форм: переключение полей, ввод текста, выбор страны телефона, выбор бюджета.
- Отзывчивость калькуляторов: реакция ползунков и инпутов на ввод.
- Аккордеоны FAQ и поиск по глоссарию: отсутствие фризов при раскрытии.

### Вектор 5: Геометрия, верстка и переполнение (Overflow)
- Проверка горизонтального переполнения (`scrollWidth <= innerWidth`) на мобильных (320px, 360px, 390px, 430px) и десктопных (1280px, 1440px, 1920px) вьюпортах.

### Вектор 6: Сторонние скрипты и трекинг (Third-Party Stress)
- Поведение Yandex Metrika (Webvisor), Google Analytics/Tag Manager, Meta Pixel.
- Вызывает ли запись сессий Вебвизором микрофризы на устройствах посетителей.

---

## 3. Критерии приемки и доказательная база (Acceptance Protocol)
1. **Фактическое профилирование**: автоматический запуск Playwright на живом сайте `whalewzrd.com` и локальном стенде.
2. **Сбор объективных метрик**: сбор логов консоли, сетевого тайминга, FCP, LCP, CLS, TBT, Long Tasks и среднего FPS скролла по каждой из 19 страниц.
3. **Строгая классификация проблем**: отделение проблем пользовательского интернет-соединения / Cloudflare QUIC в РФ от багов клиентского рендеринга и тяжелых CSS/JS циклов.
4. **Конкретный план устранения выявленных узких мест**.
