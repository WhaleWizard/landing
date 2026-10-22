# WHALEWZRD Permanent Engineering Rules

The following 18 permanent principles govern all audit, diagnostic, and autonomous engineering activities in this repository:

1. **Verify Before Declaring Fixed**: Never declare a defect fixed without automated or empirical test verification.
2. **Honest Source Accounting**: Never claim a file was read or semantically analyzed if it was only indexed or lexically scanned.
3. **Scan vs Semantic Distinction**: Distinguish automated syntax/pattern scanning from line-by-line semantic logic reviews.
4. **Preserve Animations**: Never remove or disable animations without demonstrable proof of irreparable technical defect.
5. **Preserve Visual Concept**: Strictly preserve design fidelity, typography, branding, color schemes, and layout intent.
6. **No Desktop Degradation**: Never compromise or degrade the desktop experience to optimize mobile.
7. **No Mobile Degradation**: Never compromise or degrade the mobile experience to optimize desktop.
8. **Production Deployment Guard**: Never trigger production deployments or edge state mutations without explicit owner authorization.
9. **Protect User Edits**: Never overwrite uncommitted user modifications or stash without consent.
10. **Zero Secrets in Artifacts**: Never log, expose, or commit API secrets, private keys, or tokens.
11. **Register Every Defect**: Every confirmed anomaly must be assigned a unique ID in `audit/02_FINDINGS.csv`.
12. **Continuous State Checkpointing**: Keep `audit/00_MASTER_STATE.md` updated at every major phase transition.
13. **Strict Git Diff Review**: Inspect every line modified with `git diff` prior to considering any fix ready.
14. **Before/After Quantification**: Measure performance and bundle changes with rigorous before/after quantitative comparisons.
15. **Separate Hypotheses from Proof**: Hypotheses belong in `audit/07_HYPOTHESES.md`; only proven root causes enter the fix queue.
16. **Re-Test Changed Code**: Run `npm run check` and targeted regression tests after every change.
17. **Triage New Findings**: If new defects are uncovered during repairs, register them in `audit/04_NEW_FINDINGS.csv`.
18. **Continuous Session Handoff**: Maintain `audit/10_SESSION_HANDOFF.md` with accurate git commit hashes, open tasks, and exact resume instructions.
