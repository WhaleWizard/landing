import {
  fetchMetaWithRetry,
  getMetaApiVersion,
  getMetaDataProcessingOptions,
  getMetaPixelId,
  isConfirmedMetaReceipt,
  isRetryableMetaResponse,
  parseMetaApiReceipt,
  type MetaApiReceipt,
} from './meta-capi';
import { markMetaEventSent, recordMetaDiagnostics, wasMetaEventAlreadySent } from './meta-diagnostics';
import { normalizeEmail, normalizePhone, sha256Hex } from './meta-pii';
import {
  enqueueMetaEvent,
  getMetaOutboxEvent,
  getOutboxRetryDelaySeconds,
  markOutboxDeadLetter,
  markOutboxRetry,
  markOutboxSent,
} from './meta-outbox';
import type { Env } from './types';

/**
 * Событие «человек заинтересовался закрытой страницей» для Meta.
 *
 * Отдельное пользовательское событие `PageInterest`, а НЕ стандартный `Lead`:
 * это не заявка, и подмешивать её в оптимизацию и статистику лидов нельзя —
 * ровно по той же причине, по которой такие контакты не попадают в `leads`.
 *
 * Правила серверных событий проекта соблюдаются полностью:
 * - уходит только при явном согласии на маркетинг (отдельная снятая по
 *   умолчанию галочка на заглушке) — гейт не ослабляется;
 * - PII только в виде SHA-256 хешей, ничего лишнего и ничего выдуманного;
 * - дедупликация по event_id, очередь `meta_outbox` с фоновой досылкой,
 *   честная запись фактического ответа Meta в диагностику.
 *
 * Телеграм в Meta не передаётся: у него нет подходящего параметра
 * сопоставления, и выдавать его за чужое поле было бы враньём.
 */

export const PAGE_INTEREST_EVENT = 'PageInterest';

export interface PageInterestInput {
  /** Идентификатор записи в page_lock_subscribers: делает повтор идемпотентным. */
  subscriberId: number;
  path: string;
  email: string;
  phone: string;
  /** Явное согласие на маркетинг. Без него функция ничего не отправляет. */
  marketingConsent: boolean;
  consentRegion: string;
  clientIp: string;
  userAgent: string;
  fbp: string;
  fbc: string;
  eventSourceUrl: string;
}

export type PageInterestStatus = 'sent' | 'queued' | 'skipped' | 'failed';

export interface PageInterestResult {
  status: PageInterestStatus;
  reason?: string;
  eventId: string;
}

function sanitizeSourceUrl(value: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}

