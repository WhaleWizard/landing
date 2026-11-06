---
name: desktop-startup-forensics
description: Deep desktop cold load diagnostics, browser performance tracing, JavaScript execution profiling, React mounting forensics, LCP critical path decomposition, and network waterfall analysis.
---

# Desktop Startup Forensics (`desktop-startup-forensics`)

Operational skill for investigating and resolving slow desktop startup, heavy cold visits, initial bundle evaluation overhead, main-thread blocking, and render delays on desktop viewports.

## Core Forensics Vectors
1. **Cold Load Decomposition**:
   - Navigation Start -> TTFB -> First Paint -> FCP -> Hero Mount -> LCP -> Interactive (TBT).
   - Evaluate cache state: completely empty HTTP/storage cache vs warm repeat visits.
2. **Critical Path & Waterfall**:
   - HTML document response -> CSS stylesheets -> Main JavaScript bundles -> Web fonts -> Critical images -> API calls.
   - Elimination of serial request waterfalls and redundant preloads.
3. **JavaScript Execution & React Lifecycle**:
   - Parse & Compile times for initial bundles.
   - Long Tasks (>50ms) before and after FCP/LCP.
   - Provider cascading, unnecessary re-renders, expensive synchronous effects in root layout.
   - Verification that admin or route-specific dependencies are NOT bundled into public routes.
4. **Desktop Viewport Matrix**:
   - `1024x768`, `1280x720`, `1366x768`, `1440x900`, `1536x864`, `1920x1080`, `2560x1440`.
5. **Animation & GPU Compositing**:
   - Initial layout recalculation cost vs GPU acceleration.
   - Hero background effects, backdrop filters, complex SVG rendering cost.

## Acceptance Gates
- **Root Cause Verified**: Causal trace links delay to specific module/function/DOM node.
- **Measured Improvement**: Before/after trace confirms reduction in blocking time or transfer.
- **Design Preserved**: Visual appearance, effects, and branding remain completely intact.
- **Zero Functional Regression**: Navigation, interactive CTA, forms, and admin features function seamlessly.
