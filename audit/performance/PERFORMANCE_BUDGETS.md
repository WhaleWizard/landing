# PERFORMANCE BUDGETS & CORE WEB VITALS SPECIFICATION

## 1. Budget Targets

| Metric | Target (Field p75) | Target (Lab Desktop) | Target (Lab Mobile 4G) | Actual Current | Status |
|---|---|---|---|---|---|
| **LCP (Largest Contentful Paint)** | ≤ 2.5 s | ≤ 1.0 s | ≤ 1.8 s | 0.8s (Desk) / 1.4s (Mob) | ✅ PASSED |
| **FCP (First Contentful Paint)** | ≤ 1.8 s | ≤ 0.4 s | ≤ 0.9 s | 0.2s (Desk) / 0.5s (Mob) | ✅ PASSED |
| **CLS (Cumulative Layout Shift)** | ≤ 0.10 | ≤ 0.02 | ≤ 0.02 | 0.00 | ✅ PASSED |
| **INP / TBT** | ≤ 200 ms | TBT ≤ 50 ms | TBT ≤ 100 ms | TBT 0–30 ms | ✅ PASSED |
| **Initial JS Transfer (Gzip)** | ≤ 120 kB | ≤ 95 kB | ≤ 95 kB | 90.8 kB | ✅ PASSED |
| **Initial CSS Transfer (Gzip)** | ≤ 35 kB | ≤ 25 kB | ≤ 25 kB | 24.2 kB | ✅ PASSED |
| **Horizontal Layout Shift / Overflow** | 0 px | 0 px | 0 px | 0 px across all viewports | ✅ PASSED |

## 2. Resource Weight Distribution (Current Production Build)
- Critical Startup Bundle: `vendor` (77.7 kB) + `index` (13.1 kB) = **90.8 kB gzip**.
- Route Stylesheet: `index.css` = **24.2 kB gzip**.
- Route Font Subsets: WOFF2 with `font-display: swap` preloaded via Early Hints.
- Image Payload: WebP responsive variants generated at build time; Hero images priority loaded without duplicate fetch.
