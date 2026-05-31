# Сайт Whale Wzrd

This is a code bundle for Сайт Whale Wzrd. The original project is available at https://www.figma.com/design/xh1pMq4wWwnJgtEEnVJhnj/%D0%A1%D0%B0%D0%B9%D1%82-Whale-Wzrd.

## Running the code

Run `pnpm install` to install the dependencies from `pnpm-lock.yaml`.

Run `pnpm dev` to start the development server. The npm scripts remain available when dependencies are already installed, but pnpm is the lockfile source of truth.

If TypeScript is available in your environment, `tsc -p tsconfig.functions.json --noEmit` runs a scoped type check for Cloudflare Functions and the local Pages binding declarations.

## Cloudflare Pages Functions env vars

Set these environment variables in Cloudflare Pages project settings:

- `JSONBIN_BIN_ID`
- `JSONBIN_MASTER_KEY`
- `JSONBIN_ACCESS_KEY` (optional)
- `JSONBIN_URL` (optional override; defaults to `https://api.jsonbin.io/v3/b/${JSONBIN_BIN_ID}/latest`)
- `REQUIRE_FRESH_ARTICLES` (`true` for production builds that must fail instead of silently deploying stale fallback articles)
- `ALLOW_FALLBACK_BUILD` (`true` only for intentional emergency deploys when JSONBin is unavailable)
- `JSONBIN_BACKUP_BIN_ID` (optional, second bin for fallback read/write)
- `JSONBIN_BACKUP_MASTER_KEY` (optional, defaults to `JSONBIN_MASTER_KEY`)
- `JSONBIN_BACKUP_ACCESS_KEY` (optional, defaults to `JSONBIN_ACCESS_KEY`)
- `ADMIN_PASSWORD`
- `SITE_URL` (optional, defaults to current origin)
- `R2_PUBLIC_HOST` (public R2 host including protocol, for example `https://pub-...r2.dev`)
- `INDEXNOW_KEY` (optional, for Bing/IndexNow instant URL notification)
- `INDEXNOW_ENDPOINT` (optional, defaults to `https://api.indexnow.org/indexnow`)
- `VITE_GTM_ID` (optional override, defaults to `GTM-T88BWXVV`)
- `VITE_GA_MEASUREMENT_ID` (optional override, defaults to `G-ZV18R9DLVC`)
- `VITE_YANDEX_METRIKA_ID` (optional override, defaults to `108699980`)
- `VITE_META_PIXEL_ID` (optional, Meta Pixel ID for client build)
- `VITE_TIKTOK_PIXEL_ID` (optional, TikTok Pixel ID for client build)
- `DB` (D1 binding, optional while migrating)
- `USE_D1_ARTICLES` (`true` to read/write articles from D1; requires `DB` binding)


## Article freshness guard for production deploys

For JSONBin-backed production, keep `REQUIRE_FRESH_ARTICLES=true` so the build fails when JSONBin cannot be fetched. This prevents accidental deploys with stale `data/articles.build.json` or committed local fallback content.

For D1-backed production (`USE_D1_ARTICLES=true`), runtime Pages Functions read current articles from D1. In that mode JSONBin is only a build-time static SEO fallback, so a temporary JSONBin outage should not block deploys.

Use `ALLOW_FALLBACK_BUILD=true` only as a temporary emergency override for JSONBin-backed production when you intentionally want to deploy code while JSONBin is unavailable. Remove it after the emergency deploy so fresh content is required again.

## SEO endpoints

- `GET /sitemap.xml` — dynamic sitemap from active articles storage
- `GET /feed.xml` — RSS feed for fast discovery
- `GET /blog/:slug` — bot-aware SEO HTML on edge

## D1 migration quick start (safe mode)

1. Create D1 database and bind it as `DB` in Pages.
2. Apply SQL migrations from `migrations/0001_create_articles.sql` through the latest migration in order.
3. Import data into `articles`.
4. Set `USE_D1_ARTICLES=true` when D1 is the source of truth.
5. Keep `JSONBIN_*` variables during the transition as a fallback source; after validation, you can deprecate them.

Required production bindings for the current Cloudflare setup:

- D1 database binding `DB`
- R2 bucket binding `BUCKET`
- KV namespace bindings `META_CAPI_DIAGNOSTICS`, `META_CAPI_IDEMPOTENCY`, and `META_CAPI_NONCE` for Meta CAPI diagnostics/idempotency/nonce storage

After deploying these changes, apply `migrations/0006_articles_status_and_versions.sql` to the D1 database. This migration preserves draft/published status and creates private article version history.

## Analytics events

- Page view on every route change (including future pages added to router): `virtual_pageview` (dataLayer), `gtag('config', ..., { page_path })`, `ym(..., 'hit', path)`
- Lead form success: `generate_lead`, `form_submit`, `lead_submitted`
- Thank-you page conversion: `thank_you_page_view`


## Admin upload security

Admin uploads are stored in the `BUCKET` R2 binding and served through `R2_PUBLIC_HOST`. Uploads are limited to 15 MB and allow only common image/document formats: JPEG, PNG, WebP, GIF, AVIF, PDF, ZIP, DOCX, XLSX, and PPTX. SVG, HTML, JavaScript, XML, and unknown MIME types are intentionally blocked to reduce phishing and XSS risk.

The admin password is sent in the request body/header, not in the URL query string.
