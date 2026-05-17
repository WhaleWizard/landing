import { json } from '../_lib/http';
import { CACHE_CONTROL } from '../_lib/cache';
import type { Env } from '../_lib/types';
import { enforceRateLimit } from '../_lib/rate-limit';
import { markMetaEventSent, recordMetaDiagnostics, wasMetaEventAlreadySent } from '../_lib/meta-diagnostics';
import { fetchMetaWithRetry, isTrustedTrackingRequest } from '../_lib/meta-capi';
import { enqueueMetaEvent, markOutboxRetry, markOutboxSent } from '../_lib/meta-outbox';
import { getTrackingSignatureMode, verifyTrackingSignature } from '../_lib/tracking-signature';

type MetaEventName = 'ViewContent' | 'FormStart' | 'Contact' | 'LeadFormView' | 'EngagedView';

interface MetaEventPayload {
  event_name?: MetaEventName;
  event_id?: string;
  event_time?: number;
  page_url?: string;
  page_location?: string;
  referrer?: string;
  external_id?: string;
  em?: string;
  ph?: string;
  fn?: string;
  ln?: string;
  fbp?: string;
  fbc?: string;
  fbclid?: string;
  marketing_consent?: boolean;
  landing_page_url?: string;
  first_touch_url?: string;
  first_touch_at?: string;
  last_touch_url?: string;
  last_touch_at?: string;
  session_id?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  utm_id?: string;
  gclid?: string;
  wbraid?: string;
  gbraid?: string;
  yclid?: string;
  page_title?: string;
  page_path?: string;
  browser_language?: string;
  screen_width?: number;
  screen_height?: number;
  viewport_width?: number;
  viewport_height?: number;
  device_pixel_ratio?: number;
  timezone_offset?: number;
  consent_version?: number;
  consent_source?: string;
  consent_region?: string;
  consent_timestamp?: number;
  service?: string;
  service_slug?: string;
  form_id?: string;
  form_step?: string;
  form_field?: string;
  engagement_type?: string;
  engagement_seconds?: number;
  scroll_depth?: number;
  contact_channel?: string;
  placement?: string;
  content_name?: string;
  content_category?: string;
  content_type?: string;
  content_ids?: string[];
}

const ALLOWED_EVENTS = new Set<MetaEventName>(['ViewContent', 'FormStart', 'Contact', 'LeadFormView', 'EngagedView']);

function sanitizeText(value: string, max: number): string {
  return String(value || '').trim().slice(0, max);
}

function sanitizeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function sanitizeTextArray(value: unknown, maxItems: number, maxTextLength: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item) => sanitizeText(String(item || ''), maxTextLength))
    .filter(Boolean)
    .slice(0, maxItems);
  return items.length ? items : undefined;
}

