import { verifyAdminPassword } from '../../_lib/auth';
import { CACHE_CONTROL } from '../../_lib/cache';
import { json } from '../../_lib/http';
import { enforceRateLimit } from '../../_lib/rate-limit';
import { isSiteContentKey, safeSiteJsonObject, sanitizeSiteContent } from '../../_lib/site-content';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };

function missingSchema(error: unknown): boolean {
  return /no such table|no such column/i.test(error instanceof Error ? error.message : String(error));
}

function credentials(request: Request, body?: { password?: string }): string {
  return request.headers.get('X-Admin-Password') || body?.password || '';
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;
  if (!verifyAdminPassword(credentials(request), env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.DB) return json({ success: false, error: 'D1 не подключена' }, { status: 503, headers: noStore });

  const url = new URL(request.url);
  const key = url.searchParams.get('key') || '';
  try {
    if (key) {
      if (!isSiteContentKey(key)) return json({ success: false, error: 'Unknown section key' }, { status: 400, headers: noStore });
      const section = await env.DB.prepare(
        `SELECT section_key, page_path, label, draft_json, published_json, status, version, published_version, updated_at, published_at
         FROM site_sections WHERE section_key=? LIMIT 1`,
      ).bind(key).first<Record<string, string | number | null>>();
      const versions = await env.DB.prepare(
        `SELECT id, source, created_at FROM site_section_versions
         WHERE section_key=? ORDER BY id DESC LIMIT 20`,
      ).bind(key).all<{ id: number; source: string; created_at: string }>();
      return json({
        success: true,
        section: section ? {
          key: section.section_key,
          pagePath: section.page_path,
          label: section.label,
          draft: safeSiteJsonObject(key, String(section.draft_json || '{}')),
          published: safeSiteJsonObject(key, String(section.published_json || '{}')),
          status: section.status,
          version: Number(section.version || 1),
          publishedVersion: section.published_version === null ? null : Number(section.published_version),
          updatedAt: section.updated_at,
          publishedAt: section.published_at,
        } : null,
        versions: versions.results || [],
      }, { headers: noStore });
    }

    const sections = await env.DB.prepare(
      `SELECT section_key, page_path, label, status, version, published_version, updated_at, published_at
       FROM site_sections ORDER BY page_path`,
    ).all<Record<string, string | number | null>>();
    return json({ success: true, sections: sections.results || [] }, { headers: noStore });
  } catch (error) {
    if (missingSchema(error)) {
      return json({ success: false, error: 'Примените миграцию 0013_site_sections.sql' }, { status: 503, headers: noStore });
    }
    return json({ success: false, error: error instanceof Error ? error.message : 'Не удалось прочитать секции' }, { status: 500, headers: noStore });
  }
};

type WriteBody = {
  password?: string;
  action?: 'save' | 'publish' | 'restore';
  key?: string;
  pagePath?: string;
  label?: string;
  content?: unknown;
  versionId?: number;
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;
  const body = await request.json().catch(() => ({})) as WriteBody;
  if (!verifyAdminPassword(credentials(request, body), env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.DB) return json({ success: false, error: 'D1 не подключена' }, { status: 503, headers: noStore });
  if (!body.key || !isSiteContentKey(body.key)) {
    return json({ success: false, error: 'Unknown section key' }, { status: 400, headers: noStore });
  }
  if (!body.action || !['save', 'publish', 'restore'].includes(body.action)) {
    return json({ success: false, error: 'Unknown action' }, { status: 400, headers: noStore });
  }

  try {
    const db = env.DB;
    if (body.action === 'restore') {
      const versionId = Number(body.versionId || 0);
      if (!Number.isInteger(versionId) || versionId <= 0) {
        return json({ success: false, error: 'Invalid version' }, { status: 400, headers: noStore });
      }
      const snapshot = await db.prepare(
        'SELECT snapshot_json FROM site_section_versions WHERE id=? AND section_key=? LIMIT 1',
      ).bind(versionId, body.key).first<{ snapshot_json: string }>();
      if (!snapshot) return json({ success: false, error: 'Version not found' }, { status: 404, headers: noStore });
      const sanitized = JSON.stringify(safeSiteJsonObject(body.key, snapshot.snapshot_json));
      const current = await db.prepare(
        'SELECT draft_json FROM site_sections WHERE section_key=? LIMIT 1',
      ).bind(body.key).first<{ draft_json: string }>();
      const update = db.prepare(
        `UPDATE site_sections SET draft_json=?, status='draft', version=version+1, updated_at=datetime('now')
         WHERE section_key=?`,
      ).bind(sanitized, body.key);
      if (current?.draft_json && current.draft_json !== '{}') {
        await db.batch([
          db.prepare(
            `INSERT INTO site_section_versions (section_key, snapshot_json, source)
             VALUES (?, ?, 'draft')`,
          ).bind(body.key, current.draft_json),
          update,
        ]);
      } else {
        await update.run();
      }
      return json({ success: true, restored: true }, { headers: noStore });
    }

    const content = sanitizeSiteContent(body.key, body.content);
    if (!Object.keys(content).length) {
      return json({ success: false, error: 'Секция не содержит допустимых текстовых полей' }, { status: 400, headers: noStore });
    }
    const serialized = JSON.stringify(content);
    if (serialized.length > 50_000) {
      return json({ success: false, error: 'Слишком большой объём текста' }, { status: 413, headers: noStore });
    }
    const defaultPath = body.key === 'site:faq' ? '/faq' : `/${body.key.replace('service:', '')}`;
    const pagePath = String(body.pagePath || defaultPath).slice(0, 120);
    const label = String(body.label || body.key).replace(/[<>]/g, '').slice(0, 120);
    const existing = await db.prepare(
      'SELECT draft_json, published_json FROM site_sections WHERE section_key=? LIMIT 1',
    ).bind(body.key).first<{ draft_json: string; published_json: string }>();

    const statements: D1PreparedStatement[] = [];
    const addSnapshot = (snapshot: string, source: 'draft' | 'published') => {
      statements.push(db.prepare(
        'INSERT INTO site_section_versions (section_key, snapshot_json, source) VALUES (?, ?, ?)',
      ).bind(body.key, snapshot, source));
    };

    if (existing && body.action === 'publish') {
      // Сначала старая live-версия, затем отличающийся сохранённый draft:
      // в списке версий ближайший рабочий draft окажется сверху, дубликатов не будет.
      if (existing.published_json && existing.published_json !== '{}' && existing.published_json !== serialized) {
        addSnapshot(existing.published_json, 'published');
      }
      if (
        existing.draft_json
        && existing.draft_json !== '{}'
        && existing.draft_json !== serialized
        && existing.draft_json !== existing.published_json
      ) {
        addSnapshot(existing.draft_json, 'draft');
      }
    } else if (
      existing?.draft_json
      && existing.draft_json !== '{}'
      && existing.draft_json !== serialized
    ) {
      addSnapshot(existing.draft_json, 'draft');
    }

    if (body.action === 'publish') {
      statements.push(db.prepare(
        `INSERT INTO site_sections
           (section_key, page_path, label, draft_json, published_json, status, version, published_version, created_at, updated_at, published_at)
         VALUES (?, ?, ?, ?, ?, 'published', 1, 1, datetime('now'), datetime('now'), datetime('now'))
         ON CONFLICT(section_key) DO UPDATE SET
           page_path=excluded.page_path,
           label=excluded.label,
           draft_json=excluded.draft_json,
           published_json=excluded.published_json,
           status='published',
           published_version=site_sections.version+1,
           version=site_sections.version+1,
           updated_at=datetime('now'),
           published_at=datetime('now')`,
      ).bind(body.key, pagePath, label, serialized, serialized));
    } else {
      statements.push(db.prepare(
        `INSERT INTO site_sections
           (section_key, page_path, label, draft_json, published_json, status, version, created_at, updated_at)
         VALUES (?, ?, ?, ?, '{}', 'draft', 1, datetime('now'), datetime('now'))
         ON CONFLICT(section_key) DO UPDATE SET
           page_path=excluded.page_path,
           label=excluded.label,
           draft_json=excluded.draft_json,
           status='draft',
           version=site_sections.version+1,
           updated_at=datetime('now')`,
      ).bind(body.key, pagePath, label, serialized));
    }
    await db.batch(statements);

    return json({ success: true, status: body.action === 'publish' ? 'published' : 'draft' }, { headers: noStore });
  } catch (error) {
    if (missingSchema(error)) {
      return json({ success: false, error: 'Примените миграцию 0013_site_sections.sql' }, { status: 503, headers: noStore });
    }
    return json({ success: false, error: error instanceof Error ? error.message : 'Не удалось сохранить секцию' }, { status: 500, headers: noStore });
  }
};
