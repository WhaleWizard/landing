# ARCHITECTURE MAP: WHALEWZRD APPLICATION & EDGE INFRASTRUCTURE

## 1. System Topology & Layers

```mermaid
graph TD
    Client["Browser Client (Desktop / Mobile)"]
    CFEdge["Cloudflare Pages Edge Network"]
    EarlyHints["103 Early Hints (_headers)"]
    HTMLRewriter["HTML Rewriter / Middleware"]
    SSRShell["Pre-rendered HTML Shell"]
    PagesFunc["Pages Functions (functions/api/*)"]
    D1["Cloudflare D1 (SQLite Database)"]
    R2["Cloudflare R2 (Media & Snapshots)"]
    KV["Cloudflare KV (Page Locks / Rate Limit)"]
    MetaAPI["Meta Graph API (CAPI)"]

    Client --> CFEdge
    CFEdge --> EarlyHints
    CFEdge --> HTMLRewriter
    HTMLRewriter --> SSRShell
    SSRShell --> Client
    Client -->|API Requests| PagesFunc
    PagesFunc --> D1
    PagesFunc --> R2
    PagesFunc --> KV
    PagesFunc -->|Server-Side Events| MetaAPI
```

## 2. Frontend Critical Rendering & Hydration Path

```mermaid
sequenceDiagram
    autonumber
    actor User as User Browser
    participant Edge as Cloudflare Edge
    participant DOM as Browser DOM / Engine
    participant React as React 18 Hydration
    participant Chunks as Lazy Chunk Pipeline

    User->>Edge: GET / (or service route)
    Edge-->>User: 103 Early Hints (index.css crossorigin, route fonts)
    Edge-->>User: 200 OK (SSR HTML with #root + #ww-static-shell)
    User->>DOM: Parse HTML, paint Hero First Screen immediately
    Note over DOM: Zero white flash, zero layout jump
    User->>Edge: Fetch critical vendor & route scripts
    User->>React: Execute main.tsx -> hydrateRoot(#root)
    React->>DOM: Commit hydration release: remove data-ww-prehydrate & #ww-static-shell
    Note over React,DOM: First Screen Interactive (FCP ~140ms, LCP ~1.0s)
    User->>Chunks: DeferredSection enters viewport threshold
    Chunks->>Edge: Fetch section chunk (wrapped in SectionErrorBoundary)
    Chunks->>DOM: Render section progressively
```

## 3. Hero Animation Subsystem Pipeline

```mermaid
graph LR
    Admin["Admin CMS / Live Preview"] -->|titleLines config| Payload["Site Content Store / API"]
    Payload -->|fetch / seed| Page["Landing Page / Hero Component"]
    Page --> Resolve["resolveHeroTitleLines()"]
    Resolve -->|accumulated duration & safeSequenceGap| Engine["HeroTitleEffect.tsx"]
    Engine --> CSS["hero-title-effects.css"]
    CSS -->|background-image: inherit; -webkit-background-clip: text| Paint["GPU Compositor Paint"]
```

## 4. Resilience Architecture
1. **Network Fault Isolation**: `SectionErrorBoundary` surrounds each below-the-fold `DeferredSection`. If an offline condition or network blip occurs during scroll, the Hero and navigation remain 100% interactive. When `window.addEventListener('online')` fires, failed sections automatically reload.
2. **Chunk Version Mismatch Protection**: `RouteErrorBoundary` detects stale deployment chunks (`Failed to fetch dynamically imported module`), sets an anti-loop retry timestamp in URL parameter and sessionStorage, and reloads exactly once to fetch the latest manifest.
3. **Lead Capture Durability**: `leadRetryQueue` writes every submission to `localStorage` before initiating network fetch. If offline or Turnstile is unavailable, submissions are retained and scheduled for retry with exponential backoff upon network restoration or `visibilitychange`.
4. **Data Privacy & Strict Meta Gate**: If visitor grants analytics but declines marketing (`marketing_consent: false`), `pageview` operates in `stats_only` mode without queuing D1 outbox rows or calling Meta CAPI.
