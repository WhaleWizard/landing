import { json } from '../_lib/http';
import { CACHE_CONTROL } from '../_lib/cache';
import type { Env } from '../_lib/types';
import { enforceRateLimit } from '../_lib/rate-limit';
import { verifyAdminPassword } from '../_lib/auth';
import { recordMetaDiagnostics } from '../_lib/meta-diagnostics';
import { getMetaApiVersion, getMetaDataProcessingOptions, getMetaPixelId, isConfirmedMetaReceipt, type MetaApiReceipt } from '../_lib/meta-capi';

const TEST_EVENTS = ['PageView', 'ViewContent', 'FormStart', 'LeadFormView', 'EngagedView', 'Contact', 'Lead', 'QualifiedLead', 'UnqualifiedLead'] as const;

type TestEventName = typeof TEST_EVENTS[number];

interface MetaTestPayload {
  event_name?: TestEventName | 'all';
  page_url?: string;
}

function getClientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
}

function buildTestEvent(eventName: TestEventName, request: Request, eventSourceUrl: string, originalLead: { eventId: string; eventTime: number }, env: Env) {
  const eventId = eventName === 'Lead' ? originalLead.eventId : `test-${eventName}-${crypto.randomUUID()}`;
  const eventTime = eventName === 'Lead' ? originalLead.eventTime : Math.floor(Date.now() / 1000);
  const base = {
    event_name: eventName,
    event_time: eventTime,
    event_id: eventId,
    action_source: 'website',
    event_source_url: eventSourceUrl,
    user_data: {
      client_ip_address: getClientIp(request),
      client_user_agent: request.headers.get('User-Agent') || 'Meta CAPI smoke test',
    },
    ...getMetaDataProcessingOptions(env),
  };

  if (eventName === 'ViewContent') {
    return {
      ...base,
      custom_data: {
        content_name: 'Meta CAPI test ViewContent',
        content_category: 'diagnostics',
        content_type: 'service',
        content_ids: ['meta-capi-test'],
      },
    };
  }

  if (eventName === 'FormStart') {
    return {
      ...base,
      custom_data: {
        form_id: 'meta_capi_test_form',
        form_step: 'first_interaction',
        form_field: 'email',
      },
    };
  }

  if (eventName === 'LeadFormView') {
    return {
      ...base,
      custom_data: {
        form_id: 'meta_capi_test_form',
        content_name: 'Meta CAPI test LeadFormView',
        content_category: 'diagnostics',
      },
    };
  }

  if (eventName === 'EngagedView') {
    return {
      ...base,
      custom_data: {
        engagement_reason: 'diagnostics_test',
        engagement_seconds: 10,
        content_category: 'diagnostics',
      },
    };
  }

  if (eventName === 'Contact') {
    return {
      ...base,
      custom_data: {
        contact_channel: 'diagnostics',
        placement: 'meta_capi_test_event',
        content_category: 'contact_intent',
      },
    };
  }

  if (eventName === 'Lead') {
    return {
      ...base,
      custom_data: {
        service: 'Meta CAPI diagnostics',
        form_id: 'meta_capi_test_form',
      },
    };
  }

  if (eventName === 'QualifiedLead' || eventName === 'UnqualifiedLead') {
    return {
      ...base,
      action_source: 'system_generated',
      original_event_data: {
        event_name: 'Lead',
        event_time: originalLead.eventTime,
        event_id: originalLead.eventId,
      },
      custom_data: {
        lead_quality: eventName === 'QualifiedLead' ? 'qualified' : 'unqualified',
        lead_event_source: 'meta_capi_test_event',
      },
    };
  }

  return base;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const rateLimited = await enforceRateLimit(request, 'meta_test_event');
  if (rateLimited) return rateLimited;

  const token = env.META_CAPI_ACCESS_TOKEN;
  const pixelId = getMetaPixelId(env);
  const testCode = env.META_CAPI_TEST_CODE;
  const apiVersion = getMetaApiVersion(env);

  const debugSecret = env.META_CAPI_DEBUG_SECRET;
  const providedSecret = request.headers.get('x-meta-debug-secret') || undefined;
  const bySecret = Boolean(debugSecret) && providedSecret === debugSecret;

  // Второй допуск — пароль админки: кнопка «Отправить тестовое событие» в
  // разделе Meta CAPI не должна требовать отдельного секрета. Права те же:
  // владелец админки и так управляет трекингом. Событие уходит только с
  // test_event_code, то есть в «Тестирование событий», а не в живые данные.
  const byAdmin = verifyAdminPassword(request.headers.get('X-Admin-Password') || '', env);

  if (!bySecret && !byAdmin) {
    return json(
      { success: false, error: 'META_CAPI_DEBUG_SECRET is required and must match x-meta-debug-secret' },
      { status: 403, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }

  if (!token || !pixelId || !testCode) {
    return json(
      { success: false, error: 'META_CAPI_ACCESS_TOKEN, VITE_META_PIXEL_ID and META_CAPI_TEST_CODE are required' },
      { status: 400, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }

  const payload = (await request.json().catch(() => ({}))) as MetaTestPayload;
  const requested = payload.event_name === 'all' || !payload.event_name ? TEST_EVENTS : TEST_EVENTS.filter((name) => name === payload.event_name);
  const eventSourceUrl = payload.page_url || request.headers.get('Referer') || env.SITE_URL || request.url;
  const originalLead = { eventId: `test-Lead-${crypto.randomUUID()}`, eventTime: Math.floor(Date.now() / 1000) };
  const events = requested.map((name) => buildTestEvent(name, request, eventSourceUrl, originalLead, env));

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${pixelId}/events?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: events, test_event_code: testCode }),
  });

  const resultText = await response.text();
  const parsed = (() => {
    try { return JSON.parse(resultText) as MetaApiReceipt & { error?: { code?: number; message?: string } }; }
    catch { return null; }
  })();
  const confirmed = response.ok && isConfirmedMetaReceipt(parsed);

  for (const event of events) {
    waitUntil(recordMetaDiagnostics(env, {
      event_name: event.event_name,
      event_id: event.event_id,
      event_time: event.event_time,
      status: confirmed ? 'sent' : 'failed',
      events_received: confirmed ? 1 : parsed?.events_received,
      fbtrace_id: parsed?.fbtrace_id,
      error_code: confirmed ? undefined : (parsed?.error?.code || response.status),
      error_message: confirmed ? undefined : (parsed?.error?.message || (response.ok ? 'Meta 2xx without events_received confirmation' : resultText)),
      page_url: eventSourceUrl,
      service: 'meta_capi_test_event',
      marketing_consent: true,
    }));
  }

  return json(
    {
      success: confirmed,
      status: response.status,
      events_requested: events.map((event) => ({ event_name: event.event_name, event_id: event.event_id })),
      meta: parsed || resultText,
    },
    { status: confirmed ? 200 : 502, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
  );
};
