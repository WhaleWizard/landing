import { CACHE_CONTROL, matchCache, putCache } from '../_lib/cache';
import {
  fetchArticleWithFallback,
  fetchArticleSummariesWithFallback,
  fetchArticlesWithFallback,
  filterVisibleArticles,
} from '../_lib/articles';
import { json } from '../_lib/http';
import type { Article, Env } from '../_lib/types';

export type PublicArticleSummary = Article & { _summary: true };

export function toPublicArticleSummary(article: Article): PublicArticleSummary {
  const { content: _content, ...summary } = article;
  return {
    ...summary,
    // Keep one stable public shape so older clients remain compatible, but do
    // not send every article body to listing pages and the home page.
    content: '',
    _summary: true,
  };
}

function isValidSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const url = new URL(request.url);
  const bypassCache = url.searchParams.has('_') || url.searchParams.get('cache') === 'no-store';
  const requestedSlug = String(url.searchParams.get('slug') || '').trim();
  const summaryView = url.searchParams.get('view') === 'summary';

  if (requestedSlug && !isValidSlug(requestedSlug)) {
    return json(
      { error: 'Invalid article slug' },
      { status: 400, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }

  const cacheKey = new Request(request.url, { method: 'GET' });
  if (!bypassCache) {
    try {
      const cached = await matchCache(cacheKey);
      if (cached) return cached;
    } catch {
      // Ignore edge cache failures and continue with live data fetch.
    }
  }

  try {
    const now = new Date().toISOString();
    const requestedArticle = requestedSlug
      ? await fetchArticleWithFallback(env, request, requestedSlug)
      : null;
    const allArticles = requestedSlug
      ? requestedArticle ? [requestedArticle] : []
      : summaryView
        ? await fetchArticleSummariesWithFallback(env, request)
        : await fetchArticlesWithFallback(env, request, waitUntil);
    const visibleArticles = filterVisibleArticles(allArticles, now);
    visibleArticles.sort((a, b) => Number(a.id || 0) - Number(b.id || 0));

    if (requestedSlug) {
      const article = visibleArticles.find((item) => item.slug === requestedSlug);
      if (!article) {
        return json(
          { error: 'Article not found' },
          { status: 404, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
        );
      }

      const response = json(
        { article },
        { headers: { 'Cache-Control': CACHE_CONTROL.apiArticles } },
      );
      if (!bypassCache) {
        waitUntil(putCache(cacheKey, response).catch(() => undefined));
      }
      return response;
    }

    const isEmpty = !Array.isArray(visibleArticles) || visibleArticles.length === 0;
    const responseArticles = summaryView
      ? visibleArticles.map(toPublicArticleSummary)
      : visibleArticles;
    const response = json(
      { articles: responseArticles },
      {
        headers: {
          'Cache-Control': isEmpty ? CACHE_CONTROL.noStore : CACHE_CONTROL.apiArticles,
        },
      },
    );

    if (!isEmpty && !bypassCache) {
      waitUntil(
        putCache(cacheKey, response).catch(() => {
          // Ignore cache write errors; response is already ready.
        }),
      );
    }
    return response;
  } catch (error) {
    return json(
      {
        error: 'Failed to load articles',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      {
        status: 503,
        headers: {
          'Cache-Control': CACHE_CONTROL.noStore,
          'Retry-After': '300',
        },
      },
    );
  }
};
