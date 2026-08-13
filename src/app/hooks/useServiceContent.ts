import { useEffect, useMemo, useState } from 'react';
import { readInlineSiteContentSeed } from '../utils/siteContentSeed';

export const SITE_CONTENT_CACHE_TTL_MS = 15_000;
const SITE_CONTENT_REVALIDATE_COOLDOWN_MS = 1_000;

type ServiceContentCacheEntry = {
  content: Record<string, unknown> | null;
  version: number | null;
  fetchedAt: number;
};

const serviceContentCache = new Map<string, ServiceContentCacheEntry>();
const serviceContentPending = new Map<string, Promise<unknown>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function mergeContent<T>(base: T, override: unknown): T {
  if (Array.isArray(base)) {
    if (!Array.isArray(override)) return base;
    if (base.every((item) => !isRecord(item))) return override as T;
    // Arrays of CMS blocks are authoritative: their length and order come
    // from the editor. Visual-only fields (icons, gradients, case images) are
    // still inherited from a protected source slot instead of being stored in
    // D1. `visualSlot` survives reordering, while old snapshots fall back to
    // their positional slot. New rows reuse the available visual palette.
    if (base.length === 0) return override as T;
    return override.map((item, index) => {
      const requestedSlot = isRecord(item) && Number.isInteger(item.visualSlot)
        ? Number(item.visualSlot)
        : index;
      const safeSlot = requestedSlot >= 0 ? requestedSlot % base.length : index % base.length;
      return mergeContent(base[safeSlot], item);
    }) as T;
  }
  if (isRecord(base)) {
    if (!isRecord(override)) return base;
    const next: Record<string, unknown> = { ...base };
    Object.entries(override).forEach(([key, value]) => {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') return;
      next[key] = key in base ? mergeContent(base[key], value) : value;
    });
    return next as T;
  }
  return (override === undefined || override === null ? base : override) as T;
}

function publishedVersion(value: unknown): number | null {
  const version = Number(value);
  return Number.isSafeInteger(version) && version > 0 ? version : null;
}

function cacheResponse(
  cacheKey: string,
  content: Record<string, unknown> | null,
  version: number | null,
): Record<string, unknown> | null {
  const current = serviceContentCache.get(cacheKey);
  // A delayed edge response must never downgrade content already observed by
  // this tab at a newer published version.
  if (current && current.version !== null && (version === null || version < current.version)) {
    serviceContentCache.set(cacheKey, { ...current, fetchedAt: Date.now() });
    return current.content;
  }
  if (current && current.version !== null && version === current.version) {
    serviceContentCache.set(cacheKey, { ...current, fetchedAt: Date.now() });
    return current.content;
  }
  serviceContentCache.set(cacheKey, { content, version, fetchedAt: Date.now() });
  return content;
}

function loadSiteContent(cacheKey: string, revalidate = false): Promise<unknown> {
  // `null` — тоже завершённый и валидный ответ («для ключа нет CMS override»).
  // Проверка по truthiness раньше не кэшировала его, поэтому Home параллельно
  // запрашивал один и тот же site:home из SEO и Hero.
  const cached = serviceContentCache.get(cacheKey);
  const cacheTtl = revalidate ? SITE_CONTENT_REVALIDATE_COOLDOWN_MS : SITE_CONTENT_CACHE_TTL_MS;
  if (cached && Date.now() - cached.fetchedAt < cacheTtl) {
    return Promise.resolve(cached.content);
  }
  const pending = serviceContentPending.get(cacheKey);
  if (pending) return pending;

  const request = fetch(`/api/site-content?key=${encodeURIComponent(cacheKey)}`, {
    credentials: 'same-origin',
    cache: 'no-cache',
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`site content request failed: ${response.status}`);
      return response.json();
    })
    .then((payload) => {
      if (!isRecord(payload) || payload.success !== true) {
        throw new Error('site content response is invalid');
      }
      const loaded = payload.content === null
        ? null
        : isRecord(payload.content)
          ? payload.content
          : undefined;
      if (loaded === undefined) throw new Error('site content payload is invalid');
      return cacheResponse(cacheKey, loaded, publishedVersion(payload.version));
    })
    .finally(() => serviceContentPending.delete(cacheKey));

  serviceContentPending.set(cacheKey, request);
  return request;
}

export function preloadSiteContent(cacheKey: string): Promise<unknown> {
  return loadSiteContent(cacheKey).catch(() => undefined);
}

function initialContentOverride(cacheKey: string): unknown {
  const cached = serviceContentCache.get(cacheKey);
  if (cached) return cached.content;
  return readInlineSiteContentSeed(cacheKey);
}

function resolveContent<T>(cacheKey: string, fallback: T): T {
  const override = initialContentOverride(cacheKey);
  return override
    ? mergeContent(fallback, override)
    : fallback;
}

export function useSiteContent<T>(cacheKey: string | null, fallback: T): T {
  const [content, setContent] = useState<T>(() => {
    if (!cacheKey) return fallback;
    return resolveContent(cacheKey, fallback);
  });

  useEffect(() => {
    if (!cacheKey) {
      setContent(fallback);
      return;
    }
    setContent(resolveContent(cacheKey, fallback));
    let active = true;
    // Mounting a route revalidates an old module-cache entry. A just-completed
    // intent preload is reused for one second, and concurrent section hooks are
    // still collapsed by serviceContentPending.
    void loadSiteContent(cacheKey, true)
      .then((loaded) => {
        if (!active) return;
        setContent(loaded
          ? mergeContent(fallback, loaded)
          : fallback);
      })
      .catch(() => {
        // Публичная страница всегда остаётся на статическом проверенном тексте.
      });
    return () => { active = false; };
  }, [cacheKey, fallback]);

  return content;
}

export function useSiteSection<T>(cacheKey: string | null, section: string, fallback: T): T {
  const wrappedFallback = useMemo(() => ({ [section]: fallback }), [fallback, section]);
  const content = useSiteContent<Record<string, T>>(cacheKey, wrappedFallback);
  return content[section] ?? fallback;
}

export default function useServiceContent<T>(service: string, fallback: T): T {
  return useSiteContent(`service:${service}`, fallback);
}
