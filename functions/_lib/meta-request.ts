/**
 * Общие помощники трёх точек трекинга: `api/lead`, `api/pageview`, `api/meta-event`.
 *
 * Раньше каждая из них держала свою копию этих функций — по двести с лишним
 * строк одинакового кода. Правка в одном файле не доезжала до двух других:
 * так уже расходились нормализация фамилии и коды стран XX/T1. Теперь тело
 * одно, а точки только вызывают его.
 *
 * Здесь только то, что действительно одинаково во всех трёх местах. Всё, что
 * различается по смыслу (например, `buildExternalIdSeed` у заявки умеет
 * опираться на почту и телефон), остаётся в самой точке.
 */
import { detectCountryCode, resolveDeviceType, getMetaDataProcessingOptions } from './meta-capi';
import { isSha256Hex } from './meta-pii';
import type { Env } from './types';

export { getMetaDataProcessingOptions, isSha256Hex };
export type { Env };

export function sanitizeText(value: string, max: number): string {
  return String(value || '').trim().slice(0, max);
}

export function sanitizeNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function sanitizeTextArray(value: unknown, maxItems: number, maxTextLength: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item) => sanitizeText(String(item || ''), maxTextLength))
    .filter(Boolean)
    .slice(0, maxItems);
  return items.length ? items : undefined;
}

export function normalizeGender(value: string | undefined): 'm' | 'f' | undefined {
  const raw = (value || '').trim().toLowerCase();
  if (!raw) return undefined;
  if (raw === 'm' || raw === 'male' || raw === 'man' || raw === 'м' || raw === 'муж') return 'm';
  if (raw === 'f' || raw === 'female' || raw === 'woman' || raw === 'ж' || raw === 'жен') return 'f';
  return undefined;
}

export function normalizeDobPart(value: string | undefined, len: 2 | 4): string | undefined {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return undefined;
  return digits.slice(0, len).padStart(len, '0');
}

export function normalizeTextForMeta(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeLocationForMeta(value: string): string {
  return normalizeTextForMeta(value).replace(/[\s\p{P}\p{S}_]+/gu, '');
}

export function createFbcFromFbclid(fbclid: string | undefined, eventTime: number): string | undefined {
  return fbclid ? `fb.1.${eventTime * 1000}.${fbclid}` : undefined;
}

export function createFbcFromPageUrl(pageUrl: string | undefined, eventTime: number): string | undefined {
  if (!pageUrl) return undefined;

  try {
    return createFbcFromFbclid(new URL(pageUrl).searchParams.get('fbclid')?.trim(), eventTime);
  } catch {
    return undefined;
  }
}

export async function sha256Normalized(value: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Анонимный external_id: сессия или _fbp. Вариант для просмотров и событий;
 * у заявки своя версия с опорой на почту и телефон.
 */
export function buildExternalIdSeed(payload: { external_id?: string; session_id?: string }, fbp: string | undefined): string | undefined {
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

export function getMetaCookies(request: Request): { fbp?: string; fbc?: string } {
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

export function resolveEventTime(payloadEventTime: number | undefined): number {
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

export function extractRequestContext(request: Request, pageUrl?: string) {
  const country = detectCountryCode(request);
  const city = request.headers.get('CF-IPCity') || request.headers.get('X-City') || undefined;
  const region = request.headers.get('CF-Region') || request.headers.get('X-Region') || undefined;
  const regionCode = request.headers.get('CF-Region-Code') || request.headers.get('X-Region-Code') || undefined;
  const timezone = request.headers.get('CF-Timezone') || undefined;
  const language = request.headers.get('Accept-Language')?.split(',')[0]?.trim() || undefined;
  const platform = request.headers.get('Sec-CH-UA-Platform')?.replaceAll('"', '') || undefined;
  // Заголовок Sec-CH-UA-Mobile присылает только Chromium; для Safari и Firefox
  // тип устройства берётся из user-agent, иначе параметр уходил бы в Meta
  // пустым как раз на мобильном трафике.
  const isMobile = resolveDeviceType(request);

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

export type RequestContext = ReturnType<typeof extractRequestContext>;

export function normalizePagePath(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const path = value.split('?')[0].split('#')[0] || '/';
  return path.length > 1 ? path.replace(/\/$/, '') : path;
}

export function sanitizeUrlForMeta(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}

export type UtmPayload = {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  utm_id?: string;
};

export function hasAnyUtm(payload: UtmPayload, ctx: RequestContext): boolean {
  return Boolean(
    payload.utm_source || payload.utm_medium || payload.utm_campaign || payload.utm_content ||
    payload.utm_term || payload.utm_id || ctx.utmSource || ctx.utmMedium || ctx.utmCampaign ||
    ctx.utmContent || ctx.utmTerm || ctx.utmId
  );
}
