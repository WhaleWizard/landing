import { CACHE_CONTROL } from '../../_lib/cache';
import { fetchArticlesWithFallback } from '../../_lib/articles';
import { json } from '../../_lib/http';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'default');
  if (rateLimited) return rateLimited;

  try {
    // `waitUntil` намеренно НЕ передаётся. С ним `fetchArticlesWithFallback`
    // на каждый вызов записывал в R2 полный снимок всех статей — а точка
    // публичная, без пароля, и отвечает `no-store`, то есть кэш её не
    // прикрывает. Один анонимный запрос стоил чтения всей базы статей плюс
    // записи всего снимка. Проверке доступности снимок не нужен: она смотрит
    // только, читается ли контент.
    const articles = await fetchArticlesWithFallback(env, request);
    return json(
      {
        ok: true,
        source: articles.length > 0 ? 'content_available' : 'empty_or_fallback',
        articlesCount: articles.length,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': CACHE_CONTROL.noStore,
        },
      },
    );
  } catch (error) {
    console.error('[health/content] Article read failed:', error);
    return json(
      {
        ok: false,
        source: 'error',
        articlesCount: 0,
        timestamp: new Date().toISOString(),
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

