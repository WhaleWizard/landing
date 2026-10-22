---
name: cloudflare-delivery-audit
description: Cloudflare Pages Functions, routing middleware, 301/308 redirects, security headers, edge caching, and CDN asset delivery.
---

# Cloudflare Delivery Audit (`cloudflare-delivery-audit`)

Use this skill to audit edge routing, Pages Functions middleware, security headers, CDN caching policies, and early hints delivery.

## Key Edge Invariants

1. **Edge Middleware & Routing Policy (`functions/_middleware.ts`)**
   - Canonical redirect: enforces `https://www.whalewzrd.com` (301 permanent redirect from apex).
   - Strict trailing slash enforcement: public routes canonicalized to trailing slashes to avoid edge 308 redirect loops.
   - Bot detection: `isBotUserAgent` correctly recognizes Googlebot, AdsBot-Google, and Google-InspectionTool to deliver complete SEO SSR HTML.

2. **Security & Header Compliance**
   - Content-Security-Policy (CSP) headers properly defined without `unsafe-eval` in public views.
   - `X-Frame-Options: SAMEORIGIN` / `frame-ancestors` preventing clickjacking.
   - `X-Robots-Tag: noindex, nofollow` on `/api/*` administrative endpoints.

3. **Asset Caching & Early Hints**
   - Static hashed assets (`/assets/*`) served with immutable long-term caching (`Cache-Control: public, max-age=31536000, immutable`).
   - HTML documents served with `Cache-Control: public, max-age=0, must-revalidate`.
   - 103 Early Hints link headers include `crossorigin` attribute matching the static HTML `<link rel="preload">` declaration to eliminate credential mismatch warnings in Chromium.
