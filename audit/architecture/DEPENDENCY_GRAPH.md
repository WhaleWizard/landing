# DEPENDENCY GRAPH: MODULES & CHUNK BOUNDARIES

## 1. Chunking & Splitting Structure (Vite & Rollup)

| Chunk Name | Primary Modules Included | Gzip Size | Load Trigger |
|---|---|---|---|
| `vendor-*.js` | `react`, `react-dom`, `react-router` | ~77.7 kB | Critical startup (Preloaded on all routes) |
| `index-*.js` | `src/main.tsx`, `App.tsx`, `routes.tsx` | ~13.1 kB | Critical startup (Preloaded on all routes) |
| `index-*.css` | Global Tailwind CSS, variables, base fonts | ~24.2 kB | Critical startup (`as="style" crossorigin`) |
| `motion-*.js` | Framer Motion / Motion primitives | ~32.0 kB | Dynamic / loaded on animated routes |
| `Hero-*.js` | `src/app/components/Hero.tsx`, `HeroTitleEffect` | ~7.3 kB | Preloaded on `/`, `/meta-apps/`, `/google-ads/` |
| `MetaAdsEditorialHero-*.js` | Editorial visual layout for Meta Ads | ~4.2 kB | Preloaded exclusively on `/meta-ads/` |
| `ConsultStudioHero-*.js` | Consulting studio visual layout & calendar | ~3.8 kB | Preloaded exclusively on `/consult/` |
| `ServiceLandingPage-*.js` | Service layout framework & sections | ~15.6 kB | Lazy-loaded on service routes |
| `Admin-*.js` | Admin routing, layout, core state | ~37.5 kB | Lazy-loaded exclusively on `/admin/*` |
| `AdminLeads-*.js` | Leads table, filtering, CRM actions | ~25.6 kB | Lazy-loaded inside Admin |
| `AdminContentControl-*.js` | CMS editor, site content management | ~23.3 kB | Lazy-loaded inside Admin |
| `AdminFinance-*.js` | Financial stats, calculations | ~7.5 kB | Lazy-loaded inside Admin |
| `BlogPage-*.js` | Blog archive & single article renderer | ~13.5 kB | Lazy-loaded on `/blog/*` and `/cases/*` |
| `MarketingCalculator-*.js`| Performance marketing budget calculator | ~10.2 kB | Lazy-loaded on `/calculator` |
| `ContactForm-*.js` | Lead intake form, turnstile, validation | ~7.7 kB | Deferred / on scroll |

## 2. Public vs Admin Isolation Guarantee
- **Zero Admin Leakage in Public Bundles**: `Admin.tsx`, `AdminLeads.tsx`, `AdminContentControl.tsx`, `AdminFinance.tsx`, `admin-ui.css`, and administrative lucide icons are completely isolated into independent code-split chunks. No public landing downloads or evaluates administrative logic.
- **Single DOMPurify jsdom Sanitization Boundary**: HTML sanitization for public articles is performed statically during build time via `scripts/article-sanitizer.js` with jsdom, and at edge function submission time via `functions/_lib/sanitize.ts`.
