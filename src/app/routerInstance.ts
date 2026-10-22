import type { createBrowserRouter } from 'react-router';

type AppRouter = ReturnType<typeof createBrowserRouter> | null;

let activeAppRouter: AppRouter = null;

export function setAppRouter(r: AppRouter): void {
  activeAppRouter = r;
}

export function getAppRouter(): AppRouter {
  return activeAppRouter;
}

export function getCurrentPathname(): string {
  if (activeAppRouter?.state?.location?.pathname) {
    return activeAppRouter.state.location.pathname;
  }
  if (typeof window !== 'undefined') {
    return window.location.pathname;
  }
  return '/';
}

/**
 * Decoupled router facade so components like CookieConsentManager can query
 * current route location and subscribe to transitions without importing the full
 * routes tree directly and forming circular imports.
 */
export const router = {
  get state() {
    return {
      get location() {
        return activeAppRouter?.state?.location ?? {
          pathname: getCurrentPathname(),
          search: typeof window !== 'undefined' ? window.location.search : '',
          hash: typeof window !== 'undefined' ? window.location.hash : '',
          state: null,
          key: 'default',
        };
      },
    };
  },
  subscribe(fn: (state: { location: { pathname: string } }) => void) {
    if (activeAppRouter) {
      return activeAppRouter.subscribe(fn as any);
    }
    return () => {};
  },
};
