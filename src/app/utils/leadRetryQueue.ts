import { CONSENT_KEY, loadConsent, MARKETING_CONSENT_REVOKED_EVENT } from '../consent/consentStorage';
import { createEventId } from '../consent/consent';
import { applyConsentDowngrade } from './leadRetryConsent';

const QUEUE_KEY = 'ww_lead_retry_queue_v1';
const MAX_QUEUE_SIZE = 10;
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;
const RETRY_DELAYS = [10_000, 30_000, 120_000, 300_000];

type QueuedLead = {
  id: string;
  endpoint: string;
  payload: unknown;
  queuedAt: number;
  retryAt?: number;
};

function readQueue(): QueuedLead[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item && typeof item.id === 'string'
      && typeof item.endpoint === 'string' && Number.isFinite(item.queuedAt));
  } catch {
    return [];
  }
}

function isCurrent(item: QueuedLead): boolean {
  return Date.now() - item.queuedAt < MAX_AGE_MS;
}

async function updateQueue(update: (queue: QueuedLead[]) => QueuedLead[] | null): Promise<boolean> {
  const write = () => {
    const next = update(readQueue());
    if (!next) return false;
    localStorage.setItem(QUEUE_KEY, JSON.stringify(next));
    return true;
  };

  try {
    const locks = typeof window !== 'undefined' ? navigator.locks : undefined;
    return locks ? await locks.request(`${QUEUE_KEY}:write`, write) : write();
  } catch {
    return false;
  }
}

function dueAt(item: QueuedLead): number {
  return typeof item.retryAt === 'number' && Number.isFinite(item.retryAt) ? item.retryAt : 0;
}

export function readLeadRetryAfter(header: string | null): number | undefined {
  const value = header?.trim();
  if (!value) return undefined;
  const now = Date.now();
  const time = /^\d+$/.test(value) ? now + Number(value) * 1000 : Date.parse(value);
  return Number.isFinite(time) && time > now ? Math.min(time, now + MAX_AGE_MS) : undefined;
}

function deferEndpoint(queue: QueuedLead[], endpoint: string, retryAt: number): QueuedLead[] {
  return queue.map((item) => item.endpoint === endpoint && dueAt(item) < retryAt
    ? { ...item, retryAt }
    : item);
}

export function queueLeadForRetry(endpoint: string, payload: unknown, retryAt?: number): Promise<boolean> {
  return updateQueue((queue) => {
    const current = queue.filter(isCurrent);
    // Preserve already confirmed records when the queue is full.
    if (current.length >= MAX_QUEUE_SIZE) return null;
    const next = [...current, {
      id: createEventId(),
      endpoint,
      payload: applyConsentDowngrade(payload, loadConsent()),
      queuedAt: Date.now(),
    }];
    const notBefore = Math.max(retryAt ?? 0, ...current.filter((item) => item.endpoint === endpoint).map(dueAt));
    return notBefore ? deferEndpoint(next, endpoint, notBefore) : next;
  });
}

export function isRetryableLeadStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

function isPermanentRejection(status: number): boolean {
  return status >= 400 && status < 500 && !isRetryableLeadStatus(status);
}

function scrubMarketingConsent(): void {
  void updateQueue((queue) => queue.length
    ? queue.map((item) => ({ ...item, payload: applyConsentDowngrade(item.payload, null) }))
    : null);
}

async function sendQueuedLeads(): Promise<void> {
  let stored = readQueue();
  if (stored.some((item) => !isCurrent(item))) {
    await updateQueue((current) => current.filter(isCurrent));
    stored = readQueue();
  }
  if (navigator.onLine === false || !stored.some((item) => isCurrent(item) && dueAt(item) <= Date.now())) return;

  // Deferred submissions always need a fresh one-time Turnstile token.
  const { mintDetachedTurnstileToken } = await import('../components/hooks/useTurnstile');
  for (const item of stored) {
    if (!isCurrent(item) || dueAt(item) > Date.now()) continue;
    try {
      const freshToken = await mintDetachedTurnstileToken();
      if (!freshToken) {
        continue;
      }

      // Consent, expiry, and a server delay can change during verification.
      const current = readQueue().find((record) => record.id === item.id);
      if (!current || !isCurrent(current) || dueAt(current) > Date.now()) continue;
      const payload = applyConsentDowngrade(current.payload, loadConsent());
      const res = await fetch(current.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...(payload as Record<string, unknown>), turnstile_token: freshToken }),
      });
      if (res.ok || isPermanentRejection(res.status)) {
        await updateQueue((queue) => queue.filter((record) => record.id !== current.id));
      } else {
        const retryAt = readLeadRetryAfter(res.headers.get('Retry-After'));
        if (retryAt) {
          await updateQueue((queue) => deferEndpoint(queue, current.endpoint, retryAt));
          break;
        }
      }
    } catch {
      // Keep the entry for the next retry.
    }
  }
}

let flushing = false;

export async function flushLeadQueue(): Promise<void> {
  if (flushing || !readQueue().length) return;
  flushing = true;
  try {
    if (navigator.locks) {
      await navigator.locks.request(`${QUEUE_KEY}:send`, { ifAvailable: true }, async (lock) => {
        if (lock) await sendQueuedLeads();
      });
    } else {
      // Older browsers still have server-side idempotency by event ID.
      await sendQueuedLeads();
    }
  } catch {
    // A blocked lock manager or unavailable verification leaves the queue intact.
  } finally {
    flushing = false;
  }
}

let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryAttempt = 0;

export function scheduleLeadRetry(): void {
  if (retryTimer !== null) clearTimeout(retryTimer);
  retryTimer = null;
  const queue = readQueue();
  if (!queue.length) {
    retryAttempt = 0;
    return;
  }
  if (navigator.onLine === false) return;
  const now = Date.now();
  const backoff = RETRY_DELAYS[Math.min(retryAttempt, RETRY_DELAYS.length - 1)];
  const wake = Math.min(...queue.map((item) => Math.min(item.queuedAt + MAX_AGE_MS, Math.max(now + backoff, dueAt(item)))));
  retryTimer = setTimeout(() => {
    retryTimer = null;
    retryAttempt += 1;
    retry();
  }, Math.max(1000, wake - now));
}

function retry(): void {
  void flushLeadQueue().then(scheduleLeadRetry);
}

let initialized = false;

export function initLeadRetryQueue(): void {
  if (initialized) return;
  initialized = true;
  if (readQueue().length && !loadConsent()?.categories.marketing) scrubMarketingConsent();
  retry();
  window.addEventListener('online', retry);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') retry();
  });
  window.addEventListener(MARKETING_CONSENT_REVOKED_EVENT, scrubMarketingConsent);
  window.addEventListener('storage', (event) => {
    if (event.key !== CONSENT_KEY && !(event.key === null && event.storageArea === localStorage)) return;
    try {
      if (JSON.parse(event.newValue || 'null')?.categories?.marketing === true) return;
    } catch { /* Invalid consent cannot grant marketing. */ }
    scrubMarketingConsent();
  });
}
