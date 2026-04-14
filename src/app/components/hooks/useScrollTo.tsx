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

  return { scrollTo, scrollToHome };
}