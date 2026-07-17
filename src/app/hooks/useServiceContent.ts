import { useEffect, useState } from 'react';

const serviceContentCache = new Map<string, unknown>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function mergeContent<T>(base: T, override: unknown): T {
  if (Array.isArray(base)) {
    if (!Array.isArray(override)) return base;
    if (base.every((item) => !isRecord(item))) return override as T;
    return base.map((item, index) => mergeContent(item, override[index])) as T;
  }
  if (isRecord(base)) {
    if (!isRecord(override)) return base;
    const next: Record<string, unknown> = { ...base };
    Object.entries(override).forEach(([key, value]) => {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') return;
      if (key in base) next[key] = mergeContent(base[key], value);
    });
    return next as T;
  }
  return (override === undefined || override === null ? base : override) as T;
}

export default function useServiceContent<T>(service: string, fallback: T): T {
  const cacheKey = `service:${service}`;
  const [content, setContent] = useState<T>(() => {
    const cached = serviceContentCache.get(cacheKey);
    return cached ? mergeContent(fallback, cached) : fallback;
  });

  useEffect(() => {
    setContent(() => {
      const cached = serviceContentCache.get(cacheKey);
      return cached ? mergeContent(fallback, cached) : fallback;
    });
    const controller = new AbortController();
    fetch(`/api/site-content?key=${encodeURIComponent(cacheKey)}`, {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (controller.signal.aborted) return;
        if (!payload?.success || !payload.content) return;
        serviceContentCache.set(cacheKey, payload.content);
        setContent(mergeContent(fallback, payload.content));
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        // Публичная страница всегда остаётся на статическом проверенном тексте.
      });
    return () => controller.abort();
  }, [cacheKey, fallback]);

  return content;
}
