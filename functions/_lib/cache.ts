export const CACHE_CONTROL = {
  apiArticles: 'public, s-maxage=120, stale-while-revalidate=300',
  sitemap: 'public, s-maxage=300, stale-while-revalidate=600',
  botArticle: 'public, s-maxage=300, stale-while-revalidate=900',
  noStore: 'no-store',
};

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
