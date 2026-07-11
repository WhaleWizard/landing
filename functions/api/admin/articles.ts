import { CACHE_CONTROL, deleteCacheByUrl } from '../../_lib/cache';
import { verifyAdminPassword } from '../../_lib/auth';
import { enforceRateLimit } from '../../_lib/rate-limit';
import { fetchArticlesFromJsonBin, writeArticlesToJsonBin } from '../../_lib/jsonbin';
import { fetchArticlesFromD1, writeArticlesToD1 } from '../../_lib/d1';
import { fetchArticlesWithFallback, isPublishedArticle, shouldUseD1Articles } from '../../_lib/articles';
import { getArticlePath } from '../../_lib/seo';
import { json } from '../../_lib/http';
import type { Article, Env } from '../../_lib/types';

interface AuthPayload {
  password?: string;
}

interface UpdatePayload {
  password?: string;
  articles?: Article[];
}

const MAX_ARTICLES = 500;
const MAX_CONTENT_LENGTH = 120_000;
const MAX_TEXT_LENGTH = 2_000;
const ALLOWED_INDEXNOW_HOSTS = new Set(['api.indexnow.org']);
const PROTECTED_ARTICLE_SLUG = 'kak-meta-ads-i-google-ads-sozdayut-effektivnuyu-voronku-prodazh';

function getSiteUrl(env: Env, request: Request): string {
  if (env.SITE_URL) return env.SITE_URL.replace(/\/$/, '');
  const { origin } = new URL(request.url);
  return origin.replace(/\/$/, '');
}

interface CacheInvalidationReport {
  targets: string[];
  successful: string[];
  failed: string[];
}

function buildSeoCacheTargets(siteUrl: string, articleSlugs: string[]): string[] {
  return [
    `${siteUrl}/api/articles`,
    `${siteUrl}/sitemap.xml`,
    `${siteUrl}/feed.xml`,
    ...articleSlugs.flatMap((slug) => [`${siteUrl}/blog/${slug}`, `${siteUrl}/cases/${slug}`]),
  ];
}

// caches.default.delete() чистит кэш только текущего дата-центра Cloudflare.
// Для глобальной очистки нужен API-вызов purge_cache — работает, если заданы
// CF_ZONE_ID и CF_CACHE_PURGE_TOKEN (токен с правом Zone.Cache Purge).
async function purgeCloudflareEdgeCache(env: Env, urls: string[]): Promise<{ attempted: boolean; ok: boolean; error?: string }> {
  const zoneId = env.CF_ZONE_ID;
  const apiToken = env.CF_CACHE_PURGE_TOKEN;
  if (!zoneId || !apiToken) return { attempted: false, ok: false };

  try {
    // Cloudflare ограничивает purge_by_url 30 адресами за вызов.
    for (let offset = 0; offset < urls.length; offset += 30) {
      const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify({ files: urls.slice(offset, offset + 30) }),
      });
      if (!response.ok) {
        return { attempted: true, ok: false, error: `HTTP ${response.status}` };
      }
    }
    return { attempted: true, ok: true };
  } catch (error) {
    return { attempted: true, ok: false, error: error instanceof Error ? error.message : 'purge failed' };
  }
}

async function invalidateSeoCaches(targets: string[]): Promise<CacheInvalidationReport> {
  const settled = await Promise.allSettled(targets.map((url) => deleteCacheByUrl(url)));
  const successful: string[] = [];
  const failed: string[] = [];

  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') successful.push(targets[index]);
    else failed.push(targets[index]);
  });

  return {
    targets,
    successful,
    failed,
  };
}

