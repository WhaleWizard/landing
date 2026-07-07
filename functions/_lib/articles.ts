import { fetchArticlesFromJsonBin, normalizeArticles } from './jsonbin';
import { fetchArticlesFromD1 } from './d1';
import type { Article, Env } from './types';

interface SeedPayload {
  articles?: unknown[];
}

function isEnabledFlag(value?: string): boolean {
  return String(value || '').trim().toLowerCase() === 'true';
}

export function shouldUseD1Articles(env: Env): boolean {
  return isEnabledFlag(env.USE_D1_ARTICLES) && Boolean(env.DB);
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

async function fetchSeedArticles(siteUrl: string): Promise<Article[]> {
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

    if (!response.ok) return [];

    const payload = (await response.json()) as SeedPayload;
    return Array.isArray(payload?.articles) ? normalizeArticles(payload.articles) : [];
  } catch {
    return [];
  }
}

function toTimestamp(value?: string): number {
  if (!value) return 0;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function getDatasetFreshness(articles: Article[]): number {
  return articles.reduce((freshest, article) => Math.max(
    freshest,
    toTimestamp(article.updatedAt),
    toTimestamp(article.publishedAt),
  ), 0);
}

async function preferRicherSeed(primary: Article[], seedPromise: Promise<Article[]>, sourceName: string): Promise<Article[]> {
  const seedArticles = await seedPromise;
  const primaryFreshness = getDatasetFreshness(primary);
  const seedFreshness = getDatasetFreshness(seedArticles);

  if (seedArticles.length > primary.length && primaryFreshness <= seedFreshness) {
    console.warn(`[articles] ${sourceName} returned ${primary.length} articles. Using richer static seed: ${seedArticles.length} articles.`);
    return seedArticles;
  }

  return primary;
}

export async function fetchArticlesWithFallback(env: Env, request: Request): Promise<Article[]> {
  const siteUrl = getSiteUrl(env, request);
  const seedArticlesPromise = fetchSeedArticles(siteUrl);

  if (shouldUseD1Articles(env)) {
    try {
      const d1Articles = await fetchArticlesFromD1(env);
      if (d1Articles.length > 0) return preferRicherSeed(d1Articles, seedArticlesPromise, 'D1');
      console.warn('[articles] D1 returned empty dataset, continuing fallback chain.');
    } catch {
      console.error('[articles] Failed to read from D1, continuing fallback chain.');
    }
  }

  try {
    const primary = await fetchArticlesFromJsonBin(env);
    if (primary.length > 0) return preferRicherSeed(primary, seedArticlesPromise, 'JsonBin');
    console.warn('[articles] JsonBin returned empty dataset, continuing fallback chain.');
  } catch {
    console.error('[articles] Failed to read from JsonBin, continuing fallback chain.');
  }

  return seedArticlesPromise;
}
