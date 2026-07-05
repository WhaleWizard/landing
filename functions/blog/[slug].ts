import { CACHE_CONTROL, matchCache, putCache } from '../_lib/cache';
import { fetchArticlesWithFallback, filterVisibleArticles } from '../_lib/articles';
import { findArticleBySlugPrefix, getArticlePath, isBotRequest, renderArticleHtml, renderArticleNotFoundHtml } from '../_lib/seo';
import type { Env } from '../_lib/types';

const SECTION_PATH = '/blog';

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
  if (!slug) {
    return new Response(renderArticleNotFoundHtml(getSiteUrl(env, request), SECTION_PATH), {
      status: 404,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': CACHE_CONTROL.noStore,
      },
    });
  }

  const cacheKey = new Request(request.url, { method: 'GET' });
  const cached = await matchCache(cacheKey);
  if (cached) return cached;

  try {
    const articles = filterVisibleArticles(await fetchArticlesWithFallback(env, request));
    const article = articles.find((item) => item.slug === slug && item.category !== 'Кейсы');
    const siteUrl = getSiteUrl(env, request);

    if (!article) {
      const redirectArticle = findArticleBySlugPrefix(articles, slug, SECTION_PATH);
      if (redirectArticle) {
        return Response.redirect(`${siteUrl}${getArticlePath(redirectArticle)}`, 301);
      }

      return new Response(renderArticleNotFoundHtml(siteUrl, SECTION_PATH), {
        status: 404,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': CACHE_CONTROL.noStore,
        },
      });
    }

    const html = renderArticleHtml(siteUrl, article, SECTION_PATH);

    const response = new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': CACHE_CONTROL.botArticle,
      },
    });

    waitUntil(putCache(cacheKey, response));
    return response;
  } catch {
    return new Response(renderArticleNotFoundHtml(getSiteUrl(env, request), SECTION_PATH), {
      status: 503,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': CACHE_CONTROL.noStore,
        'Retry-After': '300',
      },
    });
  }
};
