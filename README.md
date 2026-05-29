# Сайт Whale Wzrd

This is a code bundle for Сайт Whale Wzrd. The original project is available at https://www.figma.com/design/xh1pMq4wWwnJgtEEnVJhnj/%D0%A1%D0%B0%D0%B9%D1%82-Whale-Wzrd.

## Running the code

Run `npm i` to install the dependencies.

Run `npm run dev` to start the development server.

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
- `INDEXNOW_KEY` (optional, for Bing/IndexNow instant URL notification)
- `INDEXNOW_ENDPOINT` (optional, defaults to `https://api.indexnow.org/indexnow`)
- `VITE_GTM_ID` (optional override, defaults to `GTM-T88BWXVV`)
- `VITE_GA_MEASUREMENT_ID` (optional override, defaults to `G-ZV18R9DLVC`)
- `VITE_YANDEX_METRIKA_ID` (optional override, defaults to `108699980`)
- `VITE_META_PIXEL_ID` (optional, Meta Pixel ID for client build)
- `VITE_TIKTOK_PIXEL_ID` (optional, TikTok Pixel ID for client build)
- `DB` (D1 binding, optional while migrating)
- `USE_D1_ARTICLES` (`true` to read/write articles from D1, default `false`)


## Article freshness guard for production deploys

For production, keep `REQUIRE_FRESH_ARTICLES=true` so the build fails when JSONBin cannot be fetched. This prevents accidental deploys with stale `data/articles.build.json` or committed local fallback content.

Use `ALLOW_FALLBACK_BUILD=true` only as a temporary emergency override when you intentionally want to deploy code while JSONBin is unavailable. Remove it after the emergency deploy so fresh content is required again.

## SEO endpoints

- `GET /sitemap.xml` — dynamic sitemap from active articles storage
- `GET /feed.xml` — RSS feed for fast discovery
- `GET /blog/:slug` — bot-aware SEO HTML on edge

## D1 migration quick start (safe mode)

1. Create D1 database and bind it as `DB` in Pages.
2. Apply SQL migration from `migrations/0001_create_articles.sql`.
3. Keep `USE_D1_ARTICLES=false` and import data into `articles`.
4. Validate in preview/staging.
5. Switch `USE_D1_ARTICLES=true` in production.
6. After validation, you can deprecate `JSONBIN_*` variables.

## Analytics events

- Page view on every route change (including future pages added to router): `virtual_pageview` (dataLayer), `gtag('config', ..., { page_path })`, `ym(..., 'hit', path)`
- Lead form success: `generate_lead`, `form_submit`, `lead_submitted`
- Thank-you page conversion: `thank_you_page_view`
