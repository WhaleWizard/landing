---
name: audit-rca
description: Systematic Root Cause Analysis (RCA) for bugs, hydration discrepancies, layout shifts, network failures, and edge Pages Functions anomalies.
---

# Root Cause Analysis & Anomaly Investigation (`audit-rca`)

Use this skill when diagnosing obscure bugs, intermittent test failures, hydration mismatches, memory leaks, or unhandled exceptions in the client or Cloudflare Pages Functions.

## 5-Step RCA Methodology

### 1. Failure Characterization & Deterministic Reproduction
- Document exact URL, viewport, user-agent, network conditions, and local/production divergence.
- Create an isolated reproduction test in `scripts/` using Node's native test runner (`node --test ...`) or Playwright.

### 2. Differential DOM & State Inspection
- Compare generated static HTML (`dist/*.html`) with hydrated browser DOM.
- Identify the exact diff: tag mismatch, missing text node, mismatched attribute, or dynamic time/locale calculation.

### 3. Edge Function & D1 Binding Diagnostics
- In `functions/`: verify error handling contracts:
  - If D1 is unavailable or missing migration: ensure the endpoint returns structured 503 explanation rather than unhandled 500.
  - Test retry idempotency: verify lead submissions handle network retries without creating duplicate CRM records.

### 4. Memory Profiling & Event Listener Leaks
- Check for lingering `setInterval`, unremoved `window.addEventListener('scroll')` or `resize`, and uncancelled animation frames.
- Verify React hook cleanup functions in `useEffect` and `useLayoutEffect`.

### 5. Hypothesis Validation Prior to Patching
- Formulate a testable hypothesis.
- Prove the hypothesis by failing a targeted test first, then verifying that only the minimal root fix resolves the failure without touching unrelated files.

## Verification Checklist
- [ ] Minimal reproduction script created and verified failing before fix.
- [ ] Root cause verified (not merely treating symptoms with `setTimeout` or `try/catch` suppression).
- [ ] All 45+ regression suites pass post-remediation.
