import { createBrowserRouter, Outlet, ScrollRestoration, useLocation, useNavigationType, useRouteError } from 'react-router';
import { lazy, Suspense, useEffect, useInsertionEffect, useLayoutEffect, useRef } from 'react';
import RouteSkeleton from './components/RouteSkeleton';
import ScrollExperience from './components/ScrollExperience';
import RouteIntentPreloader from './components/RouteIntentPreloader';
import { ArticlesProvider } from './context/ArticlesContext';
import { useRememberPublicRoute } from './utils/siteNavigation';
import { isPathLocked, refreshPageLocks } from './utils/pageLocks';
import {
  loadAdmin,
  loadBlogPage,
  loadCalculator,
  loadCasesPage,
  loadConsultStudioHero,
  loadContentPreview,
  loadCookiePolicy,
  loadFaqPage,
  loadHero,
  loadHome,
  loadMarketingGlossaryPage,
  loadMetaAdsEditorialHero,
  loadMetaAppsHeroVisual,
  loadNotFound,
  loadOffer,
  loadPrivacyPolicy,
  loadRoiPage,
  loadServiceLandingPage,
  loadThankYou,
} from './utils/routePreload';
const CookieConsentManager = lazy(() => import('./components/cookie/CookieConsentManager'));
const PageLockHandoff = lazy(() => import('./components/PageLockHandoff'));

const Home = lazy(loadHome);
const ThankYou = lazy(loadThankYou);
const BlogPage = lazy(loadBlogPage);
const CasesPage = lazy(loadCasesPage);
const Calculator = lazy(loadCalculator);
const RoiPage = lazy(loadRoiPage);
const Admin = lazy(loadAdmin);
const ContentPreview = lazy(loadContentPreview);
const PrivacyPolicy = lazy(loadPrivacyPolicy);
const Offer = lazy(loadOffer);
const CookiePolicy = lazy(loadCookiePolicy);
const FAQPage = lazy(loadFaqPage);
const MarketingGlossaryPage = lazy(loadMarketingGlossaryPage);
const NotFound = lazy(loadNotFound);

type ServiceType = import('./pages/ServiceLandingPage').ServiceType;
type ServicePreload = () => Promise<unknown>;

function lazyServiceLanding(service: ServiceType, preloads: ServicePreload[] = []) {
  return lazy(async () => {
    // Above-the-fold hero chunks start together with the landing module instead
    // of forming a second/third request waterfall after it has evaluated.
    const [module] = await Promise.all([
      loadServiceLandingPage(),
      ...preloads.map((preload) => preload()),
    ]);

    return {
      default: function RoutedServiceLanding() {
        return <module.ServiceLandingPage service={service} />;
      },
    };
  });
}

const MetaAdsPage = lazyServiceLanding('meta-ads', [
  loadMetaAdsEditorialHero,
]);
const GoogleAdsPage = lazyServiceLanding('google-ads', [
  loadHero,
]);
const ConsultPage = lazyServiceLanding('consult', [
  loadConsultStudioHero,
]);
const MetaAppsPage = lazyServiceLanding('meta-apps', [
  loadHero,
  loadMetaAppsHeroVisual,
]);


function RouteErrorBoundary() {
  const error = useRouteError() as Error | undefined;

  useEffect(() => {
    const msg = String(error?.message || '');
    if (msg.includes('Failed to fetch dynamically imported module')) {
      const onceKey = 'ww_chunk_reload_once_v1';
      const alreadyRetried = window.sessionStorage.getItem(onceKey) === '1';
      const timer = window.setTimeout(() => {
        if (alreadyRetried) return;
        window.sessionStorage.setItem(onceKey, '1');
        const url = new URL(window.location.href);
        url.searchParams.set('_v', String(Date.now()));
        window.location.replace(url.toString());
      }, 400);
      return () => window.clearTimeout(timer);
    }
  }, [error]);

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24, textAlign: 'center' }}>
      <div>
        <h1>Страница не загрузилась</h1>
        <p>Попробуйте обновить страницу. Если ошибка повторится, вернитесь на главную.</p>
        <button type="button" onClick={() => window.location.reload()}>Обновить страницу</button>
      </div>
    </div>
  );
}

