import { CACHE_CONTROL } from '../../_lib/cache';
import { buildSeoCacheTargets, invalidateSeoCaches, purgeCloudflareEdgeCache } from '../../_lib/article-cache';
import { verifyAdminPassword } from '../../_lib/auth';
import { enforceRateLimit } from '../../_lib/rate-limit';
import { fetchArticlesFromJsonBin, writeArticlesToJsonBin } from '../../_lib/jsonbin';
import {
  deleteArticleFromD1,
  fetchArticleFromD1,
  fetchArticleSummariesFromD1,
  fetchArticlesFromD1,
  nextArticleIdFromD1,
  writeArticleToD1,
  writeArticlesToD1,
} from '../../_lib/d1';
import {
  fetchArticlesWithFallback,
  isPublishedArticle,
  persistD1ArticlesSnapshot,
  scheduleD1ArticlesSnapshot,
  shouldUseD1Articles,
} from '../../_lib/articles';
import { getArticlePath } from '../../_lib/seo';
import { json, readCappedJsonBody } from '../../_lib/http';
import type { Article, Env } from '../../_lib/types';

interface AuthPayload {
  password?: string;
}

interface UpdatePayload {
  password?: string;
  articles?: Article[];
}

interface SingleUpdatePayload {
  password?: string;
  article?: Article;
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
  if (article.caseData && JSON.stringify(article.caseData).length > 4_000) return false;
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

  const payload = (await readCappedJsonBody(request)) as AuthPayload;
  const password = String(request.headers.get('X-Admin-Password') || payload?.password || '');

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

export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
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

  const url = new URL(request.url);
  const requestedSlug = String(url.searchParams.get('slug') || '').trim();
  const summaryView = url.searchParams.get('view') === 'summary';
  const useD1 = shouldUseD1Articles(env) && Boolean(env.DB);

