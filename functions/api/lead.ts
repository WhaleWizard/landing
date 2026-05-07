import { json } from '../_lib/http';
import { CACHE_CONTROL } from '../_lib/cache';
import type { Env } from '../_lib/types';
import { enforceRateLimit } from '../_lib/rate-limit';

interface LeadPayload {
  name?: string;
  email?: string;
  phone?: string;
  budget?: string;
  message?: string;
  contactMethod?: 'telegram' | 'whatsapp';
  telegramUsername?: string;
  service?: string;
  event_id?: string;
  hp_trap?: string;   // honeypot – боты заполняют, люди нет
  page_url?: string;
  referrer?: string;
  external_id?: string;
  page_title?: string;
  page_path?: string;
  browser_language?: string;
  screen_width?: number;
  screen_height?: number;
  viewport_width?: number;
  viewport_height?: number;
  device_pixel_ratio?: number;
  timezone_offset?: number;
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

function createFbcFromPageUrl(pageUrl: string | undefined, eventTime: number): string | undefined {
  if (!pageUrl) return undefined;

  try {
    const fbclid = new URL(pageUrl).searchParams.get('fbclid')?.trim();
    return fbclid ? `fb.1.${eventTime * 1000}.${fbclid}` : undefined;
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
    event_id: sanitizeText(payload.event_id || '', 64),
    hp_trap: sanitizeText(payload.hp_trap || '', 10),
    page_url: sanitizeText(payload.page_url || '', 2048),
    referrer: sanitizeText(payload.referrer || '', 2048),
    external_id: sanitizeText(payload.external_id || '', 128),
    page_title: sanitizeText(payload.page_title || '', 200),
    page_path: sanitizeText(payload.page_path || '', 512),
    browser_language: sanitizeText(payload.browser_language || '', 40),
    screen_width: sanitizeNumber(payload.screen_width),
    screen_height: sanitizeNumber(payload.screen_height),
    viewport_width: sanitizeNumber(payload.viewport_width),
    viewport_height: sanitizeNumber(payload.viewport_height),
    device_pixel_ratio: sanitizeNumber(payload.device_pixel_ratio),
    timezone_offset: sanitizeNumber(payload.timezone_offset),
  };
}

async function sha256Normalized(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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

  try {
    const sourceUrl = new URL(pageUrl || request.url);
    utmSource = sourceUrl.searchParams.get('utm_source') || undefined;
    utmMedium = sourceUrl.searchParams.get('utm_medium') || undefined;
    utmCampaign = sourceUrl.searchParams.get('utm_campaign') || undefined;
    utmContent = sourceUrl.searchParams.get('utm_content') || undefined;
    utmTerm = sourceUrl.searchParams.get('utm_term') || undefined;
  } catch {
    // no-op
  }

  return { country, city, region, regionCode, timezone, language, platform, isMobile, utmSource, utmMedium, utmCampaign, utmContent, utmTerm };
}

async function sendMetaConversionEvent(
  payload: LeadPayload,
  env: Env,
  request: Request
): Promise<void> {
  const token = env.META_CAPI_ACCESS_TOKEN;
  const pixelId = env.VITE_META_PIXEL_ID || '926332213606723';
  const testCode = env.META_CAPI_TEST_CODE;
  const apiVersion = env.META_CAPI_API_VERSION || 'v25.0';

  if (!token || !pixelId) {
    console.warn('[Meta CAPI] Missing ACCESS_TOKEN or PIXEL_ID. Skipping server event.');
    return;
  }

  const eventTime = Math.floor(Date.now() / 1000);
  const clientIp = request.headers.get('CF-Connecting-IP') || '';
  const userAgent = request.headers.get('User-Agent') || '';
  const eventSourceUrl = payload.page_url || request.headers.get('Referer') || request.url;
  const metaCookies = getMetaCookies(request);
  const fbp = metaCookies.fbp;
  const fbc = metaCookies.fbc || createFbcFromPageUrl(eventSourceUrl, eventTime);
  const ctx = extractRequestContext(request, eventSourceUrl);

  const nameParts = (payload.name || '').trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  const [hashedEmail, hashedPhone, hashedFn, hashedLn, hashedCountry, hashedCity, hashedRegion, hashedExternalId] = await Promise.all([
    payload.email ? sha256Normalized(normalizeEmailForMeta(payload.email)) : undefined,
    payload.phone ? sha256Normalized(normalizePhoneForMeta(payload.phone)) : undefined,
    firstName ? sha256Normalized(normalizeTextForMeta(firstName)) : undefined,
    lastName ? sha256Normalized(normalizeTextForMeta(lastName)) : undefined,
    ctx.country ? sha256Normalized(normalizeLocationForMeta(ctx.country)) : undefined,
    ctx.city ? sha256Normalized(normalizeLocationForMeta(ctx.city)) : undefined,
    (ctx.regionCode || ctx.region) ? sha256Normalized(normalizeLocationForMeta(ctx.regionCode || ctx.region || '')) : undefined,
    payload.external_id ? sha256Normalized(normalizeTextForMeta(payload.external_id)) : undefined,
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
      external_id: hashedExternalId ? [hashedExternalId] : undefined,
    },
    custom_data: {
      budget: payload.budget,
      contact_method: payload.contactMethod,
      service: payload.service,
      country: ctx.country,
      city: ctx.city,
      region: ctx.region,
      timezone: ctx.timezone,
      language: ctx.language,
      platform: ctx.platform,
      device_type: ctx.isMobile,
      utm_source: ctx.utmSource,
      utm_medium: ctx.utmMedium,
      utm_campaign: ctx.utmCampaign,
      utm_content: ctx.utmContent,
      utm_term: ctx.utmTerm,
      content_name: payload.page_title || payload.service,
      page_title: payload.page_title,
      page_path: payload.page_path,
      referrer: payload.referrer,
      browser_language: payload.browser_language,
      screen_width: payload.screen_width,
      screen_height: payload.screen_height,
      viewport_width: payload.viewport_width,
      viewport_height: payload.viewport_height,
      device_pixel_ratio: payload.device_pixel_ratio,
      timezone_offset: payload.timezone_offset,
    },
    event_source_url: eventSourceUrl,
  };

  const body = JSON.stringify({
    data: [event],
    test_event_code: testCode || undefined,
  });

  try {
    const response = await fetch(
      `https://graph.facebook.com/${apiVersion}/${pixelId}/events?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Meta CAPI] Lead event failed with HTTP ${response.status}: ${errorText}`);
    } else {
      console.log('[Meta CAPI] Lead server event sent successfully');
    }
  } catch (error) {
    console.error('[Meta CAPI] Error sending Lead event:', error);
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  // --- Rate limit ---
  const rateLimited = await enforceRateLimit(request);
  if (rateLimited) return rateLimited;

  const payload = (await request.json().catch(() => ({}))) as LeadPayload;
  const normalized = normalizeLeadPayload(payload);

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

  try {
    const response = await fetch(DEFAULT_LEAD_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(normalized),
      cf: { cacheEverything: false, cacheTtl: 0 },
    });

    if (!response.ok) {
      return json(
        { success: false, error: `Lead endpoint failed with HTTP ${response.status}` },
        { status: 502, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
      );
    }

    waitUntil(sendMetaConversionEvent(normalized, env, request));

    return json(
      { success: true },
      { headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  } catch {
    return json(
      { success: false, error: 'Lead submission failed' },
      { status: 502, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }
};
