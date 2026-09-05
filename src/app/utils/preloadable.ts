import { createElement, type ComponentType } from 'react';
import type { MemoizedLoader } from './memoizedImport';

/** Render an already prepared module in the first commit. React.lazy cannot
 * synchronously inspect a fulfilled promise and otherwise commits fallback
 * once more, even after bootstrap has awaited this very same module. */
export function preloadable<P extends object>(
  loader: MemoizedLoader<{ default: ComponentType<P> }>,
): ComponentType<P> {
  let Loaded = loader.resolved?.default;
  let pending: Promise<unknown> | undefined;

  return function PreloadedComponent(props: P) {
    if (!Loaded) Loaded = loader.resolved?.default;
    if (Loaded) return createElement(Loaded, props);

    if (!pending) {
      pending = loader().then((module) => {
        Loaded = module.default;
      }).catch((error) => {
        pending = undefined;
        throw error;
      });
    }
    throw pending;
  };
}
