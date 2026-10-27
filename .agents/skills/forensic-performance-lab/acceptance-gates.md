# Acceptance Gates Protocol

Every performance optimization must pass all five gates before being marked as `VERIFIED`:

## Gate A — Causal Evidence
The bottleneck was measured and proven to restrict performance (e.g. blocking main thread, delaying critical request).

## Gate B — Correctness
The change is architecturally clean, adheres to React/TypeScript standards, and introduces no antipatterns.

## Gate C — Measured Improvement
Statistically significant improvement measured under identical lab conditions (e.g. FCP, LCP, TBT reduction).

## Gate D — No Functional Regression
All forms, CTA buttons, navigation, admin dashboard, analytics, and consent gates function without defects.

## Gate E — No Visual Regression
Design integrity, typography, animations, responsive layouts, and branding remain intact across viewports.
