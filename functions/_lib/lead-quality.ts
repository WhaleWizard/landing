import type { Env } from './types';
import { normalizeEmail, normalizeName, normalizePhone, sha256Hex } from './meta-pii';
import { markMetaEventSent, recordMetaDiagnostics, wasMetaEventAlreadySent } from './meta-diagnostics';
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
import { enqueueMetaEvent, getMetaOutboxEvent, getOutboxRetryDelaySeconds, markOutboxDeadLetter, markOutboxRetry, markOutboxSent } from './meta-outbox';

// Строка таблицы leads (поля, нужные для события качества)
export interface LeadQualityRow {
  id: number;
  event_id?: string;
  name?: string;
  email?: string;
  phone?: string;
  fbp?: string;
  fbc?: string;
  event_source_url?: string;
  external_id?: string;
  marketing_consent?: number;
  service?: string;
  page_path?: string;
  created_at?: string;
  last_submitted_at?: string;
}

export type LeadQuality = 'target' | 'nontarget';

export interface LeadQualityResult {
  status: 'sent' | 'queued' | 'skipped' | 'failed';
  reason?: string;
  event_id: string;
  events_received?: number;
  fbtrace_id?: string;
}

function sanitizeSourceUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}

function splitName(value: string | undefined): { firstName?: string; lastName?: string } {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  return {
    firstName: parts[0],
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : undefined,
  };
}

function parseSqliteTimestamp(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const iso = value.includes('T') ? value : `${value.replace(' ', 'T')}Z`;
  const parsed = Date.parse(iso);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : undefined;
}

