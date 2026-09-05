const SCROLL_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' ']);

/** A dialog freezes body at -scrollY; the window itself can then report zero.
 * Persist the document's visual position, not that temporary lock artefact. */
export function readDocumentScrollY(): number {
  const bodyStyle = document.body.style;
  if (bodyStyle.position === 'fixed' && bodyStyle.overflow === 'hidden') {
    const lockedTop = Number.parseFloat(bodyStyle.top);
    if (Number.isFinite(lockedTop)) return Math.max(0, -lockedTop);
  }
  return Math.max(0, window.scrollY);
}

/**
 * Deferred positioning must yield when the visitor starts scrolling. Listen
 * to intent, not scroll events: our own scrollTo and browser anchoring also
 * dispatch scroll. In particular, the click which opened an anchor is not a
 * cancellation signal.
 */
export function onUserScrollIntent(onIntent: () => void): () => void {
  let listening = true;
  const cleanup = () => {
    if (!listening) return;
    listening = false;
    window.removeEventListener('wheel', handleIntent);
    window.removeEventListener('touchmove', handleIntent);
    window.removeEventListener('keydown', handleKey);
    window.removeEventListener('pointerdown', handleScrollbar);
  };
  const handleIntent = () => {
    if (!listening) return;
    cleanup();
    onIntent();
  };
  const handleKey = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || !SCROLL_KEYS.has(event.key)) return;
    const target = event.target;
    if (target instanceof Element) {
      // These controls consume navigation keys themselves, without moving
      // the document. A button's Space activates it instead of page scrolling.
      if (target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="slider"], [role="combobox"], [role="listbox"], [role="menu"]')) return;
      if (event.key === ' ' && target.closest('button, [role="button"]')) return;
    }
    handleIntent();
  };
  const handleScrollbar = (event: PointerEvent) => {
    // A classic desktop scrollbar has no wheel/touchmove event while being
    // dragged. Restrict this pointer listener to its gutter, never page clicks.
    if (event.button !== 0 || event.pointerType !== 'mouse') return;
    const root = document.documentElement;
    if (window.innerWidth > root.clientWidth && event.clientX >= root.clientWidth) handleIntent();
  };

  window.addEventListener('wheel', handleIntent, { passive: true });
  window.addEventListener('touchmove', handleIntent, { passive: true });
  window.addEventListener('keydown', handleKey);
  window.addEventListener('pointerdown', handleScrollbar, { passive: true });
  return cleanup;
}

/** Restore a history entry after lazy layout settles, unless the user moves. */
export function restoreWindowScrollPosition(saved: number): () => void {
  let frame = 0;
  let timer = 0;
  let attempts = 0;
  let previousHeight = -1;
  let stableFrames = 0;
  let cancelled = false;
  let stopListening = () => {};

  const cleanup = () => {
    cancelled = true;
    window.cancelAnimationFrame(frame);
    window.clearTimeout(timer);
    stopListening();
  };
  const position = () => {
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    window.scrollTo({ top: Math.min(saved, maxScroll), left: 0, behavior: 'auto' });
  };
  const restore = () => {
    if (cancelled) return;
    attempts += 1;
    const height = document.documentElement.scrollHeight;
    if (height === previousHeight) stableFrames += 1;
    else {
      previousHeight = height;
      stableFrames = 0;
    }
    if (stableFrames >= 3 || attempts >= 120) {
      position();
      return;
    }
    frame = window.requestAnimationFrame(restore);
  };

  stopListening = onUserScrollIntent(cleanup);
  frame = window.requestAnimationFrame(restore);
  // A late chunk may grow the document after its first stable frame. Keep
  // this final correction, but never let it undo a new wheel/touch/key gesture.
  timer = window.setTimeout(() => {
    if (!cancelled) position();
    cleanup();
  }, 1200);
  return cleanup;
}
