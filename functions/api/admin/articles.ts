import { CACHE_CONTROL, deleteCacheByUrl } from '../../_lib/cache';
import { verifyAdminPassword } from '../../_lib/auth';
import { enforceRateLimit } from '../../_lib/rate-limit';
import { fetchArticlesFromJsonBin, writeArticlesToJsonBin } from '../../_lib/jsonbin';
import { json } from '../../_lib/http';
import type { Article, Env } from '../../_lib/types';

interface AuthPayload {
  password?: string;
}

interface UpdatePayload {
  password?: string;
  articles?: Article[];
}

function getSiteUrl(env: Env, request: Request): string {
  if (env.SITE_URL) return env.SITE_URL.replace(/\/$/, '');
  const { origin } = new URL(request.url);
  return origin.replace(/\/$/, '');
}

async function invalidateSeoCaches(siteUrl: string, articleSlugs: string[]): Promise<void> {
  const targets = [
    `${siteUrl}/api/articles`,
    `${siteUrl}/sitemap.xml`,
    `${siteUrl}/feed.xml`,
    ...articleSlugs.map((slug) => `${siteUrl}/blog/${slug}`),
  ];

  await Promise.all(targets.map((url) => deleteCacheByUrl(url)));
}

async function notifyIndexNow(env: Env, siteUrl: string, updatedArticles: Article[]): Promise<void> {
  if (!env.INDEXNOW_KEY) return;

  const endpoint = env.INDEXNOW_ENDPOINT || 'https://api.indexnow.org/indexnow';
  const host = new URL(siteUrl).host;
  const urls = updatedArticles.map((article) => `${siteUrl}/blog/${article.slug}`);

  if (urls.length === 0) return;

  await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({
      host,
      key: env.INDEXNOW_KEY,
      keyLocation: `${siteUrl}/${env.INDEXNOW_KEY}.txt`,
      urlList: urls.slice(0, 10000),
    }),
    cf: {
      cacheEverything: false,
      cacheTtl: 0,
    },
  });
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request);
  if (rateLimited) return rateLimited;

  const payload = (await request.json().catch(() => ({}))) as AuthPayload;
  const password = String(payload?.password || '');

  if (!verifyAdminPassword(password, env)) {
    return json(
      { success: false, error: 'Unauthorized' },
      {
        status: 401,
        headers: { 'Cache-Control': CACHE_CONTROL.noStore },
      },
    );
  }

  return json(
    { success: true },
    {
      headers: { 'Cache-Control': CACHE_CONTROL.noStore },
    },
  );
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const rateLimited = await enforceRateLimit(request);
  if (rateLimited) return rateLimited;

  const payload = (await request.json().catch(() => ({}))) as UpdatePayload;
  const password = String(payload?.password || '');

  if (!verifyAdminPassword(password, env)) {
    return json(
      { success: false, error: 'Unauthorized' },
      {
        status: 401,
        headers: { 'Cache-Control': CACHE_CONTROL.noStore },
      },
    );
  }

  if (!Array.isArray(payload?.articles)) {
    return json(
      { success: false, error: 'Invalid payload: articles[] required' },
      {
        status: 400,
        headers: { 'Cache-Control': CACHE_CONTROL.noStore },
      },
    );
  }

  try {
    const existing = await fetchArticlesFromJsonBin(env);

    if (existing.length > 0 && payload.articles.length === 0) {
      return json(
        { success: false, error: 'Refusing to overwrite non-empty blog with an empty payload' },
        {
          status: 400,
          headers: { 'Cache-Control': CACHE_CONTROL.noStore },
        },
      );
    }

    const updated = await writeArticlesToJsonBin(env, payload.articles, existing);

    const allSlugs = Array.from(new Set([...existing, ...updated].map((article) => article.slug)));
    const siteUrl = getSiteUrl(env, request);

    waitUntil(invalidateSeoCaches(siteUrl, allSlugs));
    waitUntil(notifyIndexNow(env, siteUrl, updated));

    return json(
      { success: true, articles: updated },
      {
        headers: {
          'Cache-Control': CACHE_CONTROL.noStore,
        },
      },
    );
  } catch (error) {
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to save articles',
      },
      {
        status: 502,
        headers: { 'Cache-Control': CACHE_CONTROL.noStore },
      },
    );
  }
};
