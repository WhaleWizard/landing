# ENGINEERING CHANGELOG & VERIFIED REPAIRS

## Session 23.10.2026 — Master Forensics & Autonomous Architecture Hardening (v4.0)

### 1. A11Y-001: Accessible Landmark Region in Pre-rendered Static Shell
- **Affected File:** `scripts/generate-pages.js` (line 1450)
- **Problem:** Static HTML pre-rendered for search engines and assistive technologies rendered `#ww-static-shell > section` without an accessible name (`aria-label`). Axe-core flagged a WCAG 2.1 AA `[moderate] region: Ensure all page content is contained by landmarks` violation.
- **Root Cause:** A `<section>` element is only treated as a landmark region by screen readers when it possesses an accessible name (`aria-label` or `aria-labelledby`).
- **Resolution:** Added `aria-label="Текстовая версия страницы"` to the generated `<section>` element.
- **Verification:** Re-ran `npm run build && node scripts/audit/smoke-test-a11y.mjs`. Axe-core violations reduced from 1 to **0**. `npm run test:seo-output` passed 15/15.

### 2. CIRC-001: Complete Elimination of 8 Circular Dependency Loops
- **Affected Files:**
  - `src/app/types/faq.ts` (created): extracted `FaqCategory` and `FaqItem` from `FAQPage.tsx`.
  - `src/app/hooks/useFaqContent.ts`: imports `FaqItem` from `../types/faq` instead of `../pages/FAQPage`.
  - `src/app/types/hero.ts` (created): extracted `HeroStat`, `HeroContent`, `HeroVisual` from `Hero.tsx`.
  - `src/app/components/service-heroes/ConsultStudioHero.tsx` & `MetaAdsEditorialHero.tsx`: import `HeroContent` from `../../types/hero` instead of `../Hero`.
  - `src/app/utils/heroVisualPreload.ts` (created): extracted `loadCosmicHeroScene` and `loadMetaAppsHeroVisual` to break circular import with `heroPreload.ts`.
  - `src/app/components/Hero.tsx`: imports visual loaders from `heroVisualPreload.ts` instead of `heroPreload.ts`.
  - `src/app/types/editorContent.ts` (created): extracted `EditableContent`, `EditorPage`, `EditorSection`, `IntroContent`, `TypographySettings`.
  - `src/app/content/contentPreviewProtocol.ts` & `AdminContentPreview.tsx`: import editor types from `types/editorContent` instead of `AdminContentControl`.
  - `src/app/utils/caseArticlePreload.ts` (created): extracted `loadCaseArticleView` to break circular dependency between `routePreload.ts` and `BlogPage.tsx`.
  - `src/app/routerInstance.ts` (created): decoupled router facade (`router`, `setAppRouter`, `getCurrentPathname`, `getAppRouter`) allowing `CookieConsentManager` to query route state and subscribe to transitions without importing the full `routes.tsx` tree.
- **Verification:** Re-ran `npm run audit:madge`. Madge scanned 218 modules and reported **0 circular dependencies** (down from 8). `npm run test:meta-capi` passed with exact string verification.

### 3. HOOK-001: Resolution of 13 React Hook Exhaustive-Deps Warnings
- **Affected Files:**
  - `src/app/pages/BlogPage.tsx`: Line 672, added `returnTo` to `useCallback` dependency array, resolving potential stale closure when user navigates back to blog list.
  - `src/app/components/Navbar.tsx`: Line 208, removed unused `location.key` from `useCallback` dependency array to eliminate redundant function recreations.
  - `src/app/components/admin/PublishSchedulePanel.tsx`: Lines 51-55, computed `nowIso` inside `candidates` `useMemo` callback, eliminating redundant recalculations.
  - `src/app/components/admin/AdminToday.tsx`: Lines 218-219, memoized `items` and `focus` arrays with `useMemo`, preventing unstable empty array references from invalidating downstream memoized calculations.
  - `src/app/components/admin/AdminPageLocks.tsx`: Line 177, memoized `routes` with `useMemo` to stabilize dependencies of `locked` and `groups`.
  - `src/app/components/admin/AttributionCharts.tsx`: Line 345, extracted `valuesKey` to replace inline `values.join(',')` in hook dependencies.
  - `src/app/pages/Admin.tsx`: Line 1205, included memoized `refreshHealth` in dependencies; Line 1286, added explicit `eslint-disable-next-line` documenting intentional mount-only session check.
  - `src/app/utils/firstScreen.ts`: Line 16, removed unused `eslint-disable-next-line no-var` directive.
- **Verification:** Re-ran `npm run lint`. ESLint scanned all `src/` modules and reported **0 errors and 0 warnings** (down from 13).

### 4. Master Quality Gate Verification
- **Application TypeScript:** `npm run typecheck:app` passed with 0 errors.
- **Edge Functions TypeScript:** `npm run typecheck:functions` passed with 0 errors.
- **Meta CAPI Smoke Tests:** `npm run test:meta-capi` passed with 0 errors.
- **Full Test Suite & Production Build:** `npm run check` passed all 45+ test suites, Vite production compilation, static page generation (27 routes), and SEO contract validation with **exit code 0**.
