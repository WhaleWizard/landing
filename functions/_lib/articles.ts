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

export async function fetchArticlesWithFallback(env: Env, request: Request): Promise<Article[]> {
  if (shouldUseD1Articles(env)) {
    try {
      const d1Articles = await fetchArticlesFromD1(env);
      if (d1Articles.length > 0) return d1Articles;
      console.warn('[articles] D1 returned empty dataset, continuing fallback chain.');
    } catch {
      console.error('[articles] Failed to read from D1, continuing fallback chain.');
    }
  }

  try {
    const primary = await fetchArticlesFromJsonBin(env);
    if (primary.length > 0) return primary;
    console.warn('[articles] JsonBin returned empty dataset, continuing fallback chain.');
  } catch {
    console.error('[articles] Failed to read from JsonBin, continuing fallback chain.');
  }

  const siteUrl = (env.SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
  return fetchSeedArticles(siteUrl);
}
