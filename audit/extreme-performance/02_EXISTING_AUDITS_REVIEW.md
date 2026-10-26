# Review of Existing Audits & Baselines

## 1. Prior Audit Artefacts Reviewed
- `audit/performance/PERFORMANCE_REPORT.md` (Generated 2026-10-23T06:59:03Z)
- `audit/qa/VIEWPORT_QA_REPORT.md` (364 automated tests, 0 overflow)
- `audit/00_MASTER_STATE.md`, `audit/02_FINDINGS.csv`, `audit/04_NEW_FINDINGS.csv`
- `docs/handoff/README.md`

## 2. Key Insights from Previous Baselines
1. **LCP & Hydration Stability**:
   - Desktop LCP ranged from 108ms (`/blog/`) to 1708ms (`/`).
   - Mobile Moto G4 LCP ranged from 212ms (`/cases/`) to 840ms (`/meta-apps/`).
   - All 16 tested routes exhibited **PASS** on SSR hydration (0 hydration fallbacks, zero React #418/422).
2. **Identified Bottlenecks in Prior Runs**:
   - **TBT on Mobile (Moto G4 with 4x CPU slowdown)**:
     - `/blog/`: TBT 466ms (Target < 200ms)
     - `/cases/`: TBT 475ms (Target < 200ms)
     - `/faq/`: TBT 395ms (Target < 200ms) - 2,821 DOM nodes in accordion blocks
   - **Console Errors in Prior Runs**:
     - 1 console error noted on `/`, `/blog/`, `/cases/` during headless measurement (needs exact stack trace verification).
   - **Visual and Layout Stability**:
     - CLS across all routes was 0.0000 - 0.0001 (excellent visual stability).
     - Hero animation quantum time bug (MOB-HERO-001) and multiline sync (MOB-HERO-002) previously resolved.

## 3. Scope for Deepening Investigation in v6.0
- Previous tests used simple static server without network throttling (only 4x CPU slowdown).
- Extreme network profiles (Slow 4G, 400 Kbps, 200 Kbps, 100 Kbps) were not systematically tested across all routes.
- Cold cache vs Warm cache comparison was not formalized.
- Hero element render delays under low-bandwidth network waterfalls need precise sub-millisecond breakdown.
