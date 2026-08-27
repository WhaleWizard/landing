import { json } from '../_lib/http';
import { CACHE_CONTROL } from '../_lib/cache';
import type { Env } from '../_lib/types';
import { enforceRateLimit } from '../_lib/rate-limit';
import { verifyAdminPassword, verifyDebugSecret } from '../_lib/auth';
import { recordMetaDiagnostics } from '../_lib/meta-diagnostics';
import { fetchMetaWithRetry, getMetaApiVersion, getMetaDataProcessingOptions, getMetaPixelId, isConfirmedMetaReceipt, type MetaApiReceipt } from '../_lib/meta-capi';
import { normalizeEmail, normalizeLocation, normalizeName, normalizePhone, sha256Hex } from '../_lib/meta-pii';

const TEST_EVENTS = ['PageView', 'ViewContent', 'FormStart', 'LeadFormView', 'EngagedView', 'Contact', 'Lead', 'QualifiedLead', 'UnqualifiedLead'] as const;

type TestEventName = typeof TEST_EVENTS[number];

interface MetaTestPayload {
  event_name?: TestEventName | 'all';
  page_url?: string;
}

// Синтетический контакт для проверки доставки параметров. Значения заведомо
// нереальные: задача теста — увидеть, что поле доходит до Meta, а не выдать
// чужие данные за тестовые.
const TEST_CONTACT = {
  email: 'test.lead@whalewzrd.com',
  phone: '+79000000000',
  firstName: 'Тест',
  lastName: 'Тестовый',
};

function getClientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
}

function getRequestGeo(request: Request): { country?: string; city?: string; region?: string } {
  const cf = (request as Request & { cf?: Record<string, unknown> }).cf || {};
  return {
    country: request.headers.get('CF-IPCountry') || (cf.country as string) || undefined,
    city: (cf.city as string) || undefined,
    region: (cf.regionCode as string) || (cf.region as string) || undefined,
  };
}

/**
 * Собирает user_data тестового лида по тем же правилам, что и `/api/lead`:
 * те же ключи, та же нормализация, тот же SHA-256. Без этого «тестовое
 * событие» проверяло только связь с Meta и ничего не говорило о том, какие
 * параметры совпадения реально уходят с заявки.
 */
type LeadUserData = Awaited<ReturnType<typeof buildLeadUserData>>;

async function buildLeadUserData(request: Request, eventTime: number) {
  const geo = getRequestGeo(request);
  const [em, ph, fn, ln, country, ct, st, externalId] = await Promise.all([
    sha256Hex(normalizeEmail(TEST_CONTACT.email)),
    sha256Hex(normalizePhone(TEST_CONTACT.phone)),
    sha256Hex(normalizeName(TEST_CONTACT.firstName)),
    sha256Hex(normalizeName(TEST_CONTACT.lastName)),
    geo.country ? sha256Hex(normalizeLocation(geo.country)) : undefined,
    geo.city ? sha256Hex(normalizeLocation(geo.city)) : undefined,
    geo.region ? sha256Hex(normalizeLocation(geo.region)) : undefined,
    sha256Hex(`meta-capi-test-${TEST_CONTACT.email}`),
  ]);

  return {
    em: [em],
    ph: [ph],
    fn: [fn],
    ln: [ln],
    country: country ? [country] : undefined,
    ct: ct ? [ct] : undefined,
    st: st ? [st] : undefined,
    external_id: [externalId],
    // Браузерных cookie у админки нет: на /admin пиксель не грузится намеренно.
    // Значения синтетические, но формата Meta — иначе поле не проверить вовсе.
    fbp: `fb.1.${eventTime * 1000}.${Math.floor(Math.random() * 9e9) + 1e9}`,
    fbc: `fb.1.${eventTime * 1000}.metacapitest${eventTime}`,
    client_ip_address: getClientIp(request),
    client_user_agent: request.headers.get('User-Agent') || 'Meta CAPI smoke test',
  };
}

