import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Keep viewport overlays outside the content's size-query container. */
export default function AdminOverlay({ children }: { children: ReactNode }) {
  const host = typeof document === 'undefined' ? null : document.getElementById('ww-admin-overlays');
  return host ? createPortal(children, host) : <>{children}</>;
}