export async function sendPageInterestEvent(env: Env, input: PageInterestInput): Promise<PageInterestResult> {
  const eventId = `pli:${input.subscriberId}`;
  const eventTime = Math.floor(Date.now() / 1000);
  const eventSourceUrl = sanitizeSourceUrl(input.eventSourceUrl);
  const diagnosticsPage = { page_path: input.path, event_source_url: eventSourceUrl };

  if (!input.marketingConsent) {
    await recordMetaDiagnostics(env, {
      event_name: PAGE_INTEREST_EVENT,
      event_id: eventId,
      event_time: eventTime,
      status: 'skipped',
      error_message: 'marketing_consent_not_granted',
      marketing_consent: false,
      ...diagnosticsPage,
    });
    return { status: 'skipped', reason: 'нет согласия на маркетинг', eventId };
  }

  const token = env.META_CAPI_ACCESS_TOKEN;
  const pixelId = getMetaPixelId(env);
  const apiVersion = getMetaApiVersion(env);
  if (!token || !pixelId) {
    await recordMetaDiagnostics(env, {
      event_name: PAGE_INTEREST_EVENT,
      event_id: eventId,
      event_time: eventTime,
      status: 'skipped',
      error_message: 'missing_token_or_pixel_id',
      marketing_consent: true,
      ...diagnosticsPage,
    });
    return { status: 'skipped', reason: 'Meta CAPI не настроен', eventId };
  }

  const persisted = await getMetaOutboxEvent(env, eventId).catch(() => undefined);
  if (persisted?.status === 'sent' || await wasMetaEventAlreadySent(env, PAGE_INTEREST_EVENT, eventId)) {
    return { status: 'skipped', reason: 'событие уже подтверждено Meta', eventId };
  }
  if (persisted && ['pending', 'retry', 'sending'].includes(persisted.status)) {
    return { status: 'queued', reason: 'событие уже в очереди отправки', eventId };
  }

  const [hashedEmail, hashedPhone] = await Promise.all([
    input.email ? sha256Hex(normalizeEmail(input.email)) : undefined,
    input.phone ? sha256Hex(normalizePhone(input.phone)) : undefined,
  ]);

  if (!hashedEmail && !hashedPhone && !input.fbp && !input.fbc) {
    await recordMetaDiagnostics(env, {
      event_name: PAGE_INTEREST_EVENT,
      event_id: eventId,
      event_time: eventTime,
      status: 'skipped',
      error_message: 'no_match_keys',
      marketing_consent: true,
      ...diagnosticsPage,
    });
    return { status: 'skipped', reason: 'нет данных для сопоставления с Meta', eventId };
  }

  const event = {
    event_name: PAGE_INTEREST_EVENT,
    event_time: eventTime,
    // Человек только что нажал кнопку на странице сайта — это website, а не
    // системный сигнал из CRM.
    action_source: 'website',
    event_id: eventId,
    event_source_url: eventSourceUrl,
    user_data: {
      em: hashedEmail ? [hashedEmail] : undefined,
      ph: hashedPhone ? [hashedPhone] : undefined,
      fbp: input.fbp || undefined,
      fbc: input.fbc || undefined,
      client_ip_address: input.clientIp || undefined,
      client_user_agent: input.userAgent || undefined,
    },
    custom_data: {
      interest_page: input.path,
      // Что именно человек оставил — без самих значений.
      contact_channels: [input.email ? 'email' : '', input.phone ? 'phone' : '']
        .filter(Boolean)
        .join(','),
      lead_event_source: 'whalewzrd_page_lock',
    },
    ...getMetaDataProcessingOptions(env),
  };

  const body = JSON.stringify({ data: [event] });

  let outboxAvailable = false;
  let outboxError = '';
  try {
    const queued = await enqueueMetaEvent(env, {
      id: eventId,
      event_name: PAGE_INTEREST_EVENT,
      event_id: eventId,
      payload_json: body,
    });
    outboxAvailable = queued.durable;
    if (!queued.inserted && queued.state?.status === 'sent') {
      return { status: 'skipped', reason: 'событие уже подтверждено Meta', eventId };
    }
    if (!queued.inserted && queued.state && ['pending', 'retry', 'sending'].includes(queued.state.status)) {
      return { status: 'queued', reason: 'событие уже в очереди отправки', eventId };
    }
  } catch (error) {
    outboxError = error instanceof Error ? error.message : String(error);
  }

  const diagnosticsBase = {
    event_name: PAGE_INTEREST_EVENT,
    event_id: eventId,
    event_time: eventTime,
    has_email: Boolean(hashedEmail),
    has_phone: Boolean(hashedPhone),
    has_fbp: Boolean(input.fbp),
    has_fbc: Boolean(input.fbc),
    marketing_consent: true,
    consent_source: 'user',
    consent_region: input.consentRegion || undefined,
    consent_timestamp: Date.now(),
    ...diagnosticsPage,
  };

  try {
    const response = await fetchMetaWithRetry(
      `https://graph.facebook.com/${apiVersion}/${pixelId}/events?access_token=${token}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body },
      env,
    );

    if (!response.ok) {
      const errorText = await response.text();
      const errorReceipt = parseMetaApiReceipt(errorText);
      const retryable = isRetryableMetaResponse(response.status, errorReceipt);
      if (outboxAvailable) {
        const message = `HTTP ${response.status}: ${errorText.slice(0, 300)}`;
        if (retryable) {
          await markOutboxRetry(env, eventId, 1, Math.floor(Date.now() / 1000) + getOutboxRetryDelaySeconds(1), message);
        } else {
          await markOutboxDeadLetter(env, eventId, 1, message);
        }
      }
      await recordMetaDiagnostics(env, {
        ...diagnosticsBase,
        status: 'failed',
        error_code: errorReceipt?.error?.code || response.status,
        error_message: errorText.slice(0, 500),
        fbtrace_id: errorReceipt?.error?.fbtrace_id,
      });
      return {
        status: outboxAvailable && retryable ? 'queued' : 'failed',
        reason: outboxAvailable && retryable
          ? 'Meta ответила ошибкой — событие дошлётся автоматически'
          : `Meta ответила ошибкой ${response.status}${outboxError ? `; очередь недоступна: ${outboxError}` : ''}`,
        eventId,
      };
    }

    const receipt = await response.json().catch(() => null) as MetaApiReceipt | null;
    if (!isConfirmedMetaReceipt(receipt)) {
      const message = `Meta 2xx without events_received confirmation${receipt?.fbtrace_id ? ` (${receipt.fbtrace_id})` : ''}`;
      if (outboxAvailable) {
        await markOutboxRetry(env, eventId, 1, Math.floor(Date.now() / 1000) + getOutboxRetryDelaySeconds(1), message);
      }
      await recordMetaDiagnostics(env, {
        ...diagnosticsBase,
        status: 'failed',
        error_message: message,
        fbtrace_id: receipt?.fbtrace_id,
        events_received: receipt?.events_received,
      });
      return {
        status: outboxAvailable ? 'queued' : 'failed',
        reason: 'Meta не подтвердила приём события',
        eventId,
      };
    }

    await markMetaEventSent(env, PAGE_INTEREST_EVENT, eventId);
    if (outboxAvailable) await markOutboxSent(env, eventId);
    await recordMetaDiagnostics(env, {
      ...diagnosticsBase,
      status: 'sent',
      events_received: receipt?.events_received,
      fbtrace_id: receipt?.fbtrace_id,
    });
    return { status: 'sent', eventId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (outboxAvailable) {
      await markOutboxRetry(env, eventId, 1, Math.floor(Date.now() / 1000) + getOutboxRetryDelaySeconds(1), message);
    }
    await recordMetaDiagnostics(env, { ...diagnosticsBase, status: 'failed', error_message: message });
    return {
      status: outboxAvailable ? 'queued' : 'failed',
      reason: outboxAvailable ? 'сеть недоступна — событие дошлётся автоматически' : 'сеть и очередь недоступны',
      eventId,
    };
  }
}
