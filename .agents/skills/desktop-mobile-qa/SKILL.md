---
name: desktop-mobile-qa
description: Multi-viewport QA testing across desktop (768px-2560px) and mobile (320px-480px) viewports, zoom stress testing, overflow detection, and interactive modal validation.
---

# Desktop & Mobile QA (`desktop-mobile-qa`)

Use this skill for automated multi-viewport testing, responsive layout verification, zero-overflow enforcement, and cross-browser consistency checks.

## Viewport Grid Matrix

- **Desktop Form Factors:**
  `768x1024`, `1024x768`, `1280x720`, `1366x768`, `1440x900`, `1536x864`, `1920x1080`, `2560x1440`
- **Mobile Form Factors:**
  `320px`, `360px`, `375px`, `390px`, `393px`, `412px`, `414px`, `428px`, `430px`, `480px`
- **Breakpoint Boundaries:**
  `639px`, `640px`, `767px`, `768px`, `1023px`, `1024px`

## Procedures

1. **Horizontal Overflow Verification (Zero-Overflow Policy)**
   - Every route MUST satisfy:
     `document.documentElement.scrollWidth <= window.innerWidth`
   - Never apply blanket `overflow-x: hidden` to mask layout defects. Pinpoint root overflowing DOM node.

2. **Zoom Stress Testing**
   - Verify layout stability under browser zoom levels: 125%, 150%, and 200%.
   - Ensure sticky headers, mobile menu overlays, modal dialogs, and CTA buttons do not overlap or break out of viewport boundaries.

3. **Touch Targets & Accessibility (A11y)**
   - Interactive elements (buttons, inputs, links, dropdown items) must meet minimum touch target area (48x48px or 44x44px with adequate padding).
   - Run axe-core accessibility checks:
     `npm run audit:a11y`

4. **Visual & Interaction Checks**
   - Test navigation drawer opening/closing, body scroll locking, and form submission flows.
   - Capture regression screenshots for Chromium and WebKit.
