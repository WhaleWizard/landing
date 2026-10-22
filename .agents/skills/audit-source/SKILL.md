---
name: audit-source
description: Static code analysis, dead code detection (Knip), circular dependency analysis (Madge), AST inspection, React hooks verification (ESLint), Semgrep security scanning, and character integrity checks across src/ and functions/.
---

# Audit Source Code & Static Architecture (`audit-source`)

Use this skill when auditing source files for dead code, unused exports, circular imports, syntax/type anomalies, React hook violations, and security vulnerabilities.

## Primary Tooling Suite

1. **Dead Code & Unused Exports (Knip)**
   - Run: `npx knip --no-exit-code --tsConfig tsconfig.app.json`
   - Scans for orphaned components, unused exported functions/types, duplicate exports, and missing or unlisted package dependencies.
   - Verify before deleting: check if an export is dynamically loaded by CMS or used across Pages Functions.

2. **Circular Dependency Detection (Madge)**
   - Run: `npx madge --circular --extensions ts,tsx --ts-config tsconfig.app.json src/main.tsx`
   - Identifies import cycles that cause bundle bloat, initialization race conditions, or undefined module exports during SSR hydration.

3. **React Hooks Integrity (ESLint Flat Config)**
   - Run: `npx eslint src/`
   - Enforces `react-hooks/rules-of-hooks` (order and call invariants) and `react-hooks/exhaustive-deps` (stale closures in effects and callbacks).

4. **Static Security & Vulnerability Scanning (Semgrep)**
   - Run: `semgrep scan --metrics=off --config p/javascript src/ functions/`
   - Detects unsafe HTML injections, unescaped regexes, dangerous prototype mutations, missing CSRF/origin checks, and insecure storage operations.

5. **Character Integrity & Hidden Anomaly Scans**
   - Run: `node scripts/audit-regressions.test.js` and AST checks.
   - Guard against invisible zero-width spaces, UTF-8 BOM byte mismatches, or malformed unicode in marketing copy and translations.

## Verification Checklist
- [ ] No high/critical findings in Semgrep.
- [ ] All circular dependencies in `src/` documented or decoupled via lightweight interfaces.
- [ ] Knip report analyzed: true dead code distinguished from CMS seed models.
- [ ] Zero unhandled React Hook violations.
