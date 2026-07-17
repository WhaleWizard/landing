# Design QA — Case Finder

Date: 2026-07-17

## Scope

- `/cases`
- `/cases/:slug`
- Desktop catalog, mobile catalog, desktop article, mobile article
- Filter, sort, search, mobile filter sheet, source-aware back navigation

## Reference images

- Catalog desktop: `C:\Users\Asus\.codex\generated_images\019f5cb5-6e18-7740-a4bc-c56cfbdd8f25\exec-f41a064e-9ab9-4e64-bf33-3220f606dfe4.png`
- Catalog mobile: `C:\Users\Asus\.codex\generated_images\019f5cb5-6e18-7740-a4bc-c56cfbdd8f25\exec-ad8c5ef9-8aba-4381-a2a4-a45b3e608dd7.png`
- Article desktop: `C:\Users\Asus\.codex\generated_images\019f5cb5-6e18-7740-a4bc-c56cfbdd8f25\exec-dae21ed7-53b6-4f90-899c-0fd892bbdc09.png`

## Implementation evidence

- `audit-reports/cases-finder-2026-07-16/cases-desktop-1440-final.png`
- `audit-reports/cases-finder-2026-07-16/cases-mobile-390-final.png`
- `audit-reports/cases-finder-2026-07-16/cases-mobile-320-final.png`
- `audit-reports/cases-finder-2026-07-16/cases-mobile-320-filter-sheet-selected.png`
- `audit-reports/cases-finder-2026-07-16/case-article-desktop-1440-final.png`
- `audit-reports/cases-finder-2026-07-16/case-article-mobile-390-final.png`
- `audit-reports/cases-finder-2026-07-16/case-article-mobile-390-body-final.png`
- `audit-reports/cases-finder-2026-07-16/case-article-mobile-320-final.png`
- `audit-reports/cases-finder-2026-07-17/cases-desktop-cards-border-v1.png`
- `audit-reports/cases-finder-2026-07-17/cases-desktop-1200-final-cards-scroll.png`
- `audit-reports/cases-finder-2026-07-17/cases-mobile-390-final.png`
- `audit-reports/cases-finder-2026-07-17/cases-mobile-390-final-cards.png`
- `audit-reports/cases-finder-2026-07-17/cases-mobile-320-final.png`
- `audit-reports/cases-finder-2026-07-17/article-premium-desktop-1200-final.png`
- `audit-reports/cases-finder-2026-07-17/article-premium-mobile-390-final.png`
- `audit-reports/cases-finder-2026-07-17/article-premium-mobile-320-final.png`

## Side-by-side comparison inputs

- `audit-reports/cases-finder-2026-07-16/compare-catalog-desktop.png`
- `audit-reports/cases-finder-2026-07-16/compare-catalog-mobile.png`
- `audit-reports/cases-finder-2026-07-16/compare-article-desktop.png`
- Border iteration: `audit-reports/cases-finder-2026-07-17/cases-desktop-before-border.png` → `audit-reports/cases-finder-2026-07-17/cases-desktop-cards-border-v1.png`
- Mobile border iteration: `audit-reports/cases-finder-2026-07-17/cases-mobile-cards-before-border.png` → `audit-reports/cases-finder-2026-07-17/cases-mobile-390-final-cards.png`

## Viewports and states checked

- 1440 × 1024: catalog, article hero, first result rows
- 390 × 844: catalog hero, result card, article hero, article body
- 320 × 844: catalog hero, stacked controls, filter sheet, article hero
- Direct `/cases`
- `/cases?src=meta&from=meta-apps`
- Article opened from a filtered catalog
- Back to catalog with filters and `from` preserved
- Back from catalog to `/meta-apps`
- Legal page opened from `/meta-apps` and returned to the actual origin
- 1200 × 800: final desktop catalog and article regression pass in the current browser session
- 1440 × 1024: partial-border desktop pass retained in `cases-desktop-cards-border-v1.png`
- `/cases?from=meta-apps&utm_source=qa&fbclid=click-123&q=private`
- Cleared Meta Apps preset, reload of `from=meta-apps&all=1`, and external return to plain `/cases`
- Direct `sort=roi` and `sort=budget`

## Findings resolved

1. P1 — Mobile hero was too tall and repeated navigation. Breadcrumbs are hidden on mobile, stats are compact 2 × 2, and the first case begins in the first viewport on a direct catalog visit.
2. P1 — Sorting labels could clip near 390 px. Control proportions were adjusted; at 320 px controls stack into one column.
3. P1 — Article preamble was too dense on mobile. Summary, contents, and key takeaways are compact accordions; real article content begins without a wall of cards.
4. P1 — Desktop article title wrapped into four awkward lines. Grid and type scale now produce a balanced three-line heading at 1440 px and natural four/five-line wrapping at 390/320 px.
5. P1 — Optional case metrics could leave an empty mobile grid. Metric grids now adapt to one, two, or three real values; no fabricated proof item is added.
6. P1 — Source PNG covers added about 2.5 MB. Delivered WebP assets are 16–23 KB each and retain the intended crop and detail.
7. P2 — Case cards were buttons. They are now real links with normal new-tab/long-press behavior while retaining SPA navigation.
8. P2 — Filter URL state could initialize before CMS data and then be overwritten. Initialization now waits for article loading and URL synchronization starts only after state is ready.
9. P2 — Mobile filter sheet lacked a clear reset path and single-action footer width. Both states are implemented and checked.
10. P2 — Case and legal back navigation lost origin. Filters, `from`, related-case navigation, invalid-slug fallback, and same-origin legal returns now preserve context.
11. P2 — CMS article typography could be overridden by legacy blog selectors. Case article selectors now win while retaining the shared sanitised content behavior.
12. P2 — Touch targets, focus treatment, reduced motion, image alt text, and mobile ZIP-dialog height were corrected.
13. P1 — Adjacent cards visually merged during scrolling. The list now has a 12 px rhythm plus a low-opacity, partial violet/blue edge that separates cards without turning every card into a glowing frame.
14. P1 — Query-only filter changes could create duplicate PageView/ViewContent events. Route tracking now reacts to pathname changes only.
15. P1 — Local search and free-form CMS filters could leak into advertising URLs. Search stays local; non-neutral filter values use opaque stable tokens; Meta and dataLayer receive exact values only from the neutral allowlist and only after the relevant consent.
16. P1 — Catalog URL rewriting could drop UTM and click identifiers. Known acquisition parameters are now preserved while arbitrary parameters are discarded.
17. P1 — A cleared CMS metric could reappear from hardcoded seed data. Seed caseData is now used only when CMS caseData is wholly absent; explicit empty CMS values win.
18. P2 — `from=meta-apps` could represent both an active preset and a cleared catalog. The cleared state now has an explicit `all=1` marker and survives reload without losing the origin back-link.
19. P2 — ROI/budget sorts were still biased by the featured card and “new” used editorial update time. Sorts now follow the selected metric; publication date is primary for newest.
20. P2 — SPA tracking could fire before the article title changed. Route events now wait for the new title (bounded fallback), avoiding the previous catalog title on case events.

## Verification

- `npm run check` — passed
- Meta CAPI smoke tests — passed
- Production build and static route generation — passed
- Cloudflare Functions TypeScript check — passed
- Horizontal overflow — none at 1440, 390, or 320 px in checked catalog/article states
- Filter state, preset clearing/reload, attribution retention, ROI/budget sorting, article/list hrefs, and related-case hrefs — passed
- Browser console — no application errors or React warnings; only the expected localhost Meta Pixel traffic-permission warning
- No deployment, commit, or push performed

final result: passed
