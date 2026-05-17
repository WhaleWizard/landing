import { json } from '../_lib/http';
import { CACHE_CONTROL } from '../_lib/cache';
import type { Env } from '../_lib/types';
import { enforceRateLimit } from '../_lib/rate-limit';
import { recordMetaDiagnostics } from '../_lib/meta-diagnostics';

const TEST_EVENTS = ['PageView', 'ViewContent', 'FormStart', 'Lead'] as const;

type TestEventName = typeof TEST_EVENTS[number];

interface MetaTestPayload {
  event_name?: TestEventName | 'all';
  page_url?: string;
}

function getClientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
}

function buildTestEvent(eventName: TestEventName, request: Request, eventSourceUrl: string) {
  const eventId = `test-${eventName}-${crypto.randomUUID()}`;
  const eventTime = Math.floor(Date.now() / 1000);
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

  if (eventName === 'Lead') {
    return {
      ...base,
      custom_data: {
        service: 'Meta CAPI diagnostics',
        form_id: 'meta_capi_test_form',
      },
    };
  }

  return base;
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const rateLimited = await enforceRateLimit(request);
  if (rateLimited) return rateLimited;

  const token = env.META_CAPI_ACCESS_TOKEN;
  const pixelId = env.VITE_META_PIXEL_ID || '926332213606723';
  const testCode = env.META_CAPI_TEST_CODE;
  const apiVersion = env.META_CAPI_API_VERSION || 'v25.0';

  const debugSecret = env.META_CAPI_DEBUG_SECRET;
  const providedSecret = request.headers.get('x-meta-debug-secret') || new URL(request.url).searchParams.get('secret') || undefined;

  if (!debugSecret || providedSecret !== debugSecret) {
    return json(
      { success: false, error: 'META_CAPI_DEBUG_SECRET is required and must match x-meta-debug-secret or ?secret=' },
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
  const events = requested.map((name) => buildTestEvent(name, request, eventSourceUrl));

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${pixelId}/events?access_token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: events, test_event_code: testCode }),
  });

  const resultText = await response.text();
  const parsed = (() => {
    try { return JSON.parse(resultText) as { fbtrace_id?: string; events_received?: number; error?: { code?: number; message?: string } }; }
    catch { return null; }
  })();

  for (const event of events) {
    waitUntil(recordMetaDiagnostics(env, {
      event_name: event.event_name,
      event_id: event.event_id,
      event_time: event.event_time,
      status: response.ok ? 'sent' : 'failed',
      events_received: parsed?.events_received,
      fbtrace_id: parsed?.fbtrace_id,
      error_code: parsed?.error?.code || response.status,
      error_message: response.ok ? undefined : (parsed?.error?.message || resultText),
      page_url: eventSourceUrl,
      service: 'meta_capi_test_event',
      marketing_consent: true,
    }));
  }

  return json(
    {
      success: response.ok,
      status: response.status,
      events_requested: events.map((event) => ({ event_name: event.event_name, event_id: event.event_id })),
      meta: parsed || resultText,
    },
    { status: response.ok ? 200 : 502, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
  );
};
