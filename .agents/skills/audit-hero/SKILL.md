---
name: audit-hero
description: Audit Hero section rendering, SSR hydration sync, Framer Motion/GPU animation loops, layout shift, and mobile title visual stability.
---

# Audit Hero Animations & Rendering Stability (`audit-hero`)

Use this skill when auditing the hero section, first screen entrance, animated headings (`HeroTitleEffect`), decorative backdrop loops, and SSR-to-client hydration transitions.

## Key Architecture Invariants

1. **Hydration Handshake Protocol**
   - Generator sets markers on `<html>`:
     - `data-ww-first-screen`: identifies pre-rendered route (`/`, `/meta-ads`, `/meta-apps`, `/google-ads`, `/consult`).
     - `data-ww-prehydrate`: pauses CSS animation loops until React completes the initial commit.
     - `HydrationRelease` (`src/main.tsx`): removes `data-ww-prehydrate` and clears `#ww-static-shell`.
   - **Zero DOM Mismatch**: Initial client render MUST produce exact identical DOM nodes as SSR static HTML. No `window.innerWidth`, `matchMedia`, or `Math.random()` during initial render.

2. **Framer Motion & GPU Acceleration**
   - All animations must use `LazyMotion` and lightweight `m.*` components instead of heavy `motion.*`.
   - Only GPU-accelerated CSS properties (`transform`, `opacity`) are allowed for continuous loops.
   - Guard against layout recalculation loops (`will-change: transform`, `transform: translateZ(0)`).

3. **Mobile Title & Gradient Protection**
   - Check multiline title wrapping across narrow screens (320px - 390px).
   - Ensure `background-clip: text` and `-webkit-background-clip: text` do not clip descending letters or create dark horizontal borders upon SPA route transitions.

## Test Procedures & Commands

- **Hydration & Preload Regression Tests:**
  `node --test scripts/first-screen-hydration.test.js scripts/first-screen-render.test.js scripts/first-screen-preload.test.js`
- **Animation Loop & GPU Verification:**
  `node --test scripts/meta-apps-loops.test.js scripts/plexus-static.test.js scripts/title-fit-performance.test.js`
- **Playwright Visual Verification:**
  Capture screenshot of `/` and `/meta-apps` on `360x800` viewport before and after scroll.

## Verification Checklist
- [ ] No `console.warn('[app] hydration fell back to client render')` in browser console.
- [ ] First screen renders instantly without flash of unstyled content (FOUC).
- [ ] No layout shift when `HydrationRelease` fires.
- [ ] Reduced motion preference (`prefers-reduced-motion: reduce`) properly disables decorative loops.
