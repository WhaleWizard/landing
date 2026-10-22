# PROJECT INVARIANTS: WHALEWZRD

## 1. Design Invariants
- **Color System**: Deep space theme (`#08090C`, `#0A0D14`, `#0F1420`), cyan/electric blue accents (`#38bdf8`, `#06b6d4`, `#60a5fa`), status tones (emerald `#10b981`, amber `#f59e0b`, rose `#f43f5e`).
- **Typography Concept**: Dual variable font system (`Inter Variable` for body/interface, `Onest Variable` for headings and lead typography). Cyrillic quotation marks (« ») and non-breaking conjunctions/prepositions via `smartTitle`.
- **Page Structure**: SSR-prehydrated first screen (`#root` with `data-ww-first-screen` and `data-ww-prehydrate`), text shell `#ww-static-shell` for no-JS crawlers, deferred below-fold sections (`DeferredSection`) with progressive viewport margin (`350px` mobile, `800px` desktop).
- **Hero Composition**: Centered brand badge with pulse, dual-tone or accent gradient `<h1>` with `HeroTitleEffect` (word/character/typewriter animations), lead subtitle, CTA button with shimmer glow, trust/proof indicators.
- **Visual Style & Proportion**: Responsive max-width containers (`max-w-7xl`, `max-w-5xl`), subtle borders (`rgba(255,255,255,0.08)`), cosmic dust/plexus background elements without CPU loops.

## 2. Functional Invariants
- **All Routes Active**: Core landings (`/`, `/meta-ads/`, `/meta-apps/`, `/google-ads/`, `/consult/`), content lists (`/blog/`, `/cases/`), dynamic articles (`/blog/:slug/`, `/cases/:slug/`), tools (`/calculator/`, `/roi-calculator/`, `/faq/`, `/marketing-glossary/`), legal (`/privacy-policy/`, `/offer/`, `/cookie-policy/`), confirmation (`/thank-you/`), admin (`/admin/`).
- **Admin Panel Integrity**: D1-backed CRM, article publishing with schedule, live site content management, finance and marketing stats, media library with multi-variant image storage in R2.
- **Conversion & Lead Intake**: Two-step lead capture (`ContactForm`, `LandingForm`), phone country code selector with national prefix stripping, offline queue (`leadRetryQueue`) with exponential backoff and storage in D1 with deduplication.
- **Analytics & Tracking**: Strict consent gating (`cookieConsent` with `marketing_consent` vs `analytics_only` / `stats_only`), Meta CAPI server-side event pipeline (`_lib/meta-capi.ts`), D1 outbox durability, GTM dataLayer consistency.
- **SEO & Server Architecture**: 27 statically generated routes, `_headers` Early Hints with `crossorigin`, clean canonical URLs with trailing slashes, full SSR schema markup (`Service`, `BreadcrumbList`, `Article`).

## 3. Data & Storage Invariants
- **Zero Data Loss**: Lead submissions, client deal statuses, and published articles are sacred.
- **No Unauthorized Production Writes**: Local audits and tests must never wipe or mutate production D1 or R2.
- **D1 Schema Stability**: Every database schema change requires an incremental, backward-compatible migration (`migrations/*.sql`) tested via `scripts/admin-migrations.test.js`.
- **Secret Isolation**: Production 2FA secrets, JWT keys, and API tokens are configured exclusively in Cloudflare Pages environment variables, never hardcoded in repository files.
