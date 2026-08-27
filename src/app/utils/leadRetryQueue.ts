// Клиентская retry-очередь для заявок: если fetch к /api/lead падает по сети
// (не по вине сервера — обрыв связи, offline), заявка не теряется, а лежит в
// localStorage и повторно отправляется при восстановлении сети или следующем визите.

import { loadConsent } from '../consent/consent';
import { applyConsentDowngrade } from './leadRetryConsent';

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

/**
 * Ответ, после которого повторять бессмысленно.
 *
 * Сервер уже различает временный отказ и окончательный: недоступную проверку
 * Turnstile и недоступную базу он отдаёт как 503 с `retryable`, а испорченный
 * токен — как 403, заявку без имени или контакта — как 400. Очередь этой
 * разницы не видела и держала окончательно отклонённую запись все трое суток,
 * пробуя её на каждой загрузке страницы. Каждая попытка тратила свежий токен
 * Turnstile и место в ограничителе частоты `/api/lead` — то есть испорченная
 * запись могла вытеснить настоящую заявку того же человека.
 *
 * 408 и 429 — не отказ по существу, а «попробуйте позже», поэтому они остаются
 * поводом для повтора.
 */
function isPermanentRejection(status: number): boolean {
  return !isRetryableLeadStatus(status) && status >= 400 && status < 500;
}

/**
 * Ответ, после которого заявку имеет смысл отложить и повторить.
 *
 * Форма и очередь смотрят на одно и то же, поэтому правило одно на двоих.
 * 429 сюда входит намеренно: лимит на заявки — двадцать за десять минут с
 * одного адреса, и упереться в него может не только бот, но и обычный человек
 * за общим адресом мобильного оператора. Раньше форма считала такой отказ
 * окончательным, показывала английское «Too many requests» и **выбрасывала
 * заявку**.
 */
export function isRetryableLeadStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

let flushing = false;

export async function flushLeadQueue(): Promise<void> {
  if (flushing) return;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return;

  flushing = true;
  try {
    const stored = readQueue();
    const batch = stored.filter((item) => Date.now() - item.queuedAt < MAX_AGE_MS);
    if (!batch.length) {
      // Просроченные записи раньше оставались в localStorage навсегда: выход
      // стоял до уборки. Отправлять их уже нельзя, но и хранить незачем.
      if (stored.length) writeQueue([]);
      return;
    }

    // Токен Turnstile одноразовый и живёт минуты. В очереди лежит тот, что был
    // получен в момент неудачной отправки, — к этой минуте Cloudflare его уже
    // погасил, и сервер отвечал бы 403 всегда. Значит на каждую отложенную
    // заявку нужен свежий токен.
    //
    // Модуль подгружается динамически и только здесь: у обычного посетителя
    // очередь пуста, выполнение сюда не доходит, и первая загрузка страницы
    // ничего лишнего не тянет.
    let mintToken: (() => Promise<string | null>) | null = null;
    try {
      ({ mintDetachedTurnstileToken: mintToken } = await import('../components/hooks/useTurnstile'));
    } catch {
      // Скрипт проверки не поднялся — отправим как есть, вдруг проверка
      // на сервере вообще не включена.
    }

    const settled = new Set<string>();
    for (const item of batch) {
      try {
        const payload = applyConsentDowngrade(item.payload, loadConsent());
        const freshToken = mintToken ? await mintToken() : null;
        const body = freshToken
          ? { ...(payload as Record<string, unknown>), turnstile_token: freshToken }
          : payload;

        const res = await fetch(item.endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (res.ok || isPermanentRejection(res.status)) settled.add(item.id);
      } catch {
        // Сеть не ответила — остаётся в очереди до следующей попытки.
      }
    }

    // Перечитываем очередь перед записью: пока шла отправка, могла добавиться
    // новая заявка — старый вариант перезаписывал её результатом этой пачки.
    const current = readQueue();
    writeQueue(current.filter((item) => !settled.has(item.id) && Date.now() - item.queuedAt < MAX_AGE_MS));
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
