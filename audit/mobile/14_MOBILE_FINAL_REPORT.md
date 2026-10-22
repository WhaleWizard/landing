# WHALEWZRD — Mobile Performance & Animation Engineering Audit
## Final Report — Version 1.0

### Executive Summary
A comprehensive, empirical mobile-only audit of WHALEWZRD (`https://whalewzrd.com`) was executed across 14 public routes, 15 mobile/boundary viewports (320px–480px, 639px–1024px), and two browser rendering engines: Chromium (Android / Pixel 7) and WebKit (iOS / iPhone 13).

---

### Root Cause Discoveries & Resolutions

#### 1. MOB-HERO-001 (P1): Invisible Text with `typewriter` Effect on Accent Gradient Lines
- **Problem**: When a heading line had `tone: 'accent'` (styled with `bg-gradient-to-r ... bg-clip-text text-transparent`) and was configured with the `typewriter` animation in CMS, all typed text remained completely invisible.
- **Root Cause**:
  1. Under CSS inheritance rules, `background-clip: text` and `background-image` do not inherit by default.
  2. While `.hero-title-effect__word` had been patched in PROD-002, `.hero-title-effect__typeword` and `.hero-title-effect__character` were omitted from gradient inheritance selectors.
  3. `HeroTitleEffect.tsx` wrapped `renderTypewriter` in an unstyled intermediate `<span>`, causing any `inherit` rule on descendant elements to inherit `none` from the span instead of the gradient on `.hero-title-effect`.
  4. The animation used `1ms step-end both`. In Blink, floating-point quantization of cumulative delays resulted in `active_time / duration < 1.0`, keeping the step-end function stuck at 0 (`opacity: 0; visibility: hidden`).
- **Fix**:
  1. Added `.hero-title-effect__typeword` and `.hero-title-effect__character` to the gradient inheritance rules in `src/styles/hero-title-effects.css`.
  2. Removed the unnecessary intermediate `<span>` wrapper in `src/app/components/HeroTitleEffect.tsx`.
  3. Updated entrance keyframes and duration to `40ms linear forwards`, ensuring reliable, visible glyph rendering across all devices.

#### 2. MOB-HERO-002 (P2): Stagger & Sequence Timing Desynchronization for Multi-Line Hero Titles
- **Problem**: In multi-line hero headings where line 0 was configured with `typewriter` and subsequent lines had other effects (e.g. `fade-up`), the subsequent lines animated almost immediately (at 90ms) while line 0 was still typing its first word.
- **Root Cause**:
  - `HeroTitleEffect` computed `--hero-title-delay` using `safeDelay + safeSequenceIndex * safeSequenceGap`.
  - Line 1 evaluated `safeSequenceGap` strictly from its **own** effect (`fade-up` = 90ms), ignoring the 1800ms duration of line 0.
- **Fix**:
  - Built `resolveHeroTitleLines` in `src/app/components/HeroTitleEffect.tsx` to calculate exact cumulative start delays: $T_i = T_{i-1} + \text{gap of line } (i-1)$.
  - Integrated `resolveHeroTitleLines` across `Hero.tsx`, `ConsultStudioHero.tsx`, and `MetaAdsEditorialHero.tsx`.
  - Updated `heroTitleTotalDurationMs` to accumulate sequence gaps sequentially, ensuring CMS preview settle timings match reality.

---

### Responsive & Layout Findings
- **Horizontal Overflows**: 0 detected across all 15 viewports on `/`, `/meta-apps/`, `/meta-ads/`, and `/blog/`.
- **Breakpoints**: 320px (iPhone SE 1st gen), 360px, 375px, 390px, 412px, 430px, 480px, 639px, 640px, 767px, 768px, 1023px, 1024px all render without layout shift (`CLS = 0`).
- **Touch Navigation**: Hamburger drawer locks document scroll on iOS/Android (`body.style.position = fixed`, `overflow = hidden`), restores exact prior position on close, and passes all dialog accessibility requirements.

---

### Verification & Stability
- Production build passes cleanly (`npm run build`).
- Full test suite passes without regressions (`npm run check`: 45+ test suites, 0 errors).
- Server-side rendering and hydration contracts verified (`scripts/first-screen-hydration.test.js` & `scripts/first-screen-render.test.js`).
