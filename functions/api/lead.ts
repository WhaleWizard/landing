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
  event_id?: string;
  hp_trap?: string;   // honeypot – боты заполняют, люди нет
  page_url?: string;
  referrer?: string;
}

const DEFAULT_LEAD_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxE5dVWccxQ0Ga3MSUYeEZ8B6c-KEkbBNl3QPa-zbkyjBvFl5QnxZA2g5BIGmwe-7jNfA/exec';

function sanitizeText(value: string, max: number): string {
  return String(value || '').trim().slice(0, max);
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
    event_id: sanitizeText(payload.event_id || '', 64),
    hp_trap: sanitizeText(payload.hp_trap || '', 10),
    page_url: sanitizeText(payload.page_url || '', 2048),
    referrer: sanitizeText(payload.referrer || '', 2048),
  };
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
async function sendMetaConversionEvent(
  payload: LeadPayload,
  env: Env,
  request: Request
): Promise<void> {
  const token = env.META_CAPI_ACCESS_TOKEN;
  const pixelId = env.VITE_META_PIXEL_ID || '926332213606723';
  const testCode = env.META_CAPI_TEST_CODE;

  if (!token || !pixelId) {
    console.warn('[Meta CAPI] Missing ACCESS_TOKEN or PIXEL_ID. Skipping server event.');
    return;
  }

  const eventTime = Math.floor(Date.now() / 1000);
  const clientIp = request.headers.get('CF-Connecting-IP') || '';
  const userAgent = request.headers.get('User-Agent') || '';
  const eventSourceUrl = payload.page_url || request.headers.get('Referer') || request.url;
  const { fbp, fbc } = getMetaCookies(request);

  const nameParts = (payload.name || '').trim().split(/\s+/);
  const firstName = nameParts[0] || '';
  const lastName = nameParts.slice(1).join(' ') || '';

  const [hashedEmail, hashedPhone, hashedFn, hashedLn] = await Promise.all([
    payload.email ? sha256(payload.email) : undefined,
    payload.phone ? sha256(payload.phone) : undefined,
    firstName ? sha256(firstName) : undefined,
    lastName ? sha256(lastName) : undefined,
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
    },
    custom_data: {
      budget: payload.budget,
      message: payload.message?.slice(0, 500),
      contact_method: payload.contactMethod,
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
      console.error(`[Meta CAPI] Lead event failed with HTTP ${response.status}: ${errorText}`);
    } else {
      console.log('[Meta CAPI] Lead server event sent successfully');
    }
  } catch (error) {
    console.error('[Meta CAPI] Error sending Lead event:', error);
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  // --- Rate limit ---
  const rateLimited = await enforceRateLimit(request);
  if (rateLimited) return rateLimited;

  const payload = (await request.json().catch(() => ({}))) as LeadPayload;
  const normalized = normalizeLeadPayload(payload);

  // --- Honeypot ---
  if (normalized.hp_trap && normalized.hp_trap.length > 0) {
    void sendMetaConversionEvent(normalized, env, request);

    return json(
      { success: true },
      { headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }

  if (!normalized.name || !normalized.email) {
    return json(
      { success: false, error: 'name and email are required' },
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

    void sendMetaConversionEvent(normalized, env, request);

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
