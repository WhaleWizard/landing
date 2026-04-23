import { CACHE_CONTROL } from '../../_lib/cache';
import { fetchArticlesWithFallback } from '../../_lib/articles';
import { json } from '../../_lib/http';
import type { Env } from '../../_lib/types';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const articles = await fetchArticlesWithFallback(env, request);
    return json(
      {
        ok: true,
        source: articles.length > 0 ? 'content_available' : 'empty_or_fallback',
        articlesCount: articles.length,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': CACHE_CONTROL.noStore,
        },
      },
    );
  } catch (error) {
    return json(
      {
        ok: false,
        source: 'error',
        articlesCount: 0,
        error: error instanceof Error ? error.message : 'unknown',
        timestamp: new Date().toISOString(),
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