async function notifyIndexNow(env: Env, siteUrl: string, updatedArticles: Article[]): Promise<void> {
  if (!env.INDEXNOW_KEY) return;

  const endpoint = env.INDEXNOW_ENDPOINT || 'https://api.indexnow.org/indexnow';
  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    return;
  }
  if (parsedEndpoint.protocol !== 'https:' || !ALLOWED_INDEXNOW_HOSTS.has(parsedEndpoint.host)) {
    return;
  }
  const host = new URL(siteUrl).host;
  // Только опубликованные статьи и их реальные адреса: кейсы живут на /cases/,
  // а черновики отдают 404 — пинговать их бессмысленно.
  const urls = updatedArticles
    .filter((article) => isPublishedArticle(article))
    .map((article) => `${siteUrl}${getArticlePath(article)}`);

  if (urls.length === 0) return;

  await fetch(parsedEndpoint.toString(), {
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

function isValidArticlePayload(article: Article): boolean {
  if (!article) return false;
  if (String(article.title || '').trim().length === 0) return false;
  if (String(article.slug || '').trim().length === 0) return false;
  if (String(article.content || '').length > MAX_CONTENT_LENGTH) return false;
  if (String(article.description || '').length > MAX_TEXT_LENGTH) return false;
  if (String(article.seoTitle || '').length > 120) return false;
  if (String(article.seoDescription || '').length > 220) return false;
  if ((article.tags || []).length > 20) return false;
  if ((article.keyTakeaways || []).length > 20) return false;
  if ((article.faq || []).length > 20) return false;
  if (article.status && article.status !== 'draft' && article.status !== 'published') return false;
  return true;
}

function findProtectedArticle(articles: Article[]): Article | undefined {
  return articles.find((article) => article.slug === PROTECTED_ARTICLE_SLUG);
}

function comparableProtectedArticle(article: Article): Record<string, unknown> {
  return {
    slug: article.slug || '',
    title: article.title || '',
    category: article.category || '',
    readTime: article.readTime || '',
    date: article.date || '',
    description: article.description || '',
    content: article.content || '',
    image: article.image || '',
    seoTitle: article.seoTitle || '',
    seoDescription: article.seoDescription || '',
    publishedAt: article.publishedAt || '',
    tags: article.tags || [],
    summary: article.summary || '',
    keyTakeaways: article.keyTakeaways || [],
    faq: article.faq || [],
    status: article.status || 'published',
  };
}

function isProtectedArticleUnchanged(existing: Article[], incoming: Article[]): boolean {
  const currentProtected = findProtectedArticle(existing);
  if (!currentProtected) return true;

  const nextProtected = findProtectedArticle(incoming);
  if (!nextProtected) return false;

  return JSON.stringify(comparableProtectedArticle(currentProtected)) === JSON.stringify(comparableProtectedArticle(nextProtected));
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
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

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  const password = String(request.headers.get('X-Admin-Password') || '');

  if (!verifyAdminPassword(password, env)) {
    return json(
      { success: false, error: 'Unauthorized' },
      {
        status: 401,
        headers: { 'Cache-Control': CACHE_CONTROL.noStore },
      },
    );
  }

  try {
    const articles = await fetchArticlesWithFallback(env, request);
    articles.sort((a, b) => Number(a.id || 0) - Number(b.id || 0));

    return json(
      { success: true, articles },
      {
        headers: { 'Cache-Control': CACHE_CONTROL.noStore },
      },
    );
  } catch (error) {
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to load admin articles',
      },
      {
        status: 502,
        headers: { 'Cache-Control': CACHE_CONTROL.noStore },
      },
    );
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
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
  if (payload.articles.length > MAX_ARTICLES) {
    return json(
      { success: false, error: `Too many articles. Limit is ${MAX_ARTICLES}` },
      {
        status: 400,
        headers: { 'Cache-Control': CACHE_CONTROL.noStore },
      },
    );
  }
  if (!payload.articles.every((article) => isValidArticlePayload(article as Article))) {
    return json(
      { success: false, error: 'Invalid article payload: check required fields and size limits' },
      {
        status: 400,
        headers: { 'Cache-Control': CACHE_CONTROL.noStore },
      },
    );
  }

  try {
    const useD1 = shouldUseD1Articles(env);
    const existing = useD1 ? await fetchArticlesFromD1(env) : await fetchArticlesFromJsonBin(env);

    if (!isProtectedArticleUnchanged(existing, payload.articles)) {
      return json(
        {
          success: false,
          error: `Protected article "${PROTECTED_ARTICLE_SLUG}" cannot be changed through admin updates`,
        },
        {
          status: 409,
          headers: { 'Cache-Control': CACHE_CONTROL.noStore },
        },
      );
    }

    if (existing.length > 0 && payload.articles.length === 0) {
      return json(
        { success: false, error: 'Refusing to overwrite non-empty blog with an empty payload' },
        {
          status: 400,
          headers: { 'Cache-Control': CACHE_CONTROL.noStore },
        },
      );
    }

    const articlesWithStatus = payload.articles.map((article, index) => ({
      ...article,
      id: index + 1,
      status: article.status || 'published',
    }));

    const updated = useD1
      ? await writeArticlesToD1(env, articlesWithStatus, existing)
      : await writeArticlesToJsonBin(env, articlesWithStatus, existing);

    const allSlugs = Array.from(new Set([...existing, ...updated].map((article) => article.slug)));
    const siteUrl = getSiteUrl(env, request);
    const cacheTargets = buildSeoCacheTargets(siteUrl, allSlugs);

    const invalidationPromise = invalidateSeoCaches(cacheTargets);
    waitUntil(invalidationPromise.then(() => undefined));
    waitUntil(purgeCloudflareEdgeCache(env, cacheTargets).then(() => undefined));
    waitUntil(notifyIndexNow(env, siteUrl, updated));

    const invalidationReport = await invalidationPromise;

    return json(
      {
        success: true,
        articles: updated,
        cacheInvalidationAttempted: true,
        globalPurgeConfigured: Boolean(env.CF_ZONE_ID && env.CF_CACHE_PURGE_TOKEN),
        siteUrlUsed: siteUrl,
        requestOrigin: new URL(request.url).origin.replace(/\/$/, ''),
        invalidatedPathsCount: invalidationReport.successful.length,
        invalidationTargetsCount: invalidationReport.targets.length,
        invalidationFailedCount: invalidationReport.failed.length,
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
