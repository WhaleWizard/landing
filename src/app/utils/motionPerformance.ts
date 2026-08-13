export const SCROLL_ACTIVITY_START_EVENT = 'ww:scroll-activity-start';
export const SCROLL_ACTIVITY_END_EVENT = 'ww:scroll-activity-end';

export function isScrollActivityActive(): boolean {
  return typeof document !== 'undefined'
    && document.documentElement.dataset.wwScrolling === 'true';
}
