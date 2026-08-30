type RouteLoader = () => Promise<unknown>;

export type MemoizedLoader<T> = (() => Promise<T>) & {
  /** The module is exposed once its promise has fulfilled so a route wrapper
   * can render synchronously instead of showing a one-frame Suspense fallback. */
  resolved?: T;
};

/**
 * Route preloading and React.lazy must share the same promise. Calling
 * `import()` twice returns two promises even when the module is already in the
 * browser cache; React can therefore render one Suspense fallback frame after
 * bootstrap has awaited the first promise. Cache each route import and reset
 * it after a failed request so a transient/chunk-version error can retry.
 */
function memoizedImport<T>(loader: () => Promise<T>): MemoizedLoader<T> {
  let pending: Promise<T> | undefined;
  const load = (() => {
    if (pending) return pending;
    pending = loader().then(
      (value) => {
        load.resolved = value;
        return value;
      },
      (error) => {
        pending = undefined;
        throw error;
      },
    );
    return pending;
  }) as MemoizedLoader<T>;
  return load;
}

export const loadHome = memoizedImport(() => import('../pages/Home'));
export const loadThankYou = memoizedImport(() => import('../pages/ThankYou'));
export const loadBlogPage = memoizedImport(() => import('../pages/BlogPage'));
export const loadCasesPage = memoizedImport(() => import('../pages/CasesPage'));
export const loadCalculator = memoizedImport(() => import('../pages/Calculator'));
export const loadRoiPage = memoizedImport(() => import('../pages/RoiPage'));
export const loadAdmin = memoizedImport(() => import('../pages/Admin'));
export const loadContentPreview = memoizedImport(() => import('../pages/ContentPreview'));
export const loadPrivacyPolicy = memoizedImport(() => import('../pages/PrivacyPolicy'));
export const loadOffer = memoizedImport(() => import('../pages/Offer'));
export const loadCookiePolicy = memoizedImport(() => import('../pages/CookiePolicy'));
export const loadFaqPage = memoizedImport(() => import('../pages/FAQPage'));
export const loadMarketingGlossaryPage = memoizedImport(() => import('../pages/MarketingGlossaryPage'));
export const loadNotFound = memoizedImport(() => import('../pages/NotFound'));
export const loadServiceLandingPage = memoizedImport(() => import('../pages/ServiceLandingPage'));
export const loadHero = memoizedImport(() => import('../components/Hero'));
// Home renders the cosmic scene inside Hero's own Suspense boundary. Preload
// that nested chunk together with the route so a cold production visit does
// not hand off from the generated shell to the generic RouteSkeleton before
// the actual first screen is ready.
export const loadCosmicHeroScene = memoizedImport(() => import('../components/CosmicHeroScene'));
export const loadMetaAppsHeroVisual = memoizedImport(() => import('../components/MetaAppsHeroVisual'));
export const loadConsultStudioHero = memoizedImport(() => import('../components/service-heroes/ConsultStudioHero'));
export const loadMetaAdsEditorialHero = memoizedImport(() => import('../components/service-heroes/MetaAdsEditorialHero'));

const routePromises = new Map<string, Promise<unknown>>();

function routeLoader(pathname: string): { key: string; loader: RouteLoader } | null {
  if (pathname === '/') {
    return {
      key: 'home',
      loader: () => Promise.all([loadHome(), loadCosmicHeroScene()]),
    };
  }
  if (/^\/blog(?:\/|$)/.test(pathname)) return { key: 'blog', loader: loadBlogPage };
  if (/^\/cases\/[^/]+\/?$/.test(pathname)) return { key: 'case-article', loader: loadBlogPage };
  if (pathname === '/cases' || pathname === '/cases/') return { key: 'cases', loader: loadCasesPage };
  if (pathname === '/calculator' || pathname === '/calculator/') return { key: 'calculator', loader: loadCalculator };
  if (pathname === '/roi-calculator' || pathname === '/roi-calculator/') return { key: 'roi', loader: loadRoiPage };
  if (pathname === '/thank-you' || pathname === '/thank-you/') return { key: 'thank-you', loader: loadThankYou };
  if (pathname === '/privacy-policy' || pathname === '/privacy-policy/') return { key: 'privacy', loader: loadPrivacyPolicy };
  if (pathname === '/offer' || pathname === '/offer/') return { key: 'offer', loader: loadOffer };
  if (pathname === '/cookie-policy' || pathname === '/cookie-policy/') return { key: 'cookie', loader: loadCookiePolicy };
  if (pathname === '/faq' || pathname === '/faq/') return { key: 'faq', loader: loadFaqPage };
  if (pathname === '/marketing-glossary' || pathname === '/marketing-glossary/') {
    return { key: 'glossary', loader: loadMarketingGlossaryPage };
  }
  if (pathname === '/admin' || pathname === '/admin/') return { key: 'admin', loader: loadAdmin };
  if (pathname === '/admin/content-preview' || pathname === '/admin/content-preview/') {
    return { key: 'content-preview', loader: loadContentPreview };
  }
  if (pathname === '/meta-ads' || pathname === '/meta-ads/') {
    return {
      key: 'meta-ads',
      // Keep the first-screen hero on the same network wave as the landing
      // route. Otherwise bootstrap hands off the generated shell as soon as
      // ServiceLandingPage resolves, and MetaAdsEditorialHero briefly falls
      // back to its Suspense placeholder on a cold production visit.
      loader: () => Promise.all([loadServiceLandingPage(), loadMetaAdsEditorialHero()]),
    };
  }
  if (pathname === '/google-ads' || pathname === '/google-ads/') {
    return {
      key: 'google-ads',
      loader: () => Promise.all([loadServiceLandingPage(), loadHero()]),
    };
  }
  if (pathname === '/consult' || pathname === '/consult/') {
    return {
      key: 'consult',
      loader: () => Promise.all([loadServiceLandingPage(), loadConsultStudioHero()]),
    };
  }
  if (pathname === '/meta-apps' || pathname === '/meta-apps/') {
    return {
      key: 'meta-apps',
      loader: () => Promise.all([
        loadServiceLandingPage(),
        loadHero(),
        loadMetaAppsHeroVisual(),
      ]),
    };
  }
  return null;
}

/**
 * Starts loading a same-origin route only after an explicit navigation intent
 * (hover, focus or pointer down). This keeps PageSpeed's initial bundle clean,
 * while removing the lazy-route waterfall before a real click whenever possible.
 */
function prepareRouteMatch(target: string, useNotFoundFallback: boolean): Promise<unknown> | null {
  if (typeof window === 'undefined') return null;

  let url: URL;
  try {
    url = new URL(target, window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;

  const match = routeLoader(url.pathname) || (useNotFoundFallback
    ? { key: 'not-found', loader: loadNotFound }
    : null);
  if (!match) return null;
  const existing = routePromises.get(match.key);
  if (existing) return existing;

  const pending = Promise.resolve()
    .then(match.loader)
    .catch(() => {
      // A transient network failure must not poison future navigation attempts.
      routePromises.delete(match.key);
    });
  routePromises.set(match.key, pending);
  return pending;
}

/** Prepares the currently requested page, including the generated 404 shell. */
export function prepareRoute(target: string): Promise<unknown> | null {
  return prepareRouteMatch(target, true);
}

export function preloadPublicRoute(target: string): void {
  // Unknown same-origin links (downloads, API endpoints, etc.) should not
  // speculatively fetch the NotFound chunk on hover.
  void prepareRouteMatch(target, false);
}
