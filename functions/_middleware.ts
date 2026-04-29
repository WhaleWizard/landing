import type { Env } from './_lib/types';

const CANONICAL_HOST = 'www.whalewzrd.com';
const LEGACY_HOSTS = new Set(['whalewzrd.com']);

const IS_DEV = false;

function buildCsp(): string {
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://mc.yandex.ru https://connect.facebook.net https://analytics.tiktok.com",
    "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://www.googletagmanager.com https://mc.yandex.ru https://connect.facebook.net https://graph.facebook.com https://analytics.tiktok.com https://api.jsonbin.io https://script.google.com",
    "frame-src 'self' https://www.googletagmanager.com",
    "manifest-src 'self'",
    'upgrade-insecure-requests',
  ];

  if (IS_DEV) directives.push("script-src-elem 'self' 'unsafe-inline' 'unsafe-eval'");

  return directives.join('; ');
}

function withSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);

  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  headers.set('Content-Security-Policy', buildCsp());
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const onRequest: PagesFunction<Env> = async ({ request, next }) => {
  const url = new URL(request.url);

  if (LEGACY_HOSTS.has(url.hostname)) {
    const redirectUrl = new URL(request.url);
    redirectUrl.hostname = CANONICAL_HOST;
    redirectUrl.protocol = 'https:';
    return withSecurityHeaders(Response.redirect(redirectUrl.toString(), 301));
  }

  const response = await next();
  return withSecurityHeaders(response);
};
