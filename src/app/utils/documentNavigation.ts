let leavingHref: string | undefined;

export function trackDocumentNavigation(): void {
  // The old document can still run timers during a slow navigation.
  window.addEventListener('beforeunload', () => {
    leavingHref = window.location.href;
  });
  const reset = () => {
    leavingHref = undefined;
  };
  window.addEventListener('pageshow', reset);
  // A click or key press on this document after a cancelled navigation
  // makes it safe to retry a new failure here.
  window.addEventListener('pointerdown', reset, { capture: true, passive: true });
  window.addEventListener('keydown', reset, { capture: true });
}

export function isLeavingDocument(href: string): boolean {
  return leavingHref === href;
}