function buildLeadCustomData(request: Request, eventSourceUrl: string) {
  const geo = getRequestGeo(request);
  return {
    service: 'Meta CAPI diagnostics',
    service_slug: 'meta-capi-diagnostics',
    contact_method: 'telegram',
    form_id: 'meta_capi_test_form',
    form_variant: 'diagnostics',
    lead_source_page: '/admin',
    content_name: 'Тестовая заявка из раздела Meta CAPI',
    content_type: 'lead',
    content_ids: ['meta-capi-diagnostics'],
    page_title: 'Meta CAPI — тестовое событие',
    page_location: eventSourceUrl,
    page_path: '/admin',
    utm_source: 'whalewzrd_admin',
    utm_medium: 'diagnostics',
    utm_campaign: 'meta_capi_test_event',
    language: request.headers.get('Accept-Language')?.split(',')[0] || undefined,
    country: geo.country,
    device_type: /mobi|iphone|android/i.test(request.headers.get('User-Agent') || '') ? 'mobile' : 'desktop',
    consent_source: 'admin_test_event',
    consent_version: 1,
    consent_timestamp: Math.floor(Date.now() / 1000),
  };
}

// Показывает владельцу, что именно ушло, не раскрывая значений: хеш SHA-256
// сам по себе не персональные данные, но и печатать его целиком незачем.
function describeSentFields(value: Record<string, unknown> | undefined): { key: string; preview: string }[] {
  if (!value) return [];
  return Object.entries(value)
    .filter(([, item]) => item !== undefined && item !== null && item !== '')
    .map(([key, item]) => {
      const raw = Array.isArray(item) ? String(item[0] ?? '') : String(item);
      const preview = /^[a-f0-9]{64}$/i.test(raw) ? `${raw.slice(0, 12)}… (SHA-256)` : raw.slice(0, 60);
      return { key, preview };
    });
}

function buildTestEvent(
  eventName: TestEventName,
  request: Request,
  eventSourceUrl: string,
  originalLead: { eventId: string; eventTime: number },
  env: Env,
  leadUserData: LeadUserData,
) {
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

  // Lead — единственное событие, ради которого стоит смотреть тест целиком:
  // именно на нём проверяется, доходят ли параметры совпадения пользователя.
  if (eventName === 'Lead') {
    return {
      ...base,
      user_data: leadUserData,
      custom_data: buildLeadCustomData(request, eventSourceUrl),
    };
  }

  if (eventName === 'QualifiedLead' || eventName === 'UnqualifiedLead') {
    return {
      ...base,
      // Тот же набор, что у Lead: в реальной связке события качества лида
      // приходят по тому же человеку, и разные fbp/external_id тут выглядели
      // бы как два разных пользователя.
      user_data: leadUserData,
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

  const bySecret = verifyDebugSecret(request.headers.get('x-meta-debug-secret'), env);

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
  // Один набор данных пользователя на весь запрос: события одного теста должны
  // выглядеть для Meta как один человек, а не как несколько разных.
  const leadUserData = await buildLeadUserData(request, originalLead.eventTime);
  const events = requested.map(
    (name) => buildTestEvent(name, request, eventSourceUrl, originalLead, env, leadUserData),
  );

  // Через общий отправитель, как и все остальные события: он даёт таймаут и
  // повторы. Голый fetch здесь означал, что зависший запрос к Meta держал бы
  // ответ админке до лимита воркера.
  const response = await fetchMetaWithRetry(
    `https://graph.facebook.com/${apiVersion}/${pixelId}/events?access_token=${token}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: events, test_event_code: testCode }),
    },
    env,
  );

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
      test_event_code: testCode,
      events_requested: events.map((event) => ({ event_name: event.event_name, event_id: event.event_id })),
      // Разбор отправленного: событие синтетическое, поэтому показывать его
      // состав безопасно, а владельцу это единственный способ увидеть, какие
      // параметры реально доходят до Meta с заявки.
      events_detail: events.map((event) => {
        const eventRecord = event as typeof event & {
          user_data?: Record<string, unknown>;
          custom_data?: Record<string, unknown>;
        };
        return {
          event_name: event.event_name,
          event_id: event.event_id,
          action_source: event.action_source,
          event_source_url: event.event_source_url,
          user_data: describeSentFields(eventRecord.user_data),
          custom_data: describeSentFields(eventRecord.custom_data),
        };
      }),
      meta: parsed || resultText,
    },
    { status: confirmed ? 200 : 502, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
  );
};
