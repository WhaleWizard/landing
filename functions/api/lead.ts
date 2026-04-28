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

async function sha256(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value.toLowerCase().trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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

  // 1. Отправка в Google Apps Script (можно закомментировать для теста Meta отдельно)
  try {
    const leadResponse = await fetch(DEFAULT_LEAD_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(normalized),
      cf: { cacheEverything: false, cacheTtl: 0 },
    });

    if (!leadResponse.ok) {
      return json(
        { success: false, error: `Lead endpoint failed with HTTP ${leadResponse.status}` },
        { status: 502, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
      );
    }
  } catch {
    return json(
      { success: false, error: 'Lead submission failed' },
      { status: 502, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }

  // 2. Синхронная отправка события Lead в Meta Conversions API
  const token = env.META_CAPI_ACCESS_TOKEN;
  const pixelId = env.VITE_META_PIXEL_ID || '926332213606723';
  const testCode = env.META_CAPI_TEST_CODE;

  if (!token || !pixelId) {
    return json(
      { success: true, meta: { status: 'skipped', reason: 'missing access token or pixel id' } },
      { headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }

  const eventTime = Math.floor(Date.now() / 1000);
  const clientIp = request.headers.get('CF-Connecting-IP') || '';
  const userAgent = request.headers.get('User-Agent') || '';

  // Хешируем email и телефон (обязательно для Meta)
  const [hashedEmail, hashedPhone] = await Promise.all([
    normalized.email ? sha256(normalized.email) : undefined,
    normalized.phone ? sha256(normalized.phone) : undefined,
  ]);

  const event = {
    event_name: 'Lead',
    event_time: eventTime,
    action_source: 'website',
    event_id: normalized.event_id || undefined,
    user_data: {
      em: hashedEmail ? [hashedEmail] : undefined,
      ph: hashedPhone ? [hashedPhone] : undefined,
      fn: normalized.name ? [normalized.name.split(' ')[0]] : undefined,
      ln: normalized.name ? [normalized.name.split(' ').slice(1).join(' ')] : undefined,
      client_ip_address: clientIp,
      client_user_agent: userAgent,
    },
    custom_data: {
      budget: normalized.budget,
      message: normalized.message?.slice(0, 500),
      contact_method: normalized.contactMethod,
    },
    event_source_url: request.url,
  };

  const body = JSON.stringify({
    data: [event],
    ...(testCode ? { test_event_code: testCode } : {}),
  });

  try {
    const metaResponse = await fetch(
      `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      }
    );

    const metaText = await metaResponse.text();
    console.log('[Meta CAPI] Response:', metaResponse.status, metaText);

    return json(
      {
        success: true,
        meta: {
          status: metaResponse.status,
          body: metaText,
        },
      },
      { headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  } catch (error) {
    return json(
      {
        success: true,
        meta: { status: 'network_error', body: String(error) },
      },
      { headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }
};
