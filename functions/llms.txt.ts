import { CACHE_CONTROL, matchCache, putCache } from './_lib/cache';
import { fetchArticlesWithFallback, filterVisibleArticles } from './_lib/articles';
import { getArticlePath, renderLlmsTxt } from './_lib/seo';
import { findPageLock, readPageLockSnapshot } from './_lib/page-locks';
import { text } from './_lib/http';
import { headFromGet } from './_lib/article-page';
import type { Env } from './_lib/types';

function getSiteUrl(env: Env, request: Request): string {
  if (env.SITE_URL) return env.SITE_URL.replace(/\/$/, '');
  return new URL(request.url).origin.replace(/\/$/, '');
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { request, env, waitUntil, next } = context;
  const requestUrl = new URL(request.url);
  const cacheKey = new Request(new URL(requestUrl.pathname, requestUrl.origin).toString(), { method: 'GET' });
  const cached = await matchCache(cacheKey);
  if (cached) return cached;

  try {
    const siteUrl = getSiteUrl(env, request);
    const staticRes = await next();
    const staticHeader = await staticRes.text();

    const { locks } = await readPageLockSnapshot(env, waitUntil);
    const articles = filterVisibleArticles(await fetchArticlesWithFallback(env, request, waitUntil))
      .filter((article) => !findPageLock(locks, getArticlePath(article)));

    const generatedDate = new Date().toISOString().slice(0, 10);
    const content = renderLlmsTxt(staticHeader, articles, siteUrl, generatedDate);

    const response = text(content, {
      headers: {
        'Cache-Control': CACHE_CONTROL.sitemap,
      },
    });

    waitUntil(putCache(cacheKey, response));
    return response;
  } catch {
    return next();
  }
};

export const onRequestHead: PagesFunction<Env> = headFromGet(onRequestGet);
