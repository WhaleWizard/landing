import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};
const clientSnapshot = () => false;
const serverSnapshot = () => true;

/** React uses the server snapshot for each boundary's initial hydration. */
export function useIsHydrating(enabled = true): boolean {
  return useSyncExternalStore(subscribe, clientSnapshot, enabled ? serverSnapshot : clientSnapshot);
}
