# Tool Readiness Assessment — Forensic Lab v7.0

| Tool | Version | Status | Capability / Purpose |
|---|---|:---:|---|
| **Node.js** | v25.9.0 | ACTIVE | Test execution, SSR static generation, scripting |
| **pnpm** | 12.15.0 | ACTIVE | Package management & lockfile consistency |
| **Playwright** | 1.64.1 | ACTIVE | Chromium headless automation, CDP session management, trace capture |
| **Lighthouse CLI / LHCI** | 13.5.0 | ACTIVE | Standard mobile & desktop audit suite, CWV diagnostics |
| **Vite** | 6.4.3 | ACTIVE | Production bundler, code-splitting, tree-shaking |
| **TypeScript** | 5.8+ (`npx -p typescript`) | ACTIVE | Dual typechecking (`tsconfig.app.json` & `tsconfig.functions.json`) |
| **Chrome DevTools Protocol (CDP)** | Supported via Chromium | ACTIVE | CPU throttling (2x-6x), Network throttling, Performance.enable |
| **Node Test Runner** | Built-in | ACTIVE | 46 automated regression test suites |

## Static Preview Server
- Port: 4173 (or automated ephemeral port via node http server)
- Root: `dist/` (contains pre-rendered SSR HTML files for 27 routes)
- MIME types: HTML, CSS, JS, WOFF2, WebP, PNG, SVG, JSON with gzip compression support.
