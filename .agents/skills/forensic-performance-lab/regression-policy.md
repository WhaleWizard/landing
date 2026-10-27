# Regression Policy & Invariant Enforcement

1. **Mandatory Test Suite**:
   - `npm run check` must pass with exit code 0 on all 46 test suites.
   - Zero TypeScript errors (`tsconfig.app.json` and `tsconfig.functions.json`).
   - Zero SEO contract regressions (`test:seo-output`).
   - Zero hydration mismatch regressions (`test:audit-regressions`).
2. **Visual & Behavioral Invariants**:
   - SSR first-screen HTML must be identical to initial client render.
   - Hero animations must retain their visual polish without layout thrashing.
   - Tracking/CAPI security signatures and deduplication must remain intact.
