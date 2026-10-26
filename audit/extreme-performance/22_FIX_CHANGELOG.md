# FIX CHANGELOG — Extreme Performance Engineering v6.0

## FIX-01: Sequential Idle Deferral of Section Warming (`sectionWarmup.ts`)
- **Root Cause**: `autoWarmTimer` was firing aggressively at 1200ms after page mount, requesting 7 dynamic JS chunks (`Services`, `Cases`, `CallToAction`, `Testimonials`, `LandingForm`, `select` 25KB, `Footer`) directly during the critical Hero LCP measurement window.
- **Architectural Repair**:
  - Increased `autoWarmTimer` from 1200ms to 3500ms, ensuring complete quietness and dedicated network pipe during the above-the-fold paint phase.
  - Added `navigator.connection?.saveData` awareness: when Data Saver is enabled by the user, automated warming is omitted, conserving battery and data.
  - Preserved instant zero-delay warming upon explicit visitor interaction (`scroll`, `wheel`, `touchstart`, `keydown`, `pointerdown`).
- **Impact**: Eliminated background network contention during LCP; dropped Home mobile TBT from 108ms to 20ms (-81.5%).

---

## FIX-02: Scoped Preload Priority for Whale Hero Asset (`generate-pages.js`)
- **Root Cause**: In `HERO_PRELOADS['/']`, `whale.webp` (148 KB desktop asset) was marked with unconditional `priority: true` without a media query. This caused two simultaneous `fetchpriority="high"` image preloads on mobile screens (`sky-compact.webp` 53 KB and `whale.webp` 148 KB), starving the actual mobile LCP element (`sky-compact.webp`, area 174,555 px²). Furthermore, the lack of `media` caused the 148 KB asset to be injected into Cloudflare's HTTP `Link` header, forcing mobile clients to download it before HTML parsing.
- **Architectural Repair**:
  - Maintained `whale.webp` in `HERO_PRELOADS['/']` for early hints compliance, but removed `priority: true` from the general tag so `sky-compact.webp` retains exclusive `fetchpriority="high"` on mobile.
  - Prioritized `sky-compact.webp` as the sole high-priority background image for viewports ≤ 900px.
- **Impact**: Home mobile LCP dropped from 5097ms to 4036ms (-1061ms / -20.8%); Lighthouse Mobile score jumped from 75 to 82 (+7 points).

---

## FIX-03: Primary Subset Font Preloading on Editorial Landings (`generate-pages.js`)
- **Root Cause**: `resolveHeroFontPreloads` automatically included Latin font subsets whenever ASCII letters or digits were detected in heading text (`/[A-Za-z0-9]/u.test(text)`). In predominantly Cyrillic editorial headlines featuring brand names (e.g. "Meta", "Instagram", "Facebook"), this forced an eager `<link rel="preload" as="font">` for the 74,986-byte Latin subset of decorative library fonts (e.g., Pangolin) in `<head>` at `VeryHigh` priority.
- **Architectural Repair**:
  - Refined `resolveHeroFontPreloads` to prioritize the primary `cyrillic` subset when Cyrillic characters are present.
  - Prevented redundant secondary Latin preloads of heavy library fonts while preserving Latin preloads for English titles and compact `hero/` directory fonts.
  - Secondary brand words swap smoothly via the non-blocking font library stylesheet with `font-display: swap`.
- **Impact**: Saved ~75 KB of critical high-priority font transfer on Cyrillic landing pages.

---

## FIX-04: Lossless-Quality Recompression of Consult Hero Assets (`desk-v-800.webp`, `desk-v.webp`)
- **Root Cause**: Consult studio vertical background images were encoded at unnecessarily high WebP quality settings, resulting in 251.8 KB for `desk-v-800.webp` (800x1200) and 426.1 KB for `desk-v.webp` (1200x1800), dominating the mobile network payload.
- **Architectural Repair**:
  - Re-encoded both images with `sharp` at WebP quality 82 with maximum compression effort (effort 6).
  - `desk-v-800.webp`: 251,812 bytes -> 170,426 bytes (-81.4 KB / -32.3%).
  - `desk-v.webp`: 426,150 bytes -> 373,910 bytes (-52.2 KB / -12.3%).
  - Preserved identical pixel dimensions, aspect ratio, and visual crispness.
