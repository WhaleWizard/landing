---
name: performance-investigator
description: Cold/warm load analysis, Core Web Vitals (LCP, FCP, CLS, INP, TBT), main-thread profiling, network waterfall inspection, and bundle chunk analysis.
---

# Performance Investigator (`performance-investigator`)

Use this skill to investigate cold/warm load latencies, bottlenecks in the critical rendering path, Core Web Vitals compliance, and Vite production bundle distribution.

## Procedures

1. **Core Web Vitals & Load Benchmarks**
   - Measure against performance budgets:
     - Largest Contentful Paint (LCP) ≤ 2.5s (Target p75)
     - Cumulative Layout Shift (CLS) ≤ 0.1
     - Interaction to Next Paint (INP) ≤ 200ms
     - First Contentful Paint (FCP) ≤ 1.8s
     - Total Blocking Time (TBT) ≤ 200ms
   - Evaluate runs under controlled throttling profiles:
     - Desktop Unthrottled
     - Mobile Slow 4G / CPU 4x Throttled
     - Severe Connection / Network Flapping

2. **Lighthouse CI & Synthetic Profiling**
   - Execute headless Lighthouse audits against `dist/`:
     `npm run audit:lhci`
   - Extract filmstrip frames and pinpoint LCP element candidate.

3. **Production Bundle Forensics**
   - Build bundle visualizer map:
     `npm run audit:analyze`
   - Inspect `dist/stats.html` for:
     - Initial vendor chunk vs route chunks.
     - Presence of admin modules in public bundles.
     - Duplicate packages across chunks.
     - Heavy third-party dependencies (e.g. icons, canvas confetti, date helpers).

4. **Critical Path & Deferral Audit**
   - Verify `DeferredSection` `rootMargin` settings (350px mobile, 800px desktop).
   - Verify `sectionWarmup.ts` sequential scheduling (80ms idle slices).
   - Ensure render-blocking CSS/JS are minimized and early hints match resource credentials.
