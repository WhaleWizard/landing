---
name: repo-forensics
description: Complete repository inventory, source file indexing, character scanning, line counting, AST analysis, dependency graph, source hashes, and code quality findings.
---

# Repository Forensics (`repo-forensics`)

Use this skill for total repository forensics, source inventory verification, character-level anomaly detection, lexical AST parsing, and dependency mapping.

## Procedures

1. **Repository Inventory & File Ledger**
   - Track every file in the repository across `src/`, `functions/`, `scripts/`, `public/`, and configuration roots.
   - Maintain `audit/source/FILE_COVERAGE.csv` recording relative path, SHA-256 hash, byte count, line count, and character count.
   - Ensure zero unindexed source code files.

2. **Character & Lexical Integrity Scanning**
   - Run character integrity checks for:
     - UTF-8 validity and unexpected BOM markers.
     - Invisible Unicode, zero-width spaces (`\u200B`, `\u200C`, `\u200D`, `\uFEFF`).
     - Cyrillic/Latin homoglyph identifier confusion.
     - Escaped regex character bugs, invalid template string tokens, and unexpected line endings.
   - Output results to `audit/source/CHARACTER_INTEGRITY_REPORT.md`.

3. **AST & Static Code Quality Inspection**
   - Check TypeScript/JavaScript tokens, operators (`===`, `??`, `?.`), nullish coalescing, and ternary logic branches.
   - Run Knip to detect orphaned components and unreferenced exports:
     `npm run audit:knip`
   - Run Semgrep for static vulnerability inspection:
     `npm run audit:semgrep`
   - Run Madge for circular import detection:
     `npm run audit:madge`
   - Run ESLint for React Hook rules and exhaustive dependencies:
     `npm run lint`

4. **Verification Gate**
   - Check that all source files parse cleanly without syntax errors.
   - Distinguish dynamic runtime seed models and Pages Functions bindings from dead code.
