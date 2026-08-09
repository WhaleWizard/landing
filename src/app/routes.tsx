import { createBrowserRouter, Outlet, useLocation, useRouteError } from 'react-router';
import { lazy, Suspense, useEffect } from 'react';
import RouteSkeleton from './components/RouteSkeleton';
import { ArticlesProvider } from './context/ArticlesContext';
import { useRememberPublicRoute } from './utils/siteNavigation';
const CookieConsentManager = lazy(() => import('./components/cookie/CookieConsentManager'));

const Home = lazy(() => import('./pages/Home'));
const ThankYou = lazy(() => import('./pages/ThankYou'));
const BlogPage = lazy(() => import('./pages/BlogPage'));
const CasesPage = lazy(() => import('./pages/CasesPage'));
const Calculator = lazy(() => import('./pages/Calculator'));
const RoiPage = lazy(() => import('./pages/RoiPage'));
const Admin = lazy(() => import('./pages/Admin'));
const ContentPreview = lazy(() => import('./pages/ContentPreview'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const Offer = lazy(() => import('./pages/Offer'));
const CookiePolicy = lazy(() => import('./pages/CookiePolicy'));
const FAQPage = lazy(() => import('./pages/FAQPage'));
const MarketingGlossaryPage = lazy(() => import('./pages/MarketingGlossaryPage'));
const NotFound = lazy(() => import('./pages/NotFound'));

type ServiceType = import('./pages/ServiceLandingPage').ServiceType;
type ServicePreload = () => Promise<unknown>;

function lazyServiceLanding(service: ServiceType, preloads: ServicePreload[] = []) {
  return lazy(async () => {
    // Above-the-fold hero chunks start together with the landing module instead
    // of forming a second/third request waterfall after it has evaluated.
    const [module] = await Promise.all([
      import('./pages/ServiceLandingPage'),
      ...preloads.map((preload) => preload()),
    ]);

    return {
      default: function RoutedServiceLanding() {
        return <module.ServiceLandingPage service={service} />;
      },
    };
  });
}

const MetaAdsPage = lazyServiceLanding('meta-ads');
const GoogleAdsPage = lazyServiceLanding('google-ads', [
  () => import('./components/Hero'),
]);
const ConsultPage = lazyServiceLanding('consult', [
  () => import('./components/service-heroes/ConsultStudioHero'),
]);
const MetaAppsPage = lazyServiceLanding('meta-apps', [
  () => import('./components/Hero'),
  () => import('./components/MetaAppsHeroVisual'),
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

function LazyWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
      {children}
    </Suspense>
  );
}


function RootLayout() {
  const location = useLocation();
  useRememberPublicRoute();
  const isAdmin = /^\/admin(?:\/|$)/.test(location.pathname);
  const isContentPreview = location.pathname === '/admin/content-preview';
  const needsArticles = !isContentPreview && (
    location.pathname === '/'
    || /^\/(?:blog|cases|admin)(?:\/|$)/.test(location.pathname)
  );
  const articleInitialLoad = isAdmin
    ? 'manual'
    : location.pathname === '/'
      ? 'deferred'
      : 'immediate';
  const routeContent = <Outlet />;

  return (
    <>
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
      { path: 'admin', element: <LazyWrapper><Admin /></LazyWrapper> },
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
