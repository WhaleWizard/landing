import { CACHE_CONTROL } from '../_lib/cache';
import { json } from '../_lib/http';
import { isSiteContentKey, safeSiteJsonObject } from '../_lib/site-content';
import type { Env } from '../_lib/types';

const publicCache = { 'Cache-Control': 'public, max-age=60, stale-while-revalidate=300' };

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const key = new URL(request.url).searchParams.get('key') || '';
  if (!isSiteContentKey(key)) {
    return json({ success: false, error: 'Unknown section key' }, { status: 400, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }
  if (!env.DB) return json({ success: true, content: null, source: 'static' }, { headers: publicCache });

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
    if (!row) return json({ success: true, content: null, source: 'static' }, { headers: publicCache });
    return json({
      success: true,
      content: safeSiteJsonObject(key, row.published_json),
      source: 'd1',
      version: Number(row.published_version || 1),
      publishedAt: row.published_at,
    }, { headers: publicCache });
  } catch (error) {
    if (/no such table|no such column/i.test(error instanceof Error ? error.message : String(error))) {
      return json({ success: true, content: null, source: 'static' }, { headers: publicCache });
    }
    return json({ success: false, content: null, source: 'static' }, { status: 500, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }
};
