import type { Env } from './types';
import { normalizeEmail, normalizePhone, sha256Hex } from './meta-pii';
import { markMetaEventSent, recordMetaDiagnostics, wasMetaEventAlreadySent } from './meta-diagnostics';
import { fetchMetaWithRetry } from './meta-capi';
import { enqueueMetaEvent, getOutboxRetryDelaySeconds, markOutboxRetry, markOutboxSent } from './meta-outbox';

// Строка таблицы leads (поля, нужные для события качества)
export interface LeadQualityRow {
  id: number;
  email?: string;
  phone?: string;
  fbp?: string;
  fbc?: string;
  event_source_url?: string;
  external_id?: string;
  marketing_consent?: number;
  service?: string;
  page_path?: string;
}

export type LeadQuality = 'target' | 'nontarget';

export interface LeadQualityResult {
  status: 'sent' | 'skipped' | 'failed';
  reason?: string;
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

// Обратная связь по качеству лида для Meta: QualifiedLead / UnqualifiedLead.
// Отправляется, когда в админке заявку помечают «целевой» / «нецелевой».
// Правила те же, что у остальных серверных событий:
// - только при marketing_consent, полученном вместе с заявкой (не ослаблять);
// - PII уходит только в виде SHA-256 хешей;
// - дедупликация по event_id + запись в meta_outbox с фоновой досылкой.
export async function sendLeadQualityEvent(env: Env, lead: LeadQualityRow, quality: LeadQuality): Promise<LeadQualityResult> {
  const eventName = quality === 'target' ? 'QualifiedLead' : 'UnqualifiedLead';
  const eventId = `lq:${quality}:${lead.id}`;
  const eventTime = Math.floor(Date.now() / 1000);
  const eventSourceUrl = sanitizeSourceUrl(lead.event_source_url);

  if (Number(lead.marketing_consent || 0) !== 1) {
    await recordMetaDiagnostics(env, { event_name: eventName, event_id: eventId, event_time: eventTime, status: 'skipped', error_message: 'marketing_consent_not_granted', page_path: lead.page_path, event_source_url: eventSourceUrl, service: lead.service, marketing_consent: false });
    return { status: 'skipped', reason: 'нет согласия на маркетинг (или заявка создана до обновления)' };
  }

  const token = env.META_CAPI_ACCESS_TOKEN;
  const pixelId = env.VITE_META_PIXEL_ID || '926332213606723';
  const apiVersion = env.META_CAPI_API_VERSION || 'v25.0';
  if (!token || !pixelId) {
    await recordMetaDiagnostics(env, { event_name: eventName, event_id: eventId, event_time: eventTime, status: 'skipped', error_message: 'missing_token_or_pixel_id', page_path: lead.page_path, event_source_url: eventSourceUrl, service: lead.service, marketing_consent: true });
    return { status: 'skipped', reason: 'Meta CAPI не настроен' };
  }

  if (await wasMetaEventAlreadySent(env, eventName, eventId)) {
    return { status: 'skipped', reason: 'событие уже отправлялось для этой заявки' };
  }

  const [hashedEmail, hashedPhone, hashedExternalId] = await Promise.all([
    lead.email ? sha256Hex(normalizeEmail(lead.email)) : undefined,
    lead.phone ? sha256Hex(normalizePhone(lead.phone)) : undefined,
    lead.external_id ? sha256Hex(String(lead.external_id).trim().toLowerCase()) : undefined,
  ]);
  const fbp = lead.fbp || undefined;
  const fbc = lead.fbc || undefined;

  if (!hashedEmail && !hashedPhone && !fbp && !fbc && !hashedExternalId) {
    await recordMetaDiagnostics(env, { event_name: eventName, event_id: eventId, event_time: eventTime, status: 'skipped', error_message: 'no_match_keys', page_path: lead.page_path, event_source_url: eventSourceUrl, service: lead.service, marketing_consent: true });
    return { status: 'skipped', reason: 'у заявки нет данных для сопоставления с Meta' };
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
  };

  const body = JSON.stringify({ data: [event] });
  // В outbox кладём готовое тело запроса: при сбое фоновый обработчик дошлёт
  await enqueueMetaEvent(env, { id: eventId, event_name: eventName, event_id: eventId, payload_json: body });

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
      await markOutboxRetry(env, eventId, 1, Math.floor(Date.now() / 1000) + getOutboxRetryDelaySeconds(1), `HTTP ${response.status}: ${errorText.slice(0, 300)}`);
      await recordMetaDiagnostics(env, { ...diagnosticsBase, status: 'failed', error_code: response.status, error_message: errorText.slice(0, 500) });
      return { status: 'failed', reason: `Meta ответила ошибкой ${response.status} — событие дошлётся автоматически` };
    }
    await markMetaEventSent(env, eventName, eventId);
    await markOutboxSent(env, eventId);
    await recordMetaDiagnostics(env, { ...diagnosticsBase, status: 'sent' });
    return { status: 'sent' };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markOutboxRetry(env, eventId, 1, Math.floor(Date.now() / 1000) + getOutboxRetryDelaySeconds(1), message);
    await recordMetaDiagnostics(env, { ...diagnosticsBase, status: 'failed', error_message: message });
    return { status: 'failed', reason: 'сеть недоступна — событие дошлётся автоматически' };
  }
}
