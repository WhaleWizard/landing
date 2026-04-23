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

## SEO endpoints

- `GET /sitemap.xml` — dynamic sitemap from JSONBin
- `GET /feed.xml` — RSS feed for fast discovery
- `GET /blog/:slug` — bot-aware SEO HTML on edge

## Analytics events

- Page view on every route change (including future pages added to router): `virtual_pageview` (dataLayer), `gtag('config', ..., { page_path })`, `ym(..., 'hit', path)`
- Lead form success: `generate_lead`, `form_submit`, `lead_submitted`
- Thank-you page conversion: `thank_you_page_view`