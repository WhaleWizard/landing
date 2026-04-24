import { createBrowserRouter } from 'react-router';
import { lazy, Suspense } from 'react';
import Home from './pages/Home';
import RouteSkeleton from './components/RouteSkeleton';

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

function LazyWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      {children}
    </Suspense>
  );
}

export const router = createBrowserRouter([
  { path: '/', Component: Home },
  { path: '/calculator', element: <LazyWrapper><Calculator /></LazyWrapper> },
  { path: '/roi-calculator', element: <LazyWrapper><RoiPage /></LazyWrapper> },
  { path: '/thank-you', element: <LazyWrapper><ThankYou /></LazyWrapper> },
  { path: '/blog', element: <LazyWrapper><BlogPage /></LazyWrapper> },
  { path: '/blog/:slug', element: <LazyWrapper><BlogPage /></LazyWrapper> },
  { path: '/admin', element: <LazyWrapper><Admin /></LazyWrapper> },
  { path: '/privacy-policy', element: <LazyWrapper><PrivacyPolicy /></LazyWrapper> },
  { path: '/offer', element: <LazyWrapper><Offer /></LazyWrapper> },
  { path: '/cookie-policy', element: <LazyWrapper><CookiePolicy /></LazyWrapper> },
  { path: '/faq', element: <LazyWrapper><FAQPage /></LazyWrapper> },
  { path: '/marketing-glossary', element: <LazyWrapper><MarketingGlossaryPage /></LazyWrapper> },
]);
