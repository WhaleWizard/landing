import { useCallback } from 'react';

export function useScrollTo() {
  const scrollTo = useCallback((elementId: string, offset: number = 80) => {
    const element = document.getElementById(elementId);
    if (!element) return;
    const y = element.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: y, behavior: 'smooth' });
  }, []);

  const scrollToHome = useCallback(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const scrollToWhenReady = useCallback((elementId: string, options?: { offset?: number; attempts?: number; intervalMs?: number }) => {
    const offset = options?.offset ?? 80;
    const attempts = options?.attempts ?? 60;
    const intervalMs = options?.intervalMs ?? 100;

    const tryScroll = (attempt: number) => {
      const element = document.getElementById(elementId);
      if (element) {
        const y = element.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top: y, behavior: 'smooth' });
        return;
      }

      if (attempt >= attempts) return;
      window.setTimeout(() => tryScroll(attempt + 1), intervalMs);
    };

    tryScroll(0);
  }, []);

  return { scrollTo, scrollToHome, scrollToWhenReady };
}
