import { CACHE_CONTROL, matchCache, putCache } from './_lib/cache';
import { fetchArticlesWithFallback, filterVisibleArticles } from './_lib/articles';
import { getArticlePath, renderFeedXml } from './_lib/seo';
import { findPageLock, readPageLockSnapshot } from './_lib/page-locks';
import { xml } from './_lib/http';
import { headFromGet } from './_lib/article-page';
import type { Env } from './_lib/types';

function getSiteUrl(env: Env, request: Request): string {
  if (env.SITE_URL) return env.SITE_URL.replace(/\/$/, '');
  return new URL(request.url).origin.replace(/\/$/, '');
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  // Ключ кэша — без query: иначе `?_=<случайное>` на каждый запрос заново
  // читал все статьи из D1, и такой ключ не чистился `buildSeoCacheTargets`.
  const requestUrl = new URL(request.url);
  const cacheKey = new Request(new URL(requestUrl.pathname, requestUrl.origin).toString(), { method: 'GET' });
  const cached = await matchCache(cacheKey);
  if (cached) return cached;

  try {
    const siteUrl = getSiteUrl(env, request);
    const { locks } = await readPageLockSnapshot(env, waitUntil);
    // Материал закрытого раздела в ленте вёл бы подписчика на заглушку.
    const articles = filterVisibleArticles(await fetchArticlesWithFallback(env, request, waitUntil))
      .filter((article) => !findPageLock(locks, getArticlePath(article)));
    const feed = renderFeedXml(siteUrl, articles);

    const response = xml(feed, {
      headers: {
        'Cache-Control': CACHE_CONTROL.feed,
      },
    });

    waitUntil(putCache(cacheKey, response));
    return response;
  } catch {
    return xml('<!-- feed generation failed -->', {
      status: 503,
      headers: {
        'Cache-Control': CACHE_CONTROL.noStore,
        'Retry-After': '300',
      },
    });
  }
};

// HEAD отвечает тем же статусом и заголовками, что GET: без своего
// обработчика Cloudflare Pages отдавал на HEAD статику, то есть 404.
export const onRequestHead: PagesFunction<Env> = headFromGet(onRequestGet);
