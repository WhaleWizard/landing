import { json } from '../_lib/http';
import { CACHE_CONTROL } from '../_lib/cache';
import type { Env } from '../_lib/types';

interface PageViewPayload {
  event_id?: string;
  page_url?: string;
  referrer?: string;
  external_id?: string;
}

function sanitizeText(value: string, max: number): string {
  return String(value || '').trim().slice(0, max);
}

async function sha256(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function getMetaCookies(request: Request): { fbp?: string; fbc?: string } {
  const cookieHeader = request.headers.get('Cookie') || '';
  const pairs = cookieHeader.split(';').map(p => p.trim());
  const result: { fbp?: string; fbc?: string } = {};
  for (const pair of pairs) {
    const [key, ...rest] = pair.split('=');
    const value = rest.join('=');
    if (key === '_fbp') result.fbp = decodeURIComponent(value);
    else if (key === '_fbc') result.fbc = decodeURIComponent(value);
  }
  return result;
}


function extractRequestContext(request: Request) {
  const country = request.headers.get('CF-IPCountry') || undefined;
  const city = request.headers.get('CF-IPCity') || request.headers.get('X-City') || undefined;
  const region = request.headers.get('CF-Region') || request.headers.get('X-Region') || undefined;
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
    const sourceUrl = new URL(request.url);
    utmSource = sourceUrl.searchParams.get('utm_source') || undefined;
    utmMedium = sourceUrl.searchParams.get('utm_medium') || undefined;
    utmCampaign = sourceUrl.searchParams.get('utm_campaign') || undefined;
    utmContent = sourceUrl.searchParams.get('utm_content') || undefined;
    utmTerm = sourceUrl.searchParams.get('utm_term') || undefined;
  } catch {
    // no-op
  }

  return { country, city, region, timezone, language, platform, isMobile, utmSource, utmMedium, utmCampaign, utmContent, utmTerm };
}

async function sendMetaPageView(
  payload: PageViewPayload,
  env: Env,
  request: Request
): Promise<void> {
  const token = env.META_CAPI_ACCESS_TOKEN;
  const pixelId = env.VITE_META_PIXEL_ID || '926332213606723';
  const testCode = env.META_CAPI_TEST_CODE;

  if (!token || !pixelId) {
    console.warn('[Meta CAPI] Missing token or pixel ID, skipping PageView');
    return;
  }

  const eventTime = Math.floor(Date.now() / 1000);
  const clientIp = request.headers.get('CF-Connecting-IP') || '';
  const userAgent = request.headers.get('User-Agent') || '';
  const eventSourceUrl = payload.page_url || request.headers.get('Referer') || request.url;
  const eventId = payload.event_id || undefined;

  const { fbp, fbc } = getMetaCookies(request);
  const ctx = extractRequestContext(request);
  const hashedExternalId = payload.external_id ? await sha256(payload.external_id) : undefined;
  const hashedCountry = ctx.country ? await sha256(ctx.country) : undefined;
  const hashedCity = ctx.city ? await sha256(ctx.city) : undefined;
  const hashedRegion = ctx.region ? await sha256(ctx.region) : undefined;

  const event = {
    event_name: 'PageView',
    event_time: eventTime,
    action_source: 'website',
    event_id: eventId,
    user_data: {
      client_ip_address: clientIp,
      client_user_agent: userAgent,
      fbp: fbp || undefined,
      fbc: fbc || undefined,
      external_id: hashedExternalId ? [hashedExternalId] : undefined,
      country: hashedCountry ? [hashedCountry] : undefined,
      ct: hashedCity ? [hashedCity] : undefined,
      st: hashedRegion ? [hashedRegion] : undefined,
    },
    custom_data: {
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
    },
    event_source_url: eventSourceUrl,
  };

  const body = JSON.stringify({
    data: [event],
    test_event_code: testCode || undefined,
  });

  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Meta CAPI] PageView event failed: ${response.status} ${errorText}`);
    } else {
      console.log('[Meta CAPI] PageView server event sent successfully');
    }
  } catch (error) {
    console.error('[Meta CAPI] Error sending PageView event:', error);
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const payload = (await request.json().catch(() => ({}))) as PageViewPayload;

  if (!payload.event_id) {
    return json(
      { success: false, error: 'event_id is required' },
      { status: 400, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }

  // Отправляем асинхронно, не замедляя клиентскую навигацию
  void sendMetaPageView(payload, env, request);

  return json(
    { success: true },
    { headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
  );
};
