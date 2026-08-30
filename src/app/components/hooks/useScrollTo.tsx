import { useCallback, useEffect, useRef } from 'react';
import { preferredScrollBehavior } from '../../utils/motionPreference';

export function useScrollTo() {
  /**
   * Отложенная попытка доскроллить до ещё не смонтированной секции.
   *
   * Ожидание длится до секунды, и его нужно отменять: при следующем вызове —
   * чтобы две цели не спорили друг с другом, при уходе со страницы — чтобы
   * забытая попытка не искала элемент уже на другой странице. Идентификаторы
   * секций на сайте повторяются (`contact` есть и на главной, и на лендингах),
   * поэтому такая попытка не промахивалась мимо, а прокручивала новую страницу
   * к чужому якорю.
   */
  const pendingRef = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(pendingRef.current), []);

  const scrollTo = useCallback((elementId: string, offset: number = 80) => {
    const element = document.getElementById(elementId);
    if (!element) return;
    const y = element.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: y, behavior: preferredScrollBehavior() });
  }, []);

  const scrollToHome = useCallback(() => {
    window.scrollTo({ top: 0, behavior: preferredScrollBehavior() });
  }, []);

  const scrollToWhenReady = useCallback((elementId: string, options?: { offset?: number; attempts?: number; intervalMs?: number }) => {
    const offset = options?.offset ?? 80;
    const attempts = options?.attempts ?? 12;
    const intervalMs = options?.intervalMs ?? 80;

    window.clearTimeout(pendingRef.current);

    const tryScroll = (attempt: number) => {
      const element = document.getElementById(elementId);
      if (element) {
        const y = element.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top: y, behavior: preferredScrollBehavior() });
        return;
      }

      if (attempt >= attempts) return;
      pendingRef.current = window.setTimeout(() => tryScroll(attempt + 1), intervalMs);
    };

    tryScroll(0);
  }, []);

  return { scrollTo, scrollToHome, scrollToWhenReady };
}
