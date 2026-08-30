/**
 * Native smooth scrolling is not controlled by MotionConfig. Keep it for
 * ordinary visitors, but make programmatic scrolling immediate when the OS
 * asks for less movement.
 */
export function preferredScrollBehavior(): ScrollBehavior {
  if (typeof window === 'undefined') return 'auto';
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth';
}
