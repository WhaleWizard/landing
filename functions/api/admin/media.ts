import { json } from '../../_lib/http';
import { CACHE_CONTROL } from '../../_lib/cache';
import { verifyAdminPassword } from '../../_lib/auth';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };
// Загрузки админки лежат под этим префиксом (см. api/admin/upload.ts) —
// листинг и удаление намеренно ограничены им же.
const UPLOADS_PREFIX = 'uploads/';

function getPublicHost(env: Env): string {
  return String(env.R2_PUBLIC_HOST || 'https://pub-0c68f065a6a3442c97a55535ba03e377.r2.dev').replace(/\/$/, '');
}

function getPassword(request: Request, body?: { password?: string }): string {
  return request.headers.get('X-Admin-Password') || body?.password || '';
}

// Список загруженных файлов (новые сверху)
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  if (!verifyAdminPassword(getPassword(request), env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.BUCKET) {
    return json({ success: false, error: 'Хранилище R2 не подключено (доступно только на продакшене)' }, { status: 503, headers: noStore });
  }

  try {
    const publicHost = getPublicHost(env);
    const files: Array<{ key: string; url: string; size: number; uploaded: string; contentType: string; name: string }> = [];
    let cursor: string | undefined;
    // R2 отдаёт максимум 1000 объектов за запрос — этого хватает; страховка от бесконечного цикла.
    for (let page = 0; page < 3; page += 1) {
      const listing = await env.BUCKET.list({ prefix: UPLOADS_PREFIX, limit: 1000, cursor, include: ['httpMetadata', 'customMetadata'] });
      for (const object of listing.objects) {
        files.push({
          key: object.key,
          url: `${publicHost}/${object.key}`,
          size: object.size,
          uploaded: object.uploaded instanceof Date ? object.uploaded.toISOString() : String(object.uploaded || ''),
          contentType: object.httpMetadata?.contentType || '',
          name: object.customMetadata?.originalName || object.key.split('/').pop() || object.key,
        });
      }
      if (!listing.truncated) break;
      cursor = listing.cursor;
    }
    files.sort((a, b) => (a.uploaded < b.uploaded ? 1 : -1));
    return json({ success: true, files }, { headers: noStore });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : 'Failed to list media' }, { status: 500, headers: noStore });
  }
};

// Удаление файла: { key } (только внутри uploads/)
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => ({})) as { password?: string; action?: string; key?: string };
  if (!verifyAdminPassword(getPassword(request, body), env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.BUCKET) {
    return json({ success: false, error: 'Хранилище R2 не подключено' }, { status: 503, headers: noStore });
  }

  const key = String(body.key || '');
  if (body.action !== 'delete' || !key.startsWith(UPLOADS_PREFIX) || key.includes('..')) {
    return json({ success: false, error: 'Invalid action or key' }, { status: 400, headers: noStore });
  }

  try {
    await env.BUCKET.delete(key);
    return json({ success: true }, { headers: noStore });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : 'Failed to delete file' }, { status: 500, headers: noStore });
  }
};
