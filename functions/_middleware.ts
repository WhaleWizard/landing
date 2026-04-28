import type { Env } from './_lib/types';

const CANONICAL_HOST = 'www.whalewzrd.com';
const LEGACY_HOSTS = new Set(['whalewzrd.com']);

/*
 * Полная Content Security Policy для всех используемых и потенциально возможных сервисов.
 * Разрешены:
 * - Google Analytics 4, GTM, Google Ads (ремаркетинг и конверсии)
 * - Meta Pixel (браузерный и серверный)
 * - Яндекс Метрика, Яндекс Директ
 * - TikTok Pixel
 * - Twitter/X Pixel
 * - YouTube, Vimeo
 * - Google Fonts
 * - JSONBin, imgbb (i.ibb.co) и собственные ресурсы
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "  https://www.googletagmanager.com",
  "  https://connect.facebook.net",
  "  https://analytics.tiktok.com",
  "  https://mc.yandex.ru",
  "  https://yastatic.net",
  "  https://static.ads-twitter.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: https://i.ibb.co https://www.whalewzrd.com",
  "  https://*.facebook.com https://*.fbcdn.net https://*.twitter.com",
  "font-src 'self' https://fonts.gstatic.com https://fonts.googleapis.com",
  "connect-src 'self'",
  "  https://www.google-analytics.com",
  "  https://*.google-analytics.com",
  "  https://www.googletagmanager.com",
  "  https://stats.g.doubleclick.net",
  "  https://www.googleadservices.com",
  "  https://*.facebook.com",
  "  https://*.fbcdn.net",
  "  https://analytics.tiktok.com",
  "  https://mc.yandex.ru",
  "  https://yandex.ru",
  "  https://api.jsonbin.io",
  "  https://analytics.twitter.com",
  "frame-src 'self' https://www.youtube.com https://player.vimeo.com",
  "media-src 'self' https://*.youtube.com https://*.vimeo.com",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '0',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

export const onRequest: PagesFunction<Env> = async ({ request, next }) => {
  const url = new URL(request.url);

  // Редирект с whalewzrd.com → www.whalewzrd.com
  if (LEGACY_HOSTS.has(url.hostname)) {
    const redirectUrl = new URL(request.url);
    redirectUrl.hostname = CANONICAL_HOST;
    redirectUrl.protocol = 'https:';
    return new Response(null, {
      status: 301,
      headers: {
        Location: redirectUrl.toString(),
        ...SECURITY_HEADERS,
      },
    });
  }

  const response = await next();

  // Добавляем security-заголовки ко всем ответам
  const newHeaders = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!newHeaders.has(key)) {
      newHeaders.set(key, value);
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
};
