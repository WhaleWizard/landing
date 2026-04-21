import { createBrowserRouter } from 'react-router';
import { lazy, Suspense } from 'react';
import Home from './pages/Home';

const ThankYou = lazy(() => import('./pages/ThankYou'));
const BlogPage = lazy(() => import('./pages/BlogPage'));
const Calculator = lazy(() => import('./pages/Calculator'));
const RoiPage = lazy(() => import('./pages/RoiPage'));
const Admin = lazy(() => import('./pages/Admin'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const Offer = lazy(() => import('./pages/Offer'));
const CookiePolicy = lazy(() => import('./pages/CookiePolicy'));
const FAQPage = lazy(() => import('./pages/FAQPage'));

function LazyWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background flex items-center justify-center text-muted-foreground">Загрузка...</div>}>
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
]);
