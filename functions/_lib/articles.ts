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

    if (!response.ok) {
      console.warn(`Seed file fetch failed: ${response.status}`);
      return [];
    }

    const payload = (await response.json()) as SeedPayload;
    const articles = Array.isArray(payload?.articles) ? payload.articles : [];
    return articles.length > 0 ? normalizeArticles(articles) : [];
  } catch (error) {
    console.error('Error fetching seed articles:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

export async function fetchArticlesWithFallback(env: Env, request: Request): Promise<Article[]> {
  // D1 попытка (если настроен)
  const useD1 = Boolean(env.DB);
  if (useD1) {
    try {
      const d1Articles = await fetchArticlesFromD1(env);
      if (Array.isArray(d1Articles) && d1Articles.length > 0) {
        console.log('✅ Using D1 articles');
        return d1Articles;
      }
    } catch (error) {
      console.warn('⚠️ D1 fetch failed:', error instanceof Error ? error.message : String(error));
    }
  }

  // JSONBin попытка (если настроен)
  try {
    const jsonbinArticles = await fetchArticlesFromJsonBin(env);
    if (Array.isArray(jsonbinArticles) && jsonbinArticles.length > 0) {
      console.log('✅ Using JSONBin articles');
      return jsonbinArticles;
    }
  } catch (error) {
    console.warn('⚠️ JSONBin fetch failed:', error instanceof Error ? error.message : String(error));
  }

  // Seed файл как основной fallback
  try {
    console.log('🌱 Trying seed articles...');
    const siteUrl = (env.SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
    const seedArticles = await fetchSeedArticles(siteUrl);

    if (Array.isArray(seedArticles) && seedArticles.length > 0) {
      console.log('✅ Using seed articles - ' + seedArticles.length + ' articles');
      return seedArticles;
    } else {
      console.warn('⚠️ Seed file returned 0 articles');
      return [];
    }
  } catch (error) {
    console.error('❌ Seed articles fetch failed:', error instanceof Error ? error.message : String(error));
    return [];
  }
}
