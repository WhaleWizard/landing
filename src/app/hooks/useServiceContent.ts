import { useEffect, useMemo, useState } from 'react';

const serviceContentCache = new Map<string, unknown>();
const serviceContentPending = new Map<string, Promise<unknown>>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function migrateLegacyPublishedContent(cacheKey: string, override: unknown): unknown {
  if (cacheKey !== 'service:meta-ads' || !isRecord(override) || !isRecord(override.cases)) {
    return override;
  }

  const legacyCases = override.cases;
  const isLegacyProblemSection = legacyCases.badge === 'С чем чаще всего приходят'
    && legacyCases.titlePrefix === 'Где теряется результат'
    && legacyCases.titleAccent === 'в Meta Ads';
  if (!isLegacyProblemSection) return override;

  // This exact published block predates the real case cards introduced in the
  // source config. Drop only that stale section; all other CMS edits remain
  // authoritative, and any newly published case heading will merge normally.
  const { cases: _legacyCases, ...currentOverride } = override;
  return currentOverride;
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

function loadSiteContent(cacheKey: string): Promise<unknown> {
  // `null` — тоже завершённый и валидный ответ («для ключа нет CMS override»).
  // Проверка по truthiness раньше не кэшировала его, поэтому Home параллельно
  // запрашивал один и тот же site:home из SEO и Hero.
  if (serviceContentCache.has(cacheKey)) {
    return Promise.resolve(serviceContentCache.get(cacheKey));
  }
  const pending = serviceContentPending.get(cacheKey);
  if (pending) return pending;

  const request = fetch(`/api/site-content?key=${encodeURIComponent(cacheKey)}`, {
    credentials: 'same-origin',
    cache: 'default',
  })
    .then(async (response) => response.ok ? response.json() : null)
    .then((payload) => {
      const loaded = payload?.success && payload.content ? payload.content : null;
      serviceContentCache.set(cacheKey, loaded);
      return loaded;
    })
    .finally(() => serviceContentPending.delete(cacheKey));

  serviceContentPending.set(cacheKey, request);
  return request;
}

export function useSiteContent<T>(cacheKey: string | null, fallback: T): T {
  const [content, setContent] = useState<T>(() => {
    if (!cacheKey) return fallback;
    const cached = serviceContentCache.get(cacheKey);
    return cached ? mergeContent(fallback, migrateLegacyPublishedContent(cacheKey, cached)) : fallback;
  });

  useEffect(() => {
    if (!cacheKey) {
      setContent(fallback);
      return;
    }
    setContent(() => {
      const cached = serviceContentCache.get(cacheKey);
      return cached ? mergeContent(fallback, migrateLegacyPublishedContent(cacheKey, cached)) : fallback;
    });
    let active = true;
    void loadSiteContent(cacheKey)
      .then((loaded) => {
        if (!active || !loaded) return;
        setContent(mergeContent(fallback, migrateLegacyPublishedContent(cacheKey, loaded)));
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
