import { useEffect, useState } from 'react';
import type { FaqItem } from '../pages/FAQPage';
import { readInlineSiteContentSeed } from '../utils/siteContentSeed';

export type FaqSeoContent = {
  title: string;
  description: string;
};

type FaqPageContent = {
  items: FaqItem[];
  seo: FaqSeoContent;
};

let faqCache: FaqPageContent | null = null;
let faqOverrideCache: Record<string, unknown> | null | undefined;
let faqOverridePending: Promise<Record<string, unknown> | null | undefined> | null = null;

export function preloadFaqContent(): Promise<Record<string, unknown> | null | undefined> {
  if (faqOverrideCache !== undefined) return Promise.resolve(faqOverrideCache);
  if (faqOverridePending) return faqOverridePending;

  faqOverridePending = fetch('/api/site-content?key=site%3Afaq', {
    credentials: 'same-origin',
    cache: 'no-store',
  })
    .then(async (response) => response.ok ? response.json() : null)
    .then((payload) => {
      if (!payload?.success) return undefined;
      faqOverrideCache = payload.content && typeof payload.content === 'object' && !Array.isArray(payload.content)
        ? payload.content as Record<string, unknown>
        : null;
      return faqOverrideCache;
    })
    .catch(() => undefined)
    .finally(() => {
      faqOverridePending = null;
    });
  return faqOverridePending;
}

function resolveFaqContent(
  override: Record<string, unknown> | null | undefined,
  fallback: FaqItem[],
  fallbackSeo: FaqSeoContent,
): FaqPageContent {
  if (!override) return { items: fallback, seo: fallbackSeo };

  const items = Array.isArray(override.items) && override.items.length > 0
    ? override.items as FaqItem[]
    : fallback;
  const seoOverride = override.seo && typeof override.seo === 'object' && !Array.isArray(override.seo)
    ? override.seo as Record<string, unknown>
    : null;
  const seo = {
    title: typeof seoOverride?.title === 'string' && seoOverride.title.trim()
      ? seoOverride.title
      : fallbackSeo.title,
    description: typeof seoOverride?.description === 'string' && seoOverride.description.trim()
      ? seoOverride.description
      : fallbackSeo.description,
  };
  return { items, seo };
}

export default function useFaqContent(fallback: FaqItem[], fallbackSeo: FaqSeoContent): FaqPageContent {
  const [content, setContent] = useState<FaqPageContent>(() => (
    faqCache || resolveFaqContent(
      faqOverrideCache === undefined
        ? readInlineSiteContentSeed('site:faq')
        : faqOverrideCache,
      fallback,
      fallbackSeo,
    )
  ));

  useEffect(() => {
    let active = true;
    void preloadFaqContent()
      .then((override) => {
        if (!active || override === undefined) return;
        faqCache = resolveFaqContent(override, fallback, fallbackSeo);
        setContent(faqCache);
      });
    return () => { active = false; };
  }, [fallback, fallbackSeo]);

  return content;
}
