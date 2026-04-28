import { json } from '../_lib/http';
import { CACHE_CONTROL } from '../_lib/cache';
import type { Env } from '../_lib/types';

interface PageViewPayload {
  event_id?: string;
  page_url?: string;
  referrer?: string;
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

async function sendMetaPageView(
  payload: PageViewPayload,
  env: Env,
  request: Request
): Promise<void> {
  const token = env.META_CAPI_ACCESS_TOKEN;
  const pixelId = env.VITE_META_PIXEL_ID || '926332213606723';

  if (!token || !pixelId) {
    console.warn('[Meta CAPI] Missing token or pixel ID, skipping PageView');
    return;
  }

  const eventTime = Math.floor(Date.now() / 1000);
  const clientIp = request.headers.get('CF-Connecting-IP') || '';
  const userAgent = request.headers.get('User-Agent') || '';
  const eventSourceUrl = payload.page_url || request.headers.get('Referer') || request.url;
  const eventId = payload.event_id || undefined;

  // Для PageView обычно достаточно IP и User-Agent; если есть fbp/fbc из cookie, можно извлечь
  const event = {
    event_name: 'PageView',
    event_time: eventTime,
    action_source: 'website',
    event_id: eventId,
    user_data: {
      client_ip_address: clientIp,
      client_user_agent: userAgent,
    },
    event_source_url: eventSourceUrl,
  };

  const body = JSON.stringify({
    data: [event],
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

  // Простая валидация: event_id обязателен для дедупликации
  if (!payload.event_id) {
    return json(
      { success: false, error: 'event_id is required' },
      { status: 400, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }

  // Отправляем асинхронно, чтобы не замедлять клиент
  void sendMetaPageView(payload, env, request);

  return json(
    { success: true },
    { headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
  );
};
