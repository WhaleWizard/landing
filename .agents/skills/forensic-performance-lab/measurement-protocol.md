# Measurement Protocol

1. **Environment Standardization**:
   - Node v25+, Vite 6.4+, Playwright 1.64+, Lighthouse 13.5+.
   - Port 4173 static preview server serving pre-rendered `dist/`.
   - Disabled browser caching for cold-load runs; enabled for warm navigation.
2. **Repetition & Statistical Rigor**:
   - 5 independent runs minimum for every Lighthouse evaluation.
   - Record distribution: min, median, max.
   - Median change must exceed test variability to be considered significant.
3. **No Fluff / No Synthetic Tricks**:
   - Never disable scripts exclusively under test flags.
   - Always run production bundles with SSR HTML and hydration active.
