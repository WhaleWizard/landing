import { fetchArticlesFromJsonBin, normalizeArticles } from './jsonbin';
import { fetchArticlesFromD1 } from './d1';
import type { Article, Env } from './types';

interface SeedPayload {
  articles?: unknown[];
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
  const useD1 = Boolean(env.DB);
  if (useD1) {
    try {
      const d1Articles = await fetchArticlesFromD1(env);
      if (d1Articles.length > 0) return d1Articles;
    } catch {
      // fallback below
    }
  }

  try {
    const primary = await fetchArticlesFromJsonBin(env);
    if (primary.length > 0) return primary;
  } catch {
    // fallback below
  }

  const siteUrl = (env.SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
  return fetchSeedArticles(siteUrl);
}
