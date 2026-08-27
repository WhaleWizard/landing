import { CACHE_CONTROL, matchCache, putCache } from '../_lib/cache';
import {
  fetchArticleWithFallback,
  fetchArticleSummariesWithFallback,
  fetchArticlesWithFallback,
  filterVisibleArticles,
} from '../_lib/articles';
import { json } from '../_lib/http';
import { verifyAdminPassword } from '../_lib/auth';
import type { Article, Env } from '../_lib/types';

export type PublicArticleSummary = Article & { _summary: true };

export function toPublicArticleSummary(article: Article): PublicArticleSummary {
  const { content: _content, ...summary } = article;
  return {
    ...summary,
    // Keep one stable public shape so older clients remain compatible, but do
    // not send every article body to listing pages and the home page.
    content: '',
    _summary: true,
  };
}

function isValidSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const url = new URL(request.url);
  // Два разных обхода кэша, и права у них разные.
  //
  // `?_=<произвольное>` — сбрасыватель кэша админки. Он принимает **любое**
  // значение, поэтому запросы `?_=1`, `?_=2`, `?_=3` и так далее заставляли
  // базу читать все статьи заново на каждый запрос и плодили ключи кэша.
  // Теперь он требует пароль администратора.
  //
  // `?cache=no-store` — фиксированная строка, её использует production-сборка
  // (`scripts/config.js`, `PUBLIC_ARTICLES_URL`), и она ходит без заголовков
  // авторизации. Закрыть её паролем нельзя, не сломав получение свежих статей
  // при сборке, — оставлена открытой осознанно.
  const adminBypass = url.searchParams.has('_')
    && verifyAdminPassword(request.headers.get('X-Admin-Password') || '', env);
  const bypassCache = adminBypass || url.searchParams.get('cache') === 'no-store';
  const requestedSlug = String(url.searchParams.get('slug') || '').trim();
  const summaryView = url.searchParams.get('view') === 'summary';

  if (requestedSlug && !isValidSlug(requestedSlug)) {
    return json(
      { error: 'Invalid article slug' },
      { status: 400, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }

  const cacheKey = new Request(request.url, { method: 'GET' });
  if (!bypassCache) {
    try {
      const cached = await matchCache(cacheKey);
      if (cached) return cached;
    } catch {
      // Ignore edge cache failures and continue with live data fetch.
    }
  }

  try {
    const now = new Date().toISOString();
    const requestedArticle = requestedSlug
      ? await fetchArticleWithFallback(env, request, requestedSlug)
      : null;
    const allArticles = requestedSlug
      ? requestedArticle ? [requestedArticle] : []
      : summaryView
        ? await fetchArticleSummariesWithFallback(env, request)
        : await fetchArticlesWithFallback(env, request, waitUntil);
    const visibleArticles = filterVisibleArticles(allArticles, now);
    visibleArticles.sort((a, b) => Number(a.id || 0) - Number(b.id || 0));

    if (requestedSlug) {
      const article = visibleArticles.find((item) => item.slug === requestedSlug);
      if (!article) {
        return json(
          { error: 'Article not found' },
          { status: 404, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
        );
      }

      const response = json(
        { article },
        { headers: { 'Cache-Control': CACHE_CONTROL.apiArticles } },
      );
      if (!bypassCache) {
        waitUntil(putCache(cacheKey, response).catch(() => undefined));
      }
      return response;
    }

    const isEmpty = !Array.isArray(visibleArticles) || visibleArticles.length === 0;
    const responseArticles = summaryView
      ? visibleArticles.map(toPublicArticleSummary)
      : visibleArticles;
    const response = json(
      { articles: responseArticles },
      {
        headers: {
          'Cache-Control': isEmpty ? CACHE_CONTROL.noStore : CACHE_CONTROL.apiArticles,
        },
      },
    );

    if (!isEmpty && !bypassCache) {
      waitUntil(
        putCache(cacheKey, response).catch(() => {
          // Ignore cache write errors; response is already ready.
        }),
      );
    }
    return response;
  } catch (error) {
    // Причина уходит в лог, а не в публичный ответ: наружу утекали внутренние
    // сообщения вроде «no last-known-good D1 snapshot» и сырые ошибки SQLite.
    console.error('[articles] Public read failed:', error);
    return json(
      {
        error: 'Failed to load articles',
      },
      {
        status: 503,
        headers: {
          'Cache-Control': CACHE_CONTROL.noStore,
          'Retry-After': '300',
        },
      },
    );
  }
};
