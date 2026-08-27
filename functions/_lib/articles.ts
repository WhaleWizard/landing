import { fetchArticlesFromJsonBin, normalizeArticles } from './jsonbin';
import {
  fetchArticleFromD1,
  fetchArticleCandidatesFromD1,
  fetchArticleSummariesFromD1,
  fetchArticlesFromD1,
} from './d1';
import type { Article, Env } from './types';

interface SeedPayload {
  articles?: unknown[];
}

interface D1SnapshotPayload {
  version: 1;
  source: 'd1';
  savedAt: string;
  total: number;
  articles: unknown[];
}

export type ArticlesWaitUntil = (promise: Promise<unknown>) => void;

const D1_SNAPSHOT_PREFIX = '_system/article-snapshots';
const D1_SNAPSHOT_KEY_CONTEXT = 'whalewzrd:d1-articles-snapshot:v1:';

function isEnabledFlag(value?: string): boolean {
  return String(value || '').trim().toLowerCase() === 'true';
}

// The feature flag selects the authority. A missing DB binding is an outage,
// not permission to fall through to a different content store.
export function shouldUseD1Articles(env: Env): boolean {
  return isEnabledFlag(env.USE_D1_ARTICLES);
}

export function isPublishedArticle(article: Article, nowIso = new Date().toISOString()): boolean {
  if (article.status === 'draft') return false;
  if (article.publishedAt && article.publishedAt > nowIso) return false;
  return true;
}

export function filterVisibleArticles(articles: Article[], nowIso = new Date().toISOString()): Article[] {
  return articles.filter((article) => isPublishedArticle(article, nowIso));
}

