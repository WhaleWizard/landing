---
name: audit-memory-manager
description: Session state continuity, checkpoints, finding ledgers, fix queues, source hash reconciliation, and seamless multi-turn handoffs.
---

# Audit Memory Manager (`audit-memory-manager`)

Use this skill to maintain synchronized audit ledgers, record defect findings, manage the fix queue, and enable seamless context recovery across AI sessions.

## Core Ledger Files in `audit/`

- `00_MASTER_STATE.md`: Real-time system snapshot, current phase, git commit, quantitative metrics.
- `01_MASTER_PLAN.md`: Full multi-phase audit plan and execution progress.
- `02_FINDINGS.csv`: Comprehensive bug register with unique IDs, categories, priorities, and root causes.
- `03_FIX_QUEUE.csv`: Prioritized queue of verified defects ready for repair.
- `04_NEW_FINDINGS.csv`: Secondary registry for discoveries uncovered during audit or repair loops.
- `05_CHANGELOG.md`: Detailed engineering log of every applied change with line references and rationale.
- `06_VERIFICATION_MATRIX.csv`: Test status across desktop, mobile, and browser engines.
- `07_HYPOTHESES.md`: Rigorous tracking of open, confirmed, and refuted hypotheses.
- `08_BLOCKERS.md`: Documented technical constraints, environment limitations, and blockers.
- `09_FINAL_REPORT.md`: Comprehensive final technical evaluation report.
- `10_SESSION_HANDOFF.md`: Exact recovery instructions and next actionable command for incoming sessions.

## State Reconciliation Protocol

1. Before starting a session: inspect `audit/00_MASTER_STATE.md` and `audit/10_SESSION_HANDOFF.md`.
2. When a defect is discovered: append an entry to `audit/02_FINDINGS.csv` and formulate hypothesis in `audit/07_HYPOTHESES.md`.
3. When root cause is verified: move entry to `audit/03_FIX_QUEUE.csv`.
4. When fix is committed: update `audit/05_CHANGELOG.md` and mark item `FIXED`/`VERIFIED` in `audit/02_FINDINGS.csv`.
5. Before ending a turn: synchronize `audit/00_MASTER_STATE.md` and `audit/10_SESSION_HANDOFF.md`.
