import { getClientIp } from './http';

type RateLimitProfile = {
  windowSeconds: number;
  maxRequests: number;
};

const RATE_LIMIT_PROFILES: Record<string, RateLimitProfile> = {
  default: { windowSeconds: 60, maxRequests: 30 },
  pageview: { windowSeconds: 60, maxRequests: 120 },
  meta_event: { windowSeconds: 60, maxRequests: 120 },
  lead: { windowSeconds: 600, maxRequests: 20 },
  meta_test_event: { windowSeconds: 60, maxRequests: 20 },
  admin: { windowSeconds: 60, maxRequests: 30 },
};

// Ключ включает номер окна: у каждого окна свой счётчик, который истекает сам.
// Раньше TTL продлевался при каждом запросе, из-за чего счётчик не сбрасывался,
// пока запросы шли чаще windowSeconds, и честный трафик со временем получал 429.
function makeRateLimitCacheKey(scope: string, ip: string, windowIndex: number): Request {
  return new Request(`https://internal-rate-limit.local/${scope}/ip/${ip}/window/${windowIndex}`);
}

export function getRateLimitProfile(scope?: string): RateLimitProfile {
  if (!scope) return RATE_LIMIT_PROFILES.default;
  return RATE_LIMIT_PROFILES[scope] || RATE_LIMIT_PROFILES.default;
}

export async function enforceRateLimit(request: Request, scope = 'default'): Promise<Response | null> {
  const ip = getClientIp(request);
  const cache = caches.default;
  const profile = getRateLimitProfile(scope);
  const nowSeconds = Math.floor(Date.now() / 1000);
  const windowIndex = Math.floor(nowSeconds / profile.windowSeconds);
  const secondsUntilWindowEnd = profile.windowSeconds - (nowSeconds % profile.windowSeconds);
  const key = makeRateLimitCacheKey(scope, ip, windowIndex);

  const existing = await cache.match(key);
  const currentCount = existing ? Number(await existing.text()) || 0 : 0;
  const nextCount = currentCount + 1;

  if (nextCount > profile.maxRequests) {
    return new Response(JSON.stringify({ error: 'Too many requests', scope }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Retry-After': String(secondsUntilWindowEnd),
      },
    });
  }

  const counterResponse = new Response(String(nextCount), {
    headers: {
      'Cache-Control': `max-age=${profile.windowSeconds}`,
    },
  });

  await cache.put(key, counterResponse);

  return null;
}
