# Forensic Engineering Master Plan v7.0

**Project:** WHALEWZRD (whalewzrd.com)  
**Environment:** Google Antigravity  
**Mode:** Autonomous Causal Forensic Performance Engineering  
**Primary Target:** Reproducible Lighthouse Performance >= 95 Desktop & Mobile across all 17 public routes.  
**Constraint:** Zero visual regressions, zero functional regressions, preserved tracking/CAPI security.

---

## 1. Phased Architecture & Execution Protocol

### Phase 0: Recovery & Inventory
- Recover previous audit artifacts, findings (NEW-001 through NEW-029), and fix queues (FIX-01 through FIX-22).
- Establish single source of truth in `audit/forensic-v7/`.

### Phase 1: Evidence Quality & Audit of Audits
- Verify claims from earlier optimization cycles against current code and disk assets.
- Generate `PREVIOUS_AUDIT_VALIDATION.csv` classifying claims as CONFIRMED_RESOLVED, PARTIALLY_RESOLVED, STILL_REPRODUCIBLE, or REGRESSED.

### Phase 2: Tool Readiness & Laboratory Validation
- Validate Node v25, Playwright v1.64, LHCI v13.5, and CDP protocol hooks.
- Establish static preview environment serving production pre-rendered `dist/` with gzip compression.

### Phase 3: Current Empirical Baseline
- Execute rigorous 17-route baseline across Mobile (Lantern 4G + 4x CPU throttle) and Desktop (Unrestricted).
- Record exact distributions in `07_BASELINE.csv`.

### Phase 4: Critical Path Graphing
- Construct end-to-end critical path for top landing pages (`/`, `/meta-ads/`, `/meta-apps/`, `/google-ads/`, `/consult/`).
- Map resource discovery timing, initial TCP congestion window (14.6 KB) usage, and blocking CSS/JS chains.

### Phase 5 & 6: Trace Forensics & Source Attribution
- Capture Playwright CDP performance traces (`Performance.enable`).
- Map trace events (Long Tasks, Recalculate Style, Layout Thrashing, Hydration Passes) to exact React components and bundles.
- Document in `13_SOURCE_HOTSPOTS.csv`.

### Phase 7: Multi-Variable Matrix (CPU x Network Stress)
- Test 6 network classes down to 100 Kbps / 800ms latency.
- Evaluate interaction between CPU throttling (4x, 6x) and high-latency networks.

### Phase 8 & 9: Causal Hypotheses & Controlled Experiments
- Isolate identified bottlenecks with targeted counterfactual experiments.
- Record in `08_HYPOTHESES.csv` and `09_EXPERIMENT_REGISTER.csv`.

### Phase 10 to 14: Root Cause Fixes & Acceptance Gates
- Implement minimal, surgical fixes passing all 5 Acceptance Gates (Causal Evidence, Correctness, Measured Improvement, No Functional Regression, No Visual Regression).
- Run full `npm run check` (46 test suites) after every single modification.

### Phase 15 to 21: Verification & Independent Adversarial Review
- 5 repeated runs per critical route for Lighthouse stability verification.
- Red-team adversarial review searching for hidden edge-case regressions or unoptimized waterfalls.
- Compile comprehensive `23_FINAL_REPORT.md` and session handoffs.
