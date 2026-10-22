---
name: audit-desktop-mobile-qa
description: Multi-viewport QA testing across 8 desktop and 15 mobile viewports, zoom stress testing (125%-200%), horizontal overflow detection, tap target accessibility, and interactive modal validation.
---

# Desktop & Mobile Cross-Viewport QA (`audit-desktop-mobile-qa`)

Use this skill when auditing responsive layouts, checking horizontal scrollbar leaks, validating touch targets, and testing cross-browser rendering on Desktop and Mobile.

## Target Matrix

### Desktop Viewports (8 Configurations)
- `768x1024` (iPad portrait)
- `1024x768` (iPad landscape)
- `1280x720` (HD Laptop)
- `1366x768` (Standard Laptop)
- `1440x900` (MacBook Pro 13/14)
- `1536x864` (Scaled 1080p Windows)
- `1920x1080` (FHD Desktop)
- `2560x1440` (QHD Monitor)

### Mobile Viewports (15 Breakpoints)
- `320px` (iPhone SE 1st gen)
- `360px` (Galaxy S8/S9, Android small)
- `375px` (iPhone SE 2/3, iPhone 12 mini)
- `390px` (iPhone 12/13/14)
- `393px` (Pixel 7/8, iPhone 15)
- `412px` (Samsung Galaxy S20/S21/S24 Ultra)
- `414px` (iPhone Plus / Max older)
- `428px` (iPhone 13/14 Pro Max)
- `430px` (iPhone 15 Pro Max)
- `480px` (Large mobile landscape)
- Breakpoint boundaries: `639px`, `640px` (sm), `767px`, `768px` (md), `1023px`, `1024px` (lg).

## Key Inspection Protocol

1. **Horizontal Overflow Check (Zero Tolerance)**
   - In browser / Playwright evaluation:
     `document.documentElement.scrollWidth <= window.innerWidth`
   - Every route and modal state MUST yield `0px` horizontal overflow.

2. **Browser Zoom Stress Test**
   - Emulate 125%, 150%, and 200% browser zoom levels.
   - Verify: font sizes do not break grid columns; sticky navigation headers stay within bounds.

3. **Touch Targets & Accessibility (Axe-Core)**
   - Interactive elements (buttons, inputs, links, menu toggles) must meet minimum touch target standards (44x44px / 48x48px).
   - Run automated a11y: `node scripts/audit/smoke-test-a11y.mjs`

4. **Mobile Navigation & Modals**
   - Test hamburger menu toggle, body scroll lock during open drawer, and focus traps on calculator dialogs.

## Verification Checklist
- [ ] 0px horizontal scrollbar on all 15 mobile viewports.
- [ ] Sticky navbar transitions smoothly upon scroll.
- [ ] No tap target overlap on lead generation forms and calculator inputs.
- [ ] Clean font hierarchy without awkward single-word wrapping.
