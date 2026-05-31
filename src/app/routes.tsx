import { createBrowserRouter, Outlet, useLocation, useRouteError } from 'react-router';
import { lazy, Suspense, useEffect } from 'react';
import Home from './pages/Home';
import RouteSkeleton from './components/RouteSkeleton';
import Navbar from './components/Navbar';
const CookieConsentManager = lazy(() => import('./components/cookie/CookieConsentManager'));

const ThankYou = lazy(() => import('./pages/ThankYou'));
const BlogPage = lazy(() => import('./pages/BlogPage'));
const Calculator = lazy(() => import('./pages/Calculator'));
const RoiPage = lazy(() => import('./pages/RoiPage'));
const Admin = lazy(() => import('./pages/Admin'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const Offer = lazy(() => import('./pages/Offer'));
const CookiePolicy = lazy(() => import('./pages/CookiePolicy'));
const FAQPage = lazy(() => import('./pages/FAQPage'));
const MarketingGlossaryPage = lazy(() => import('./pages/MarketingGlossaryPage'));
import MetaAdsPage from './pages/MetaAdsPage';
import GoogleAdsPage from './pages/GoogleAdsPage';
import ConsultPage from './pages/ConsultPage';
import MetaAppsPage from './pages/MetaAppsPage';
const NotFound = lazy(() => import('./pages/NotFound'));


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
        <h1>Страница обновилась</h1>
        <p>Сайт был обновлён. Пожалуйста, обновите страницу.</p>
        <button type="button" onClick={() => window.location.reload()}>Обновить</button>
      </div>
    </div>
  );
}

function LazyWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      {children}
    </Suspense>
  );
}



const NAVBAR_SCROLL_OFFSET = 80;
const PENDING_SCROLL_KEY = 'ww_pending_scroll_section';

function getPendingScrollSection() {
  try {
    return window.sessionStorage.getItem(PENDING_SCROLL_KEY);
  } catch {
    return null;
  }
}

function clearPendingScrollSection() {
  try {
    window.sessionStorage.removeItem(PENDING_SCROLL_KEY);
  } catch {
    // Storage can be blocked; direct route navigation still works.
  }
}

function ScrollToHash() {
  const location = useLocation();

  useEffect(() => {
    const pendingSection = getPendingScrollSection();
    const hashSection = location.hash ? decodeURIComponent(location.hash.slice(1)) : '';
    const elementId = pendingSection || hashSection;

    if (!elementId) return;

    const scrollWhenReady = (attempt = 0) => {
      const element = document.getElementById(elementId);
      if (element) {
        clearPendingScrollSection();
        if (hashSection) {
          window.history.replaceState(null, '', `${location.pathname}${location.search}`);
        }
        const y = element.getBoundingClientRect().top + window.scrollY - NAVBAR_SCROLL_OFFSET;
        window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
        return;
      }

      if (attempt >= 100) return;
      window.setTimeout(() => scrollWhenReady(attempt + 1), 50);
    };

    window.requestAnimationFrame(() => scrollWhenReady());
  }, [location.hash, location.pathname]);

  return null;
}

const SERVICE_NAV_PATHS = new Set(['/meta-ads', '/google-ads', '/consult', '/meta-apps']);
const NAVBAR_HIDDEN_PATHS = new Set(['/admin']);

function RootLayout() {
  const location = useLocation();
  const normalizedPath = location.pathname.replace(/\/$/, '') || '/';
  const shouldShowNavbar = !NAVBAR_HIDDEN_PATHS.has(normalizedPath);
  const navbarVariant = SERVICE_NAV_PATHS.has(normalizedPath) ? 'service' : 'home';

  return (
    <>
      <ScrollToHash />
      {shouldShowNavbar && <Navbar variant={navbarVariant} />}
      <Outlet />
      <Suspense fallback={null}>
        <CookieConsentManager />
      </Suspense>
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
      { index: true, Component: Home },
      { path: 'calculator', element: <LazyWrapper><Calculator /></LazyWrapper> },
      { path: 'roi-calculator', element: <LazyWrapper><RoiPage /></LazyWrapper> },
      { path: 'thank-you', element: <LazyWrapper><ThankYou /></LazyWrapper> },
      { path: 'blog', element: <LazyWrapper><BlogPage /></LazyWrapper> },
      { path: 'blog/:slug', element: <LazyWrapper><BlogPage /></LazyWrapper> },
      { path: 'cases', element: <LazyWrapper><BlogPage /></LazyWrapper> },
      { path: 'cases/:slug', element: <LazyWrapper><BlogPage /></LazyWrapper> },
      { path: 'admin', element: <LazyWrapper><Admin /></LazyWrapper> },
      { path: 'privacy-policy', element: <LazyWrapper><PrivacyPolicy /></LazyWrapper> },
      { path: 'offer', element: <LazyWrapper><Offer /></LazyWrapper> },
      { path: 'cookie-policy', element: <LazyWrapper><CookiePolicy /></LazyWrapper> },
      { path: 'faq', element: <LazyWrapper><FAQPage /></LazyWrapper> },
      { path: 'marketing-glossary', element: <LazyWrapper><MarketingGlossaryPage /></LazyWrapper> },
      { path: 'meta-ads', Component: MetaAdsPage },
      { path: 'google-ads', Component: GoogleAdsPage },
      { path: 'consult', Component: ConsultPage },
      { path: 'meta-apps', Component: MetaAppsPage },
      { path: 'api/article', Component: ApiArticleRedirect },
      { path: '*', element: <LazyWrapper><NotFound /></LazyWrapper> },
    ],
  },
]);
