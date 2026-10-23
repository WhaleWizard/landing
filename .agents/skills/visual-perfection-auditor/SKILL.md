---
name: visual-perfection-auditor
description: Autonomous pixel-precision visual UI audit, layout geometry inspection, typography and spacing validation, cross-browser consistency, and visual regression prevention for WHALEWZRD.
---

# Visual Perfection Auditor Skill

## 1. Core Mandate & Non-Negotiable Invariants
- **Preserve the Design Concept**: Under no circumstances redesign, restyle, rebrand, or alter intentional aesthetics.
- **Differentiate Design Intent vs Implementation Bug**: Unusual or distinctive styling (e.g. cosmic dark theme, neon glows, glassmorphism, accent badges) is by design. Only correct technical rendering, alignment, clipping, spacing, and geometry defects.
- **Zero Cosmetic Guesswork**: Every defect must be verified with DOM measurements (`getBoundingClientRect`, computed CSS), viewport reproduction, and screenshot evidence.

## 2. Defect Classification & Severity
- **V0 — CRITICAL**: Content invisible, button unclickable/covered, broken navigation, text completely clipped.
- **V1 — HIGH**: Layout break, horizontal overflow (`scrollWidth > innerWidth`), hero title clipping, large layout shift (CLS > 0.05), broken mobile responsiveness.
- **V2 — MEDIUM**: Awkward line wraps / orphaned words, misaligned repeating cards, uneven spacing scales, border seam tears, button height mismatch (1-3px).
- **V3 — MICRO**: Subpixel hairline artifacts, 1-2px icon optical misalignment, border radius mismatch, minor focus-visible offset, subtle shadow clipping.

## 3. DOM Geometry & Alignment Measurement Protocol
1. **Bounding Box Analysis**:
   ```javascript
   const rect = el.getBoundingClientRect();
   const computed = window.getComputedStyle(el);
   // Check: rect.width, rect.height, rect.left, rect.top, computed.lineHeight, computed.padding
   ```
2. **Subpixel & Alignment Forensics**:
   - Verify sibling buttons share identical heights (`Math.abs(rectA.height - rectB.height) < 0.5px`).
   - Verify continuous border junctions: no double borders, no 1px gaps (`Math.abs(rectA.right - rectB.left) <= 0.5px`).
   - Verify icon centering: optical center matches text cap-height/baseline.
3. **Container Constraints & Overflows**:
   - `document.documentElement.scrollWidth <= window.innerWidth` across all viewports.
   - Child elements must not overflow parent bounding boxes without deliberate scrolling containers.

## 4. Typography & Wrapping Protocol
- Inspect headings (`H1`, `H2`, `H3`, `H4`) for unbalanced wraps, orphaned single words on trailing lines, and clipped ascenders/descenders.
- Line heights must accommodate Cyrillic and Latin glyphs without vertical clipping.
- Do NOT shrink font sizes to unreadable levels just to force single-line constraints.
- Verify `text-wrap: balance` or `text-wrap: pretty` where supported and visually beneficial.

## 5. Interaction & Dynamic State Protocol
- Inspect all visual interactive states: `default`, `hover`, `active`, `focus-visible`, `disabled`, `loading`.
- Hover and focus transitions must NOT cause layout shifts or button dimension changes.
- Focus rings must be visible, properly offset, and unclipped by `overflow: hidden`.

## 6. Fix Verification & Regression Prevention
1. Reproduce defect in isolated or live environment and capture baseline screenshot (`before/`).
2. Identify Root Cause in CSS / JSX (specificity, box-sizing, flex-shrink, line-height, etc.).
3. Apply minimal, surgical correction (prefer component-level or token-level over `!important`).
4. Re-measure DOM geometry and capture verification screenshot (`after/`).
5. Run full test suite: `npm run check` and visual regression matrix.
6. Verify neighbor viewports (mobile, tablet, desktop) and transition boundary widths.
7. Record findings in `audit/visual/03_VISUAL_BUGS.csv` and updates in `audit/visual/00_VISUAL_STATE.md`.
