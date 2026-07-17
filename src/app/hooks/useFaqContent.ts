import { useEffect, useState } from 'react';
import type { FaqItem } from '../pages/FAQPage';

let faqCache: FaqItem[] | null = null;

export default function useFaqContent(fallback: FaqItem[]): FaqItem[] {
  const [items, setItems] = useState<FaqItem[]>(() => faqCache || fallback);

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
        if (!payload?.success || !Array.isArray(payload.content?.items) || payload.content.items.length === 0) return;
        faqCache = payload.content.items as FaqItem[];
        setItems(faqCache);
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      });
    return () => controller.abort();
  }, []);

  return items;
}
