---
name: mobile-typography-engineer
description: Mobile typography forensics, heading line wrapping analysis, balanced responsive text composition, CSS constraint diagnosis, and zero visual clipping validation.
---

# Mobile Typography Engineer (`mobile-typography-engineer`)

Operational skill for investigating and repairing mobile typography defects, unbalanced line wraps, text clipping, improper line heights, and container constraints without altering original design or content.

## Scope of Investigation
- **Headings (H1–H6)**: Line counts, inline bounding fragments, balanced wrapping, orphan words.
- **Hero & Animated Lines**: Text segmentation spans, word boundaries, white-space constraints, height shifts on render.
- **Cards & Badges**: Truncation, line clamping, flexible container padding, responsive card titles.
- **CTA & Buttons**: Multiline button labels, icon alignment, touch target padding, vertical stretching.
- **Articles & Case Studies**: Paragraph density, compound word wrapping, mixed-script numerals and currencies.
- **Form Controls & Modals**: Label alignment, input placeholder readability, helper text wrapping.

## Mobile Viewport Matrix
Test across standard widths:
- `320px`, `344px`, `360px`, `375px`, `390px`, `393px`, `402px`, `412px`, `414px`, `430px`, `440px`, `480px`, `540px`, `640px`, `767px`
- Breakpoint boundaries: `639px / 640px`, `767px / 768px`.

## Strict Typography Rules
1. **Never arbitrarily reduce font size** to force arbitrary line count reductions.
2. **Never apply `word-break: break-all`** to regular text.
3. **Never apply `overflow: hidden` or `text-overflow: ellipsis`** to primary content headings.
4. **Never introduce arbitrary manual `<br>` tags** for isolated viewports.
5. **Never modify content or wording** to satisfy layout constraints.
6. Preferred techniques:
   - Target root container width / inline padding.
   - Investigate CSS flex / grid shrinkage constraints.
   - Use `text-wrap: balance` or `text-wrap: pretty` where supported and proven stable.
   - Verify font loading and rendering metrics to prevent FOUT reflows.

## Verification Checklist
- [ ] No horizontal overflow (`scrollWidth <= clientWidth`).
- [ ] No text clipping or vertical truncation.
- [ ] Preserved font families, font weights, and letter spacing.
- [ ] Verified across 320px up to 767px without regressions on tablet/desktop.
