# PRODUCTION VS LOCAL ENVIRONMENT DELTA ANALYSIS

## Summary of Differences
A critical directive of this audit is that **LOCAL PASS ≠ PRODUCTION PASS**. The following discrepancies were identified between the local development environment (`npm run dev` / `npx vite`) and the live production environment (`https://www.whalewzrd.com` on Cloudflare Pages):

| Dimension | Local Dev (`vite dev`) | Production Build (`vite build` + `generate:pages`) | Live Production (`whalewzrd.com`) | Impact & Findings |
|---|---|---|---|---|
| **Early Hints** | Not emitted (Vite dev server) | Generated in `dist/_headers` | Emitted by Cloudflare Pages Edge (103 Early Hints) | **PROD-001**: Lacked `crossorigin` attribute in `_headers`, causing double-fetch in live browsers. Invisible locally. |
| **CSS Bundling** | Injected via `<style>` tags via Vite HMR | Extracted into hashed `.css` files (`index-[hash].css`, `cosmic-hero-[hash].css`) | Served over HTTP/2 with Cloudflare Edge compression | CSS load order and render-blocking characteristics differ significantly from dev mode. |
| **Hero Title Accent** | Looked fine with `effect: none` | Evaluated statically with pre-render HTML | Rendered invisibly when animated with `words` or `typewriter` on WebKit / Chrome mobile | **PROD-002**: Isolated stacking context caused `color: transparent` to hide words. |
| **Network Interruption on Scroll** | Fast local loopback (0ms latency, 0 packet loss) | N/A unless throttled | Real mobile cellular drops, tunnel disconnections | **PROD-003**: In local dev, chunks always load instantly. On live mobile networks, temporary packet loss caused full route crash. |
| **Hydration Handoff** | Client-only render (`createRoot`) | SSR entry pre-renders DOM into HTML | `hydrateRoot` in `main.tsx` reconciles existing DOM | Pre-hydration CSS freeze (`data-ww-prehydrate`) is unique to production pipeline. |
| **API Endpoints** | Mocked or local D1 SQLite proxy | Cloudflare Pages Functions emulated via Wrangler (optional) | Cloudflare Pages Functions with live D1, R2, and KV bindings | Edge functions execute in V8 isolate with strict subrequest limits. |