- **Impact**: Saved 133.6 KB on mobile consult page loads; Consult mobile LCP reduced by 446ms.

---

## FIX-05: High-Fidelity Static Test Server Harness (`run-network-stress.mjs`)
- **Root Cause**: The audit test server previously served raw uncompressed files (183 KB CSS instead of 27 KB gzip; 236 KB JS instead of 77 KB gzip) and answered edge `/api/*` endpoints with the full 65 KB uncompressed `index.html` shell. Over low-bandwidth throttled connections (100–400 Kbps), this artificially inflated network transfer by 400%–500% compared to real Cloudflare Pages edge delivery.
- **Architectural Repair**:
  - Implemented dynamic `zlib` Gzip compression in `startStaticServer` for all text, CSS, JS, and JSON assets matching `Accept-Encoding: gzip`.
  - Added lightweight edge `/api/*` mock responder returning `{ ok: true }` in JSON instead of serving the full HTML root shell.
- **Impact**: Stress test transfers now faithfully reflect Cloudflare CDN edge behavior (~350–550 KB total initial page load over mobile networks).


---

## FIX-06: Compact Mobile Cosmic Sky LCP Re-encoding (`cosmicCompactImages.json`)
- **Root Cause**: `sky-compact.webp` was generated at 1400px width with quality 80, weighing 52,892 bytes. For mobile viewports (capped at `max-width: 900px` in CSS), 1400px was excessively wide, consuming unnecessary bytes on the single element identified by Lighthouse as the primary LCP for the homepage (`.cosmic-sky`).
- **Architectural Repair**:
  - Adjusted `backgrounds.sky` in `src/app/data/cosmicCompactImages.json` to width 1080px (providing 3x resolution for 360px phones and 2.7x for iPhone screens) and quality 78 with `effort: 6, smartSubsample: true`.
  - Re-generated `public/images/cosmic/sky-compact.webp` via `scripts/build-cosmic-compact-images.js`.
  - File size dropped from 52,892 bytes to 30,940 bytes (-21,952 bytes / -41.5% reduction).
- **Impact**: Reduced initial mobile hero LCP payload by 22 KB; first-screen SSR hydration and visual rendering tests pass 100%.

---

## FIX-07: MozJPEG Optimization for Google Ads Hero Portrait (`hero-portrait.jpg`)
- **Root Cause**: `/images/hero-portrait.jpg` (746x720) was encoded with 4:4:4 chroma subsampling at 77,114 bytes, serving as the render-blocking high-priority hero image for `/google-ads/`.
- **Architectural Repair**:
  - Re-encoded using `sharp` MozJPEG at quality 80 with progressive encoding.
  - File size dropped from 77,114 bytes to 44,841 bytes (-32,273 bytes / -41.8% reduction).
  - Preserved exact file format, name, URL, dimensions (746x720), and visual sharpness without code modification.
- **Impact**: Saved 32.3 KB of high-priority transfer on `/google-ads/`.

---

## FIX-08: Recompression of Consult Hero Scene Objects (`laptop.webp`, `notebook.webp`)
- **Root Cause**: Consult desk scene objects `notebook.webp` (700x582) and `laptop.webp` (720x693) weighed 123,976 bytes and 58,688 bytes respectively (total 182.7 KB).
- **Architectural Repair**:
  - Re-encoded with `sharp` at WebP quality 80 with effort 6.
  - `laptop.webp`: 58,688 bytes -> 48,616 bytes (-10,072 bytes / -17.2%).
  - `notebook.webp`: 123,976 bytes -> 108,178 bytes (-15,798 bytes / -12.7%).
  - Saved 25.8 KB across consult scene assets.
- **Impact**: Combined with FIX-04 (`desk-v-800.webp`), Consult mobile LCP dropped from 6315ms to 5487ms (-828ms reduction).
