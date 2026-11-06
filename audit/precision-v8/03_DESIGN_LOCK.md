# 03_DESIGN_LOCK.md — Visual Preservation Baseline (WHALEWZRD v8.0)

**Date**: 2026-11-07  
**Scope**: Full website (Desktop, Mobile, Tablet, Admin, React, CSS, Cloudflare)  
**Strict Policy**: DESIGN LOCK — NO ARBITRARY VISUAL DEVIATIONS

---

## 1. Brand Tokens & Colors

```css
:root {
  --background: #0a0a0f;
  --foreground: #f5f5f7;
  --card: #111116;
  --card-foreground: #f5f5f7;
  --popover: #111116;
  --popover-foreground: #f5f5f7;
  --primary: #8b5cf6;            /* Brand Violet */
  --primary-foreground: #ffffff;
  --secondary: #3b82f6;          /* Brand Blue */
  --secondary-foreground: #ffffff;
  --muted: #1f1f28;
  --muted-foreground: #9ca3af;
  --accent: #6366f1;           /* Indigo accent */
  --accent-foreground: #ffffff;
  --destructive: #ef4444;
  --destructive-foreground: #ffffff;
  --border: rgba(139, 92, 246, 0.1);
  --input: rgba(139, 92, 246, 0.2);
  --input-background: #111116;
  --ring: #8b5cf6;
}
```

### Gradients
- Brand Primary: `linear-gradient(135deg, #8b5cf6 0%, #3b82f6 100%)`
- Accent Sheen: `linear-gradient(90deg, #7c3aed, #8b5cf6 46%, #38bdf8)`
- Deep Glass Surface: `rgba(17, 17, 22, 0.75)` with `backdrop-filter: blur(16px)`

---

## 2. Typography & Fonts

### Font Families
- **Display Heading**: `"Segoe UI Variable Display", "Segoe UI", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif`
  - Weight: 700
  - Letter-spacing: `-0.018em`
- **Body & Text**: `"Segoe UI Variable Text", "Segoe UI", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif`
  - Weight: 400
  - Medium accents: 500
- **Base font size**: 16px (Enforced >= 16px on mobile inputs to prevent iOS zoom).

---

## 3. Shadows & Radii
- Standard Border Radius: `0.75rem` (`12px`)
- Card Radius: `1rem` (`16px`)
- Button Radius: `0.75rem` / Pill `9999px` (Hero CTA / badge chips)
- Elevation Surface: `0 1px 2px rgba(7, 10, 20, 0.28), 0 0 0 1px rgba(139, 92, 246, 0.08)`
- Elevation Raised: `0 10px 30px rgba(7, 10, 20, 0.3), 0 2px 10px rgba(99, 102, 241, 0.15)`
- Elevation Floating: `0 18px 40px rgba(7, 10, 20, 0.34), 0 8px 24px rgba(59, 130, 246, 0.2)`

---

## 4. Breakpoints & Layout Dimensions
- Breakpoints:
  - Mobile: `< 640px` (tested at 320, 360, 375, 390, 393, 412, 414, 430, 480)
  - Small Tablet: `640px` (`sm`)
  - Tablet: `768px` (`md`)
  - Laptop / Small Desktop: `1024px` (`lg`)
  - Standard Desktop: `1280px` (`xl`)
  - Wide Desktop: `1536px` (`2xl`)
- Container Max Width: `1280px` (with standard horizontal padding `px-4 sm:px-6 lg:px-8`)

---

## 5. Hero & Key Components Composition
- **Hero Title Rules**:
  - H1 headings must never be clipped, hidden, or resized arbitrarily.
  - Balanced line wrap (`text-wrap: balance` / container tuning).
  - Splitting spans must preserve natural layout and line height.
- **Button Standards**:
  - Minimum touch target: 44x44px.
  - Icons horizontally aligned with text, no vertical drift.
- **Motion & Transitions**:
  - Motion fast: 120ms
  - Motion base: 280ms
  - Motion slow: 420ms
  - Easing: `cubic-bezier(0.22, 1, 0.36, 1)`
  - No decorative animations removed for fake performance scores.
