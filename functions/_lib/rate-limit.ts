import { getClientIp } from './http';

const WINDOW_SECONDS = 60;
const MAX_REQUESTS = 30;

function makeRateLimitCacheKey(ip: string): Request {
  return new Request(`https://internal-rate-limit.local/ip/${ip}`);
}

export async function enforceRateLimit(request: Request): Promise<Response | null> {
  const ip = getClientIp(request);
  const cache = caches.default;
  const key = makeRateLimitCacheKey(ip);

  const existing = await cache.match(key);
  const currentCount = existing ? Number(await existing.text()) : 0;
  const nextCount = currentCount + 1;

  if (nextCount > MAX_REQUESTS) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Retry-After': String(WINDOW_SECONDS),
      },
    });
  }

  const counterResponse = new Response(String(nextCount), {
    headers: {
      'Cache-Control': `max-age=${WINDOW_SECONDS}`,
    },
  });

  await cache.put(key, counterResponse);

  return null;
}
