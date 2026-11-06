# 13_CHANGELOG.md — Master Changelog (Precision v8.0)

## Session: 2026-11-07 — Precision Engineering v8.0

### Fixed Defect 1: React 18 Text Boundary Comment Stripping in Static Page Generator
- **Files Modified**:
  - [scripts/generate-pages.js](file:///d:/Dev/Projects/Landing/scripts/generate-pages.js#L270)
  - [scripts/generate-pages.js](file:///d:/Dev/Projects/Landing/scripts/generate-pages.js#L1398)
- **Problem**:
  - In `scripts/generate-pages.js`, lines 270 and 1401 post-processed generated HTML with `html.replace(/<!--(?![\$/])[\s\S]*?-->/g, '')`.
  - React 18 SSR emits `<!-- -->` as delimiters between adjacent JSX text nodes (e.g. `{linkLabel} <ArrowRight />` or `<span>№ {number}</span>`).
  - Because `<!-- -->` does not start with `$` or `/`, the regex stripped empty comments.
  - When the browser parsed the HTML without comments, adjacent text nodes coalesced into a single text node (e.g. `"№ 001"` or `"Читать кейс "`).
  - On client hydration, React encountered mismatched text nodes and threw `Minified React error #425`, falling back to full client re-render (`[app] hydration fell back to client render`).
- **Solution**:
  - Refined regex to `/<!--(?!\s*-->|[\$/?])[\s\S]*?-->/g`, preserving React 18 text delimiters `<!-- -->` and boundary comments `<!--?-->` while still stripping non-essential developer HTML comments.
- **Verification**:
  - Playwright cross-viewport testing across 1440x900 desktop and 375x667 mobile confirmed hydration errors dropped to strictly 0.

### Fixed Defect 2: Receipt Number Separation in MetaAppsHeroVisual
- **File Modified**:
  - [src/app/components/MetaAppsHeroVisual.tsx](file:///d:/Dev/Projects/Landing/src/app/components/MetaAppsHeroVisual.tsx#L381)
- **Problem**:
  - In `Receipt`, the header rendered `<span>№ {number}</span>`.
  - In JSX, `"№ "` and `{number}` formed two adjacent children, creating unnecessary dependency on SSR comment separation.
- **Solution**:
  - Converted `<span>№ {number}</span>` to an atomic template literal: `<span>{\`№ \${number}\`}</span>`.
- **Verification**:
  - `scripts/test-desktop-vs-mobile-hydration.cjs` confirmed 0 hydration errors on `/meta-apps/` on both Desktop (1440x900) and Mobile (375x667).

### Regression Safety & Full Suite Execution
- `npm run check`: 100% PASS across all 46+ test suites, including:
  - TypeScript app & functions checks (`tsc --noEmit`)
  - Meta CAPI smoke tests & consent gating
  - Lead intake reliability & tracking security
  - First-screen SSR hydration (22/22 suites)
  - First-screen render & pre-paint title fitting (113/113 suites)
  - 28 static routes generated
  - SEO contract verification (15/15 suites)
