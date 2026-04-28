import type { Env } from './_lib/types';

const CANONICAL_HOST = 'www.whalewzrd.com';
const LEGACY_HOSTS = new Set(['whalewzrd.com']);

// Только безопасные заголовки, которые НЕ трогают скрипты и пиксели
const SECURITY_HEADERS: Record<string, string> = {
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
