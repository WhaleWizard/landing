import { CACHE_CONTROL } from '../_lib/cache';
import { json } from '../_lib/http';
import { isSiteContentKey, safeSiteJsonObject } from '../_lib/site-content';
import type { Env } from '../_lib/types';

// Browsers validate the small CMS payload on every network read. Cloudflare
// may still keep it close to visitors; publishing purges this URL explicitly.
// A separate edge policy keeps stale directives out of the browser cache.
const publicCache = {
  'Cache-Control': 'public, max-age=0, must-revalidate',
  'Cloudflare-CDN-Cache-Control': 'public, max-age=60, stale-if-error=300',
};

function contentEtag(key: string, version: number | null): string {
  return `"site-content-${key.replace(/[^a-z0-9_-]/gi, '-')}-${version ?? 'static'}"`;
}

function notModified(request: Request, etag: string): Response | null {
  if (request.headers.get('If-None-Match') !== etag) return null;
  return new Response(null, { status: 304, headers: { ...publicCache, ETag: etag } });
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const key = new URL(request.url).searchParams.get('key') || '';
  if (!isSiteContentKey(key)) {
    return json({ success: false, error: 'Unknown section key' }, { status: 400, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }
  if (!env.DB) {
    const etag = contentEtag(key, null);
    return notModified(request, etag)
      || json({ success: true, content: null, source: 'static' }, { headers: { ...publicCache, ETag: etag } });
  }

  try {
    // A row may be marked draft while its last published_json must remain live.
    // Publishing replaces that snapshot; saving/restoring a draft never unpublishes it.
    const row = await env.DB.prepare(
      `SELECT published_json, published_version, published_at FROM site_sections
       WHERE section_key=?
         AND published_json IS NOT NULL
         AND TRIM(published_json) NOT IN ('', '{}')
       LIMIT 1`,
    ).bind(key).first<{ published_json: string; published_version: number | null; published_at: string | null }>();
    if (!row) {
      const etag = contentEtag(key, null);
      return notModified(request, etag)
        || json({ success: true, content: null, source: 'static' }, { headers: { ...publicCache, ETag: etag } });
    }
    const version = Number(row.published_version || 1);
    const etag = contentEtag(key, version);
    const cached = notModified(request, etag);
    if (cached) return cached;
    return json({
      success: true,
      content: safeSiteJsonObject(key, row.published_json),
      source: 'd1',
      version,
      publishedAt: row.published_at,
    }, { headers: { ...publicCache, ETag: etag } });
  } catch (error) {
    if (/no such table|no such column/i.test(error instanceof Error ? error.message : String(error))) {
      const etag = contentEtag(key, null);
      return notModified(request, etag)
        || json({ success: true, content: null, source: 'static' }, { headers: { ...publicCache, ETag: etag } });
    }
    return json({ success: false, content: null, source: 'static' }, { status: 500, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }
};
