# Forensic Engineering Blockers & Dependencies Ledger v7.0

## Active Blockers
- **None.** All 17 production routes compile cleanly, hydrate without invariant violations or console warnings, and meet or exceed all performance thresholds.

## Historical Blockers Resolved During Investigation
1. **Render-Blocking CSS Waterfall on `/cases/`**:
   - *Impact*: Delayed FCP and LCP by > 1000ms on mobile Lantern 4G simulation, capping mobile score at 87.
   - *Resolution*: Inlined and consolidated `cases-finder.css` into primary stylesheet bundle `index.css`.
2. **React SSR/Hydration Invariant Mismatch #425**:
   - *Impact*: Fatal hydration failure causing full DOM teardown and recreation on client mount.
   - *Resolution*: Converted adjacent string literals and JSX variables into atomic ES6 template literals.
3. **Headline Layout Shift (CLS 0.1489) on 412px Viewports**:
   - *Impact*: Layout shift violating CWV threshold (> 0.10).
   - *Resolution*: Calibrated fluid typography clamp bounds to ensure static and dynamic line-wrap parity.
4. **Curated Case Study Hero Preload Gap**:
   - *Impact*: Case study cover WebP assets were not preloaded in HTML `<head>`, adding 1 network RTT to LCP.
   - *Resolution*: Extended `scripts/generate-pages.js` with static preload resolution table.

## Environmental & External Dependencies
- Node.js v25.9.0 + pnpm 12.15.0
- Playwright v1.64.1 + Chromium headless
- Lighthouse CLI v13.5.0
- Cloudflare Pages Functions edge runtime
