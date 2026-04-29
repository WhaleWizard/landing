import { json } from '../../_lib/http';
import { CACHE_CONTROL } from '../../_lib/cache';
import { verifyAdminPassword } from '../../_lib/auth';
import type { Env } from '../../_lib/types';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const payload = (await request.json().catch(() => ({}))) as { password?: string; slug?: string; article?: unknown };
  const password = String(payload?.password || '');
  if (!verifyAdminPassword(password, env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }

  const slug = String(payload?.slug || '').trim();
  if (!slug) {
    return json({ success: false, error: 'slug required' }, { status: 400, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }

  try {
    await env.DB.prepare('INSERT INTO article_versions (slug, version_data) VALUES (?, ?)')
      .bind(slug, JSON.stringify(payload.article || {}))
      .run();
    return json({ success: true }, { headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');
  if (!slug) {
    return json({ success: false, error: 'slug required' }, { status: 400, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }
  try {
    const result = await env.DB.prepare('SELECT * FROM article_versions WHERE slug = ? ORDER BY created_at DESC LIMIT 20').bind(slug).all();
    return json({ versions: result.results || [] }, { headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }
};
