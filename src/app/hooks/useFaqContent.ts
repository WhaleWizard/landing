import { useMemo } from 'react';
import type { FaqItem } from '../types/faq';
import { useSiteContent } from './useServiceContent';

export type FaqSeoContent = {
  title: string;
  description: string;
};

type FaqPageContent = {
  items: FaqItem[];
  seo: FaqSeoContent;
};

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
  const override = useSiteContent<Record<string, unknown> | null>('site:faq', null);
  return useMemo(() => resolveFaqContent(override, fallback, fallbackSeo), [override, fallback, fallbackSeo]);
}
