# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Whale Wzrd" (whalewzrd.com) — a Russian-language performance-marketing agency site: landing pages for Google Ads / Meta Ads / consulting, a blog + case studies (CMS-backed), lead-gen forms, an ROI/budget calculator, a marketing glossary/FAQ, legal pages, and an admin CMS. Frontend is a React SPA; backend is Cloudflare Pages Functions. Originally scaffolded via Figma Make (`ATTRIBUTIONS.md` credits shadcn/ui and Unsplash).

Git remote: `github.com/WhaleWizard/landing`, default branch `main`.

## Commands

Package manager: **pnpm** is the lockfile source of truth (`pnpm-lock.yaml`) per `README.md`. `package-lock.json` is also committed — this is a real inconsistency in the repo (two lockfiles for one project); don't let them drift further apart, and prefer `pnpm install` for anything you run.

```
pnpm dev                        # vite dev server
npm run build                     # fetch:articles && vite build && generate:pages — the actual production build
npm run test                        # alias for `npm run build` — there is no unit test suite
npm run check                        # test:meta-capi && build — closest thing to a full gate before shipping
npm run test:meta-capi                 # node scripts/meta-capi-smoke-tests.js — smoke-tests the Meta Conversions API integration
npm run fetch:articles                   # node scripts/fetch-articles.js — pulls articles into data/articles.build.json before the vite build
npm run generate:pages                     # node scripts/generate-pages.js — emits static SEO HTML per route into dist/ after the vite build
npm run generate:media                       # node scripts/generateMedia.js
tsc -p tsconfig.functions.json --noEmit        # type-checks functions/ only
```

Known gaps, confirmed by inspection (also called out in `audit-reports/05_дополнительный_аудит.md`) — don't assume these exist:
- No `lint` script, no ESLint config anywhere in the repo.
- No `typecheck` script and no root `tsconfig.json` — only `tsconfig.functions.json`, which covers `functions/**/*.ts` and nothing under `src/`. TypeScript correctness under `src/` is only as strong as what Vite/esbuild catches at build time.
- No CI config (no `.github/workflows`).
- No error monitoring (no Sentry/Rollbar) wired into `AppErrorBoundary.tsx` or `RouteErrorBoundary`.

Given this, treat `npm run build` (plus `npm run test:meta-capi` for tracking-related changes) as the actual verification step for any change — there is no faster, narrower check available.

## Architecture

### Split: SPA (`src/`) vs edge backend (`functions/`)

- `src/app/` — the React app (React 18, React Router 7). `routes.tsx` defines a `createBrowserRouter` tree; every route except `Home` is lazy-loaded via `React.lazy` + a shared `LazyWrapper`/`RouteSkeleton` Suspense fallback. `RouteErrorBoundary` specifically detects failed dynamic-import chunk errors (post-deploy stale chunk refs) and force-reloads once via a sessionStorage guard.
  - `src/app/components/` (27 files) — feature components: `Hero`, `Navbar`, `Footer`, `ContactForm`, `BudgetCalculator`/`RoiCalculator` (+ popup variants), `Blog`, `Cases`, `ArticleEditor` (Tiptap-based rich text editor for admin), `Testimonials`, `SEO.tsx` (per-page meta tags), plus subfolders `cookie/` (consent banner), `legal/` (offer/privacy body content), `figma/` (`ImageWithFallback` — a Figma Make leftover), `hooks/` (`useArticlesApi`, `useScrollTo`).
  - `src/app/components/ui/` (46 files) — shadcn/ui-style Radix primitives (accordion, dialog, dropdown, etc.). Treat as vendored — match existing patterns rather than introducing a second design-primitive convention.
  - `src/app/pages/` (17 files) — one per route in `routes.tsx` (`Home`, `BlogPage` doubles as both `/blog` and `/cases` list+detail, `Calculator`, `RoiPage`, `Admin`, `ConsultPage`, `MetaAdsPage`, `GoogleAdsPage`, `MetaAppsPage`, legal pages, `FAQPage`, `MarketingGlossaryPage`, `ThankYou`, `NotFound`).
  - `src/app/context/ArticlesContext.tsx` — shared article state for the SPA.
  - `src/app/utils/` — `sanitizeHtml.ts` (DOMPurify wrapper for rendering CMS-authored article HTML) and `phoneCountry.ts`.
- `functions/` (37 files) — Cloudflare Pages Functions, file-based routing (`functions/api/articles.ts` → `/api/articles`, `functions/blog/[slug].ts` → `/blog/:slug`). `functions/_middleware.ts` runs on every request: 301-redirects the legacy non-`www` host to canonical `www.whalewzrd.com`, and stamps CSP/HSTS/`X-Frame-Options`/etc. on every response. `functions/_lib/` (13 files) holds shared server logic — not routable itself: `auth.ts`, `d1.ts`, `jsonbin.ts`, `meta-capi.ts`, `meta-diagnostics.ts`, `meta-outbox.ts`, `meta-pii.ts`, `rate-limit.ts`, `sanitize.ts`, `seo.ts`, `tracking-signature.ts`, `cache.ts`, `http.ts`, `types.ts` (the `Env`/`Article` type contracts).
- No `wrangler.toml` — deployment bindings (D1 `DB`, R2 `BUCKET`, KV namespaces, all secrets) are configured in Cloudflare Pages project settings, not in-repo. Full required-binding list is in `README.md`.

