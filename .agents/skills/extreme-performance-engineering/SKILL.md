---
name: extreme-performance-engineering
description: Full-stack performance forensics, low-bandwidth survival, multi-device stress testing, Lighthouse 95+ optimization, Core Web Vitals diagnostics, and zero-regression autonomous tuning for WHALEWZRD.
---

# Extreme Performance Engineering (`extreme-performance-engineering`)

Master engineering protocol for deep performance forensics, extreme network and device stress testing, and zero-regression autonomous optimization across WHALEWZRD (Desktop, Mobile, Tablet, All Routes, Admin, Frontend, Backend, CDN).

## Principles & Non-Negotiables
1. **First Visit is King**: Optimize for a new visitor arriving via an ad/external link with cold cache, unprimed DNS, uncompiled JS, and low bandwidth.
2. **True Performance vs Score Gaming**: No synthetic tricks, no user-agent cloaking, no stripping animations or functionality just for Lighthouse, no artificial delayed loading that harms real UX.
3. **Multi-Tiered Acceptance**:
   - **Level A (Standard Lighthouse)**: Target >= 95 Desktop & Mobile under reproducible lab conditions.
   - **Level B (Real User Experience)**: LCP p75 <= 2.5s, INP p75 <= 200ms, CLS p75 <= 0.1.
   - **Level C (Extreme Network Survival)**: Graceful degradation, early meaningful heading/CTA availability, zero crashes, zero blank screen loops on 100-400 Kbps high-latency networks.
4. **Preserve Visual & Functional Integrity**: All hero animations, gradients, typography, CMS flexibility, tracking/Meta CAPI correctness, and forms must remain fully operational.

## Diagnostic Protocol & Methodologies

### 1. Baselines & Profiling
- **Headless Lab Testing**: Lighthouse CLI (`npx lighthouse` / `npx lhci`) with 5 repeated runs per route, calculating median, min, max.
- **CDP Profiling via Playwright**:
  - Emulate CPU throttling (2x, 4x, 6x).
  - Emulate Network profiles: Unrestricted, Good Mobile (10M/5M/40ms), Moderate (3M/1M/100ms), Slow 4G (1.6M/750K/150ms), Very Slow Mobile (400K/200K/300ms), Severe Congestion (200K/100K/500ms), Extreme Edge (100K/50K/800ms).
  - Capture Chrome Performance Traces (`trace.json`) and Network Waterfalls.
- **Hydration & SSR Verification**: Verify zero client-side hydration fallback warnings (`[app] hydration fell back to client render`), zero React error #418, #421, #422.

### 2. Forensic Breakdown of LCP
Decompose LCP into 4 components:
1. **TTFB (Time to First Byte)**: Server/Cloudflare Pages edge latency, TLS, redirect elimination.
2. **Resource Load Delay**: Time until LCP resource (hero image / font / text) discovery by the browser parser.
3. **Resource Load Duration**: Transfer size, format (WebP/AVIF/WOFF2), responsive srcset, priority hints (`fetchpriority="high"`).
4. **Element Render Delay**: Main-thread blocking, opacity/animation delays, React mount duration, font-swap layout shifts.

### 3. Hero & Critical Rendering Path
- Critical text rendered in static HTML pre-render shell (`data-ww-first-screen`).
- Hero animation delays structured to never block readability (`opacity: 1` guaranteed on fallback, accessible text pre-painted).
- Avoid chaining layout-dependent observers or synchronous `useEffect` state cascades before initial paint.

### 4. Code Splitting & Bundle Hygiene
- Main entry chunk strictly isolated from admin modules (`react-dnd`, `lucide-react/icons-admin`, `Admin*.js`).
- Route-level lazy loading for sub-pages and non-critical dialogs.
- Critical CSS inlined/bundled cleanly without blocking font cascades.

### 5. Continuous Verification & Safety
- Execute complete `npm run check` after every code change.
- Perform visual diff checking and a11y testing (`npm run audit:a11y`).
- Maintain updated logs in `audit/extreme-performance/`.
