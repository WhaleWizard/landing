import { json } from '../_lib/http';
import { CACHE_CONTROL } from '../_lib/cache';
import { enforceRateLimit } from '../_lib/rate-limit';
import { processMetaOutbox } from '../_lib/meta-outbox';
import type { Env } from '../_lib/types';

// Ручной/внешний запуск обработки очереди недоставленных Meta-событий.
// Очередь также обрабатывается фоном при каждом /api/pageview, так что этот
// эндпоинт нужен как страховка на случай простоя трафика (внешний cron/пингер).
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  const debugSecret = env.META_CAPI_DEBUG_SECRET;
  const providedSecret = request.headers.get('x-meta-debug-secret') || undefined;

  if (!debugSecret || providedSecret !== debugSecret) {
    return json(
      { success: false, error: 'META_CAPI_DEBUG_SECRET is required and must match x-meta-debug-secret' },
      { status: 403, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }

  const limitRaw = Number(new URL(request.url).searchParams.get('limit') || 25);
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.floor(limitRaw))) : 25;

  try {
    const summary = await processMetaOutbox(env, limit);
    return json({ success: true, ...summary }, { headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  } catch (error) {
    return json(
      { success: false, error: error instanceof Error ? error.message : 'outbox processing failed' },
      { status: 500, headers: { 'Cache-Control': CACHE_CONTROL.noStore } },
    );
  }
};