function getSiteUrl(env: Env, request: Request): string {
  return (env.SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
}

async function fetchSeedArticles(siteUrl: string): Promise<Article[] | null> {
  try {
    const response = await fetch(`${siteUrl}/articles.seed.json`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cf: {
        cacheEverything: false,
        cacheTtl: 0,
      },
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as SeedPayload;
    return Array.isArray(payload?.articles) ? normalizeArticles(payload.articles) : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value: unknown): boolean {
  return value === undefined || (Array.isArray(value) && value.every((item) => typeof item === 'string'));
}

function isSnapshotArticle(value: unknown): value is Article {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'number' || !Number.isInteger(value.id) || value.id <= 0) return false;

  const requiredStrings = ['slug', 'title', 'category', 'readTime', 'date', 'description', 'content', 'image'];
  if (!requiredStrings.every((field) => typeof value[field] === 'string')) return false;
  if (!String(value.slug).trim() || !String(value.title).trim()) return false;

  const optionalStrings = ['seoTitle', 'seoDescription', 'publishedAt', 'updatedAt', 'summary'];
  if (!optionalStrings.every((field) => value[field] === undefined || typeof value[field] === 'string')) return false;
  if (value.status !== undefined && value.status !== 'draft' && value.status !== 'published') return false;
  if (!isStringArray(value.tags) || !isStringArray(value.keyTakeaways)) return false;

  if (
    value.faq !== undefined
    && (!Array.isArray(value.faq) || !value.faq.every((item) => (
      isRecord(item) && typeof item.question === 'string' && typeof item.answer === 'string'
    )))
  ) {
    return false;
  }

  if (value.caseData !== undefined && !isRecord(value.caseData)) return false;
  return true;
}

function parseD1Snapshot(value: unknown): Article[] | null {
  if (!isRecord(value)) return null;
  if (value.version !== 1 || value.source !== 'd1') return null;
  if (typeof value.savedAt !== 'string' || Number.isNaN(Date.parse(value.savedAt))) return null;
  if (
    !Array.isArray(value.articles)
    || typeof value.total !== 'number'
    || !Number.isInteger(value.total)
    || value.total !== value.articles.length
  ) return null;

  const slugs = new Set<string>();
  const ids = new Set<number>();
  for (const article of value.articles) {
    if (!isSnapshotArticle(article)) return null;
    if (slugs.has(article.slug) || ids.has(article.id)) return null;
    slugs.add(article.slug);
    ids.add(article.id);
  }

  // An empty array is a valid, authoritative D1 state and must not revive old posts.
  return value.articles as Article[];
}

function bytesToHex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function getD1SnapshotKey(env: Env): Promise<string | null> {
  const capabilitySecret = String(env.ADMIN_PASSWORD || '').trim();
  if (!env.BUCKET || !capabilitySecret) return null;

  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${D1_SNAPSHOT_KEY_CONTEXT}${capabilitySecret}`),
  );
  return `${D1_SNAPSHOT_PREFIX}/${bytesToHex(digest)}.json`;
}

async function readD1Snapshot(env: Env): Promise<Article[] | null> {
  try {
    const key = await getD1SnapshotKey(env);
    if (!key) return null;

    const object = await env.BUCKET.get(key);
    if (!object) return null;

    const raw = new TextDecoder().decode(await object.arrayBuffer());
    const articles = parseD1Snapshot(JSON.parse(raw));
    if (articles === null) {
      console.error('[articles] Ignoring an invalid D1 R2 snapshot.');
    }
    return articles;
  } catch {
    console.error('[articles] Failed to read the D1 R2 snapshot.');
    return null;
  }
}

async function writeD1Snapshot(env: Env, serializedSnapshot: string): Promise<void> {
  const key = await getD1SnapshotKey(env);
  if (!key) return;

  await env.BUCKET.put(key, serializedSnapshot, {
    httpMetadata: {
      contentType: 'application/json; charset=utf-8',
      cacheControl: 'private, no-store',
    },
    customMetadata: {
      kind: 'd1-articles-last-known-good',
      version: '1',
    },
  });
}

export function scheduleD1ArticlesSnapshot(
  env: Env,
  articles: Article[],
  waitUntil?: ArticlesWaitUntil,
): void {
  if (!waitUntil || !env.BUCKET || !String(env.ADMIN_PASSWORD || '').trim()) return;

  const payload: D1SnapshotPayload = {
    version: 1,
    source: 'd1',
    savedAt: new Date().toISOString(),
    total: articles.length,
    articles,
  };
  // Serialize before yielding so later sorting/mutation in a caller cannot alter the snapshot.
  const serializedSnapshot = JSON.stringify(payload);
  waitUntil(
    writeD1Snapshot(env, serializedSnapshot).catch(() => {
      console.error('[articles] Failed to persist the D1 R2 snapshot.');
    }),
  );
}

export async function fetchArticlesWithFallback(
  env: Env,
  request: Request,
  waitUntil?: ArticlesWaitUntil,
): Promise<Article[]> {
  if (shouldUseD1Articles(env)) {
    if (env.DB) {
      try {
        const d1Articles = await fetchArticlesFromD1(env);
        scheduleD1ArticlesSnapshot(env, d1Articles, waitUntil);
        return d1Articles;
      } catch {
        console.error('[articles] Failed to read from authoritative D1 storage.');
      }
    } else {
      console.error('[articles] USE_D1_ARTICLES is enabled but the DB binding is missing.');
    }

    const snapshotArticles = await readD1Snapshot(env);
    if (snapshotArticles !== null) return snapshotArticles;

    if (isEnabledFlag(env.ALLOW_EMERGENCY_ARTICLE_SEED)) {
      const seedArticles = await fetchSeedArticles(getSiteUrl(env, request));
      if (seedArticles !== null) {
        console.warn('[articles] Using the explicitly enabled emergency article seed.');
        return seedArticles;
      }
    }

    throw new Error('D1 articles are unavailable and no last-known-good D1 snapshot can be read');
  }

  try {
    const primary = await fetchArticlesFromJsonBin(env);
    if (primary.length > 0) return primary;
    console.warn('[articles] JsonBin returned an empty dataset, continuing fallback chain.');
  } catch {
    console.error('[articles] Failed to read from JsonBin, continuing fallback chain.');
  }

  return (await fetchSeedArticles(getSiteUrl(env, request))) || [];
}

function filterArticleCandidates(articles: Article[], slug: string): Article[] {
  const prefix = `${slug}-`;
  return articles.filter((article) => article.slug === slug || article.slug.startsWith(prefix));
}

function findExactArticle(articles: Article[], slug: string): Article | null {
  return articles.find((article) => article.slug === slug) || null;
}

/**
 * Resolve one canonical article for the public detail API. Unlike the route
 * resolver below, this deliberately does not support legacy prefix matching:
 * clients ask for an exact slug and must not make D1 read several full bodies.
 * A partial read also never replaces the full last-known-good snapshot.
 */
export async function fetchArticleWithFallback(
  env: Env,
  request: Request,
  rawSlug: string,
): Promise<Article | null> {
  const slug = String(rawSlug || '').trim();
  if (!slug) return null;

  if (shouldUseD1Articles(env)) {
    if (env.DB) {
      try {
        return await fetchArticleFromD1(env, slug);
      } catch {
        console.error('[articles] Failed to read an article from authoritative D1 storage.');
      }
    } else {
      console.error('[articles] USE_D1_ARTICLES is enabled but the DB binding is missing.');
    }

    const snapshotArticles = await readD1Snapshot(env);
    if (snapshotArticles !== null) return findExactArticle(snapshotArticles, slug);

    if (isEnabledFlag(env.ALLOW_EMERGENCY_ARTICLE_SEED)) {
      const seedArticles = await fetchSeedArticles(getSiteUrl(env, request));
      if (seedArticles !== null) {
        console.warn('[articles] Using the explicitly enabled emergency article seed.');
        return findExactArticle(seedArticles, slug);
      }
    }

    throw new Error('D1 articles are unavailable and no last-known-good D1 snapshot can be read');
  }

  return findExactArticle(await fetchArticlesWithFallback(env, request), slug);
}

/**
 * Resolve the smallest dataset needed by /blog/:slug and /cases/:slug.
 *
 * A successful D1 response (including an empty one) is authoritative. Only a
 * D1 error/missing binding may use the last-known-good R2 snapshot. Unlike a
 * full collection read, a route read must never replace that snapshot with a
 * partial collection.
 */
export async function fetchArticleCandidatesWithFallback(
  env: Env,
  request: Request,
  rawSlug: string,
): Promise<Article[]> {
  const slug = String(rawSlug || '').trim();
  if (!slug) return [];

  if (shouldUseD1Articles(env)) {
    if (env.DB) {
      try {
        return await fetchArticleCandidatesFromD1(env, slug);
      } catch {
        console.error('[articles] Failed to read article candidates from authoritative D1 storage.');
      }
    } else {
      console.error('[articles] USE_D1_ARTICLES is enabled but the DB binding is missing.');
    }

    const snapshotArticles = await readD1Snapshot(env);
    if (snapshotArticles !== null) return filterArticleCandidates(snapshotArticles, slug);

    if (isEnabledFlag(env.ALLOW_EMERGENCY_ARTICLE_SEED)) {
      const seedArticles = await fetchSeedArticles(getSiteUrl(env, request));
      if (seedArticles !== null) {
        console.warn('[articles] Using the explicitly enabled emergency article seed.');
        return filterArticleCandidates(seedArticles, slug);
      }
    }

    throw new Error('D1 articles are unavailable and no last-known-good D1 snapshot can be read');
  }

  return filterArticleCandidates(await fetchArticlesWithFallback(env, request), slug);
}

/**
 * Public cards use the same authoritative/fail-closed chain as full articles,
 * but a healthy D1 read omits the heavy HTML bodies and never writes a partial
 * result over the last-known-good full snapshot.
 */
export async function fetchArticleSummariesWithFallback(
  env: Env,
  request: Request,
): Promise<Article[]> {
  if (shouldUseD1Articles(env)) {
    if (env.DB) {
      try {
        return await fetchArticleSummariesFromD1(env);
      } catch {
        console.error('[articles] Failed to read article summaries from authoritative D1 storage.');
      }
    } else {
      console.error('[articles] USE_D1_ARTICLES is enabled but the DB binding is missing.');
    }

    const snapshotArticles = await readD1Snapshot(env);
    if (snapshotArticles !== null) return snapshotArticles;

    if (isEnabledFlag(env.ALLOW_EMERGENCY_ARTICLE_SEED)) {
      const seedArticles = await fetchSeedArticles(getSiteUrl(env, request));
      if (seedArticles !== null) {
        console.warn('[articles] Using the explicitly enabled emergency article seed.');
        return seedArticles;
      }
    }

    throw new Error('D1 articles are unavailable and no last-known-good D1 snapshot can be read');
  }

  return fetchArticlesWithFallback(env, request);
}
