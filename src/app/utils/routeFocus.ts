/** A lazy route may mount after the first frame. Wait for its real heading,
 * but never steal focus after the visitor starts their next interaction. */
export function focusRouteHeading(): () => void {
  let observer: MutationObserver | undefined;
  let timer = 0;
  let frame = 0;
  let stopped = false;
  const stop = () => {
    stopped = true;
    observer?.disconnect();
    window.clearTimeout(timer);
    window.cancelAnimationFrame(frame);
    document.removeEventListener('pointerdown', stop, true);
    document.removeEventListener('keydown', stop, true);
    document.removeEventListener('focusin', stop, true);
  };
  const focus = () => {
    if (stopped) return;
    if (document.querySelector('[role="dialog"][aria-modal="true"]')) { stop(); return; }
    const heading = document.querySelector('main h1, h1');
    if (!(heading instanceof HTMLElement)) return;
    stop();
    if (heading.contains(document.activeElement)) return;
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
  };
  observer = new MutationObserver(focus);
  observer.observe(document.getElementById('root') ?? document.body, { childList: true, subtree: true });
  document.addEventListener('pointerdown', stop, true);
  document.addEventListener('keydown', stop, true);
  document.addEventListener('focusin', stop, true);
  timer = window.setTimeout(stop, 8_000);
  frame = window.requestAnimationFrame(focus);
  return stop;
}
