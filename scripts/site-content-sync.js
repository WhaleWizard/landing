import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const SITE_CONTENT_KEYS = [
  'site:home',
  'service:meta-ads',
  'service:google-ads',
  'service:consult',
  'service:meta-apps',
  'site:faq',
];

const MAX_RESPONSE_BYTES = 100_000;

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isUsableContent(value) {
  return isRecord(value) && Object.keys(value).length > 0;
}

/**
 * Mirrors src/app/hooks/useServiceContent.ts. Keeping the same merge rules is
 * important: the interactive page and generated SEO HTML must resolve a
 * partial published override identically.
 */
export function mergePublishedContent(base, override) {
  if (Array.isArray(base)) {
    if (!Array.isArray(override)) return base;
    if (base.every((item) => !isRecord(item))) return override;
    if (base.length === 0) return override;
    return override.map((item, index) => {
      const requestedSlot = isRecord(item) && Number.isInteger(item.visualSlot)
        ? Number(item.visualSlot)
        : index;
      const safeSlot = requestedSlot >= 0 ? requestedSlot % base.length : index % base.length;
      return mergePublishedContent(base[safeSlot], item);
    });
  }

  if (isRecord(base)) {
    if (!isRecord(override)) return base;
    const next = { ...base };
    for (const [key, value] of Object.entries(override)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      next[key] = Object.prototype.hasOwnProperty.call(base, key)
        ? mergePublishedContent(base[key], value)
        : value;
    }
    return next;
  }

  return override === undefined || override === null ? base : override;
}

export function readSiteContentSnapshot(pathname) {
  if (!pathname || !existsSync(pathname)) return {};
  try {
    const parsed = JSON.parse(readFileSync(pathname, 'utf8'));
    // Version the cache format so ad-hoc/manual test fixtures from older
    // iterations can never leak into generated production HTML.
    if (parsed?.schemaVersion !== 1) return {};
    if (!isRecord(parsed?.sections)) return {};
    const sections = {};
    for (const key of SITE_CONTENT_KEYS) {
      if (isUsableContent(parsed.sections[key])) sections[key] = parsed.sections[key];
    }
    return sections;
  } catch {
    return {};
  }
}

export function writeSiteContentSnapshot(pathname, sections) {
  if (!pathname) return;
  const safeSections = {};
  for (const key of SITE_CONTENT_KEYS) {
    if (isUsableContent(sections[key])) safeSections[key] = sections[key];
  }
  writeFileSync(pathname, `${JSON.stringify({ schemaVersion: 1, fetchedAt: new Date().toISOString(), sections: safeSections }, null, 2)}\n`, 'utf8');
}

async function fetchSection({ endpoint, key, fetchImpl, timeoutMs, buildToken }) {
  const url = new URL(endpoint);
  url.searchParams.set('key', key);
  // A unique build URL avoids reusing the public endpoint's short edge cache
  // immediately after an editor publication.
  url.searchParams.set('_seo_build', buildToken);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        'Cache-Control': 'no-cache',
        'User-Agent': 'WhaleWizard-SEO-Build/1.0',
      },
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const raw = await response.text();
    if (raw.length > MAX_RESPONSE_BYTES) throw new Error('response is too large');
    const payload = JSON.parse(raw);
    if (!payload?.success) throw new Error('endpoint returned success=false');

    // `source: static` is an authoritative answer that no published D1
    // override exists. It must clear a potentially stale local snapshot.
    if (payload.source !== 'd1' || !isUsableContent(payload.content)) {
      return { key, status: 'static', content: null };
    }

    return { key, status: 'd1', content: payload.content };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetches published D1 text for SEO generation. The fallback chain is:
 * live public endpoint -> last successful local build snapshot -> source copy.
 * A network or schema failure is deliberately non-fatal so a code deployment
 * can never be blocked by the content endpoint.
 */
export async function loadPublishedSiteContent({
  endpoint,
  snapshotPath,
  fetchImpl = globalThis.fetch,
  timeoutMs = 8_000,
  strict = false,
  logger = console,
} = {}) {
  const previous = readSiteContentSnapshot(snapshotPath);
  const resolved = { ...previous };
  const buildToken = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const effectiveTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 8_000;

  if (!endpoint || typeof fetchImpl !== 'function') {
    if (strict) throw new Error('[site-content] Public content endpoint is unavailable in strict mode.');
    logger.warn?.('[site-content] Public content endpoint is unavailable; using snapshot/source fallback.');
    return resolved;
  }

  const results = await Promise.allSettled(SITE_CONTENT_KEYS.map((key) => fetchSection({
    endpoint,
    key,
    fetchImpl,
    timeoutMs: effectiveTimeoutMs,
    buildToken,
  })));

  let successfulRequests = 0;
  const failedKeys = [];
  for (let index = 0; index < results.length; index += 1) {
    const key = SITE_CONTENT_KEYS[index];
    const result = results[index];
    if (result.status === 'rejected') {
      failedKeys.push(key);
      continue;
    }

    successfulRequests += 1;
    if (result.value.status === 'd1') resolved[key] = result.value.content;
    else delete resolved[key];
  }

  if (failedKeys.length) {
    if (strict) {
      throw new Error(`[site-content] Strict refresh failed for ${failedKeys.join(', ')}.`);
    }
    logger.warn?.(`[site-content] Could not refresh ${failedKeys.join(', ')}; using snapshot/source fallback.`);
  }

  // Do not overwrite a useful snapshot on a total outage. Partial success is
  // safe: successful `static` answers remove stale entries, failed keys retain
  // their last known published value.
  if (successfulRequests > 0) {
    try {
      writeSiteContentSnapshot(snapshotPath, resolved);
    } catch {
      logger.warn?.('[site-content] Could not update the local build snapshot; continuing with in-memory content.');
    }
  }

  return resolved;
}
