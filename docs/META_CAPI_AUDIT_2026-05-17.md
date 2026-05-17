# Meta Pixel + CAPI Full Deep Audit (2026-05-17)

## 1. EXECUTIVE SUMMARY
Current setup is above average and technically mature, but not production-hard for aggressive paid scaling.
Main risk is consent bypass through GTM and third-party tags, not core API handlers.
Dedup is implemented correctly in architecture, but there are race edge cases around parallel browser/server dispatch and missing guaranteed retry queues.
Match quality is decent, but not maxed because first-party identifiers and normalization controls are inconsistent across event paths.
Server handlers are resilient (retry/timeout/rate limit/honeypot/diagnostics), but reliability still depends on best-effort fire-and-forget transport from browser.
LDU support exists but policy enforcement is env-driven and can silently misconfigure.
No hard evidence of illegal always-on server tracking in first-party endpoints, but consent model is vulnerable if GTM runs Meta independently.
Verdict: good baseline, not yet bulletproof.

## 2. SCORE
Overall score: **7.8 / 10**

## 3. CRITICAL ISSUES
1. **Consent bypass vector via GTM/dataLayer ecosystem**: first-party code gates direct `fbq` calls, but GTM can still fire Meta tags from `dataLayer` events unless every trigger is consent-locked.
2. **No durable delivery queue for CAPI events**: all browser→server sends are best effort (`fetch`/`sendBeacon`) without persistent retry store; event loss under tab close, mobile backgrounding, or network jitter is real.
3. **Lead pipeline dependency on external Google Script endpoint before CAPI send**: if Google Script fails, Lead CAPI is skipped (by design flow), losing ad optimization signal.
4. **Potential duplicate suppression collisions**: idempotency dedupe is keyed on event_id/event_name, but no explicit namespace by environment/site in key schema shown here (risk if shared KV across environments).
5. **No explicit anti-replay signature between client and tracking endpoints**: trusted-origin check helps, but same-origin abuse and replay spam are still possible.

## 4. HIGH PRIORITY FIXES
1. Enforce **hard consent contracts** in GTM:
   - Block all Meta/GTM marketing tags until `marketing_consent=true` event.
   - Add deny-by-default trigger policy and audit all community templates.
2. Add **durable CAPI outbox** (KV or D1):
   - Store unsent payloads with retry state and exponential backoff worker.
   - Mark delivered only on Meta 2xx + parsed response.
3. Decouple Lead CAPI from external webhook success:
   - Send Lead to Meta independently when form validation passed + consent granted.
   - Keep CRM webhook errors isolated from ad-signal pipeline.
4. Strengthen dedupe keys:
   - Include env/site prefix in idempotency keys (`prod:whalewzrd:event_name:event_id`).
   - TTL >= Meta dedup observation window and monitored expiry drift.
5. Add request authenticity:
   - HMAC signature (short TTL nonce) on `/api/pageview`, `/api/meta-event`, `/api/lead` from browser payload.

## 5. MEDIUM IMPROVEMENTS
- Validate `event_source_url` against `SITE_URL` domain allowlist before forwarding.
- Add structured parsing of Meta error body (subcode/category/transient) for auto-triage.
- Batch non-critical events (`ViewContent`, `EngagedView`) server-side to reduce API call overhead.
- Enrich diagnostics with `attempt_count`, `transport_type` (`beacon|fetch`), and `latency_ms`.
- Add automated synthetic monitor invoking `/api/meta-test-event` daily and alert on drops.

## 6. MATCH QUALITY SCORE + HOW TO IMPROVE
Current score: **8.2 / 10**

What is good:
- `em`, `ph`, `fn`, `ln` hashed and normalized in Lead path.
- `fbp`, `fbc`, `client_ip_address`, `client_user_agent` included.
- `external_id` generated and hashed server-side.

Gaps:
- Non-Lead endpoints accept prehashed PII only and drop raw values; if client doesn’t prehash consistently, match quality degrades silently.
- `fbc` synthesis from `fbclid` is correct pattern-wise, but attribution freshness checks are not explicit.
- No explicit validation logs when PII hash format invalid (only omitted).

Fixes:
- Standardize one shared normalization/hashing module for all event types.
- Log hash-quality counters (`invalid_sha256_em`, `invalid_sha256_ph`) per endpoint.
- Persist first-party `external_id` lifecycle across sessions with rotation policy.

## 7. CONSENT RISKS
- Core first-party tracking functions correctly gate by `marketing_consent`.
- Risk remains in **parallel tag systems** (GTM/custom HTML/partner tags) consuming pushed events.
- Auto-consent by region (`region_auto`) must be legally reviewed per jurisdiction updates.
- Late consent grant behavior is acceptable, but retroactive queued events are not reconciled.

## 8. DEDUPLICATION RISKS
- Browser and server use shared `event_id` for PageView/ViewContent/Lead: good.
- `waitUntil` async send + immediate browser fire can race; usually fine, but delayed server sends can miss dedup windows on poor networks.
- Multiple rapid route changes can create high event churn; short local anti-duplicate window (1.2s) may still allow near-duplicate views.

## 9. MISSING FEATURES (IMPORTANT)
### Critical missing
- Durable retry queue / outbox.
- GTM consent-hardening verification artifacts.
- Signed browser→server tracking payloads.

### High impact missing
- Endpoint-level SLO metrics (send success %, p95 latency, per-event drop rate).
- Automatic fallback route when Meta API transient failures persist.
- Contract tests validating exact Pixel↔CAPI event parity by event_name schema.

### Meta-recommended but not fully implemented
- Full operational governance around Event Match Quality monitoring with alert thresholds and remediation playbooks.
- End-to-end dedup observability linking browser event dispatch ID to final Meta accepted status.

## 10. FINAL VERDICT
**Production-safe for scaling ads: NO (not yet).**

Reason: implementation is strong at code level, but paid-scale safety fails on operational resiliency and consent-bypass surface (GTM ecosystem + no durable delivery queue + external dependency coupling in lead flow).
