// Клиентская retry-очередь для заявок: если fetch к /api/lead падает по сети
// (не по вине сервера — обрыв связи, offline), заявка не теряется, а лежит в
// localStorage и повторно отправляется при восстановлении сети или следующем визите.

const QUEUE_KEY = 'ww_lead_retry_queue_v1';
const MAX_QUEUE_SIZE = 10;
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 3; // 3 дня

type QueuedLead = {
  id: string;
  endpoint: string;
  payload: unknown;
  queuedAt: number;
};

function readQueue(): QueuedLead[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: QueuedLead[]): void {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE_SIZE)));
  } catch {
    /* localStorage недоступен или переполнен — очередь просто не сохранится в этот раз */
  }
}

export function queueLeadForRetry(endpoint: string, payload: unknown): void {
  const queue = readQueue();
  queue.push({ id: crypto.randomUUID(), endpoint, payload, queuedAt: Date.now() });
  writeQueue(queue);
}

let flushing = false;

export async function flushLeadQueue(): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  flushing = true;
  try {
    const queue = readQueue().filter((item) => Date.now() - item.queuedAt < MAX_AGE_MS);
    if (!queue.length) return;

    const remaining: QueuedLead[] = [];
    for (const item of queue) {
      try {
        const res = await fetch(item.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(item.payload),
        });
        if (!res.ok) remaining.push(item);
      } catch {
        remaining.push(item);
      }
    }
    writeQueue(remaining);
  } finally {
    flushing = false;
  }
}

let initialized = false;

export function initLeadRetryQueue(): void {
  if (initialized) return;
  initialized = true;
  void flushLeadQueue();
  window.addEventListener('online', () => {
    void flushLeadQueue();
  });
}
