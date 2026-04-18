import { CACHE_CONTROL, matchCache, putCache } from './_lib/cache';
import { fetchArticlesFromJsonBin } from './_lib/jsonbin';
import { renderFeedXml } from './_lib/seo';
import { xml } from './_lib/http';
import type { Env } from './_lib/types';

function getSiteUrl(env: Env, request: Request): string {
  if (env.SITE_URL) return env.SITE_URL.replace(/\/$/, '');
  return new URL(request.url).origin.replace(/\/$/, '');
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const cacheKey = new Request(request.url, { method: 'GET' });
  const cached = await matchCache(cacheKey);
  if (cached) return cached;

  try {
    const siteUrl = getSiteUrl(env, request);
    const articles = await fetchArticlesFromJsonBin(env);
    const feed = renderFeedXml(siteUrl, articles);

    const response = xml(feed, {
      headers: {
        'Cache-Control': CACHE_CONTROL.feed,
      },
    });

    waitUntil(putCache(cacheKey, response));
    return response;
  } catch (error) {
    return xml('<!-- feed generation failed -->', {
      status: 502,
      headers: {
        'Cache-Control': CACHE_CONTROL.noStore,
        'X-Error-Message': error instanceof Error ? error.message : 'unknown',
      },
    });
  }
};
