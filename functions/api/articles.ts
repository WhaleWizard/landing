import { CACHE_CONTROL, matchCache, putCache } from '../_lib/cache';
import { fetchArticlesWithFallback } from '../_lib/articles';
import { json } from '../_lib/http';
import type { Env } from '../_lib/types';

export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const url = new URL(request.url);
  const bypassCache = url.searchParams.has('_') || url.searchParams.get('cache') === 'no-store';
  const cacheKey = new Request(request.url, { method: 'GET' });
  if (!bypassCache) {
    const cached = await matchCache(cacheKey);
    if (cached) return cached;
  }

  try {
    const now = new Date().toISOString();
    const allArticles = await fetchArticlesWithFallback(env, request);

    const visibleArticles = allArticles.filter((article) => {
      if (article.status === 'draft') return false;
      if (article.publishedAt && article.publishedAt > now) return false;
      return true;
    });

    const isEmpty = !Array.isArray(visibleArticles) || visibleArticles.length === 0;
    const response = json(
      { articles: visibleArticles },
      {
        headers: {
          'Cache-Control': isEmpty ? CACHE_CONTROL.noStore : CACHE_CONTROL.apiArticles,
        },
      },
    );

    if (!isEmpty && !bypassCache) {
      waitUntil(putCache(cacheKey, response));
    }
    return response;
  } catch (error) {
    return json(
      {
        error: 'Failed to load articles',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      {
        status: 502,
        headers: {
          'Cache-Control': CACHE_CONTROL.noStore,
        },
      },
    );
  }
};
