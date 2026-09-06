import { useCallback, useEffect, useRef } from 'react';
import { preferredScrollBehavior } from '../../utils/motionPreference';
import { onUserScrollIntent } from '../../utils/scrollRestoration';

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
  const stopIntentRef = useRef<(() => void) | undefined>(undefined);

  const cancelPending = useCallback(() => {
    window.clearTimeout(pendingRef.current);
    pendingRef.current = undefined;
    stopIntentRef.current?.();
    stopIntentRef.current = undefined;
  }, []);

  useEffect(() => cancelPending, [cancelPending]);

  const scrollTo = useCallback((elementId: string, offset: number = 80) => {
    cancelPending();
    const element = document.getElementById(elementId);
    if (!element) return;
    const y = element.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: y, behavior: preferredScrollBehavior() });
  }, [cancelPending]);

  const scrollToHome = useCallback(() => {
    cancelPending();
    window.scrollTo({ top: 0, behavior: preferredScrollBehavior() });
  }, [cancelPending]);

  const scrollToWhenReady = useCallback((elementId: string, options?: { offset?: number; attempts?: number; intervalMs?: number }) => {
    const offset = options?.offset ?? 80;
    const attempts = options?.attempts ?? 12;
    const intervalMs = options?.intervalMs ?? 80;

    cancelPending();
    stopIntentRef.current = onUserScrollIntent(cancelPending);

    const tryScroll = (attempt: number) => {
      const element = document.getElementById(elementId);
      if (element) {
        cancelPending();
        const y = element.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top: y, behavior: preferredScrollBehavior() });
        return;
      }

      if (attempt >= attempts) {
        cancelPending();
        return;
      }
      pendingRef.current = window.setTimeout(() => tryScroll(attempt + 1), intervalMs);
    };

    tryScroll(0);
  }, [cancelPending]);

  return { scrollTo, scrollToHome, scrollToWhenReady };
}
