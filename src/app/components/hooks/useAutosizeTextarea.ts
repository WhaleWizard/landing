import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';

export function useAutosizeTextarea(value: string, rows: number, maxHeight = Infinity) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const measure = useCallback(() => {
    const element = ref.current;
    if (!element?.offsetWidth) return;
    element.style.height = 'auto';
    const borderHeight = element.offsetHeight - element.clientHeight;
    element.style.height = `${Math.min(element.scrollHeight + borderHeight, maxHeight)}px`;
  }, [maxHeight]);

  useLayoutEffect(() => { measure(); }, [measure, rows, value]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let frame = 0;
    let width = -1;
    let disposed = false;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(([entry]) => {
      const nextWidth = entry?.contentRect.width ?? 0;
      if (Math.abs(nextWidth - width) < 0.5) return;
      width = nextWidth;
      if (nextWidth > 0) schedule();
    });
    observer?.observe(element);
    if (!observer) window.addEventListener('resize', schedule);
    document.fonts?.addEventListener('loadingdone', schedule);
    void document.fonts?.ready.then(() => { if (!disposed) schedule(); });
    return () => {
      disposed = true;
      observer?.disconnect();
      if (!observer) window.removeEventListener('resize', schedule);
      document.fonts?.removeEventListener('loadingdone', schedule);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [measure]);

  return ref;
}
