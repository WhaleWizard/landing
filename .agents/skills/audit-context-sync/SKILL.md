---
name: audit-context-sync
description: Session continuity, state synchronization, audit ledger management (00_MASTER_STATE, findings, fix queue), and seamless context handoff between sessions.
---

# Session Continuity & Context Synchronization (`audit-context-sync`)

Use this skill to persist findings, track execution phases, synchronize state registries, and guarantee zero loss of context between agent turns and developer sessions.

## Master Audit Ledgers

All audit records live in the `audit/` and `docs/handoff/` directories:

1. **`audit/00_MASTER_STATE.md`**
   - Single source of truth for the active audit phase, git commit, pass/fail metrics, and system status.
   - Must be updated at the conclusion of every milestone.

2. **`audit/02_FINDINGS.csv`**
   - Master list of all identified issues, anomalies, bottlenecks, and security gaps.
   - Schema: `ID,Category,Severity,Component,File,Line,Description,Status,RemediationDate`

3. **`audit/03_FIX_QUEUE.csv`**
   - Prioritized queue of fixes ready for implementation, ordered by impact and safety.

4. **`audit/06_VERIFICATION_MATRIX.csv`**
   - Quantitative results across all viewports, network profiles, and test runs.

5. **`docs/handoff/README.md`**
   - High-level handoff summary for the project owner. Update the "Где мы сейчас" section at the end of each session.

## Handoff Protocol
1. Verify working directory state (`git status`).
2. Run `npm run check` to ensure baseline integrity.
3. Record new findings into `audit/02_FINDINGS.csv`.
4. Update phase and quantitative metrics in `audit/00_MASTER_STATE.md`.
5. Summarize completed actions and define immediate next steps in `docs/handoff/README.md`.
