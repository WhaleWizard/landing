import { fetchArticlesFromJsonBin, normalizeArticles } from './jsonbin';
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
  try {
    const primary = await fetchArticlesFromJsonBin(env);
    if (primary.length > 0) return primary;
  } catch {
    // fallback below
  }

  const siteUrl = (env.SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
  return fetchSeedArticles(siteUrl);
}
