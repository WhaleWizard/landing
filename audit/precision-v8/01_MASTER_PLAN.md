# 01_MASTER_PLAN.md — Precision Engineering v8.0 Roadmap

## Phase 0: Verification & Baseline (CURRENT)
- [x] Verify Git status and run baseline `npm run check`.
- [x] Create dedicated skills: `mobile-typography-engineer`, `desktop-startup-forensics`.
- [x] Initialize `audit/precision-v8/` workspace and directories.
- [x] Create `03_DESIGN_LOCK.md`.
- [ ] Populate `04_ROUTE_MATRIX.csv` and `05_VIEWPORT_MATRIX.csv`.
- [ ] Capture pristine baseline screenshots across key viewports (Desktop & Mobile) in `screenshots/before/`.

## Phase 1: Mobile Typography Forensics (Task A)
- [ ] Audit Headings (H1–H6) on Mobile (320px, 360px, 375px, 390px, 393px, 412px, 414px, 430px, 480px, 640px, 767px).
- [ ] Audit Hero text splitting spans across all landing pages (`/`, `/meta-ads`, `/meta-apps`, `/google-ads`, `/consult`).
- [ ] Audit Cards, Badges, CTA buttons, and Form controls on narrow viewports.
- [ ] Detect text clipping, awkward orphans, unwanted line wrap explosion, and container horizontal overflow.
- [ ] Populate `06_MOBILE_TYPOGRAPHY.csv`.

## Phase 2: Desktop Performance Investigation (Task B)
- [ ] Analyze desktop cold load on production build (`dist/`).
- [ ] Capture Chrome Performance traces and network waterfalls for `/` and `/meta-apps`.
- [ ] Profile main-thread parsing, JavaScript compilation, evaluation, and React root hydration/commit times.
- [ ] Trace LCP decomposition (TTFB, Resource Load Delay, Resource Load Duration, Element Render Delay).
- [ ] Verify bundle splitting boundaries (confirm zero admin/editor leakage into public chunks).
- [ ] Populate `07_DESKTOP_PERFORMANCE.csv` and `10_ROOT_CAUSES.csv`.

## Phase 3: Visual Stability & Geometry Review (Task C)
- [ ] Check buttons, icons, padding, borders, shadows, and sticky header behavior.
- [ ] Test scroll performance, resize transitions, and modal dialogs.
- [ ] Populate `08_VISUAL_FINDINGS.csv` and `09_TECHNICAL_FINDINGS.csv`.

## Phase 4: Precision Fix Loop (Minimal Risk)
- [ ] Implement targeted fixes for verified root causes.
- [ ] Verify each fix with 5-Gate acceptance (Root Cause, Correctness, Measured Improvement, Design Preservation, Zero Functional Regression).
- [ ] Capture after screenshots in `screenshots/after/` and generate visual diffs.
- [ ] Run `npm run check` and regression tests.

## Phase 5: Adversarial Review & Final Verification
- [ ] Third-pass adversarial review for hidden regressions or subtle layout shifts.
- [ ] Compile `20_FINAL_REPORT.md` and `21_HANDOFF.md`.
