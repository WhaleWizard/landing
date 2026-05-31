import { json } from '../../_lib/http';
import { CACHE_CONTROL } from '../../_lib/cache';
import { verifyAdminPassword } from '../../_lib/auth';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

const MAX_VERSION_PAYLOAD_LENGTH = 160_000;
const MAX_SLUG_LENGTH = 140;

function hasD1(env: Env): boolean {
  return Boolean(env.DB);
}

function sanitizeSlug(value: string | null | undefined): string {
  return String(value || '').trim().slice(0, MAX_SLUG_LENGTH);
}

function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

async function readJsonPayload(request: Request): Promise<{ password?: string; slug?: string; article?: unknown }> {
  return (await request.json().catch(() => ({}))) as { password?: string; slug?: string; article?: unknown };
}

function getPasswordFromRequest(request: Request, payload?: { password?: string }): string {
  return request.headers.get('X-Admin-Password') || String(payload?.password || '');
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  if (!hasD1(env)) {
    return json({ success: false, error: 'D1 is not configured' }, { status: 503, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }

  const payload = await readJsonPayload(request);
  const password = getPasswordFromRequest(request, payload);
  if (!verifyAdminPassword(password, env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }

  const slug = sanitizeSlug(payload?.slug);
  if (!isValidSlug(slug)) {
    return json({ success: false, error: 'valid slug required' }, { status: 400, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }

  const versionData = JSON.stringify(payload.article || {});
  if (versionData.length > MAX_VERSION_PAYLOAD_LENGTH) {
    return json({ success: false, error: 'article version payload is too large' }, { status: 400, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }

  try {
    await env.DB.prepare('INSERT INTO article_versions (slug, version_data) VALUES (?, ?)')
      .bind(slug, versionData)
      .run();
    return json({ success: true }, { headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }
};

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  if (!hasD1(env)) {
    return json({ success: false, error: 'D1 is not configured' }, { status: 503, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }

  const url = new URL(request.url);
  const password = getPasswordFromRequest(request);
  if (!verifyAdminPassword(password, env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }

  const slug = sanitizeSlug(url.searchParams.get('slug'));
  if (!isValidSlug(slug)) {
    return json({ success: false, error: 'valid slug required' }, { status: 400, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }

  try {
    const result = await env.DB.prepare('SELECT id, slug, version_data, created_at FROM article_versions WHERE slug = ? ORDER BY created_at DESC LIMIT 20').bind(slug).all();
    return json({ success: true, versions: result.results || [] }, { headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500, headers: { 'Cache-Control': CACHE_CONTROL.noStore } });
  }
};
