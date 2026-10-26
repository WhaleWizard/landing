import { useEffect, useState } from 'react';

/**
 * Returns true after the browser settles its initial hydration window,
 * followed by an idle state, or immediately upon user interaction.
 * Prevents non-critical client tasks (like heavy list rendering, analytics and
 * cookie banners) from contending for CPU/network during initial page hydration and LCP.
 */
export function useIdleReady(delayMs = 1500): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let timer: number | undefined;
    const trigger = () => {
      setReady(true);
      cleanup();
    };

    const cleanup = () => {
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener('scroll', trigger);
      window.removeEventListener('pointerdown', trigger);
      window.removeEventListener('keydown', trigger);
    };

    window.addEventListener('scroll', trigger, { passive: true, once: true });
    window.addEventListener('pointerdown', trigger, { passive: true, once: true });
    window.addEventListener('keydown', trigger, { passive: true, once: true });

    timer = window.setTimeout(() => {
      if ('requestIdleCallback' in window && typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(() => trigger());
      } else {
        trigger();
      }
    }, delayMs);

    return cleanup;
  }, [delayMs]);

  return ready;
}
