---
name: audit-performance
description: Comprehensive web performance audits, Core Web Vitals (LCP, CLS, INP, FCP, TBT), Lighthouse CI profiling, Vite bundle chunk analysis, and network waterfall inspection.
---

# Audit Performance & Core Web Vitals (`audit-performance`)

Use this skill when profiling page load speed, debugging slow initial render, inspecting bundle size and chunk distribution, and verifying compliance with Core Web Vitals budgets.

## Performance Budgets & Targets
- **LCP (Largest Contentful Paint)**: < 2.5s (good) on 4G mobile
- **CLS (Cumulative Layout Shift)**: < 0.1 (target: 0.00)
- **FCP (First Contentful Paint)**: < 1.8s
- **TBT (Total Blocking Time)**: < 200ms
- **INP (Interaction to Next Paint)**: < 200ms

## Primary Tooling Suite

1. **Lighthouse CI (Reproducible Headless Audits)**
   - Run: `lhci collect --no-lighthouserc --staticDistDir dist --numberOfRuns 3`
   - Generates `.lighthouseci/lhr-*.json` and HTML reports.
   - Inspect audits:
     - `largest-contentful-paint-element`: identifies hero image, heading, or background container causing LCP delay.
     - `render-blocking-resources`: flags un-inlined or non-preloaded critical CSS.
     - `layout-shift-elements`: pinpoint exact DOM elements shifting during hydration.

2. **Vite Bundle Treemap & Chunk Profiling (Rollup Visualizer)**
   - Run: `$env:ANALYZE="true"; npx vite build; Remove-Item env:ANALYZE`
   - Open: `dist/stats.html`
   - Verify:
     - No admin dependencies (`lucide-react/icons-admin`, `react-dnd`, `Admin*.js`) leaking into public routes (`Home`, `ServiceLandingPage`, `BlogPage`).
     - Vendor chunk size (`react`, `react-dom`, `react-router`, `motion`) remains within gzip budgets (< 80 kB).

3. **Chrome DevTools MCP / Chrome Tracing**
   - Start tracing with Chrome DevTools MCP performance tools.
   - Profile Main Thread activity, Long Tasks (> 50ms), JS execution costs, and layout calculations during initial page mount.

## Verification Checklist
- [ ] No chunk leaking from admin interface to public bundles.
- [ ] LCP hero element preloaded in HTML via `<link rel="preload">` or native `data-ww-first-screen` SSR snapshot.
- [ ] Zero CLS during font loading (FOUT/FOIT prevented with `@fontsource-variable` local fallback definitions).
- [ ] Total Blocking Time on mobile emulation < 150ms.
