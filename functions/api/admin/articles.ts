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
    ...articleSlugs.map((slug) => `${siteUrl}/blog/${slug}`),
  ];

  await Promise.all(targets.map((url) => deleteCacheByUrl(url)));
}


async function pingSearchEngines(siteUrl: string): Promise<void> {
  const sitemapUrl = `${siteUrl}/sitemap.xml`;
  const feedUrl = `${siteUrl}/feed.xml`;
  const targets = [
    `https://www.google.com/ping?sitemap=${encodeURIComponent(sitemapUrl)}`,
    `https://www.google.com/ping?sitemap=${encodeURIComponent(feedUrl)}`,
  ];

  await Promise.allSettled(
    targets.map((url) =>
      fetch(url, {
        method: 'GET',
        cf: { cacheTtl: 0, cacheEverything: false },
      }),
    ),
  );
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
    const updated = await writeArticlesToJsonBin(env, payload.articles);

    const allSlugs = Array.from(new Set([...existing, ...updated].map((article) => article.slug)));
    const siteUrl = getSiteUrl(env, request);
    waitUntil(invalidateSeoCaches(siteUrl, allSlugs));

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