  try {
    if (requestedSlug) {
      if (!isValidAdminSlug(requestedSlug)) {
        return json({ success: false, error: 'Invalid article slug' }, { status: 400, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
      }
      // Одна статья целиком — вместе с черновиками и запланированными: это
      // админка, а не публичная выдача. Точечное чтение из D1, при сбое —
      // общая цепочка со снимком.
      const direct = useD1 ? await fetchArticleFromD1(env, requestedSlug).catch(() => null) : null;
      const article = direct
        ?? (await fetchArticlesWithFallback(env, request, waitUntil)).find((item) => item.slug === requestedSlug)
        ?? null;
      if (!article) {
        return json({ success: false, error: 'Article not found' }, { status: 404, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
      }
      return json({ success: true, article }, { headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
    }

    // Список без текстов: при шестистах статьях полные тела весят мегабайты,
    // а списку нужны только заголовок, статус и даты. Текст редактор
    // догружает по слагу при открытии.
    const summaries = summaryView && useD1
      ? await fetchArticleSummariesFromD1(env).catch(() => null)
      : null;
    const articles = summaries ?? await fetchArticlesWithFallback(env, request, waitUntil);
    articles.sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
    const payload = summaryView
      ? articles.map((article) => ({ ...article, content: '', _summary: true }))
      : articles;

    return json(
      { success: true, articles: payload },
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
        status: 503,
        headers: { 'Cache-Control': CACHE_CONTROL.noStore },
      },
    );
  }
};

export const onRequestPut: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  const payload = (await readCappedJsonBody(request)) as UpdatePayload;
  // Пароль берётся и из заголовка: после перезагрузки /admin сессия
  // восстанавливается по cookie, и `_middleware.ts` подставляет пароль только
  // в заголовок. Читая одно лишь тело, сохранение отвечало «Unauthorized»,
  // пока владелец не выйдет и не войдёт заново.
  const password = String(request.headers.get('X-Admin-Password') || payload?.password || '');

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

    if (useD1) {
      scheduleD1ArticlesSnapshot(env, updated, waitUntil);
    }

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

function isValidAdminSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 200;
}

function protectedArticleError(): Response {
  return json(
    { success: false, error: `Protected article "${PROTECTED_ARTICLE_SLUG}" cannot be changed through admin updates` },
    { status: 409, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
  );
}

/**
 * Сохранение ОДНОЙ статьи по слагу. Режим списка (PUT) остался для удаления
 * и перестановки, но редактор и импорт ходят сюда: список из тринадцати
 * статей уже весил 168 КБ при лимите тела 256 КБ, и на двадцатой статье
 * сохранение целиком просто перестало бы проходить.
 *
 * Остальные статьи не трогаются: id не перенумеровываются, отсутствующие
 * слаги не удаляются. Защита опорной статьи действует так же, как в PUT.
 */
export const onRequestPatch: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  const payload = (await readCappedJsonBody(request)) as SingleUpdatePayload;
  const password = String(request.headers.get('X-Admin-Password') || payload?.password || '');

  if (!verifyAdminPassword(password, env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }

  const incoming = payload?.article;
  if (!incoming || typeof incoming !== 'object' || !isValidArticlePayload(incoming)) {
    return json(
      { success: false, error: 'Invalid article payload: check required fields and size limits' },
      { status: 400, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }

  const slug = String(incoming.slug || '').trim();
  if (!isValidAdminSlug(slug)) {
    return json({ success: false, error: 'Invalid article slug' }, { status: 400, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }

  try {
    const useD1 = shouldUseD1Articles(env);
    let existing: Article | null = null;
    let saved: Article | null = null;

    if (useD1) {
      existing = await fetchArticleFromD1(env, slug);
      if (!isProtectedArticleUnchanged(existing ? [existing] : [], [incoming])) return protectedArticleError();
      const article: Article = {
        ...incoming,
        slug,
        id: existing?.id ?? await nextArticleIdFromD1(env),
        status: incoming.status || 'published',
      };
      saved = await writeArticleToD1(env, article, existing);
      waitUntil(persistD1ArticlesSnapshot(env));
    } else {
      const all = await fetchArticlesFromJsonBin(env);
      existing = all.find((article) => article.slug === slug) ?? null;
      if (!isProtectedArticleUnchanged(existing ? [existing] : [], [incoming])) return protectedArticleError();
      const article: Article = {
        ...incoming,
        slug,
        id: existing?.id ?? Math.max(0, ...all.map((item) => Number(item.id) || 0)) + 1,
        status: incoming.status || 'published',
      };
      const next = existing ? all.map((item) => (item.slug === slug ? article : item)) : [...all, article];
      const updated = await writeArticlesToJsonBin(env, next, all);
      saved = updated.find((item) => item.slug === slug) ?? null;
    }

    if (!saved) {
      return json({ success: false, error: 'Article was not persisted' }, { status: 502, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
    }

    const siteUrl = getSiteUrl(env, request);
    const cacheTargets = buildSeoCacheTargets(siteUrl, [slug]);
    const invalidationPromise = invalidateSeoCaches(cacheTargets);
    waitUntil(invalidationPromise.then(() => undefined));
    waitUntil(purgeCloudflareEdgeCache(env, cacheTargets).then(() => undefined));
    waitUntil(notifyIndexNow(env, siteUrl, [saved]));
    const invalidationReport = await invalidationPromise;

    return json(
      {
        success: true,
        article: saved,
        created: !existing,
        cacheInvalidationAttempted: true,
        globalPurgeConfigured: Boolean(env.CF_ZONE_ID && env.CF_CACHE_PURGE_TOKEN),
        invalidatedPathsCount: invalidationReport.successful.length,
        invalidationTargetsCount: invalidationReport.targets.length,
        invalidationFailedCount: invalidationReport.failed.length,
      },
      { headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  } catch (error) {
    return json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to save article' },
      { status: 502, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }
};

/**
 * Удаление одной статьи по слагу. Через режим списка (PUT) удалять больше
 * нельзя: список в админке приходит без текстов, и отправка его обратно
 * затёрла бы тела всех остальных статей пустыми строками.
 */
export const onRequestDelete: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  const password = String(request.headers.get('X-Admin-Password') || '');
  if (!verifyAdminPassword(password, env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }

  const slug = String(new URL(request.url).searchParams.get('slug') || '').trim();
  if (!isValidAdminSlug(slug)) {
    return json({ success: false, error: 'Invalid article slug' }, { status: 400, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }
  if (slug === PROTECTED_ARTICLE_SLUG) return protectedArticleError();

  try {
    let deleted = false;
    if (shouldUseD1Articles(env)) {
      deleted = await deleteArticleFromD1(env, slug);
      if (deleted) waitUntil(persistD1ArticlesSnapshot(env));
    } else {
      const all = await fetchArticlesFromJsonBin(env);
      const next = all.filter((article) => article.slug !== slug);
      deleted = next.length !== all.length;
      if (deleted) await writeArticlesToJsonBin(env, next, all);
    }

    if (!deleted) {
      return json({ success: false, error: 'Article not found' }, { status: 404, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
    }

    const siteUrl = getSiteUrl(env, request);
    const cacheTargets = buildSeoCacheTargets(siteUrl, [slug]);
    waitUntil(invalidateSeoCaches(cacheTargets).then(() => undefined));
    waitUntil(purgeCloudflareEdgeCache(env, cacheTargets).then(() => undefined));

    return json({ success: true, deleted: slug }, { headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  } catch (error) {
    return json(
      { success: false, error: error instanceof Error ? error.message : 'Failed to delete article' },
      { status: 502, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }
};
