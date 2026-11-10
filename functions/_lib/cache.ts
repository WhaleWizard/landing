export const CACHE_CONTROL = {
  apiArticles: 'public, s-maxage=120, stale-while-revalidate=300',
  sitemap: 'public, s-maxage=300, stale-while-revalidate=600',
  feed: 'public, s-maxage=300, stale-while-revalidate=600',
  botArticle: 'public, s-maxage=300, stale-while-revalidate=900',
  noStore: 'no-store',
};

/** A collection cached before a scheduled publication must expire before it becomes visible. */
export function articleCollectionCacheControl(
  policy: string,
  articles: readonly { status?: string; publishedAt?: string }[],
  nowMs: number,
): string {
  const maxAge = Number(policy.match(/s-maxage=(\d+)/)?.[1] || 0);
  if (!maxAge) return policy;
  const staleAge = Number(policy.match(/stale-while-revalidate=(\d+)/)?.[1] || 0);
  let seconds = Infinity;
  for (const article of articles) {
    if (article.status === 'draft' || !article.publishedAt) continue;
    const delay = Date.parse(article.publishedAt) - nowMs;
    if (delay > 0) seconds = Math.min(seconds, Math.floor(delay / 1000));
  }
  if (seconds > maxAge + staleAge) return policy;
  if (seconds < 1) return CACHE_CONTROL.noStore;
  return `public, s-maxage=${Math.min(maxAge, seconds)}, must-revalidate`;
}

export async function matchCache(request: Request): Promise<Response | null> {
  const cached = await caches.default.match(request);
  return cached || null;
}

export async function putCache(request: Request, response: Response): Promise<void> {
  await caches.default.put(request, response.clone());
}

export async function deleteCacheByUrl(url: string): Promise<void> {
  await caches.default.delete(new Request(url));
}
