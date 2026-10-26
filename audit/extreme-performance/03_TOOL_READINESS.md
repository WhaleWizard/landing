# Tool Readiness & Smoke Verification

| Tool | Version / Path | Smoke Test Result | Notes |
|---|---|---|---|
| **Node.js** | v25.9.0 | PASS | Runtimes and native modules active |
| **pnpm** | 12.15.0 | PASS | Primary package manager, pnpm-lock.yaml synced |
| **Lighthouse CLI** | 13.5.0 | PASS | Standalone executable available via npx |
| **Lighthouse CI (@lhci/cli)** | 0.15.1 | PASS | Used for automated batch runs |
| **Playwright** | 1.64.1 | PASS | Chromium, WebKit, Firefox headless engines |
| **CDP Session** | Chromium 147.x (via Playwright) | PASS | Emulation.setCPUThrottlingRate, Network.emulateNetworkConditions |
| **Vite / Rollup Visualizer** | Vite 6.4.3 / visualizer 7.1.1 | PASS | Treemap generation via `npm run audit:analyze` |
| **ESLint** | 10.13.0 | PASS | `npm run lint` 100% clean |
| **Semgrep** | 1.182.1 | PASS | Security scanning passed |
| **Knip & Madge** | 6.42.1 / 8.0.0 | PASS | Circular dependency check 0 loops |
| **Test Suite** | Node.js Test Runner (`--test`) | PASS | 45+ test suites, 100% passing (`npm run check`) |
