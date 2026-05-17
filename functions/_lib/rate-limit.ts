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

function makeRateLimitCacheKey(scope: string, ip: string): Request {
  return new Request(`https://internal-rate-limit.local/${scope}/ip/${ip}`);
}

export function getRateLimitProfile(scope?: string): RateLimitProfile {
  if (!scope) return RATE_LIMIT_PROFILES.default;
  return RATE_LIMIT_PROFILES[scope] || RATE_LIMIT_PROFILES.default;
}

export async function enforceRateLimit(request: Request, scope = 'default'): Promise<Response | null> {
  const ip = getClientIp(request);
  const cache = caches.default;
  const profile = getRateLimitProfile(scope);
  const key = makeRateLimitCacheKey(scope, ip);

  const existing = await cache.match(key);
  const currentCount = existing ? Number(await existing.text()) : 0;
  const nextCount = currentCount + 1;

  if (nextCount > profile.maxRequests) {
    return new Response(JSON.stringify({ error: 'Too many requests', scope }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Retry-After': String(profile.windowSeconds),
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
