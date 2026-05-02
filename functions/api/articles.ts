import { CACHE_CONTROL, matchCache, putCache } from '../_lib/cache';
import { fetchArticlesWithFallback } from '../_lib/articles';
import { json } from '../_lib/http';
import type { Env } from '../_lib/types';

export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  try {
    const url = new URL(request.url);
    const bypassCache = url.searchParams.has('_') || url.searchParams.get('cache') === 'no-store';
    const cacheKey = new Request(request.url, { method: 'GET' });
    if (!bypassCache) {
      try {
        const cached = await matchCache(cacheKey);
        if (cached) return cached;
      } catch (cacheError) {
        console.warn('Cache lookup failed:', cacheError);
      }
    }

    const now = new Date().toISOString();
    let allArticles = [];

    try {
      allArticles = await fetchArticlesWithFallback(env, request);
    } catch (fetchError) {
      console.error('fetchArticlesWithFallback error:', fetchError);
      // Continue with empty array - will use seed data below
    }

    // Safely filter articles
    let visibleArticles = [];
    try {
      visibleArticles = (allArticles || []).filter((article) => {
        if (!article) return false;
        if (article.status === 'draft') return false;
        if (article.publishedAt && article.publishedAt > now) return false;
        return true;
      });
      visibleArticles.sort((a, b) => Number(a?.id || 0) - Number(b?.id || 0));
    } catch (filterError) {
      console.error('Error filtering articles:', filterError);
      visibleArticles = [];
    }

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
      try {
        waitUntil(putCache(cacheKey, response));
      } catch (cacheError) {
        console.warn('Cache put failed:', cacheError);
      }
    }
    return response;
  } catch (error) {
    console.error('Unhandled error in articles endpoint:', error);
    return json(
      {
        error: 'Failed to load articles',
        details: error instanceof Error ? error.message : String(error),
      },
      {
        status: 502,
        headers: {
          'Cache-Control': 'no-store',
        },
      },
    );
  }
};