function LazyWrapper({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  return (
    <Suspense fallback={fallback ?? <RouteSkeleton />}>
      {children}
    </Suspense>
  );
}

function InstantScrollRestoration() {
  const location = useLocation();

  // React Router restores the position in a layout effect. Install the
  // instant-scroll guard earlier so global smooth anchor scrolling cannot make
  // a new route visibly travel from the previous page's position.
  useInsertionEffect(() => {
    document.documentElement.dataset.wwInstantScroll = 'true';
  }, [location.key]);

  useEffect(() => {
    const release = () => delete document.documentElement.dataset.wwInstantScroll;
    const frame = window.requestAnimationFrame(release);
    // В фоновой вкладке кадры не выдаются, и снятие по requestAnimationFrame
    // не наступало вовсе — на <html> оставался залипший атрибут. Таймер
    // снимает его в любом случае, а сама уборка идемпотентна.
    const timer = window.setTimeout(release, 200);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      release();
    };
  }, [location.key]);

  return <ScrollRestoration />;
}

/**
 * React Router restores a POP position in a layout effect. On a lazy route the
 * first layout can still be the short skeleton, so the browser clamps the
 * requested Y and never revisits it when articles/images expand the document.
 * Keep a small in-memory mirror for SPA entries and a namespaced persistent
 * fallback for browser reloads. Apply the saved value after the page height
 * has settled so lazy content cannot clamp it to an early skeleton height.
 */
