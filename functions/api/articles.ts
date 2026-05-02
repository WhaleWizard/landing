import { CACHE_CONTROL, matchCache, putCache } from '../_lib/cache';
import { fetchArticlesWithFallback } from '../_lib/articles';
import { json } from '../_lib/http';
import type { Env } from '../_lib/types';

export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  let allArticles: any[] = [];
  let usedCache = false;

  // Попытка 1: Кеш
  try {
    const url = new URL(request.url);
    const bypassCache = url.searchParams.has('_') || url.searchParams.get('cache') === 'no-store';

    if (!bypassCache) {
      const cacheKey = new Request(request.url, { method: 'GET' });
      try {
        const cached = await matchCache(cacheKey);
        if (cached) {
          console.log('✅ Cache hit');
          usedCache = true;
          return cached;
        }
      } catch (cacheError) {
        console.warn('⚠️ Cache error:', cacheError instanceof Error ? cacheError.message : String(cacheError));
      }
    }
  } catch (e) {
    console.warn('⚠️ Cache URL parse error:', e instanceof Error ? e.message : String(e));
  }

  // Попытка 2: Загрузить статьи
  try {
    allArticles = await fetchArticlesWithFallback(env, request);

    if (!Array.isArray(allArticles)) {
      console.warn('⚠️ fetchArticlesWithFallback returned non-array:', typeof allArticles);
      allArticles = [];
    }
  } catch (fetchError) {
    console.error('❌ fetchArticlesWithFallback threw error:', fetchError instanceof Error ? fetchError.message : String(fetchError));
    allArticles = [];
  }

  // Попытка 3: Фильтровать статьи
  let visibleArticles: any[] = [];
  try {
    const now = new Date().toISOString();
    visibleArticles = (Array.isArray(allArticles) ? allArticles : []).filter((article) => {
      try {
        if (!article || typeof article !== 'object') return false;
        if (article.status === 'draft') return false;
        if (article.publishedAt && typeof article.publishedAt === 'string' && article.publishedAt > now) return false;
        return true;
      } catch {
        return false;
      }
    });

    try {
      visibleArticles.sort((a, b) => {
        const aId = Number(a?.id) || 0;
        const bId = Number(b?.id) || 0;
        return aId - bId;
      });
    } catch (sortError) {
      console.warn('⚠️ Sort error:', sortError instanceof Error ? sortError.message : String(sortError));
    }
  } catch (filterError) {
    console.error('❌ Filter error:', filterError instanceof Error ? filterError.message : String(filterError));
    visibleArticles = [];
  }

  // Попытка 4: Создать и отправить ответ
  try {
    const isEmpty = !Array.isArray(visibleArticles) || visibleArticles.length === 0;
    const response = json(
      { articles: visibleArticles || [] },
      {
        headers: {
          'Cache-Control': isEmpty ? CACHE_CONTROL.noStore : CACHE_CONTROL.apiArticles,
        },
      },
    );

    // Попытка кешировать если есть статьи
    if (!isEmpty && !usedCache) {
      try {
        const url = new URL(request.url);
        const bypassCache = url.searchParams.has('_') || url.searchParams.get('cache') === 'no-store';
        if (!bypassCache) {
          const cacheKey = new Request(request.url, { method: 'GET' });
          waitUntil(putCache(cacheKey, response.clone()));
        }
      } catch (cacheError) {
        console.warn('⚠️ Cache put error:', cacheError instanceof Error ? cacheError.message : String(cacheError));
      }
    }

    console.log('✅ Returning ' + (visibleArticles?.length || 0) + ' visible articles');
    return response;
  } catch (responseError) {
    console.error('❌ Response creation error:', responseError instanceof Error ? responseError.message : String(responseError));

    // Абсолютный fallback - вернуть простой JSON
    try {
      return new Response(
        JSON.stringify({ articles: [] }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
          },
        }
      );
    } catch (fallbackError) {
      console.error('❌ CRITICAL: Even fallback response failed:', fallbackError);
      return new Response('{"articles":[]}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }
};
