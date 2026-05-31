import { json } from '../_lib/http';
import { CACHE_CONTROL } from '../_lib/cache';
import type { Env } from '../_lib/types';
import { enforceRateLimit } from '../_lib/rate-limit';
import { markMetaEventSent, recordMetaDiagnostics, wasMetaEventAlreadySent } from '../_lib/meta-diagnostics';
import { fetchMetaWithRetry, isTrustedTrackingRequest } from '../_lib/meta-capi';
import { enqueueMetaEvent, markOutboxRetry, markOutboxSent } from '../_lib/meta-outbox';
import { getTrackingSignatureMode, verifyTrackingSignature } from '../_lib/tracking-signature';

interface LeadPayload {
  name?: string;
  email?: string;
  phone?: string;
  budget?: string;
  message?: string;
  contactMethod?: 'telegram' | 'whatsapp';
  telegramUsername?: string;
  service?: string;
  website?: string;
  website_domain?: string;
  experience?: string;
  problem?: string;
  service_slug?: string;
  form_id?: string;
  form_variant?: string;
  lead_source_page?: string;
  event_id?: string;
  hp_trap?: string;   // honeypot – боты заполняют, люди нет
  page_url?: string;
  page_location?: string;
  referrer?: string;
  external_id?: string;
  fbp?: string;
  fbc?: string;
  fbclid?: string;
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
  event_time?: number;
  consent_version?: number;
  consent_source?: string;
  consent_region?: string;
  consent_timestamp?: number;
  marketing_consent?: boolean;
  zp?: string;
  ge?: 'm' | 'f';
  dobd?: string;
  dobm?: string;
  doby?: string;
  madid?: string;
  value?: number;
  currency?: string;
  order_id?: string;
  contents?: Array<{ id?: string; quantity?: number; item_price?: number; delivery_category?: string }>;
  num_items?: number;
  predicted_ltv?: number;
  status?: string;
  lead_id?: string;
  search_string?: string;
  content_ids?: string[];
  content_type?: string;
}

const DEFAULT_LEAD_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxE5dVWccxQ0Ga3MSUYeEZ8B6c-KEkbBNl3QPa-zbkyjBvFl5QnxZA2g5BIGmwe-7jNfA/exec';

function sanitizeText(value: string, max: number): string {
  return String(value || '').trim().slice(0, max);
}

function sanitizeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeEmailForMeta(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePhoneForMeta(value: string): string {
  const trimmed = value.trim();
  const digits = trimmed.replace(/\D/g, '');
  return digits;
}

function normalizeTextForMeta(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeLocationForMeta(value: string): string {
  return normalizeTextForMeta(value).replace(/[\s\p{P}\p{S}_]+/gu, '');
}
function normalizeGender(value: string | undefined): 'm' | 'f' | undefined {
  const raw = (value || '').trim().toLowerCase();
  if (!raw) return undefined;
  if (raw === 'm' || raw === 'male' || raw === 'man' || raw === 'м' || raw === 'муж') return 'm';
  if (raw === 'f' || raw === 'female' || raw === 'woman' || raw === 'ж' || raw === 'жен') return 'f';
  return undefined;
}
function normalizeDobPart(value: string | undefined, len: 2 | 4): string | undefined {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return undefined;
  return digits.slice(0, len).padStart(len, '0');
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

function normalizeLeadPayload(payload: LeadPayload): LeadPayload {
  return {
    name: sanitizeText(payload.name || '', 100),
    email: sanitizeText(payload.email || '', 120),
    phone: sanitizeText(payload.phone || '', 60),
    budget: sanitizeText(payload.budget || '', 40),
    message: sanitizeText(payload.message || '', 4_000),
    contactMethod: payload.contactMethod === 'whatsapp' ? 'whatsapp' : 'telegram',
    telegramUsername: sanitizeText(payload.telegramUsername || '', 120),
    service: sanitizeText(payload.service || '', 80),
    website: sanitizeText(payload.website || '', 2048),
    website_domain: sanitizeText(payload.website_domain || '', 255),
    experience: sanitizeText(payload.experience || '', 200),
    problem: sanitizeText(payload.problem || '', 500),
    service_slug: sanitizeText(payload.service_slug || '', 80),
    form_id: sanitizeText(payload.form_id || '', 120),
    form_variant: sanitizeText(payload.form_variant || '', 120),
    lead_source_page: sanitizeText(payload.lead_source_page || '', 512),
    event_id: sanitizeText(payload.event_id || '', 64),
    hp_trap: sanitizeText(payload.hp_trap || '', 10),
    page_url: sanitizeText(payload.page_url || '', 2048),
    page_location: sanitizeText(payload.page_location || '', 2048),
    referrer: sanitizeText(payload.referrer || '', 2048),
    external_id: sanitizeText(payload.external_id || '', 128),
    fbp: sanitizeText(payload.fbp || '', 128),
    fbc: sanitizeText(payload.fbc || '', 256),
    fbclid: sanitizeText(payload.fbclid || '', 512),
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
    event_time: sanitizeNumber(payload.event_time),
    consent_version: sanitizeNumber(payload.consent_version),
    consent_source: sanitizeText(payload.consent_source || '', 40),
    consent_region: sanitizeText(payload.consent_region || '', 40),
    consent_timestamp: sanitizeNumber(payload.consent_timestamp),
    marketing_consent: payload.marketing_consent === true,
    zp: sanitizeText(payload.zp || '', 40),
    ge: normalizeGender(payload.ge),
    dobd: normalizeDobPart(payload.dobd, 2),
    dobm: normalizeDobPart(payload.dobm, 2),
    doby: normalizeDobPart(payload.doby, 4),
    madid: sanitizeText(payload.madid || '', 128),
    value: sanitizeNumber(payload.value),
    currency: sanitizeText(payload.currency || '', 8).toUpperCase(),
    order_id: sanitizeText(payload.order_id || '', 128),
    contents: Array.isArray(payload.contents) ? payload.contents.slice(0, 50) : undefined,
    num_items: sanitizeNumber(payload.num_items) ?? (Array.isArray(payload.contents) ? payload.contents.length : undefined),
    predicted_ltv: sanitizeNumber(payload.predicted_ltv),
    status: sanitizeText(payload.status || '', 80),
    lead_id: sanitizeText(payload.lead_id || '', 128),
    search_string: sanitizeText(payload.search_string || '', 500),
    content_type: sanitizeText(payload.content_type || '', 80),
    content_ids: Array.isArray(payload.content_ids) ? payload.content_ids.map((x) => sanitizeText(String(x || ''), 120)).filter(Boolean).slice(0, 20) : undefined,
  };
}

async function sha256Normalized(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function buildExternalIdSeed(payload: LeadPayload, fbp: string | undefined): string | undefined {
  if (payload.external_id) return payload.external_id;
  const seed = payload.session_id || fbp || payload.email || payload.phone || undefined;
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




function getLeadDiagnosticsContext(payload: LeadPayload) {
  return {
    form_id: payload.form_id,
    form_variant: payload.form_variant,
    contact_method: payload.contactMethod,
    lead_source_page: payload.lead_source_page,
  };
}

function classifyProblemCategory(problem: string | undefined): string | undefined {
  const value = (problem || '').toLowerCase();
  if (!value) return undefined;
  if (/лид|заяв|конверс|продаж|клиент/.test(value)) return 'lead_generation';
  if (/кабинет|бан|модерац|аккаунт|доступ/.test(value)) return 'account_or_moderation';
  if (/креатив|объяв|баннер|видео|контент/.test(value)) return 'creative';
  if (/аналит|пиксел|метрик|capi|отслеж/.test(value)) return 'analytics_tracking';
  if (/стратег|воронк|оффер|позицион/.test(value)) return 'strategy_funnel';
  if (/бюджет|ставк|стоим|cpl|cpa|цена/.test(value)) return 'budget_efficiency';
  return 'other';
}

function isAllowedLeadBudget(value: string | undefined): string | undefined {
  const normalized = (value || '').trim();
  if (!normalized) return undefined;
  const allowed = new Set(['до $1000', '$1к-10к', '$10к-100к', '$100к+']);
  return allowed.has(normalized) ? normalized : undefined;
}


function normalizePagePath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const path = value.split('?')[0].split('#')[0] || '/';
  return path.length > 1 ? path.replace(/\/$/, '') : path;
}

function sanitizeUrlForMeta(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}


function estimateLeadValue(payload: LeadPayload): number | undefined {
  const budget = Number((payload.budget || '').replace(/[^0-9.]/g, ''));
  if (Number.isFinite(budget) && budget > 0) return Math.min(Math.max(budget, 100), 100000);
  const serviceBoost = payload.service_slug ? 750 : 500;
  return serviceBoost;
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

function hasAnyUtm(payload: LeadPayload, ctx: ReturnType<typeof extractRequestContext>): boolean {
  return Boolean(
    payload.utm_source || payload.utm_medium || payload.utm_campaign || payload.utm_content ||
    payload.utm_term || payload.utm_id || ctx.utmSource || ctx.utmMedium || ctx.utmCampaign ||
    ctx.utmContent || ctx.utmTerm || ctx.utmId
  );
}

async function sendMetaConversionEvent(
  payload: LeadPayload,
  env: Env,
  request: Request
): Promise<void> {
  const token = env.META_CAPI_ACCESS_TOKEN;
  const pixelId = env.VITE_META_PIXEL_ID || '926332213606723';
  const apiVersion = env.META_CAPI_API_VERSION || 'v25.0';
  const eventSourceUrl = payload.page_url || payload.page_location || request.headers.get('Referer') || request.url;
  const sanitizedEventSourceUrl = sanitizeUrlForMeta(eventSourceUrl) || request.url;

  if (!token || !pixelId) {
    console.warn('[Meta CAPI] Missing ACCESS_TOKEN or PIXEL_ID. Skipping server event.');
    await recordMetaDiagnostics(env, { event_name: 'Lead', event_id: payload.event_id, event_time: payload.event_time, status: 'skipped', error_message: 'missing_token_or_pixel_id', page_path: payload.page_path, page_url: payload.page_url, event_source_url: eventSourceUrl, page_path_normalized: normalizePagePath(payload.page_path), service: payload.service, ...getLeadDiagnosticsContext(payload), has_email: Boolean(payload.email), has_phone: Boolean(payload.phone), marketing_consent: payload.marketing_consent, consent_version: payload.consent_version, consent_source: payload.consent_source, consent_region: payload.consent_region, consent_timestamp: payload.consent_timestamp });
    return;
  }

  const eventTime = resolveEventTime(payload.event_time);
  if (await wasMetaEventAlreadySent(env, 'Lead', payload.event_id)) {
    await recordMetaDiagnostics(env, { event_name: 'Lead', event_id: payload.event_id, event_time: eventTime, status: 'skipped', error_message: 'duplicate_event_id', page_path: payload.page_path, page_url: payload.page_url, event_source_url: eventSourceUrl, page_path_normalized: normalizePagePath(payload.page_path), service: payload.service, ...getLeadDiagnosticsContext(payload), has_email: Boolean(payload.email), has_phone: Boolean(payload.phone), marketing_consent: payload.marketing_consent });
    return;
  }
  const clientIp = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
  const userAgent = request.headers.get('User-Agent') || '';
  const metaCookies = getMetaCookies(request);
  const fbp = payload.fbp || metaCookies.fbp;
  const fbc = payload.fbc || metaCookies.fbc || createFbcFromFbclid(payload.fbclid, eventTime) || createFbcFromPageUrl(eventSourceUrl, eventTime);
  const ctx = extractRequestContext(request, eventSourceUrl);

  const nameParts = (payload.name || '').trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  const externalIdSeed = buildExternalIdSeed(payload, fbp);
  const [hashedEmail, hashedPhone, hashedFn, hashedLn, hashedCountry, hashedCity, hashedRegion, hashedExternalId, hashedZip, hashedDobd, hashedDobm, hashedDoby, hashedGe, hashedMadid] = await Promise.all([
    payload.email ? sha256Normalized(normalizeEmailForMeta(payload.email)) : undefined,
    payload.phone ? sha256Normalized(normalizePhoneForMeta(payload.phone)) : undefined,
    firstName ? sha256Normalized(normalizeTextForMeta(firstName)) : undefined,
    lastName ? sha256Normalized(normalizeTextForMeta(lastName)) : undefined,
    ctx.country ? sha256Normalized(normalizeLocationForMeta(ctx.country)) : undefined,
    ctx.city ? sha256Normalized(normalizeLocationForMeta(ctx.city)) : undefined,
    (ctx.regionCode || ctx.region) ? sha256Normalized(normalizeLocationForMeta(ctx.regionCode || ctx.region || '')) : undefined,
    externalIdSeed ? sha256Normalized(normalizeTextForMeta(externalIdSeed)) : undefined,
    payload.zp ? sha256Normalized(normalizeLocationForMeta(payload.zp)) : undefined,
    payload.dobd ? sha256Normalized(payload.dobd) : undefined,
    payload.dobm ? sha256Normalized(payload.dobm) : undefined,
    payload.doby ? sha256Normalized(payload.doby) : undefined,
    payload.ge ? sha256Normalized(payload.ge) : undefined,
    payload.madid ? sha256Normalized(normalizeTextForMeta(payload.madid)) : undefined,
  ]);

  const event = {
    event_name: 'Lead',
    event_time: eventTime,
    action_source: 'website',
    event_id: payload.event_id || undefined,
    user_data: {
      em: hashedEmail ? [hashedEmail] : undefined,
      ph: hashedPhone ? [hashedPhone] : undefined,
      fn: hashedFn ? [hashedFn] : undefined,
      ln: hashedLn ? [hashedLn] : undefined,
      client_ip_address: clientIp,
      client_user_agent: userAgent,
      fbp: fbp || undefined,
      fbc: fbc || undefined,
      country: hashedCountry ? [hashedCountry] : undefined,
      ct: hashedCity ? [hashedCity] : undefined,
      st: hashedRegion ? [hashedRegion] : undefined,
      zp: hashedZip ? [hashedZip] : undefined,
      dobd: hashedDobd ? [hashedDobd] : undefined,
      dobm: hashedDobm ? [hashedDobm] : undefined,
      doby: hashedDoby ? [hashedDoby] : undefined,
      ge: hashedGe ? [hashedGe] : undefined,
      madid: hashedMadid ? [hashedMadid] : undefined,
      external_id: hashedExternalId ? [hashedExternalId] : undefined,
    },
    opt_out: payload.marketing_consent === false,
    custom_data: {
      // Do not send budget-like financial details in Lead custom_data.
      budget_bucket: undefined,
      contact_method: payload.contactMethod,
      service: payload.service, ...getLeadDiagnosticsContext(payload),
      service_slug: payload.service_slug,
      form_id: payload.form_id,
      form_variant: payload.form_variant,
      lead_source_page: payload.lead_source_page,
      website_domain: payload.website_domain,
      // Avoid forwarding fields derived from free-text lead answers to Meta Lead.
      experience_level: undefined,
      problem_category: undefined,
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
      landing_page_url: sanitizeUrlForMeta(payload.landing_page_url),
      first_touch_url: sanitizeUrlForMeta(payload.first_touch_url),
      first_touch_at: payload.first_touch_at,
      last_touch_url: sanitizeUrlForMeta(payload.last_touch_url),
      last_touch_at: payload.last_touch_at,
      session_id: payload.session_id,
      content_name: payload.page_title || payload.service,
      content_type: payload.content_type || 'lead',
      content_ids: payload.content_ids || (payload.service_slug ? [payload.service_slug] : undefined),
      value: undefined,
      currency: undefined,
      order_id: undefined,
      contents: undefined,
      num_items: undefined,
      search_string: undefined,
      predicted_ltv: undefined,
      status: undefined,
      lead_id: undefined,
      page_title: payload.page_title,
      page_location: sanitizeUrlForMeta(payload.page_location || payload.page_url),
      page_path: payload.page_path,
      referrer: sanitizeUrlForMeta(payload.referrer),
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
    event_source_url: sanitizedEventSourceUrl,
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
      await recordMetaDiagnostics(env, { event_name: 'Lead', event_id: payload.event_id, event_time: eventTime, status: 'failed', error_code: response.status, error_message: errorText, page_path: payload.page_path, page_url: sanitizedEventSourceUrl, service: payload.service, ...getLeadDiagnosticsContext(payload), has_fbp: Boolean(fbp), has_fbc: Boolean(fbc), has_external_id: Boolean(hashedExternalId), has_email: Boolean(hashedEmail), has_phone: Boolean(hashedPhone), has_fbclid: Boolean(payload.fbclid), has_utm: hasAnyUtm(payload, ctx), marketing_consent: payload.marketing_consent, consent_version: payload.consent_version, consent_source: payload.consent_source, consent_region: payload.consent_region, consent_timestamp: payload.consent_timestamp });
      console.error(`[Meta CAPI] Lead event failed with HTTP ${response.status}: ${errorText}`);
    } else {
      const result = await response.json().catch(() => null) as { fbtrace_id?: string; events_received?: number } | null;
      await markMetaEventSent(env, 'Lead', payload.event_id);
      await recordMetaDiagnostics(env, { event_name: 'Lead', event_id: payload.event_id, event_time: eventTime, status: 'sent', events_received: result?.events_received, fbtrace_id: result?.fbtrace_id, page_path: payload.page_path, page_url: sanitizedEventSourceUrl, service: payload.service, ...getLeadDiagnosticsContext(payload), has_fbp: Boolean(fbp), has_fbc: Boolean(fbc), has_external_id: Boolean(hashedExternalId), has_email: Boolean(hashedEmail), has_phone: Boolean(hashedPhone), has_fbclid: Boolean(payload.fbclid), has_utm: hasAnyUtm(payload, ctx), marketing_consent: payload.marketing_consent, consent_version: payload.consent_version, consent_source: payload.consent_source, consent_region: payload.consent_region, consent_timestamp: payload.consent_timestamp });
      console.log('[Meta CAPI] Lead server event sent successfully', {
        fbtrace_id: result?.fbtrace_id,
        events_received: result?.events_received,
      });
    }
  } catch (error) {
    await recordMetaDiagnostics(env, { event_name: 'Lead', event_id: payload.event_id, event_time: eventTime, status: 'failed', error_message: error instanceof Error ? error.message : String(error), page_path: payload.page_path, page_url: sanitizedEventSourceUrl, service: payload.service, ...getLeadDiagnosticsContext(payload), has_fbp: Boolean(fbp), has_fbc: Boolean(fbc), has_external_id: Boolean(hashedExternalId), has_email: Boolean(hashedEmail), has_phone: Boolean(hashedPhone), has_fbclid: Boolean(payload.fbclid), has_utm: hasAnyUtm(payload, ctx), marketing_consent: payload.marketing_consent, consent_version: payload.consent_version, consent_source: payload.consent_source, consent_region: payload.consent_region, consent_timestamp: payload.consent_timestamp });
    console.error('[Meta CAPI] Error sending Lead event:', error);
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  if (!isTrustedTrackingRequest(request, env)) {
    return json(
      { success: false, error: 'untrusted_request_origin' },
      { status: 403, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }
  // --- Rate limit ---
  const rawBody = await request.text();
  const signatureMode = getTrackingSignatureMode(env);
  const signature = await verifyTrackingSignature(request, env, rawBody);
  if (signature.ok === false && signatureMode === 'enforce') {
    return json({ success: false, error: signature.reason }, { status: 403, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }

  const normalized = normalizeLeadPayload((JSON.parse(rawBody || '{}')) as LeadPayload);
  const rateLimited = await enforceRateLimit(request, 'lead');
  if (rateLimited) {
    waitUntil(recordMetaDiagnostics(env, { event_name: 'Lead', event_id: normalized.event_id, event_time: normalized.event_time, status: 'skipped', error_message: 'rate_limited', page_path: normalized.page_path, page_url: normalized.page_url, service: normalized.service, ...getLeadDiagnosticsContext(normalized), marketing_consent: normalized.marketing_consent }));
    return rateLimited;
  }

  // --- Honeypot ---
  if (normalized.hp_trap && normalized.hp_trap.length > 0) {
    return json(
      { success: true },
      { headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }

  const hasContact = Boolean(normalized.email || normalized.phone || normalized.telegramUsername);

  if (!normalized.name || !hasContact) {
    return json(
      { success: false, error: 'name and at least one contact field are required' },
      { status: 400, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }

  const crmTask = fetch(DEFAULT_LEAD_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(normalized),
    cf: { cacheEverything: false, cacheTtl: 0 },
  })
    .then(async (response) => {
      await recordMetaDiagnostics(env, { event_name: 'Lead', event_id: normalized.event_id, event_time: normalized.event_time, status: response.ok ? 'sent' : 'failed', error_message: response.ok ? undefined : `lead_crm_http_${response.status}`, page_path: normalized.page_path, page_url: normalized.page_url, service: normalized.service, ...getLeadDiagnosticsContext(normalized) });
    })
    .catch(async () => {
      await recordMetaDiagnostics(env, { event_name: 'Lead', event_id: normalized.event_id, event_time: normalized.event_time, status: 'failed', error_message: 'lead_crm_network_error', page_path: normalized.page_path, page_url: normalized.page_url, service: normalized.service, ...getLeadDiagnosticsContext(normalized) });
    });

  waitUntil(crmTask);

  if (normalized.marketing_consent) {
    const outboxId = `lead:${normalized.event_id}`;
    waitUntil(enqueueMetaEvent(env, { id: outboxId, event_name: 'Lead', event_id: normalized.event_id || outboxId, payload_json: JSON.stringify(normalized) }));
    waitUntil(sendMetaConversionEvent(normalized, env, request)
      .then(() => markOutboxSent(env, outboxId))
      .catch(async (e) => {
        const now = Math.floor(Date.now() / 1000);
        await markOutboxRetry(env, outboxId, 1, now + 60, e instanceof Error ? e.message : String(e));
      }));
  } else {
    waitUntil(recordMetaDiagnostics(env, { event_name: 'Lead', event_id: normalized.event_id, event_time: normalized.event_time, status: 'skipped', error_message: 'marketing_consent_not_granted', page_path: normalized.page_path, page_url: normalized.page_url, service: normalized.service, ...getLeadDiagnosticsContext(normalized), has_email: Boolean(normalized.email), has_phone: Boolean(normalized.phone), marketing_consent: false, consent_version: normalized.consent_version, consent_source: normalized.consent_source, consent_region: normalized.consent_region, consent_timestamp: normalized.consent_timestamp }));
  }

  return json(
    { success: true },
    { headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
  );
};
