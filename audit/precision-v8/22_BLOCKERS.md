# 22_BLOCKERS.md — Open Blockers & Invariants

## Active Blockers
- None currently. Environment is functional, all test suites pass, build and SSR generation succeed.

## Invariants & Design Constraints
1. **Design Lock Active**: Do not arbitrarily modify colors, typography hierarchy, font families, or remove animations.
2. **5-Gate Acceptance Active**: Every code change must have proven root cause and zero visual regression.
