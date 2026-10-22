# PRODUCTION BASELINE AUDIT REPORT

## Host & Routing Architecture
- **Canonical Domain:** `https://www.whalewzrd.com`
- **Redirect Rule:** `https://whalewzrd.com/*` -> `301 Moved Permanently` -> `https://www.whalewzrd.com/*`
- **Edge CDN:** Cloudflare Pages Functions + Cloudflare Edge CDN
- **Security Headers:**
  - `Content-Security-Policy`: Script hashes and whitelisted domains (`https://connect.facebook.net`, `https://www.googletagmanager.com`, etc.)
  - `Strict-Transport-Security`: `max-age=31536000; includeSubDomains; preload`
  - `X-Content-Type-Options`: `nosniff`
  - `X-Frame-Options`: `DENY`
  - `Referrer-Policy`: `strict-origin-when-cross-origin`
- **Static Pre-render Markers:**
  - `data-ww-first-screen`: Set on `<html>` (`/`, `/meta-ads/`, `/meta-apps/`, `/google-ads/`, `/consult/`)
  - `data-ww-prehydrate="1"`: Pauses CSS loop animations prior to hydration release
  - `#root`: Carries pre-rendered React application tree
  - `#ww-static-shell`: Bot and no-JS fallback shell, removed on `HydrationRelease` in `main.tsx`

## Baseline Metrics (Live Production, Unthrottled Fast)
| Route | Total Requests | Transferred KB | Cold Load (ms) | First Contentful Paint (ms) | Hydration Time (ms) | Console Errors |
|---|---|---|---|---|---|---|
| `/` | 18 | 398.2 | 750 | 280 | 110 | 0 (1 preload warning) |
| `/meta-ads/` | 16 | 382.4 | 690 | 260 | 95 | 0 (1 preload warning) |
| `/meta-apps/` | 16 | 379.8 | 680 | 255 | 92 | 0 (1 preload warning) |
| `/google-ads/` | 16 | 385.1 | 710 | 270 | 98 | 0 (1 preload warning) |
| `/consult/` | 15 | 365.2 | 640 | 240 | 90 | 0 (1 preload warning) |

*Note: The single console warning observed on all cold loads was the Early Hints credentials mode mismatch on the global CSS stylesheet (PROD-001).*

## Waterfall Sequence Analysis
1. **0-120ms:** Initial document request (`/` or route URL). Server responds with 200 OK + `Link` early hints header.
2. **120-250ms:** Parallel fetch of critical resources:
   - `/assets/index-[hash].css` (global layout styles)
   - Route-specific CSS (`cosmic-hero-[hash].css` or `MetaAdsEditorialHero-[hash].css`)
   - Preloaded fonts (`inter`, `onest`)
   - Critical LCP image (e.g. `whale.webp`)
3. **250-450ms:** Vite module scripts:
   - `/assets/index-[hash].js`
   - `/assets/vendor-[hash].js`
   - Route lazy chunks (`/assets/Home-[hash].js` or `/assets/ServiceLandingPage-[hash].js`)
4. **450-550ms:** React hydration release (`hydrateRoot` reconciles pre-rendered DOM, CSS animations unpause).
5. **Scroll Initiation:** `IntersectionObserver` triggers dynamic imports of below-the-fold sections (`Services`, `Cases`, `Testimonials`, `ContactForm`, `Footer`).
