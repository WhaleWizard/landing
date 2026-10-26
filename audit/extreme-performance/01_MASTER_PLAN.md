# Extreme Performance Engineering — Master Plan (v6.0)

**Project:** WHALEWZRD (whalewzrd.com)  
**Execution Phase:** Three-Pass Autonomous Investigation & Optimization  

## Phase Overview

### PASS 1: Full Performance Forensics & Baseline Establishment
1. **Tooling & Environment Smoke Tests**: Verify Lighthouse CLI, Playwright CDP, Chrome DevTools, and local static server.
2. **Route Matrix & Inventory**: Map all 27 static and dynamic routes with their critical rendering path, LCP element, and bundle dependencies.
3. **Multi-Condition Baselines**:
   - Standard Desktop & Mobile (Moto G4 / 4x CPU throttle).
   - Cold Cache vs Warm Cache.
   - Throttled Network Matrix: Unrestricted, Good Mobile (10M/5M), Moderate (3M/1M), Slow 4G (1.6M/750K), Very Slow Mobile (400K/200K), Severe Congestion (200K/100K), Extreme Edge (100K/50K).
4. **Forensic Deep Dives**:
   - LCP decomposition: TTFB -> Resource Discovery -> Transfer -> Render.
   - Hero text and animation initialization: verify no delayed opacity / layout shift.
   - Main-thread long tasks & React hydration/mounting costs.
   - Network waterfall & resource priority hints (`fetchpriority`, `preload`).
   - Bundle chunk isolation: verify Admin code never leaks into public routes.

### PASS 2: Autonomous Root Cause Remediation & Stress Validation
1. Register verified bottlenecks in `20_BOTTLENECK_REGISTER.csv`.
2. Prioritize P0/P1 bottlenecks in `21_FIX_QUEUE.csv`.
3. Implement surgical, high-impact fixes with zero regression.
4. Execute `npm run check` and targeted browser verifications after every fix.
5. Record metrics before/after in `25_BEFORE_AFTER.csv` and `26_LIGHTHOUSE_95_TRACKER.csv`.

### PASS 3: Independent Adversarial Red-Team Audit & Stress Torture
1. Challenge all optimizations under extreme constraints:
   - 100-200 Kbps high-latency simulation.
   - Immediate user interaction during hydration / slow network.
   - Navigation under packet loss / HTTP failure simulations.
   - Memory leak & long-session route transitions.
2. Complete `27_STRESS_TEST_RESULTS.csv` and generate comprehensive `28_FINAL_REPORT.md`.
