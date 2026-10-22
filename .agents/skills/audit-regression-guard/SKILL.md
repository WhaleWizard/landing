---
name: audit-regression-guard
description: Automated regression testing, invariant verification, 45+ test suite execution, SEO contract enforcement, and edge migration safety.
---

# Regression Guard & Invariant Protection (`audit-regression-guard`)

Use this skill to protect against functional, structural, and performance regressions across the entire application stack.

## Mandatory Quality Gate

The gold standard for any code modification is passing `npm run check`:
```bash
npm run check
```
This single command executes the complete chain of 45+ test suites, including:
1. `typecheck:app`: Strict TypeScript validation of client code (`tsconfig.app.json`).
2. `typecheck:functions`: Strict TypeScript validation of Cloudflare Pages Functions (`tsconfig.functions.json`).
3. `test:meta-capi`: Meta Conversions API consent gate and smoke tests.
4. `test:lead-reliability`: Lead intake, offline durable queue, and CRM deduplication.
5. `test:tracking-security`: Signature verification and write budget guards.
6. `test:admin-migrations`: D1 migration mapping, unlocks, and fallback safety.
7. `test:audit-regressions`: First-screen preload, hydration, scroll restoration, and CSS loops.
8. `test:article-images` & `test:image-variants`: WebP responsive variant consistency.
9. `build` & `test:seo-output`: Production Vite build, static route generation (27 routes), and complete SEO contract validation.

## Invariants Under Protection
- **Tracking & Privacy**: Meta CAPI events MUST strictly gate on explicit marketing consent. Unsigned tracking requests must be rejected.
- **Lead Durability**: Offline retry queue must never drop user submissions or absorb duplicate actions.
- **SSR Hydration Contract**: Generated first-screen markup must match browser client mount without flash or warning.
- **SEO Uniformity**: Static routes must have canonical URLs, valid JSON-LD schemas, and dedicated 404 handling.

## Verification Checklist
- [ ] `npm run check` finishes with exit code 0.
- [ ] No git diff in generated manifests unless intentionally triggered.
- [ ] New features include automated regression test coverage in `scripts/*.test.js`.
