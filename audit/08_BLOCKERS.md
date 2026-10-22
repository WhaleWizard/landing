# TECHNICAL BLOCKERS & ENVIRONMENT CONSTRAINTS

## Active Blockers
*None. All critical (P0) and high (P1) issues identified across Desktop, Mobile, Infrastructure, Hero Animations, and Edge Security are fully resolved and verified.*

## Environment & Testing Constraints
1. **Real Physical iOS / Safari Devices**:
   - Status: SIMULATED / EMULATED via Playwright WebKit 18.2 running on Windows.
   - Limitation: Real mobile Safari has specific dynamic address bar collapse/expand behaviors and iOS thermal throttling that can only be measured on physical hardware.
   - Mitigation: WebKit rendering engine and touch event emulation passed 100% of tests.
2. **Production D1 / R2 Direct Mutation**:
   - Status: GUARDED BY DESIGN.
   - Limitation: Local audit tests run against mock/local SQLite schema and build snapshots (`data/*.build.json`) to prevent accidental destruction of live client leads and CRM data.
   - Mitigation: Real D1 schema migrations are verified via `scripts/admin-migrations.test.js` against authentic SQLite engines.
