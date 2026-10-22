---
name: hero-animation-debugger
description: Hero configuration tracing, text segmentation, CSS/JS animation lifecycles, multiline wrapping, and GPU performance analysis.
---

# Hero Animation Debugger (`hero-animation-debugger`)

Use this skill to investigate the complete pipeline of Hero headings, text segmentation, animation transitions, and responsive wrapping behavior across viewports.

## Pipeline Architecture

```
ADMIN EDITOR -> EFFECT SELECTION -> VALIDATION -> STORAGE -> FETCH -> CACHE -> TRANSFORM -> REACT STATE -> HERO COMPONENT -> DOM -> CSS/JS -> BROWSER
```

## Procedures

1. **Heading Text Segmentation & Tokenization**
   - Inspect `src/app/components/HeroTitleEffect.tsx` and `src/app/utils/contentTypography.ts`.
   - Verify word and character splitting logic:
     - Handles Unicode glyphs, spaces, non-breaking spaces, and punctuation correctly.
     - Multiline wrapping behaves predictably on narrow screens (320px - 390px) without word clipping.
   - Verify sequence delay calculation (`resolveHeroTitleLines`):
     $$T_i = T_{i-1} + \text{duration of line } (i-1) + \text{gap}$$

2. **Animation Effects & Styling Verification**
   - Audit all 8 supported animation styles:
     `none`, `fade-up`, `fade-in`, `slide-left`, `slide-right`, `blur-reveal`, `typewriter`, `words`.
   - Verify `src/styles/hero-title-effects.css`:
     - Accent gradient text (`bg-gradient-to-r ... bg-clip-text text-transparent`) preserves text visibility during animation via `background-image: inherit` and `-webkit-background-clip: text`.
     - Zero invisible text bugs (`color: transparent` with opacity 0).
     - Keyframe duration and timing functions ensure forward settlement (`forwards`).

3. **Hydration & SSR Handshake**
   - Verify pre-hydrate state (`data-ww-prehydrate="true"`) keeps CSS loops paused until initial React hydration release.
   - Run hydration regression tests:
     `node --test scripts/first-screen-hydration.test.js scripts/first-screen-render.test.js`
   - Check `meta-apps-loops.test.js` to ensure GPU animation loops do not cause continuous repaints.

4. **Lifecycle & Fallback Protection**
   - If animations are delayed, disabled, or encounter an error, Hero text MUST remain legible and visible.
   - Ensure `prefers-reduced-motion: reduce` renders static text without delay.
