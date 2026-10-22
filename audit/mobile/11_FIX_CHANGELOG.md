# Fix Changelog — Mobile Audit

## MOB-HERO-001: Typewriter Effect on Accent Gradient Lines
- **Files Modified**:
  - `src/styles/hero-title-effects.css`
  - `src/app/components/HeroTitleEffect.tsx`
- **Root Cause**:
  1. `.hero-title-effect__typeword` and `.hero-title-effect__character` lacked `background-image: inherit; -webkit-background-clip: text; background-clip: text; color: transparent; -webkit-text-fill-color: transparent;` when inside `.bg-clip-text` or accent lines.
  2. `HeroTitleEffect.tsx` wrapped `renderTypewriter` in an unstyled intermediate `<span>`, breaking CSS `inherit` from `.hero-title-effect`.
  3. `1ms step-end both` animation duration was susceptible to floating-point quantization in Blink (`active_time / duration < 1.0`), leaving characters stuck at step 0 (`opacity: 0; visibility: hidden`).
- **Fix**:
  1. Added `.hero-title-effect__typeword` and `.hero-title-effect__character` to gradient inheritance rules in `hero-title-effects.css`.
  2. Removed unstyled intermediate `<span>` wrapper in `HeroTitleEffect.tsx`.
  3. Changed character entrance animation to `40ms linear forwards`, ensuring smooth, deterministic transition to full opacity and visibility.

## MOB-HERO-002: Multi-Line Hero Title Sequence Stagger
- **Files Modified**:
  - `src/app/components/HeroTitleEffect.tsx`
  - `src/app/components/Hero.tsx`
  - `src/app/components/service-heroes/ConsultStudioHero.tsx`
  - `src/app/components/service-heroes/MetaAdsEditorialHero.tsx`
- **Root Cause**:
  1. Each line computed `effectiveSequenceGap` based solely on its own effect (`safeDelay + safeSequenceIndex * safeSequenceGap`). If Line 0 was `typewriter` (1800ms) and Line 1 was `fade-up`, Line 1 evaluated its gap as 90ms and started animating at 90ms while Line 0 had just typed 1 letter.
  2. `heroTitleTotalDurationMs` also evaluated `index * gap`, underestimating the duration of typewriter titles in editor preview.
- **Fix**:
  1. Created `resolveHeroTitleLines` which computes cumulative delays: $T_i = T_{i-1} + \text{gap of line } (i-1)$.
  2. Updated `heroTitleTotalDurationMs` to accumulate sequence gaps sequentially.
  3. Replaced line resolution in `Hero.tsx`, `ConsultStudioHero.tsx`, and `MetaAdsEditorialHero.tsx` to pass the exact cumulative `delayMs`.
