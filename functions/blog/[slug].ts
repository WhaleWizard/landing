import { CACHE_CONTROL, matchCache, putCache } from '../_lib/cache';
import { fetchArticlesWithFallback } from '../_lib/articles';
import { isBotRequest, renderArticleHtml } from '../_lib/seo';
import type { Env } from '../_lib/types';

function getSiteUrl(env: Env, request: Request): string {
  if (env.SITE_URL) return env.SITE_URL.replace(/\/$/, '');
  return new URL(request.url).origin.replace(/\/$/, '');
}

export const onRequestGet: PagesFunction<Env> = async ({ request, params, env, next, waitUntil }) => {
  const spaIndexRequest = new Request(new URL('/index.html', request.url).toString(), {
    method: 'GET',
    headers: request.headers,
  });

  if (!isBotRequest(request)) {
    return next(spaIndexRequest);
  }

  const slug = String(params.slug || '').trim();
  if (!slug) return next(spaIndexRequest);

  const cacheKey = new Request(request.url, { method: 'GET' });
  const cached = await matchCache(cacheKey);
  if (cached) return cached;

  try {
    const articles = await fetchArticlesWithFallback(env, request);
    const article = articles.find((item) => item.slug === slug);

    if (!article) {
      return next(spaIndexRequest);
    }

    const siteUrl = getSiteUrl(env, request);
    const html = renderArticleHtml(siteUrl, article);

    const response = new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': CACHE_CONTROL.botArticle,
      },
    });

    waitUntil(putCache(cacheKey, response));
    return response;
  } catch {
    return next(spaIndexRequest);
  }
};