function StableScrollPositionRestoration() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const currentPath = `${location.pathname}${location.search}`;
  const positionsRef = useRef(new Map<string, number>());
  const previousPathRef = useRef('');
  const observedPathRef = useRef('');
  const ignoreScrollUntilRef = useRef(0);

  const storageKey = 'ww_scroll_positions_v2';

  useLayoutEffect(() => {
    if (observedPathRef.current === currentPath) return;
    observedPathRef.current = currentPath;
    // React Router may emit a synthetic scroll event while it restores the
    // destination. Do not let that transient clamped value overwrite the
    // outgoing page's real position before our settled restore runs.
    ignoreScrollUntilRef.current = Date.now() + 1800;
  }, [currentPath]);

  useEffect(() => {
    const path = currentPath;
    const key = location.key;
    let active = true;
    let persistTimer: number | null = null;
    let pendingPersistY: number | null = null;

    const persist = (y: number) => {
      try {
        const raw = window.sessionStorage.getItem(storageKey);
        const persisted = raw ? JSON.parse(raw) as Record<string, number> : {};
        persisted[path] = y;
        const keys = Object.keys(persisted);
        for (const staleKey of keys.slice(0, Math.max(0, keys.length - 32))) delete persisted[staleKey];
        window.sessionStorage.setItem(storageKey, JSON.stringify(persisted));
      } catch {
        // Storage can be unavailable in private browsing; the memory mirror
        // still covers all SPA transitions.
      }
    };

    const flushPersist = () => {
      if (persistTimer != null) {
        window.clearTimeout(persistTimer);
        persistTimer = null;
      }
      if (pendingPersistY != null) {
        persist(pendingPersistY);
        pendingPersistY = null;
      }
    };

    const remember = () => {
      if (!active || Date.now() < ignoreScrollUntilRef.current) return;
      const y = window.scrollY;
      positionsRef.current.set(key, y);
      positionsRef.current.set(path, y);
      pendingPersistY = y;
      if (persistTimer == null) {
        // Scroll events can arrive every frame. Throttle JSON/localStorage
        // work so persistence never competes with the visual motion loop.
        persistTimer = window.setTimeout(() => {
          persistTimer = null;
          if (pendingPersistY != null) {
            persist(pendingPersistY);
            pendingPersistY = null;
          }
        }, 240);
      }
    };

    const preserveBeforeNavigation = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest('a,button,[role="link"]')) return;
      if (!active || Date.now() < ignoreScrollUntilRef.current) return;
      // A router navigation can trigger its clamped scroll before the next
      // location has rendered. Capture the outgoing value at click time so
      // that synthetic movement cannot replace it in the map.
      const y = window.scrollY;
      positionsRef.current.set(key, y);
      positionsRef.current.set(path, y);
      ignoreScrollUntilRef.current = Date.now() + 1800;
      try {
        const raw = window.sessionStorage.getItem(storageKey);
        const persisted = raw ? JSON.parse(raw) as Record<string, number> : {};
        persisted[path] = y;
        const keys = Object.keys(persisted);
        for (const staleKey of keys.slice(0, Math.max(0, keys.length - 32))) delete persisted[staleKey];
        window.sessionStorage.setItem(storageKey, JSON.stringify(persisted));
      } catch {
        // Ignore unavailable storage.
      }
    };

    window.addEventListener('scroll', remember, { passive: true });
    document.addEventListener('pointerdown', preserveBeforeNavigation, true);
    document.addEventListener('click', preserveBeforeNavigation, true);
    const rememberBeforeUnload = () => {
      // pagehide can happen while the scroll listener is throttled. Persist
      // the latest outgoing position synchronously as a final safeguard.
      const y = window.scrollY;
      positionsRef.current.set(key, y);
      positionsRef.current.set(path, y);
      persist(y);
    };
    window.addEventListener('pagehide', rememberBeforeUnload);
    return () => {
      flushPersist();
      active = false;
      window.removeEventListener('scroll', remember);
      document.removeEventListener('pointerdown', preserveBeforeNavigation, true);
      document.removeEventListener('click', preserveBeforeNavigation, true);
      window.removeEventListener('pagehide', rememberBeforeUnload);
    };
  }, [currentPath, location.key]);

  useLayoutEffect(() => {
    const path = `${location.pathname}${location.search}`;
    const previousPath = previousPathRef.current;
    previousPathRef.current = path;

    if (location.hash) return undefined;

    let saved = navigationType === 'POP'
      ? positionsRef.current.get(location.key) ?? positionsRef.current.get(path)
      : undefined;

    if (saved == null && navigationType === 'POP') {
      try {
        const raw = window.sessionStorage.getItem(storageKey);
        const persisted = raw ? JSON.parse(raw) as Record<string, number> : {};
        if (typeof persisted[path] === 'number') saved = persisted[path];
      } catch {
        // Ignore malformed or unavailable storage and let native restoration
        // handle the entry.
      }
    }

    // A PUSH/REPLACE always starts at the top. POP entries use our mirror when
    // available, then the persistent fallback; otherwise React Router's native
    // restoration path remains untouched.
    if (navigationType !== 'POP' && previousPath && previousPath !== path) {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      return undefined;
    }
    if (saved == null) return undefined;

    let frame = 0;
    let attempts = 0;
    let previousHeight = -1;
    let stableFrames = 0;
    const restore = () => {
      attempts += 1;
      const height = document.documentElement.scrollHeight;
      if (height === previousHeight) stableFrames += 1;
      else {
        previousHeight = height;
        stableFrames = 0;
      }

      const maxScroll = Math.max(0, height - window.innerHeight);
      const settled = stableFrames >= 3 || attempts >= 120;
      if (settled) {
        window.scrollTo({
          top: Math.min(saved, maxScroll),
          left: 0,
          behavior: 'auto',
        });
        return;
      }
      frame = window.requestAnimationFrame(restore);
    };

    frame = window.requestAnimationFrame(restore);
    const timer = window.setTimeout(() => {
      window.scrollTo({
        top: Math.min(saved ?? 0, Math.max(0, document.documentElement.scrollHeight - window.innerHeight)),
        left: 0,
        behavior: 'auto',
      });
    }, 1200);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [location.hash, location.key, location.pathname, location.search, navigationType]);

  return null;
}

