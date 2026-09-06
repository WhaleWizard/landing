import { onUserScrollIntent } from './scrollRestoration';

/** DOM order is the source of truth, including conditional/anonymous sections. */
export function precedesDeferredHashTarget(section: HTMLElement): boolean {
  let hash: string;
  try { hash = decodeURIComponent(window.location.hash.slice(1)); }
  catch { hash = window.location.hash.slice(1); }
  if (!hash) return false;
  const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-home-section]'));
  const targetIndex = sections.findIndex((item) => item.dataset.homeAnchor === hash);
  const index = sections.indexOf(section);
  return index >= 0 && targetIndex >= index;
}

/**
 * A deep link needs real predecessor heights, not their Suspense estimates.
 * Wait for those commits and fonts, then position ONCE. No repeated scroll
 * correction, eager mounting on ordinary Home loads, or permanent observer.
 */
export function alignDeferredAnchor(anchorId: string, section: HTMLElement): () => void {
  let stopped = false;
  let frame = 0;
  let previousY: number | undefined;
  let waitingForFonts = false;
  const root = section.closest('main') ?? section.parentElement ?? section;
  const cleanup = () => {
    stopped = true;
    window.cancelAnimationFrame(frame);
    window.clearTimeout(deadline);
    observer.disconnect();
    stopIntent();
    window.removeEventListener('pointerdown', cleanup, true);
  };
  const schedule = () => {
    if (!stopped && !frame) frame = window.requestAnimationFrame(check);
  };
  const check = () => {
    frame = 0;
    if (stopped) return;
    const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-home-section]'));
    const targetIndex = sections.indexOf(section);
    const target = document.getElementById(anchorId);
    if (targetIndex < 0 || !target || !section.contains(target)) return;
    if (sections.slice(0, targetIndex + 1).some((item) => item.querySelector('[data-home-placeholder]'))) {
      previousY = undefined;
      return;
    }
    if (document.fonts?.status === 'loading') {
      previousY = undefined;
      if (!waitingForFonts) {
        waitingForFonts = true;
        void document.fonts.ready.then(() => { waitingForFonts = false; schedule(); });
      }
      return;
    }
    const navHeight = document.querySelector('nav')?.getBoundingClientRect().height || 80;
    // The wrapper owns layout; a child's reveal transform (e.g. SocialBar's
    // y:20) must not become a permanent 20px error after the reveal finishes.
    const y = Math.max(0, section.getBoundingClientRect().top + window.scrollY - navHeight - 8);
    // Two layout samples after the final commit, not a frame-count timeout
    // that incorrectly assumes a chunk is ready after 45 frames.
    if (previousY === undefined || Math.abs(y - previousY) > 1) {
      previousY = y;
      schedule();
      return;
    }
    cleanup();
    window.scrollTo({ top: y, left: 0, behavior: 'auto' });
  };
  const observer = new MutationObserver(schedule);
  observer.observe(root, { childList: true, subtree: true });
  const stopIntent = onUserScrollIntent(cleanup);
  // A different button/link is a new destination too. Capture phase excludes
  // the initiating click, whose pointerdown has already finished.
  window.addEventListener('pointerdown', cleanup, { capture: true, passive: true });
  // Bound failed imports/fonts without forcing a late jump on timeout.
  const deadline = window.setTimeout(cleanup, 8000);
  schedule();
  return cleanup;
}
