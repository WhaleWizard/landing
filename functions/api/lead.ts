import { json } from '../_lib/http';
import { CACHE_CONTROL } from '../_lib/cache';
import type { Env } from '../_lib/types';

interface LeadPayload {
  name?: string;
  email?: string;
  phone?: string;
  budget?: string;
  message?: string;
  contactMethod?: 'telegram' | 'whatsapp';
  telegramUsername?: string;
  event_id?: string;
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
  };
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
    console.warn('[Meta CAPI] Missing ACCESS_TOKEN or PIXEL_ID');
    return;
  }

  const eventTime = Math.floor(Date.now() / 1000);
  const clientIp = request.headers.get('CF-Connecting-IP') || '';
  const userAgent = request.headers.get('User-Agent') || '';

  // Временно не хешируем, чтобы проверить базовую отправку
  const event = {
    event_name: 'Lead',
    event_time: eventTime,
    action_source: 'website',
    event_id: payload.event_id || undefined,
    user_data: {
      // em и ph не передаём, чтобы избежать ошибки хеширования
      client_ip_address: clientIp,
      client_user_agent: userAgent,
    },
    custom_data: {
      budget: payload.budget,
      message: payload.message?.slice(0, 500),
      contact_method: payload.contactMethod,
    },
    event_source_url: request.url,
  };

  const body = JSON.stringify({
    data: [event],
    ...(testCode ? { test_event_code: testCode } : {}),
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
      console.error(`[Meta CAPI] Lead event failed: ${response.status} ${errorText}`);
    } else {
      console.log('[Meta CAPI] Lead server event sent successfully');
    }
  } catch (error) {
    console.error('[Meta CAPI] Error:', error);
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const payload = (await request.json().catch(() => ({}))) as LeadPayload;
  const normalized = normalizeLeadPayload(payload);

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
        { success: false, error: `Lead endpoint failed: ${response.status}` },
        { status: 502, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
      );
    }

    // Сразу вызываем sendMetaConversionEvent
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
