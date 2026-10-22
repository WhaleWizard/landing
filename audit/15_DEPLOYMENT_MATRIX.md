# DEPLOYMENT & PIPELINE MATRIX

## Repository & Branch Configuration
- **Repository Remote:** `https://github.com/WhaleWizard/landing.git`
- **Default & Production Branch:** `main`
- **Audit Target Commit:** `3303c0036a3a29fd1cd91a186052605652de203e`
- **Production Host Platform:** Cloudflare Pages
- **Build Command:** `npm run build` (`npm run fetch:articles && npm run optimize:images && vite build && npm run generate:pages`)
- **Output Directory:** `dist`

## Edge Bindings & Integrations
| Binding Name | Type | Purpose | Production Configuration |
|---|---|---|---|
| `DB` | D1 Database | Content management, articles, lead storage, CRM, audit logs | `landing-db` (Production D1 instance) |
| `BUCKET` | R2 Bucket | Uploaded images, WebP variants, snapshot backups | `landing-assets` |
| `KV` | KV Namespace | Rate limiting, session caches, emergency article seeds | Cloudflare KV |
| `META_CAPI_TOKEN` | Secret | Meta Conversions API authentication token | Managed Secret |
| `META_PIXEL_ID` | Secret | Meta Pixel identifier for CAPI events | Managed Secret |
| `ADMIN_PASSWORD` | Secret | SHA-256 / 2FA secret for admin console | Managed Secret |

## Asset Hashing & Cache Policies
| Route / Pattern | Cache-Control Header | Invalidation Strategy |
|---|---|---|
| `/assets/*` | `public, max-age=31536000, immutable` | Content hash in filename (Vite Rollup output) |
| `/images/*` | `public, max-age=86400, stale-while-revalidate=604800` | SWR caching with WebP optimization manifest |
| `/fonts/*` | `public, max-age=31536000, immutable` | Versioned font library hash |
| `/*.html` | `public, max-age=0, must-revalidate` | Always validates with Cloudflare Pages Edge |
| `/api/*` | `no-store, no-cache, must-revalidate` | Pages Functions with strict X-Robots-Tag: noindex |
