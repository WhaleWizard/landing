import { createBrowserRouter, Outlet, useRouteError } from 'react-router';
import { lazy, Suspense, useEffect } from 'react';
import Home from './pages/Home';
import RouteSkeleton from './components/RouteSkeleton';
import CookieConsentManager from './components/cookie/CookieConsentManager';

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


function RouteErrorBoundary() {
  const error = useRouteError() as Error | undefined;

  useEffect(() => {
    const msg = String(error?.message || '');
    if (msg.includes('Failed to fetch dynamically imported module')) {
      const timer = window.setTimeout(() => window.location.reload(), 400);
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


function RootLayout() {
  return (
    <>
      <Outlet />
      <CookieConsentManager />
    </>
  );
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
      { path: 'admin', element: <LazyWrapper><Admin /></LazyWrapper> },
      { path: 'privacy-policy', element: <LazyWrapper><PrivacyPolicy /></LazyWrapper> },
      { path: 'offer', element: <LazyWrapper><Offer /></LazyWrapper> },
      { path: 'cookie-policy', element: <LazyWrapper><CookiePolicy /></LazyWrapper> },
      { path: 'faq', element: <LazyWrapper><FAQPage /></LazyWrapper> },
      { path: 'marketing-glossary', element: <LazyWrapper><MarketingGlossaryPage /></LazyWrapper> },
    ],
  },
]);
