import type { ReactNode } from 'react';
import { useMountedOnClient } from '../hooks/useMountedOnClient';

/** Рисует детей только после монтирования в браузере — см. useMountedOnClient. */
export default function ClientOnly({ children }: { children: ReactNode }) {
  const mounted = useMountedOnClient();
  return mounted ? <>{children}</> : null;
}
