# Light audit report (2026-05-23)

## Scope
- Quick static and build-time audit of frontend routes/pages and critical API/serverless code paths.
- Validation run: production build + static page generation.

## What was checked
- Route declarations and fallbacks in `src/app/routes.tsx`.
- Main pages under `src/app/pages/*` reachable from router.
- Build pipeline health (`fetch:articles`, `vite build`, `generate:pages`).
- Runtime resilience for content loading fallback chain.

## Findings

### 1) Missing explicit 404 route (fixed)
- **Risk**: Unknown client-side routes relied on router error boundary behavior instead of a dedicated not-found UX.
- **Fix**: Added `NotFound` page and wired wildcard route `*`.
- **Status**: ✅ fixed.

### 2) External content source DNS instability (not code defect)
- During build, JSONBin endpoint resolution failed (`EAI_AGAIN`), but fallback to local dataset worked correctly.
- **Risk**: In degraded network conditions, fresh remote content is unavailable.
- **Current mitigation**: retries + local fallback already implemented.
- **Status**: ℹ️ acceptable for now; monitor infra/network.

## Route-level quick pass
- `/` Home: builds and renders via static generation.
- `/calculator`: route compiles and chunk generated.
- `/roi-calculator`: route compiles and chunk generated.
- `/thank-you`: route compiles and chunk generated.
- `/blog` and `/blog/:slug`: route compiles and chunk generated.
- `/admin`: route compiles and chunk generated.
- `/privacy-policy`: route compiles and chunk generated.
- `/offer`: route compiles and chunk generated.
- `/cookie-policy`: route compiles and chunk generated.
- `/faq`: route compiles and chunk generated.
- `/marketing-glossary`: route compiles and chunk generated.
- `/meta-ads`: route compiles and chunk generated.
- `/google-ads`: route compiles and chunk generated.
- `/consult`: route compiles and chunk generated.
- `/meta-apps`: route compiles and chunk generated.
- `*` wildcard: now shows explicit 404 page.

## Recommended next steps (small)
1. Add lightweight e2e smoke test for all router paths (status + hydration).
2. Add route guard/redirect tests for `/api/article` redirect behavior.
3. Add CI warning threshold when remote article source is unavailable repeatedly.
