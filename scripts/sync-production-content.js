import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isUsableArticleList } from './fetch-articles.js';
import { applyStoredSiteContentCompatibility, SITE_CONTENT_KEYS } from './site-content-sync.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MAX_ARTICLES_BYTES = 5_000_000;
const MAX_SITE_CONTENT_BYTES = 150_000;
const FETCH_TIMEOUT_MS = 15_000;

export function normalizeProductionArticles(payload, fetchedAt = new Date().toISOString()) {
  const articles = Array.isArray(payload?.articles) ? payload.articles : [];
  if (!isUsableArticleList(articles)) {
    throw new Error('Production returned an empty or invalid article collection.');
  }

  return {
    source: 'production-api',
    fetchedAt,
    updatedAt: fetchedAt,
    total: articles.length,
    articles,
  };
}

export function normalizeProductionSiteContent(rows, fetchedAt = new Date().toISOString()) {
  const sections = {};
  for (const key of SITE_CONTENT_KEYS) {
    const payload = rows.get(key);
    if (!payload?.success) throw new Error(`Production content request failed for ${key}.`);
    if (payload.source !== 'd1' || !payload.content || typeof payload.content !== 'object') continue;
    const content = applyStoredSiteContentCompatibility(key, payload.content);
    if (content && typeof content === 'object' && Object.keys(content).length > 0) sections[key] = content;
  }
  return { schemaVersion: 1, source: 'production-api', fetchedAt, sections };
}

export function collectArticleMedia(articles) {
  const media = new Set();
  for (const article of articles) {
    if (typeof article?.image === 'string' && article.image.trim()) media.add(article.image.trim());
    const html = String(article?.content || '');
    for (const match of html.matchAll(/<(?:img|source)\b[^>]*(?:src|srcset)=["']([^"']+)/gi)) {
      if (match[1]?.trim()) media.add(match[1].trim());
    }
  }
  return [...media];
}

async function fetchJson(fetchImpl, url, maxBytes) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${url.pathname}: HTTP ${response.status}`);
    const raw = await response.text();
    if (Buffer.byteLength(raw, 'utf8') > maxBytes) {
      throw new Error(`${url.pathname}: response is too large`);
    }
    return JSON.parse(raw);
  } finally {
    clearTimeout(timer);
  }
}

export function writeJsonTransaction(entries, {
  exists = existsSync,
  mkdir = mkdirSync,
  rename = renameSync,
  unlink = unlinkSync,
  write = writeFileSync,
  transactionId = `${process.pid}-${Date.now()}-${randomUUID()}`,
} = {}) {
  const staged = entries.map(({ pathname, payload }) => ({
    pathname,
    payload,
    temporary: `${pathname}.sync-${transactionId}.tmp`,
    backup: `${pathname}.sync-${transactionId}.bak`,
    backedUp: false,
    committed: false,
  }));
  let transactionCommitted = false;

  try {
    // Nothing visible changes until every complete snapshot has been staged.
    for (const entry of staged) {
      mkdir(dirname(entry.pathname), { recursive: true });
      write(entry.temporary, `${JSON.stringify(entry.payload, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
    }

    for (const entry of staged) {
      if (exists(entry.pathname)) {
        rename(entry.pathname, entry.backup);
        entry.backedUp = true;
      }
      rename(entry.temporary, entry.pathname);
      entry.committed = true;
    }
    transactionCommitted = true;
  } catch (error) {
    const rollbackErrors = [];
    for (const entry of [...staged].reverse()) {
      try {
        if (entry.committed && exists(entry.pathname)) unlink(entry.pathname);
        if (entry.backedUp && exists(entry.backup)) rename(entry.backup, entry.pathname);
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        'Production sync failed and could not fully roll back; recovery .bak files were preserved.',
      );
    }
    throw error;
  } finally {
    for (const entry of staged) {
      if (exists(entry.temporary)) {
        try {
          unlink(entry.temporary);
        } catch {
          // A unique leftover staging file is harmless and a later run cannot
          // collide with it. Preserve the original transaction result.
        }
      }
      if (transactionCommitted && exists(entry.backup)) {
        try {
          unlink(entry.backup);
        } catch {
          // The new snapshots are already committed. A locked backup is safe
          // to keep and must not turn a successful sync into a false rollback.
        }
      }
    }
  }
}

export async function syncProductionContent({
  siteUrl = process.env.SITE_URL || 'https://www.whalewzrd.com',
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  root = ROOT,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('Fetch is unavailable.');
  const baseUrl = String(siteUrl).replace(/\/$/, '');
  const current = now();
  const fetchedAt = current.toISOString();
  const token = String(current.getTime());

  const articlesUrl = new URL('/api/articles', baseUrl);
  articlesUrl.searchParams.set('cache', 'no-store');
  articlesUrl.searchParams.set('_sync', token);
  const articlesPayload = normalizeProductionArticles(
    await fetchJson(fetchImpl, articlesUrl, MAX_ARTICLES_BYTES),
    fetchedAt,
  );

  const contentRows = new Map(await Promise.all(SITE_CONTENT_KEYS.map(async (key) => {
    const url = new URL('/api/site-content', baseUrl);
    url.searchParams.set('key', key);
    url.searchParams.set('_sync', token);
    return [key, await fetchJson(fetchImpl, url, MAX_SITE_CONTENT_BYTES)];
  })));
  const siteContentPayload = normalizeProductionSiteContent(contentRows, fetchedAt);

  writeJsonTransaction([
    { pathname: join(root, 'data', 'articles.local.json'), payload: articlesPayload },
    { pathname: join(root, 'public', 'articles.seed.json'), payload: articlesPayload },
    { pathname: join(root, 'data', 'site-content.local.json'), payload: siteContentPayload },
  ]);

  return {
    articles: articlesPayload.articles.length,
    siteSections: Object.keys(siteContentPayload.sections).length,
    mediaReferences: collectArticleMedia(articlesPayload.articles).length,
  };
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (entryPath && entryPath === resolve(fileURLToPath(import.meta.url))) {
  syncProductionContent()
    .then((result) => {
      console.log(`Production synchronized: ${result.articles} articles/cases, ${result.siteSections} CMS sections, ${result.mediaReferences} media references.`);
    })
    .catch((error) => {
      console.error('Production synchronization failed; local snapshots were not changed.');
      console.error(error);
      process.exitCode = 1;
    });
}
