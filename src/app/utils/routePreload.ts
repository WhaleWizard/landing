type RouteLoader = () => Promise<unknown>;

export const loadHome = () => import('../pages/Home');
export const loadThankYou = () => import('../pages/ThankYou');
export const loadBlogPage = () => import('../pages/BlogPage');
export const loadCasesPage = () => import('../pages/CasesPage');
export const loadCalculator = () => import('../pages/Calculator');
export const loadRoiPage = () => import('../pages/RoiPage');
export const loadAdmin = () => import('../pages/Admin');
export const loadContentPreview = () => import('../pages/ContentPreview');
export const loadPrivacyPolicy = () => import('../pages/PrivacyPolicy');
export const loadOffer = () => import('../pages/Offer');
export const loadCookiePolicy = () => import('../pages/CookiePolicy');
export const loadFaqPage = () => import('../pages/FAQPage');
export const loadMarketingGlossaryPage = () => import('../pages/MarketingGlossaryPage');
export const loadNotFound = () => import('../pages/NotFound');
export const loadServiceLandingPage = () => import('../pages/ServiceLandingPage');
export const loadHero = () => import('../components/Hero');
export const loadMetaAppsHeroVisual = () => import('../components/MetaAppsHeroVisual');
export const loadConsultStudioHero = () => import('../components/service-heroes/ConsultStudioHero');

const routePromises = new Map<string, Promise<unknown>>();

function routeLoader(pathname: string): { key: string; loader: RouteLoader } | null {
  if (pathname === '/') return { key: 'home', loader: loadHome };
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
    return { key: 'meta-ads', loader: loadServiceLandingPage };
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
