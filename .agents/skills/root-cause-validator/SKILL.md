---
name: root-cause-validator
description: Systematic Root Cause Analysis (RCA), distinguishing symptoms from proven root causes, testing alternative hypotheses, and verifying evidence rigor.
---

# Root Cause Validator (`root-cause-validator`)

Use this skill to perform strict 5-stage Root Cause Analysis on all identified anomalies before any code modification is attempted.

## The 5-Stage RCA Protocol

1. **Symptom Characterization & Blast Radius**
   - Record exact observable behavior, reproduction steps, affected routes, viewports, and browser engines.
   - Separate symptom description from assumed causes.

2. **Hypothesis Formulation & Alternative Explanation**
   - Formulate at least two competing hypotheses explaining the defect.
   - Record them in `audit/07_HYPOTHESES.md` with:
     - Hypothesis ID
     - Theoretical mechanism
     - Supporting evidence
     - Conflicting evidence
     - Test method to refute or confirm

3. **Empirical Isolation & Evidence Gathering**
   - Execute controlled test (e.g. minimal reproduction script, AST probe, CSS rule isolation, or trace breakpoint).
   - Document quantitative or photographic proof in `audit/evidence/`.

4. **Mechanistic Confirmation**
   - Trace exact file path and line numbers where incorrect state, invalid calculation, or CSS override occurs.
   - Confirm why the system behaved that way and why the issue was not caught previously.

5. **Fix Proposal & Side-Effect Evaluation**
   - Design minimal, targeted fix.
   - Evaluate potential blast radius on desktop, mobile, SSR hydration, and tracking contracts.
