import { useEffect, useState } from 'react';
import type { FaqItem } from '../pages/FAQPage';

export type FaqSeoContent = {
  title: string;
  description: string;
};

type FaqPageContent = {
  items: FaqItem[];
  seo: FaqSeoContent;
};

let faqCache: FaqPageContent | null = null;

export default function useFaqContent(fallback: FaqItem[], fallbackSeo: FaqSeoContent): FaqPageContent {
  const [content, setContent] = useState<FaqPageContent>(() => faqCache || { items: fallback, seo: fallbackSeo });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/site-content?key=site%3Afaq', {
      credentials: 'same-origin',
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (controller.signal.aborted) return;
        if (!payload?.success || !payload.content) return;
        const nextItems = Array.isArray(payload.content.items) && payload.content.items.length > 0
          ? payload.content.items as FaqItem[]
          : fallback;
        const nextSeo = {
          title: typeof payload.content.seo?.title === 'string' && payload.content.seo.title.trim()
            ? payload.content.seo.title
            : fallbackSeo.title,
          description: typeof payload.content.seo?.description === 'string' && payload.content.seo.description.trim()
            ? payload.content.seo.description
            : fallbackSeo.description,
        };
        faqCache = { items: nextItems, seo: nextSeo };
        setContent(faqCache);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      });
    return () => controller.abort();
  }, [fallback, fallbackSeo]);

  return content;
}
