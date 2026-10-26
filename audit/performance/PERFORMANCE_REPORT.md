# WHALEWZRD Core Web Vitals & Performance Audit

*Generated at: 2026-10-23T07:11:03.774Z*

## 1. Executive Summary Table

| Route | Profile | FCP (ms) | LCP (ms) | CLS | TBT (ms) | TTFB (ms) | DOM Nodes | JS Heap (MB) | Hydration OK |
|---|---|---|---|---|---|---|---|---|---|
| `/` | Desktop | 1712 | 1712 | 0 | 0 | 3 | 1509 | 5.52 | PASS |
| `/meta-ads/` | Desktop | 212 | 212 | 0.0001 | 0 | 1 | 1431 | 6.15 | PASS |
| `/meta-apps/` | Desktop | 396 | 396 | 0 | 0 | 2 | 1685 | 6.19 | PASS |
| `/google-ads/` | Desktop | 264 | 264 | 0 | 0 | 1 | 1486 | 5.86 | PASS |
| `/consult/` | Desktop | 144 | 144 | 0 | 0 | 2 | 1381 | 5.57 | PASS |
| `/blog/` | Desktop | 132 | 228 | 0 | 0 | 1 | 911 | 5.46 | PASS |
| `/cases/` | Desktop | 96 | 224 | 0 | 0 | 1 | 792 | 4.95 | PASS |
| `/faq/` | Desktop | 148 | 496 | 0 | 0 | 2 | 2821 | 4.83 | PASS |
| `/` | Mobile-MotoG4-Sim | 616 | 616 | 0 | 81 | 1 | 1633 | 4.74 | PASS |
| `/meta-ads/` | Mobile-MotoG4-Sim | 672 | 672 | 0 | 4 | 1 | 789 | 4.19 | PASS |
| `/meta-apps/` | Mobile-MotoG4-Sim | 956 | 956 | 0 | 16 | 2 | 1007 | 5.43 | PASS |
| `/google-ads/` | Mobile-MotoG4-Sim | 388 | 388 | 0 | 37 | 2 | 873 | 4.86 | PASS |
| `/consult/` | Mobile-MotoG4-Sim | 748 | 1032 | 0 | 116 | 1 | 1511 | 4.84 | PASS |
| `/blog/` | Mobile-MotoG4-Sim | 292 | 292 | 0 | 561 | 2 | 1103 | 4.85 | PASS |
| `/cases/` | Mobile-MotoG4-Sim | 248 | 248 | 0 | 625 | 1 | 793 | 4.96 | PASS |
| `/faq/` | Mobile-MotoG4-Sim | 268 | 268 | 0 | 517 | 1 | 2821 | 4.81 | PASS |

## 2. Threshold Evaluation (Google CWV Standards)

- **LCP (Largest Contentful Paint)**: Good <= 2500ms, Needs Improvement <= 4000ms, Poor > 4000ms
- **CLS (Cumulative Layout Shift)**: Good <= 0.1, Needs Improvement <= 0.25, Poor > 0.25
- **TBT (Total Blocking Time)**: Good <= 200ms, Needs Improvement <= 600ms, Poor > 600ms
- **FCP (First Contentful Paint)**: Good <= 1800ms, Needs Improvement <= 3000ms, Poor > 3000ms

### Routes Requiring Optimization:
- **`/` (Desktop)**: Console errors present (1)
- **`/blog/` (Desktop)**: Console errors present (1)
- **`/cases/` (Desktop)**: Console errors present (1)
- **`/` (Mobile-MotoG4-Sim)**: Console errors present (1)
- **`/blog/` (Mobile-MotoG4-Sim)**: TBT 561ms > 200ms, Console errors present (1)
- **`/cases/` (Mobile-MotoG4-Sim)**: TBT 625ms > 200ms, Console errors present (1)
- **`/faq/` (Mobile-MotoG4-Sim)**: TBT 517ms > 200ms
