export const SCROLL_ACTIVITY_START_EVENT = 'ww:scroll-activity-start';
export const SCROLL_ACTIVITY_END_EVENT = 'ww:scroll-activity-end';

export function isScrollActivityActive(): boolean {
  return typeof document !== 'undefined'
    && document.documentElement.dataset.wwScrolling === 'true';
}

/**
 * Slow decorative dust does not need to repaint at a 120/144 Hz display rate.
 * Keep the fractional frame remainder: rounding 24 fps to every third frame
 * on a 60 Hz screen would actually run at 20 fps. The returned step is relative
 * to 60 Hz, so movement and pointer easing retain the same speed.
 */
export function createSceneFrameClock(compact: boolean) {
  const interval = 1000 / (compact ? 24 : 60);
  let nextFrameAt = Number.NaN;
  let lastFrameAt = Number.NaN;

  return {
    step(now: number): number {
      if (!Number.isNaN(nextFrameAt) && now + 0.5 < nextFrameAt) return 0;
      const elapsed = Number.isNaN(lastFrameAt) ? 1000 / 60 : Math.max(0, now - lastFrameAt);
      nextFrameAt = Number.isNaN(nextFrameAt)
        ? now + interval
        : now + interval - (Math.max(0, now - nextFrameAt) % interval);
      lastFrameAt = now;
      return Math.min(3, elapsed / (1000 / 60));
    },
    reset() {
      nextFrameAt = Number.NaN;
      lastFrameAt = Number.NaN;
    },
  };
}
