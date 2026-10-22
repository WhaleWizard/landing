---
name: regression-guardian
description: Regression prevention, impact analysis, 45+ test suite enforcement, schema migration safety, before/after metric validation, and Git diff verification.
---

# Regression Guardian (`regression-guardian`)

Use this skill to protect against functional, visual, and performance regressions across all changes.

## Verification Gates

1. **Static Analysis & Typecheck**
   - Application TypeScript: `npm run typecheck:app`
   - Edge Functions TypeScript: `npm run typecheck:functions`
   - ESLint React Hooks: `npm run lint`

2. **Core Invariant Test Suite Execution**
   - Execute full test suite: `npm run check`
   - Must exit with code 0 across all 45+ automated test scripts:
     - Lead intake reliability (`test:lead-reliability`)
     - Meta CAPI consent gating and PII protection (`test:meta-capi`)
     - D1 schema migrations (`test:admin-migrations`, `test:migration-map`)
     - First-screen SSR hydration (`test:audit-regressions`)
     - SEO static route outputs (`test:seo-output`)

3. **Performance & Bundle Regression Check**
   - Run before/after comparison on modified bundles.
   - Ensure no new render-blocking resources, circular dependency loops, or chunk bloat are introduced.

4. **Git Diff & Code Review Verification**
   - Review every modified line via `git diff`.
   - Preserve unrelated comments, docstrings, and business logic.
   - Confirm changes adhere to design preservation rules.