// Обратная связь по качеству лида для Meta: QualifiedLead / UnqualifiedLead.
// Отправляется, когда в админке заявку помечают «целевой» / «нецелевой».
// Правила те же, что у остальных серверных событий:
// - только при marketing_consent, полученном вместе с заявкой (не ослаблять);
// - PII уходит только в виде SHA-256 хешей;
// - дедупликация по event_id + запись в meta_outbox с фоновой досылкой.
export async function sendLeadQualityEvent(env: Env, lead: LeadQualityRow, quality: LeadQuality): Promise<LeadQualityResult> {
  const eventName = quality === 'target' ? 'QualifiedLead' : 'UnqualifiedLead';
  const originalLeadEventId = String(lead.event_id || lead.id);
  const eventId = `lq:${quality}:${originalLeadEventId}`;
  const eventTime = Math.floor(Date.now() / 1000);
  const originalEventTime = parseSqliteTimestamp(lead.last_submitted_at || lead.created_at) || eventTime;
  const eventSourceUrl = sanitizeSourceUrl(lead.event_source_url);

  if (Number(lead.marketing_consent || 0) !== 1) {
    await recordMetaDiagnostics(env, { event_name: eventName, event_id: eventId, event_time: eventTime, status: 'skipped', error_message: 'marketing_consent_not_granted', page_path: lead.page_path, event_source_url: eventSourceUrl, service: lead.service, marketing_consent: false });
    return { status: 'skipped', reason: 'нет согласия на маркетинг (или заявка создана до обновления)', event_id: eventId };
  }

  const token = env.META_CAPI_ACCESS_TOKEN;
  const pixelId = getMetaPixelId(env);
  const apiVersion = getMetaApiVersion(env);
  if (!token) {
    await recordMetaDiagnostics(env, { event_name: eventName, event_id: eventId, event_time: eventTime, status: 'skipped', error_message: 'missing_token_or_pixel_id', page_path: lead.page_path, event_source_url: eventSourceUrl, service: lead.service, marketing_consent: true });
    return { status: 'skipped', reason: 'Meta CAPI не настроен', event_id: eventId };
  }

  const persisted = await getMetaOutboxEvent(env, eventId).catch(() => undefined);
  if (persisted?.status === 'sent' || await wasMetaEventAlreadySent(env, eventName, eventId)) {
    return { status: 'skipped', reason: 'событие уже подтверждено Meta для этой заявки', event_id: eventId };
  }
  if (persisted && ['pending', 'retry', 'sending'].includes(persisted.status)) {
    return { status: 'queued', reason: 'событие уже находится в очереди отправки', event_id: eventId };
  }

  const { firstName, lastName } = splitName(lead.name);
  const [hashedEmail, hashedPhone, hashedExternalId, hashedFirstName, hashedLastName] = await Promise.all([
    lead.email ? sha256Hex(normalizeEmail(lead.email)) : undefined,
    lead.phone ? sha256Hex(normalizePhone(lead.phone)) : undefined,
    lead.external_id ? sha256Hex(String(lead.external_id).trim().toLowerCase()) : undefined,
    firstName ? sha256Hex(normalizeName(firstName)) : undefined,
    lastName ? sha256Hex(normalizeName(lastName)) : undefined,
  ]);
  const fbp = lead.fbp || undefined;
  const fbc = lead.fbc || undefined;

  if (!hashedEmail && !hashedPhone && !fbp && !fbc && !hashedExternalId) {
    await recordMetaDiagnostics(env, { event_name: eventName, event_id: eventId, event_time: eventTime, status: 'skipped', error_message: 'no_match_keys', page_path: lead.page_path, event_source_url: eventSourceUrl, service: lead.service, marketing_consent: true });
    return { status: 'skipped', reason: 'у заявки нет данных для сопоставления с Meta', event_id: eventId };
  }

  const event = {
    event_name: eventName,
    event_time: eventTime,
    // system_generated — рекомендация Meta для CRM-событий о качестве лида
    action_source: 'system_generated',
    event_id: eventId,
    event_source_url: eventSourceUrl,
    user_data: {
      em: hashedEmail ? [hashedEmail] : undefined,
      ph: hashedPhone ? [hashedPhone] : undefined,
      fn: hashedFirstName ? [hashedFirstName] : undefined,
      ln: hashedLastName ? [hashedLastName] : undefined,
      fbp,
      fbc,
      external_id: hashedExternalId ? [hashedExternalId] : undefined,
    },
    custom_data: {
      lead_quality: quality === 'target' ? 'qualified' : 'unqualified',
      lead_event_source: 'whalewzrd_admin',
      service: lead.service || undefined,
      lead_source_page: lead.page_path || undefined,
    },
    original_event_data: {
      event_name: 'Lead',
      event_time: originalEventTime,
      event_id: originalLeadEventId,
    },
    ...getMetaDataProcessingOptions(env),
  };

  const body = JSON.stringify({ data: [event] });
  // В outbox кладём готовое тело запроса: при сбое фоновый обработчик дошлёт.
  // Если миграция очереди ещё не применена, не блокируем прямую попытку отправки.
  let outboxAvailable = false;
  let outboxError = '';
  try {
    const queued = await enqueueMetaEvent(env, { id: eventId, event_name: eventName, event_id: eventId, payload_json: body });
    outboxAvailable = queued.durable;
    if (!queued.inserted && queued.state?.status === 'sent') {
      return { status: 'skipped', reason: 'событие уже подтверждено Meta для этой заявки', event_id: eventId };
    }
    if (!queued.inserted && queued.state && ['pending', 'retry', 'sending'].includes(queued.state.status)) {
      return { status: 'queued', reason: 'событие уже находится в очереди отправки', event_id: eventId };
    }
  } catch (error) {
    outboxError = error instanceof Error ? error.message : String(error);
  }

  const diagnosticsBase = {
    event_name: eventName,
    event_id: eventId,
    event_time: eventTime,
    page_path: lead.page_path,
    event_source_url: eventSourceUrl,
    service: lead.service,
    has_email: Boolean(hashedEmail),
    has_phone: Boolean(hashedPhone),
    has_fbp: Boolean(fbp),
    has_fbc: Boolean(fbc),
    has_external_id: Boolean(hashedExternalId),
    marketing_consent: true,
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
        const outboxMessage = `HTTP ${response.status}: ${errorText.slice(0, 300)}`;
        if (retryable) {
          await markOutboxRetry(env, eventId, 1, Math.floor(Date.now() / 1000) + getOutboxRetryDelaySeconds(1), outboxMessage);
        } else {
          await markOutboxDeadLetter(env, eventId, 1, outboxMessage);
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
          ? `Meta ответила ошибкой ${response.status} — событие дошлётся автоматически`
          : retryable
            ? `Meta ответила ошибкой ${response.status}; очередь недоступна${outboxError ? `: ${outboxError}` : ''}`
            : `Meta отклонила событие с постоянной ошибкой ${response.status}; автоповтор остановлен`,
        event_id: eventId,
      };
    }

    const receipt = await response.json().catch(() => null) as MetaApiReceipt | null;
    if (!isConfirmedMetaReceipt(receipt)) {
      const message = `Meta 2xx without events_received confirmation${receipt?.fbtrace_id ? ` (${receipt.fbtrace_id})` : ''}`;
      if (outboxAvailable) {
        await markOutboxRetry(env, eventId, 1, Math.floor(Date.now() / 1000) + getOutboxRetryDelaySeconds(1), message);
      }
      await recordMetaDiagnostics(env, { ...diagnosticsBase, status: 'failed', error_message: message, fbtrace_id: receipt?.fbtrace_id, events_received: receipt?.events_received });
      return {
        status: outboxAvailable ? 'queued' : 'failed',
        reason: outboxAvailable ? 'Meta не подтвердила приём — событие оставлено в очереди' : 'Meta не подтвердила приём, а очередь недоступна',
        event_id: eventId,
        events_received: receipt?.events_received,
        fbtrace_id: receipt?.fbtrace_id,
      };
    }

    await markMetaEventSent(env, eventName, eventId);
    if (outboxAvailable) await markOutboxSent(env, eventId);
    await recordMetaDiagnostics(env, { ...diagnosticsBase, status: 'sent', events_received: receipt.events_received, fbtrace_id: receipt.fbtrace_id });
    return { status: 'sent', event_id: eventId, events_received: receipt.events_received, fbtrace_id: receipt.fbtrace_id };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (outboxAvailable) {
      await markOutboxRetry(env, eventId, 1, Math.floor(Date.now() / 1000) + getOutboxRetryDelaySeconds(1), message);
    }
    await recordMetaDiagnostics(env, { ...diagnosticsBase, status: 'failed', error_message: message });
    return {
      status: outboxAvailable ? 'queued' : 'failed',
      reason: outboxAvailable ? 'сеть недоступна — событие дошлётся автоматически' : 'сеть и очередь отправки недоступны',
      event_id: eventId,
    };
  }
}
