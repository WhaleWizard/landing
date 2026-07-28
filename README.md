# Сайт Whale Wizard

This is a code bundle for Сайт Whale Wizard. The original project is available at https://www.figma.com/design/xh1pMq4wWwnJgtEEnVJhnj/%D0%A1%D0%B0%D0%B9%D1%82-Whale-Wzrd.

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
- `PAGESPEED_API_KEY` (required server-side Google PageSpeed Insights API key for automated admin checks; enable `pagespeedonline.googleapis.com` in Google Cloud and keep the key in Cloudflare Pages secrets)
- `SITE_CONTENT_PUBLIC_URL` (optional build-time override for published page/FAQ text; defaults to `${SITE_URL}/api/site-content`)
- `SITE_CONTENT_FETCH_TIMEOUT_MS` (optional build-time timeout, defaults to `8000`; failures use the last build snapshot and then source copy)
- `REQUIRE_FRESH_SITE_CONTENT=true` (recommended for Production together with the deploy hook; stops a build if fresh published D1 text cannot be loaded, so stale SEO HTML is never deployed)
- `CF_PAGES_DEPLOY_HOOK_URL` (secret Cloudflare Pages production deploy hook; required for automatic D1 published-content → static SEO synchronization)
- `CF_ZONE_ID` (plaintext Cloudflare Zone ID; it is an identifier, not a credential)
- `CF_CACHE_PURGE_TOKEN` (secret API token with only the `Zone.Cache Purge` permission)
- `R2_PUBLIC_HOST` (public R2 host including protocol, for example `https://pub-...r2.dev`)
- `INDEXNOW_KEY` (optional, for Bing/IndexNow instant URL notification)
- `INDEXNOW_ENDPOINT` (optional, defaults to `https://api.indexnow.org/indexnow`)
- `VITE_GTM_ID` (optional override, defaults to `GTM-T88BWXVV`)
- `VITE_GA_MEASUREMENT_ID` (optional override, defaults to `G-ZV18R9DLVC`)
- `VITE_YANDEX_METRIKA_ID` (optional override, defaults to `108699980`)
- `VITE_META_PIXEL_ID` (optional, Meta Pixel ID for client build)
- `VITE_TIKTOK_PIXEL_ID` (optional, TikTok Pixel ID for client build)
- `META_CAPI_ACCESS_TOKEN` (secret; server-side Meta Conversions API)
- `META_CAPI_API_VERSION` (currently `v25.0`)
- `META_CAPI_DEBUG_SECRET` (secret; protects diagnostics and manual outbox processing)
- `META_OUTBOX_MAX_ATTEMPTS` (optional, defaults to `8`)
- `TRACKING_HMAC_SECRET` (secret; exactly 32 random bytes encoded as 64 hexadecimal characters)
- `TRACKING_SIGNATURE_MODE=monitor` (keep this value until requests are signed by a trusted server-side component; the browser must never receive the shared secret)
- `TRACKING_SIG_TTL_SEC` (optional signature lifetime, defaults to `60` seconds)
- `VITE_ANALYTICS_RUNTIME=direct` (loads GA4 and Yandex directly; choose `gtm` only when the container owns the equivalent consent-aware tags)
- `DB` (D1 binding, optional while migrating)
- `USE_D1_ARTICLES` (`true` to read/write articles from D1; requires `DB` binding)
- `TELEGRAM_BOT_TOKEN` (secret; direct Telegram lead notifications from `/api/lead`)
- `TELEGRAM_CHAT_ID` (secret; chat that receives lead notifications; while both are unset, leads fall back to the legacy Google Apps Script proxy)


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
- KV namespace bindings `META_CAPI_DIAGNOSTICS` and `META_CAPI_IDEMPOTENCY` for Meta CAPI diagnostics and idempotency
- KV namespace binding `META_CAPI_NONCE` only as a non-atomic compatibility fallback while signature mode is `monitor`; migration `0018` provides the authoritative atomic replay claim in D1

Back up production D1, then apply every not-yet-applied SQL migration in numeric order through `0019` before deploying the code that depends on it (or in the same maintenance window before traffic reaches the new Functions). In particular, the new `/api/lead` deliberately returns a retryable `503` when `0019` is absent, instead of falsely acknowledging an unpersisted lead. Highlights: `0006` — draft/published status and article version history; `0008` — leads table and cookieless page-view aggregates; `0009`/`0010` — lead dedupe, quality marks and Meta click/consent context; `0012` — CRM pipeline and activity history; `0013` — draft/published site text; `0014` — CRM workspace, tasks, notes and tags; `0015` — durable consent receipts and the 180-day eligibility guard for delayed CRM quality events; `0016` — 90-day D1 retention for Meta diagnostics; `0017` — CRM integrity constraints; `0018` — D1 nonce ledger and aggregate signature audit; `0019` — durable lead-ingestion idempotency by `event_id`. Admin setup details: `docs/ADMIN_CONTROL_CENTER_SETUP.md` and `docs/ADMIN_SETUP_V2.md`.

Keep `TRACKING_SIGNATURE_MODE=monitor` until a trusted server-side client actually signs requests. A public browser bundle cannot safely contain the shared HMAC secret. `enforce` is appropriate only after production signature telemetry shows valid signed requests and D1 migration `0018` is active.

Local checks and the admin diagnostics prove what the application attempted and what the Meta API returned. Production delivery and Pixel/CAPI deduplication are not considered verified until the deployed event is also visible in Meta Events Manager.

## Analytics events

- Page view on every route change (including future pages added to router): `virtual_pageview` (dataLayer), `gtag('config', ..., { page_path })`, `ym(..., 'hit', path)`
- Lead form success: `generate_lead`, `form_submit`, `lead_submitted`
- Thank-you page conversion: `thank_you_page_view`


## Admin upload security

Admin uploads are stored in the `BUCKET` R2 binding and served through `R2_PUBLIC_HOST`. Uploads are limited to 15 MB and allow only common image/document formats: JPEG, PNG, WebP, GIF, AVIF, PDF, ZIP, DOCX, XLSX, and PPTX. SVG, HTML, JavaScript, XML, and unknown MIME types are intentionally blocked to reduce phishing and XSS risk.

The admin password is sent in the request body/header, not in the URL query string.
