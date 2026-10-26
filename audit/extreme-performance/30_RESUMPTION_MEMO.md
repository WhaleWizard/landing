# WHALEWZRD — ПАМЯТКА ВОЗОБНОВЛЕНИЯ РАБОТЫ (MOBILE 95+)
**Дата фиксации:** 2026-10-23 16:53 (Local)  
**Ветка:** `main`  
**Статус готовности:** Кодовая база стабильна, все 45+ тестов компилируются и проходят (`typecheck:app`, `typecheck:functions`, `test:seo-output`, `test:audit-regressions` — 100% PASS).

---

## 1. Что было сделано в этой сессии
1. **Сжатие и внедрение мобильного варианта Paper Stack для Meta Ads**:
   - Создан `public/images/meta-proof/paper-stack-480.webp` (8,854 байта вместо 18,818 байт, -53%).
   - Внедрен `srcSet` в `MetaAdsEditorialHero.tsx` и приоритетный preload в `scripts/generate-pages.js`.
2. **Ликвидация render-blocking CSS чанка HeroTitleEffect**:
   - `HeroTitleEffect` больше не порождает отдельный сетевой CSS-запрос `HeroTitleEffect-*.css` (wastedMs: 304ms).
   - Стили перенесены в основной бандл `src/styles/index.css` через `@import './hero-title-effects.css'`.
3. **Очистка TS ошибок**:
   - Удален неиспользуемый импорт `flushSync` в `src/main.tsx`. `npm run typecheck:app` и `npm run typecheck:functions` возвращают код 0.
4. **Глубокая диагностика симулятора Lantern (Chromium/Lighthouse)**:
   - В реальном браузере Chromium (без троттлинга) `observedFCP` = 530ms, `observedLCP` = 530ms, `TBT` = 0ms, `CLS` = 0.000.
   - Разница с симуляцией мобильного Lantern (1.638 Mbps, 150ms RTT, 4x CPU) вызвана:
     1. Задержками из-за отсутствия предзагрузки шрифтов (`prata-400-normal-latin.woff2` и `inter-*.woff2`), которые грузились дочерними запросами после скачивания CSS.
     2. CSS `background-image` на главной странице (`.cosmic-sky`), который привязывается к гидратации React.

---

## 2. Что осталось сделать для достижения Mobile 95+ (План действий при возобновлении)

### ШАГ 1: Добавить предзагрузку шрифтов для `/meta-ads` и `inter` в `scripts/generate-pages.js`
1. В `ROUTE_FONT_PRELOADS` добавить:
   ```javascript
   '/meta-ads': [
     '/fonts/hero/prata-400-normal-latin.woff2',
   ],
   ```
2. В `resolveHeroFontPreloads` добавить обработку `inter`:
   - Если в `requestedFonts` есть `'inter'`, из `readViteManifest()` подтягивать URL `inter-cyrillic-wght-normal-*.woff2` и `inter-latin-wght-normal-*.woff2`.
3. Собрать (`npm run build`) и замерить `/meta-ads/`:
   ```bash
   npx lhci collect --no-lighthouserc --staticDistDir=dist --url="http://localhost/meta-ads/" --numberOfRuns=1
   ```

### ШАГ 2: Перевод `.cosmic-sky` из CSS `background-image` в HTML `<img>`
1. В `src/app/components/Hero.tsx` (`CosmicHeroFallback`) и `src/app/components/CosmicHeroScene.tsx`:
   Заменить `<div className="cosmic-sky" />` на:
   ```tsx
   <picture className="cosmic-sky">
     <source media="(max-width: 900px)" srcSet="/images/cosmic/sky-compact.webp" />
     <img
       src="/images/cosmic/sky.webp"
       alt=""
       aria-hidden="true"
       width={1920}
       height={1080}
       loading="eager"
       decoding="async"
       fetchpriority="high"
       className="w-full h-full object-cover"
     />
   </picture>
   ```
2. В `src/styles/cosmic-hero.css`:
   Убрать `background-image`, задать `.cosmic-sky img { width: 100%; height: 100%; object-fit: cover; }`.
3. Замерить главную `/`:
   ```bash
   npx lhci collect --no-lighthouserc --staticDistDir=dist --url="http://localhost/" --numberOfRuns=1
   ```

### ШАГ 3: Фиксация LCP на юридических страницах (`cookie-policy`, `privacy-policy`, `offer`)
1. Устранить перерисовку текстового LCP-кандидата при смене статического шелла на `createRoot`.
2. Замерить:
   ```bash
   npx lhci collect --no-lighthouserc --staticDistDir=dist --url="http://localhost/cookie-policy/" --numberOfRuns=1
   ```

### ШАГ 4: Полный контрольный прогон
1. `node scripts/audit/run-verification-lighthouse.mjs` — прогон по всем 14 маршрутам.
2. `npm run check` — обязательная проверка всей цепочки из 45+ тестов.

---

## 3. Команда для быстрого старта
Когда пользователь скажет «продолжай», сразу переходить к **ШАГУ 1** (шрифты `ROUTE_FONT_PRELOADS` и `inter`), запустить сборку и замер.
