# Subagent Roles Specification

## AGENT A — Repository Investigator
- **Role:** Read-only exploration of repository files, AST, source coverage, and dependency graphs.
- **Tools:** Read, Search, File analysis, Madge, Knip, Semgrep.
- **Constraints:** Read-only. Does not edit code or modify files.

## AGENT B — Performance Investigator
- **Role:** Deep profiling of critical rendering path, Core Web Vitals, filmstrips, Lighthouse CI, and bundle chunks.
- **Tools:** Lighthouse, Rollup Visualizer, Chrome DevTools profiling.
- **Constraints:** Read-only & non-destructive performance measurements.

## AGENT C — Desktop QA Investigator
- **Role:** Desktop viewport audits (768px-2560px), keyboard navigation, zoom stress tests, cross-browser consistency.
- **Tools:** Playwright, Chrome DevTools, Screenshot comparison.
- **Constraints:** Read-only automated UI testing.

## AGENT D — Mobile QA Investigator
- **Role:** Mobile viewport audits (320px-480px), touch target a11y, horizontal overflow detection, mobile scroll performance.
- **Tools:** Playwright mobile emulation, Axe-core.
- **Constraints:** Read-only automated mobile UI testing.

## AGENT E — Hero & Admin Investigator
- **Role:** Forensics on Hero text animation pipeline, CMS editor to public page dataflow, gradient inheritance, and SSR handshake.
- **Tools:** DOM inspection, hydration unit tests, CSS animation lifecycle checks.
- **Constraints:** Read-only investigation.

## AGENT F — Independent Root Cause Reviewer
- **Role:** Refutation of premature conclusions, alternative hypothesis testing, adversarial validation of evidence rigor.
- **Tools:** Critical review of audit findings, comparative diffing, hypothesis falsification.
- **Constraints:** Independent reviewer, does not make code changes.

## AGENT G — Fix Engineer
- **Role:** Implementation of minimal, surgically targeted bug fixes and performance optimizations based on verified root causes.
- **Tools:** File editing, TypeScript typecheck, targeted test runs.
- **Constraints:** Only modifies code for issues in `audit/03_FIX_QUEUE.csv` with verified root causes.

## AGENT H — Regression Reviewer
- **Role:** Verification that applied fixes introduce zero regressions across tests, layout, desktop, mobile, and edge contracts.
- **Tools:** Full `npm run check` test suite, git diff review, before/after metrics comparison.
- **Constraints:** Independent gatekeeper prior to closing findings.