### Articles: dual-source with fallback chain

Read path (`functions/_lib/articles.ts`), in order:
1. If `USE_D1_ARTICLES=true` and a `DB` binding exists → read from D1 (`_lib/d1.ts`, source of truth once migrated).
2. Fall back to JSONBin (`_lib/jsonbin.ts`, legacy backing store).
3. Fall back to the static `public/articles.seed.json` snapshot baked at build time by `scripts/fetch-articles.js`.

`REQUIRE_FRESH_ARTICLES=true` fails the build instead of shipping stale fallback content; `ALLOW_FALLBACK_BUILD=true` is an explicit emergency override for JSONBin outages — both are deploy-time safety knobs, not defaults to toggle casually. `isPublishedArticle`/`filterVisibleArticles` in `_lib/articles.ts` gate out `status: 'draft'` and future-dated `publishedAt` from public reads. D1 schema evolves via numbered files in `migrations/` (`0001` articles → `0002`–`0004` Meta CAPI diagnostics → `0005` Meta outbox → `0006` article status/version history); there's no migration runner — apply them manually/in order against the bound D1 database.

### SEO: static generation + edge rendering over an SPA

- `scripts/generate-pages.js` (runs after `vite build`) pre-renders static HTML for the routes listed in `scripts/config.js`'s `STATIC_ROUTES` — keep that list in sync with `routes.tsx` when adding a crawlable route.
- `functions/blog/[slug].ts` and `functions/cases/[slug].ts` serve bot-aware SEO HTML for article pages at request time (dynamic content can't be static-generated).
- `functions/sitemap.xml.ts` and `functions/feed.xml.ts` generate sitemap/RSS dynamically from live article storage.
- `public/_redirects` duplicates the canonical-host redirect from `_middleware.ts`, exempts `articles.seed.json` and `/og-image.jpg` from SPA fallback, and defines the catch-all `/* /index.html 200`.

### Tracking/analytics pipeline

Client-side pixels (GTM, GA4, Yandex Metrika, Meta Pixel, TikTok Pixel) fire alongside a server-side Meta Conversions API path (`functions/api/meta-event.ts` / `_lib/meta-capi.ts`), deduplicated against the client pixel via shared event IDs. Failed CAPI sends go through an outbox/retry pattern (`_lib/meta-outbox.ts`, migration `0005`) instead of being dropped silently. Diagnostics (coverage, anomalies, funnel, health) are exposed under `functions/api/meta-diagnostics-*.ts`, backed by KV namespaces `META_CAPI_DIAGNOSTICS` / `META_CAPI_IDEMPOTENCY` / `META_CAPI_NONCE` and migrations `0002`–`0004`. `scripts/meta-capi-smoke-tests.js` (`npm run test:meta-capi`) is the only regression check for this path — run it after touching anything under `_lib/meta-*` or `functions/api/meta-*`.

### Admin CMS

`/admin` (`src/app/pages/Admin.tsx`) is a client-side article CMS using Tiptap for rich text (`ArticleEditor.tsx`), backed by `functions/api/admin/{articles,article-versions,upload}.ts`. Auth is a single shared `ADMIN_PASSWORD` checked in `_lib/auth.ts`, sent in the request body/header — never the URL query string. Uploads (`upload.ts`) go to the `BUCKET` R2 binding, capped at 15 MB, restricted to an explicit MIME allowlist (JPEG/PNG/WebP/GIF/AVIF/PDF/ZIP/DOCX/XLSX/PPTX); SVG/HTML/JS/XML are deliberately blocked to prevent stored-XSS via uploaded assets — don't loosen this without understanding why.

### Security headers & CSP

`functions/_middleware.ts` builds the CSP directive array inline (`buildCsp()`). Adding any new third-party script/pixel/embed almost always requires a matching addition to `script-src`, `connect-src`, or `frame-src` there, or it will be silently blocked in production only — the most common cause of "works in dev, broken in prod" in this codebase.

### Path aliases

`@/` resolves to `src/` (`vite.config.ts`). `figma:asset/...` imports are resolved by a custom Vite plugin to `src/assets/<filename>` — a Figma Make leftover; use normal relative/`@/` imports for new assets instead.

## Known issues (from code inspection + `audit-reports/`)

The `audit-reports/` directory contains five prior audits in Russian; `05_дополнительный_аудит.md` is the most current and has a prioritized table. Still-open items worth knowing before touching adjacent code:
- No offline/retry queue for lead form submissions on network loss (`ContactForm.tsx` / `LandingForm.tsx`).
- No field RUM (Core Web Vitals aren't sent anywhere).
- No documented `dataLayer` event schema — GA/YM/Meta event names live only in component code, not a shared spec.
- International SEO claims (`areaServed`: RU/US/AE/TR/EU) without hreflang or localized copy — content and legal pages are Russian-only.
- Two committed lockfiles (`pnpm-lock.yaml` and `package-lock.json`) for one package manager story.

## Documentation rule

This file is the source of truth for this project.

If project structure changes:
- suggest update of this file
- do not silently assume changes
- never overwrite without confirmation