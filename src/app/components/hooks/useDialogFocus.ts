import { useEffect, useRef, type RefObject } from 'react';

/** Elements that can receive keyboard focus inside an open dialog. */
export const DIALOG_FOCUSABLE_SELECTOR = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusable(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE_SELECTOR)).filter((element) => {
    if (element.closest('[inert]')) return false;
    const style = window.getComputedStyle(element);
    // Opacity is deliberately not a visibility test: a dialog can be entering
    // with opacity: 0 and still needs a real first focus target. Waiting for
    // the animation to finish leaves keyboard focus on the page behind it.
    return style.display !== 'none'
      && style.visibility !== 'hidden'
      && element.getClientRects().length > 0;
  });
}

/**
 * Keep keyboard focus inside a custom dialog and return it to the opener.
 * Native-looking overlays in the public app use this instead of relying on
 * browser focus heuristics, which otherwise leave focus on <body> or behind
 * an aria-modal surface on touch/keyboard navigation.
 */
export function useDialogFocus<T extends HTMLElement>(
  isOpen: boolean,
  onClose: () => void,
  initialFocusRef?: RefObject<HTMLElement | null>,
) {
  const dialogRef = useRef<T>(null);
  const closeRef = useRef(onClose);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  closeRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return undefined;

    restoreFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    const focusFrame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      const nodes = getFocusable(dialog);
      const preferred = initialFocusRef?.current;
      const first = preferred && nodes.includes(preferred) ? preferred : nodes[0];
      if (first) first.focus();
      else dialog?.focus();
    });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }

      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      const nodes = getFocusable(dialog);
      if (!nodes.length) return;

      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener('keydown', onKeyDown);
      const restoreTarget = restoreFocusRef.current;
      restoreFocusRef.current = null;
      restoreTarget?.focus({ preventScroll: true });
    };
  }, [initialFocusRef, isOpen]);

  return dialogRef;
}

/**
 * Freeze the document under a custom dialog while preserving the exact scroll
 * position. A history navigation while the dialog is open must not be undone
 * when its unmounted cleanup runs, hence the same-entry guard.
 */
export function useDialogScrollLock(isOpen: boolean) {
  useEffect(() => {
    if (!isOpen) return undefined;

    const previousOverflow = document.body.style.overflow;
    const previousPaddingRight = document.body.style.paddingRight;
    const previousPosition = document.body.style.position;
    const previousTop = document.body.style.top;
    const previousWidth = document.body.style.width;

    // A public modal or cookie documents may already own the lock. Do not
    // overwrite its top offset or restore it prematurely on close.
    if (previousPosition === 'fixed' && previousOverflow === 'hidden') return undefined;

    const scrollY = window.scrollY;
    const historyKey = window.history.state?.key;
    const href = window.location.href;
    const rootGutter = getComputedStyle(document.documentElement).scrollbarGutter;
    const bodyGutter = getComputedStyle(document.body).scrollbarGutter;
    const gutter = rootGutter.includes('stable') || bodyGutter.includes('stable')
      ? 0
      : Math.max(0, window.innerWidth - document.documentElement.clientWidth);

    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = '100%';
    if (gutter > 0) document.body.style.paddingRight = `${gutter}px`;

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.paddingRight = previousPaddingRight;
      document.body.style.position = previousPosition;
      document.body.style.top = previousTop;
      document.body.style.width = previousWidth;
      const sameEntry = historyKey ? window.history.state?.key === historyKey : window.location.href === href;
      if (sameEntry) window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });
    };
  }, [isOpen]);
}
