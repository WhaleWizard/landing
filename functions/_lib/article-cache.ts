import { deleteCacheByUrl } from './cache';
import type { Env } from './types';

/**
 * Какие адреса устаревают после изменения статьи: списки, карта сайта,
 * RSS и страницы самой статьи. Общий список для всех путей записи —
 * сохранения по одной, списка, удаления и закрепления на главной.
 */
export function buildSeoCacheTargets(siteUrl: string, articleSlugs: string[]): string[] {
  return [
    `${siteUrl}/api/articles`,
    `${siteUrl}/api/articles?view=summary`,
    `${siteUrl}/sitemap.xml`,
    `${siteUrl}/feed.xml`,
    ...articleSlugs.flatMap((slug) => [
      `${siteUrl}/api/articles?slug=${encodeURIComponent(slug)}`,
      `${siteUrl}/blog/${slug}`,
      `${siteUrl}/cases/${slug}`,
    ]),
  ];
}

export interface CacheInvalidationReport {
  targets: string[];
  successful: string[];
  failed: string[];
}

// caches.default.delete() чистит кэш только текущего дата-центра Cloudflare.
// Для глобальной очистки нужен API-вызов purge_cache — работает, если заданы
// CF_ZONE_ID и CF_CACHE_PURGE_TOKEN (токен с правом Zone.Cache Purge).
export async function purgeCloudflareEdgeCache(env: Env, urls: string[]): Promise<{ attempted: boolean; ok: boolean; error?: string }> {
  const zoneId = env.CF_ZONE_ID;
  const apiToken = env.CF_CACHE_PURGE_TOKEN;
  if (!zoneId || !apiToken) return { attempted: false, ok: false };

  try {
    // Cloudflare ограничивает purge_by_url 30 адресами за вызов.
    for (let offset = 0; offset < urls.length; offset += 30) {
      const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiToken}`,
        },
        body: JSON.stringify({ files: urls.slice(offset, offset + 30) }),
      });
      if (!response.ok) {
        return { attempted: true, ok: false, error: `HTTP ${response.status}` };
      }
    }
    return { attempted: true, ok: true };
  } catch (error) {
    return { attempted: true, ok: false, error: error instanceof Error ? error.message : 'purge failed' };
  }
}

export async function invalidateSeoCaches(targets: string[]): Promise<CacheInvalidationReport> {
  const settled = await Promise.allSettled(targets.map((url) => deleteCacheByUrl(url)));
  const successful: string[] = [];
  const failed: string[] = [];

  settled.forEach((result, index) => {
    if (result.status === 'fulfilled') successful.push(targets[index]);
    else failed.push(targets[index]);
  });

  return { targets, successful, failed };
}
