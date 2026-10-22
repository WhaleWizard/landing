---
name: admin-data-integrity
description: Admin UI validation, CMS content schemas, D1 storage, API contracts, cache invalidation, and public page synchronization.
---

# Admin Data Integrity (`admin-data-integrity`)

Use this skill to audit administrative panel workflows, content serialization, D1 SQLite schemas, and the synchronization contract between Admin changes and public page rendering.

## Core Pipelines

1. **Authentication & Session Security**
   - Verify PBKDF2 password hashing, session tokens, TOTP two-factor authentication, and brute-force protection.
   - Guard against unauthorized access to `/api/admin/*` endpoints.

2. **Content Editing & Serialization**
   - Audit Hero text and effects editor (`AdminContentControl.tsx`, `HeroTitleEffect.tsx`).
   - Audit block article editor (`ArticleEditor.tsx`):
     - Validates bidirectional HTML <-> Block transformation.
     - Preserves DOMPurify HTML sanitization without script/event handler leakage.
     - Ensures scheduled publishing times cannot be set in the past.

3. **Storage & Edge Cache Invalidation**
   - Verify D1 SQLite queries and schema migration contracts (`functions/_lib/d1.ts`, `migrations/*.sql`).
   - Verify that updates to articles or site content invalidate edge caches (`functions/_lib/cache.ts`) and trigger public re-renders appropriately without serving stale snapshots.
   - Ensure mock/test data is strictly separated from production database records.