function normalizeTextForMeta(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeLocationForMeta(value: string): string {
  return normalizeTextForMeta(value).replace(/[\s\p{P}\p{S}_]+/gu, '');
}

function createFbcFromFbclid(fbclid: string | undefined, eventTime: number): string | undefined {
  return fbclid ? `fb.1.${eventTime * 1000}.${fbclid}` : undefined;
}

function createFbcFromPageUrl(pageUrl: string | undefined, eventTime: number): string | undefined {
  if (!pageUrl) return undefined;

  try {
    return createFbcFromFbclid(new URL(pageUrl).searchParams.get('fbclid')?.trim(), eventTime);
  } catch {
    return undefined;
  }
}

function normalizeMetaEventPayload(payload: MetaEventPayload): MetaEventPayload {
  const eventName = payload.event_name && ALLOWED_EVENTS.has(payload.event_name) ? payload.event_name : undefined;

  return {
    event_name: eventName,
    event_id: sanitizeText(payload.event_id || '', 64),
    event_time: sanitizeNumber(payload.event_time),
    page_url: sanitizeText(payload.page_url || '', 2048),
    page_location: sanitizeText(payload.page_location || '', 2048),
    referrer: sanitizeText(payload.referrer || '', 2048),
    external_id: sanitizeText(payload.external_id || '', 128),
    em: sanitizeText(payload.em || '', 64),
    ph: sanitizeText(payload.ph || '', 64),
    fn: sanitizeText(payload.fn || '', 64),
    ln: sanitizeText(payload.ln || '', 64),
    fbp: sanitizeText(payload.fbp || '', 128),
    fbc: sanitizeText(payload.fbc || '', 256),
    fbclid: sanitizeText(payload.fbclid || '', 512),
    marketing_consent: payload.marketing_consent === true,
    landing_page_url: sanitizeText(payload.landing_page_url || '', 2048),
    first_touch_url: sanitizeText(payload.first_touch_url || '', 2048),
    first_touch_at: sanitizeText(payload.first_touch_at || '', 40),
    last_touch_url: sanitizeText(payload.last_touch_url || '', 2048),
    last_touch_at: sanitizeText(payload.last_touch_at || '', 40),
    session_id: sanitizeText(payload.session_id || '', 128),
    utm_source: sanitizeText(payload.utm_source || '', 200),
    utm_medium: sanitizeText(payload.utm_medium || '', 200),
    utm_campaign: sanitizeText(payload.utm_campaign || '', 200),
    utm_content: sanitizeText(payload.utm_content || '', 500),
    utm_term: sanitizeText(payload.utm_term || '', 500),
    utm_id: sanitizeText(payload.utm_id || '', 200),
    gclid: sanitizeText(payload.gclid || '', 512),
    wbraid: sanitizeText(payload.wbraid || '', 512),
    gbraid: sanitizeText(payload.gbraid || '', 512),
    yclid: sanitizeText(payload.yclid || '', 512),
    page_title: sanitizeText(payload.page_title || '', 200),
    page_path: sanitizeText(payload.page_path || '', 512),
    browser_language: sanitizeText(payload.browser_language || '', 40),
    screen_width: sanitizeNumber(payload.screen_width),
    screen_height: sanitizeNumber(payload.screen_height),
    viewport_width: sanitizeNumber(payload.viewport_width),
    viewport_height: sanitizeNumber(payload.viewport_height),
    device_pixel_ratio: sanitizeNumber(payload.device_pixel_ratio),
    timezone_offset: sanitizeNumber(payload.timezone_offset),
    consent_version: sanitizeNumber(payload.consent_version),
    consent_source: sanitizeText(payload.consent_source || '', 40),
    consent_region: sanitizeText(payload.consent_region || '', 40),
    consent_timestamp: sanitizeNumber(payload.consent_timestamp),
    service: sanitizeText(payload.service || '', 120),
    service_slug: sanitizeText(payload.service_slug || '', 120),
    form_id: sanitizeText(payload.form_id || '', 120),
    form_step: sanitizeText(payload.form_step || '', 120),
    form_field: sanitizeText(payload.form_field || '', 120),
    engagement_type: sanitizeText(payload.engagement_type || '', 120),
    engagement_seconds: sanitizeNumber(payload.engagement_seconds),
    scroll_depth: sanitizeNumber(payload.scroll_depth),
    contact_channel: sanitizeText(payload.contact_channel || '', 80),
    placement: sanitizeText(payload.placement || '', 120),
    content_name: sanitizeText(payload.content_name || '', 200),
    content_category: sanitizeText(payload.content_category || '', 120),
    content_type: sanitizeText(payload.content_type || '', 80),
    content_ids: sanitizeTextArray(payload.content_ids, 20, 120),
  };
}

async function sha256Normalized(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function isSha256Hex(value: string | undefined): boolean {
  return Boolean(value && /^[a-f0-9]{64}$/i.test(value));
}

function buildExternalIdSeed(payload: MetaEventPayload, fbp: string | undefined): string | undefined {
  if (payload.external_id) return payload.external_id;
  const seed = payload.session_id || fbp || undefined;
  if (!seed) return undefined;
  return `anon:${seed}`;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getMetaCookies(request: Request): { fbp?: string; fbc?: string } {
  const cookieHeader = request.headers.get('Cookie') || '';
  const pairs = cookieHeader.split(';').map(p => p.trim());
  const result: { fbp?: string; fbc?: string } = {};
  for (const pair of pairs) {
    const [key, ...rest] = pair.split('=');
    const value = rest.join('=');
    if (key === '_fbp') result.fbp = safeDecodeURIComponent(value);
    else if (key === '_fbc') result.fbc = safeDecodeURIComponent(value);
  }
  return result;
}

function resolveEventTime(payloadEventTime: number | undefined): number {
  const now = Math.floor(Date.now() / 1000);
  if (!payloadEventTime) return now;

  const eventTime = Math.floor(payloadEventTime);
  const maxPastAgeSeconds = 7 * 24 * 60 * 60;
  const maxFutureSkewSeconds = 5 * 60;

  if (eventTime < now - maxPastAgeSeconds || eventTime > now + maxFutureSkewSeconds) {
    return now;
  }

  return eventTime;
}


function getMetaEventDiagnosticsContext(payload: MetaEventPayload) {
  return {
    form_id: payload.form_id,
    contact_method: payload.contact_channel,
    lead_source_page: payload.page_path,
  };
}

function extractRequestContext(request: Request, pageUrl?: string) {
  const country = request.headers.get('CF-IPCountry') || undefined;
  const city = request.headers.get('CF-IPCity') || request.headers.get('X-City') || undefined;
  const region = request.headers.get('CF-Region') || request.headers.get('X-Region') || undefined;
  const regionCode = request.headers.get('CF-Region-Code') || request.headers.get('X-Region-Code') || undefined;
  const timezone = request.headers.get('CF-Timezone') || undefined;
  const language = request.headers.get('Accept-Language')?.split(',')[0]?.trim() || undefined;
  const platform = request.headers.get('Sec-CH-UA-Platform')?.replaceAll('"', '') || undefined;
  const uaMobile = request.headers.get('Sec-CH-UA-Mobile');
  const isMobile = uaMobile === '?1' ? 'mobile' : uaMobile === '?0' ? 'desktop' : undefined;

  let utmSource: string | undefined;
  let utmMedium: string | undefined;
  let utmCampaign: string | undefined;
  let utmContent: string | undefined;
  let utmTerm: string | undefined;
  let utmId: string | undefined;
  let gclid: string | undefined;
  let wbraid: string | undefined;
  let gbraid: string | undefined;
  let yclid: string | undefined;

  try {
    const sourceUrl = new URL(pageUrl || request.url);
    utmSource = sourceUrl.searchParams.get('utm_source') || undefined;
    utmMedium = sourceUrl.searchParams.get('utm_medium') || undefined;
    utmCampaign = sourceUrl.searchParams.get('utm_campaign') || undefined;
    utmContent = sourceUrl.searchParams.get('utm_content') || undefined;
    utmTerm = sourceUrl.searchParams.get('utm_term') || undefined;
    utmId = sourceUrl.searchParams.get('utm_id') || undefined;
    gclid = sourceUrl.searchParams.get('gclid') || undefined;
    wbraid = sourceUrl.searchParams.get('wbraid') || undefined;
    gbraid = sourceUrl.searchParams.get('gbraid') || undefined;
    yclid = sourceUrl.searchParams.get('yclid') || undefined;
  } catch {
    // no-op
  }

  return { country, city, region, regionCode, timezone, language, platform, isMobile, utmSource, utmMedium, utmCampaign, utmContent, utmTerm, utmId, gclid, wbraid, gbraid, yclid };
}



function normalizePagePath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const path = value.split('?')[0].split('#')[0] || '/';
  return path.length > 1 ? path.replace(/\/$/, '') : path;
}


type MetaDataProcessingOptions = {
  data_processing_options?: string[];
  data_processing_options_country?: number;
  data_processing_options_state?: number;
};

function parseDataProcessingOptions(value: string | undefined): string[] | undefined {
  const options = (value || '')
    .split(',')
    .map((option) => option.trim())
    .filter(Boolean);
  return options.length ? options : undefined;
}

function parseOptionalInteger(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function getMetaDataProcessingOptions(env: Env): MetaDataProcessingOptions {
  const dataProcessingOptions = parseDataProcessingOptions(env.META_CAPI_DATA_PROCESSING_OPTIONS);
  if (!dataProcessingOptions) return {};

  const country = parseOptionalInteger(env.META_CAPI_DATA_PROCESSING_OPTIONS_COUNTRY);
  const state = parseOptionalInteger(env.META_CAPI_DATA_PROCESSING_OPTIONS_STATE);
  const hasGeoPair = typeof country === 'number' && typeof state === 'number';

  return {
    data_processing_options: dataProcessingOptions,
    data_processing_options_country: hasGeoPair ? country : undefined,
    data_processing_options_state: hasGeoPair ? state : undefined,
  };
}

function hasAnyUtm(payload: MetaEventPayload, ctx: ReturnType<typeof extractRequestContext>): boolean {
  return Boolean(
    payload.utm_source || payload.utm_medium || payload.utm_campaign || payload.utm_content ||
    payload.utm_term || payload.utm_id || ctx.utmSource || ctx.utmMedium || ctx.utmCampaign ||
    ctx.utmContent || ctx.utmTerm || ctx.utmId
  );
}

async function sendMetaEvent(payload: MetaEventPayload, env: Env, request: Request): Promise<void> {
  const token = env.META_CAPI_ACCESS_TOKEN;
  const pixelId = env.VITE_META_PIXEL_ID || '926332213606723';
  const apiVersion = env.META_CAPI_API_VERSION || 'v25.0';
  const eventSourceUrl = payload.page_url || payload.page_location || request.headers.get('Referer') || request.url;

  if (!token || !pixelId) {
    console.warn('[Meta CAPI] Missing token or pixel ID, skipping extra event');
    await recordMetaDiagnostics(env, {
      event_name: payload.event_name, event_id: payload.event_id, event_time: payload.event_time, status: 'skipped',
      error_message: 'missing_token_or_pixel_id', page_path: payload.page_path, page_url: payload.page_url, event_source_url: eventSourceUrl, page_path_normalized: normalizePagePath(payload.page_path), service: payload.service, ...getMetaEventDiagnosticsContext(payload),
      has_fbp: Boolean(payload.fbp), has_fbc: Boolean(payload.fbc), has_external_id: Boolean(payload.external_id),
      has_email: isSha256Hex(payload.em), has_phone: isSha256Hex(payload.ph),
      has_fbclid: Boolean(payload.fbclid), marketing_consent: payload.marketing_consent, consent_version: payload.consent_version,
      consent_source: payload.consent_source, consent_region: payload.consent_region, consent_timestamp: payload.consent_timestamp,
    });
    return;
  }

  const eventTime = resolveEventTime(payload.event_time);
  if (await wasMetaEventAlreadySent(env, payload.event_name, payload.event_id)) {
    await recordMetaDiagnostics(env, { event_name: payload.event_name, event_id: payload.event_id, event_time: eventTime, status: 'skipped', error_message: 'duplicate_event_id', page_path: payload.page_path, page_url: payload.page_url, event_source_url: eventSourceUrl, page_path_normalized: normalizePagePath(payload.page_path), service: payload.service, ...getMetaEventDiagnosticsContext(payload), marketing_consent: payload.marketing_consent });
    return;
  }
  const clientIp = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
  const userAgent = request.headers.get('User-Agent') || '';
  const metaCookies = getMetaCookies(request);
  const fbp = payload.fbp || metaCookies.fbp;
  const fbc = payload.fbc || metaCookies.fbc || createFbcFromFbclid(payload.fbclid, eventTime) || createFbcFromPageUrl(eventSourceUrl, eventTime);
  const ctx = extractRequestContext(request, eventSourceUrl);

  const externalIdSeed = buildExternalIdSeed(payload, fbp);
  const [hashedExternalId, hashedCountry, hashedCity, hashedRegion] = await Promise.all([
    externalIdSeed ? sha256Normalized(normalizeTextForMeta(externalIdSeed)) : undefined,
    ctx.country ? sha256Normalized(normalizeLocationForMeta(ctx.country)) : undefined,
    ctx.city ? sha256Normalized(normalizeLocationForMeta(ctx.city)) : undefined,
    (ctx.regionCode || ctx.region) ? sha256Normalized(normalizeLocationForMeta(ctx.regionCode || ctx.region || '')) : undefined,
  ]);

  const event = {
    event_name: payload.event_name,
    event_time: eventTime,
    action_source: 'website',
    event_id: payload.event_id || undefined,
    user_data: {
      client_ip_address: clientIp,
      client_user_agent: userAgent,
      fbp: fbp || undefined,
      fbc: fbc || undefined,
      external_id: hashedExternalId ? [hashedExternalId] : undefined,
      em: isSha256Hex(payload.em) ? [payload.em!.toLowerCase()] : undefined,
      ph: isSha256Hex(payload.ph) ? [payload.ph!.toLowerCase()] : undefined,
      fn: isSha256Hex(payload.fn) ? [payload.fn!.toLowerCase()] : undefined,
      ln: isSha256Hex(payload.ln) ? [payload.ln!.toLowerCase()] : undefined,
      country: hashedCountry ? [hashedCountry] : undefined,
      ct: hashedCity ? [hashedCity] : undefined,
      st: hashedRegion ? [hashedRegion] : undefined,
    },
    custom_data: {
      service: payload.service, ...getMetaEventDiagnosticsContext(payload),
      service_slug: payload.service_slug,
      form_id: payload.form_id,
      form_step: payload.form_step,
      form_field: payload.form_field,
      engagement_type: payload.engagement_type,
      engagement_seconds: payload.engagement_seconds,
      scroll_depth: payload.scroll_depth,
      contact_channel: payload.contact_channel,
      placement: payload.placement,
      content_name: payload.content_name || payload.page_title || payload.service,
      content_category: payload.content_category,
      content_type: payload.content_type,
      content_ids: payload.content_ids,
      country: ctx.country,
      city: ctx.city,
      region: ctx.region,
      timezone: ctx.timezone,
      language: ctx.language,
      platform: ctx.platform,
      device_type: ctx.isMobile,
      utm_source: payload.utm_source || ctx.utmSource,
      utm_medium: payload.utm_medium || ctx.utmMedium,
      utm_campaign: payload.utm_campaign || ctx.utmCampaign,
      utm_content: payload.utm_content || ctx.utmContent,
      utm_term: payload.utm_term || ctx.utmTerm,
      utm_id: payload.utm_id || ctx.utmId,
      fbclid: payload.fbclid,
      gclid: payload.gclid || ctx.gclid,
      wbraid: payload.wbraid || ctx.wbraid,
      gbraid: payload.gbraid || ctx.gbraid,
      yclid: payload.yclid || ctx.yclid,
      landing_page_url: payload.landing_page_url,
      first_touch_url: payload.first_touch_url,
      first_touch_at: payload.first_touch_at,
      last_touch_url: payload.last_touch_url,
      last_touch_at: payload.last_touch_at,
      session_id: payload.session_id,
      page_title: payload.page_title,
      page_location: payload.page_location || payload.page_url,
      page_path: payload.page_path,
      referrer: payload.referrer,
      browser_language: payload.browser_language,
      screen_width: payload.screen_width,
      screen_height: payload.screen_height,
      viewport_width: payload.viewport_width,
      viewport_height: payload.viewport_height,
      device_pixel_ratio: payload.device_pixel_ratio,
      timezone_offset: payload.timezone_offset,
      event_time_client: payload.event_time,
      consent_version: payload.consent_version,
      consent_source: payload.consent_source,
      consent_region: payload.consent_region,
      consent_timestamp: payload.consent_timestamp,
    },
    event_source_url: eventSourceUrl,
    ...getMetaDataProcessingOptions(env),
  };

  const body = JSON.stringify({
    data: [event],
  });

  try {
    const response = await fetchMetaWithRetry(
      `https://graph.facebook.com/${apiVersion}/${pixelId}/events?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      },
      env
    );

    if (!response.ok) {
      const errorText = await response.text();
      await recordMetaDiagnostics(env, { event_name: payload.event_name, event_id: payload.event_id, event_time: eventTime, status: 'failed', error_code: response.status, error_message: errorText, page_path: payload.page_path, page_url: eventSourceUrl, service: payload.service, ...getMetaEventDiagnosticsContext(payload), has_fbp: Boolean(fbp), has_fbc: Boolean(fbc), has_external_id: Boolean(hashedExternalId), has_email: isSha256Hex(payload.em), has_phone: isSha256Hex(payload.ph), has_fbclid: Boolean(payload.fbclid), has_utm: hasAnyUtm(payload, ctx), marketing_consent: payload.marketing_consent, consent_version: payload.consent_version, consent_source: payload.consent_source, consent_region: payload.consent_region, consent_timestamp: payload.consent_timestamp });
      console.error(`[Meta CAPI] ${payload.event_name} event failed with HTTP ${response.status}: ${errorText}`);
    } else {
      const result = await response.json().catch(() => null) as { fbtrace_id?: string; events_received?: number } | null;
      await markMetaEventSent(env, payload.event_name, payload.event_id);
      await recordMetaDiagnostics(env, { event_name: payload.event_name, event_id: payload.event_id, event_time: eventTime, status: 'sent', events_received: result?.events_received, fbtrace_id: result?.fbtrace_id, page_path: payload.page_path, page_url: eventSourceUrl, service: payload.service, ...getMetaEventDiagnosticsContext(payload), has_fbp: Boolean(fbp), has_fbc: Boolean(fbc), has_external_id: Boolean(hashedExternalId), has_email: isSha256Hex(payload.em), has_phone: isSha256Hex(payload.ph), has_fbclid: Boolean(payload.fbclid), has_utm: hasAnyUtm(payload, ctx), marketing_consent: payload.marketing_consent, consent_version: payload.consent_version, consent_source: payload.consent_source, consent_region: payload.consent_region, consent_timestamp: payload.consent_timestamp });
      console.log(`[Meta CAPI] ${payload.event_name} server event sent successfully`, {
        fbtrace_id: result?.fbtrace_id,
        events_received: result?.events_received,
      });
    }
  } catch (error) {
    await recordMetaDiagnostics(env, { event_name: payload.event_name, event_id: payload.event_id, event_time: eventTime, status: 'failed', error_message: error instanceof Error ? error.message : String(error), page_path: payload.page_path, page_url: eventSourceUrl, service: payload.service, ...getMetaEventDiagnosticsContext(payload), has_fbp: Boolean(fbp), has_fbc: Boolean(fbc), has_external_id: Boolean(hashedExternalId), has_email: isSha256Hex(payload.em), has_phone: isSha256Hex(payload.ph), has_fbclid: Boolean(payload.fbclid), has_utm: hasAnyUtm(payload, ctx), marketing_consent: payload.marketing_consent, consent_version: payload.consent_version, consent_source: payload.consent_source, consent_region: payload.consent_region, consent_timestamp: payload.consent_timestamp });
    console.error(`[Meta CAPI] Error sending ${payload.event_name} event:`, error);
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  if (!isTrustedTrackingRequest(request, env)) {
    return json(
      { success: false, error: 'untrusted_request_origin' },
      { status: 403, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }
  const rawBody = await request.text();
  const signatureMode = getTrackingSignatureMode(env);
  const signature = await verifyTrackingSignature(request, env, rawBody);
  if (!signature.ok && signatureMode === 'enforce') {
    return json({ success: false, error: signature.reason }, { status: 403, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }

  const payload = normalizeMetaEventPayload((JSON.parse(rawBody || '{}')) as MetaEventPayload);

  const rateLimited = await enforceRateLimit(request, 'meta_event');
  if (rateLimited) {
    waitUntil(recordMetaDiagnostics(env, { event_name: payload.event_name || 'ViewContent', event_id: payload.event_id, event_time: payload.event_time, status: 'skipped', error_message: 'rate_limited', page_path: payload.page_path, page_url: payload.page_url, service: payload.service, ...getMetaEventDiagnosticsContext(payload), marketing_consent: payload.marketing_consent }));
    return rateLimited;
  }

  if (!payload.event_name || !payload.event_id) {
    return json(
      { success: false, error: 'event_name and event_id are required' },
      { status: 400, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }

  if (!payload.marketing_consent) {
    waitUntil(recordMetaDiagnostics(env, { event_name: payload.event_name, event_id: payload.event_id, event_time: payload.event_time, status: 'skipped', error_message: 'marketing_consent_not_granted', page_path: payload.page_path, page_url: payload.page_url, event_source_url: payload.page_url || payload.page_location || request.headers.get('Referer') || request.url, page_path_normalized: normalizePagePath(payload.page_path), service: payload.service, ...getMetaEventDiagnosticsContext(payload), marketing_consent: false, consent_version: payload.consent_version, consent_source: payload.consent_source, consent_region: payload.consent_region, consent_timestamp: payload.consent_timestamp }));
    return json(
      { success: true, skipped: true, reason: 'marketing_consent_not_granted' },
      { headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }

  const outboxId = `me:${payload.event_name}:${payload.event_id}`;
  waitUntil(enqueueMetaEvent(env, { id: outboxId, event_name: payload.event_name, event_id: payload.event_id, payload_json: JSON.stringify(payload) }));
  waitUntil(sendMetaEvent(payload, env, request)
    .then(() => markOutboxSent(env, outboxId))
    .catch(async (e) => {
      const now = Math.floor(Date.now() / 1000);
      await markOutboxRetry(env, outboxId, 1, now + 60, e instanceof Error ? e.message : String(e));
    }));

  return json(
    { success: true },
    { headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
  );
};