function RouteFocusManager() {
  const location = useLocation();
  useEffect(() => {
    // Якорные переходы сами выставляют скролл к нужному блоку. Перенос фокуса
    // на h1 в этот момент мог бы незаметно изменить виртуальный viewport у
    // screen reader и вернуть страницу наверх.
    if (location.hash || /^\/admin(?:\/|$)/.test(location.pathname)) return undefined;

    const frame = window.requestAnimationFrame(() => {
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const heading = document.querySelector('main h1');
      if (!(heading instanceof HTMLElement)) return;
      if (heading.contains(document.activeElement)) return;
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [location.hash, location.key, location.pathname]);

  return null;
}


function RootLayout() {
  const location = useLocation();
  useRememberPublicRoute();
  const isAdmin = /^\/admin(?:\/|$)/.test(location.pathname);
  const isContentPreview = location.pathname === '/admin/content-preview';
  // Закрытая страница не должна ни отрисоваться, ни подгрузить свой код.
  // Проверка стоит выше React.lazy именно поэтому: до неё дело не доходит.
  const isLocked = !isAdmin && isPathLocked(location.pathname);
  const needsArticles = !isContentPreview && !isLocked && (
    location.pathname === '/'
    || /^\/(?:blog|cases|admin)(?:\/|$)/.test(location.pathname)
  );
  const articleInitialLoad = isAdmin
    ? 'manual'
    : location.pathname === '/'
      ? 'deferred'
      : 'immediate';
  const routeContent = isLocked
    ? <LazyWrapper><PageLockHandoff path={location.pathname} /></LazyWrapper>
    : <Outlet />;

  // Вкладка могла быть открыта до того, как страницу закрыли: сама она за
  // новой разметкой на сервер уже не ходит. Список обновляется в фоне и не
  // чаще раза в две минуты.
  useEffect(() => {
    if (isAdmin) return;
    void refreshPageLocks();
  }, [isAdmin, location.pathname]);

  return (
    <>
      {!isContentPreview ? (
        <>
          <InstantScrollRestoration />
          <StableScrollPositionRestoration />
          <RouteFocusManager />
          <ScrollExperience showTrail={!isAdmin} routeKey={location.key} />
          {!isAdmin ? <RouteIntentPreloader /> : null}
        </>
      ) : null}
      {needsArticles ? (
        // Admin API includes drafts/future publications. The key creates a hard
        // state boundary so protected records can never flash on public routes.
        <ArticlesProvider
          key={isAdmin ? 'admin-articles' : 'public-articles'}
          initialLoad={articleInitialLoad}
        >
          {routeContent}
        </ArticlesProvider>
      ) : routeContent}
      {!isAdmin ? (
        <Suspense fallback={null}>
          <CookieConsentManager />
        </Suspense>
      ) : null}
    </>
  );
}

function ApiArticleRedirect() {
  useEffect(() => {
    const nextUrl = `/api/articles${window.location.search}${window.location.hash}`;
    window.location.replace(nextUrl);
  }, []);

  return null;
}

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    errorElement: <RouteErrorBoundary />,
    children: [
      { index: true, element: <LazyWrapper><Home /></LazyWrapper> },
      { path: 'calculator', element: <LazyWrapper><Calculator /></LazyWrapper> },
      { path: 'roi-calculator', element: <LazyWrapper><RoiPage /></LazyWrapper> },
      { path: 'thank-you', element: <LazyWrapper><ThankYou /></LazyWrapper> },
      { path: 'blog', element: <LazyWrapper><BlogPage /></LazyWrapper> },
      { path: 'blog/:slug', element: <LazyWrapper><BlogPage /></LazyWrapper> },
      { path: 'cases', element: <LazyWrapper><CasesPage /></LazyWrapper> },
      { path: 'cases/:slug', element: <LazyWrapper><BlogPage /></LazyWrapper> },
      { path: 'admin', element: <LazyWrapper fallback={<RouteSkeleton variant="gate" />}><Admin /></LazyWrapper> },
      { path: 'admin/content-preview', element: <LazyWrapper><ContentPreview /></LazyWrapper> },
      { path: 'privacy-policy', element: <LazyWrapper><PrivacyPolicy /></LazyWrapper> },
      { path: 'offer', element: <LazyWrapper><Offer /></LazyWrapper> },
      { path: 'cookie-policy', element: <LazyWrapper><CookiePolicy /></LazyWrapper> },
      { path: 'faq', element: <LazyWrapper><FAQPage /></LazyWrapper> },
      { path: 'marketing-glossary', element: <LazyWrapper><MarketingGlossaryPage /></LazyWrapper> },
      { path: 'meta-ads', element: <LazyWrapper><MetaAdsPage /></LazyWrapper> },
      { path: 'meta-apps', element: <LazyWrapper><MetaAppsPage /></LazyWrapper> },
      { path: 'google-ads', element: <LazyWrapper><GoogleAdsPage /></LazyWrapper> },
      { path: 'consult', element: <LazyWrapper><ConsultPage /></LazyWrapper> },
      { path: 'api/article', Component: ApiArticleRedirect },
      { path: '*', element: <LazyWrapper><NotFound /></LazyWrapper> },
    ],
  },
]);
