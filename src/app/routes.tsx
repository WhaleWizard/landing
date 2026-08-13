import { createBrowserRouter, Outlet, ScrollRestoration, useLocation, useRouteError } from 'react-router';
import { lazy, Suspense, useEffect, useInsertionEffect } from 'react';
import RouteSkeleton from './components/RouteSkeleton';
import ScrollExperience from './components/ScrollExperience';
import RouteIntentPreloader from './components/RouteIntentPreloader';
import { ArticlesProvider } from './context/ArticlesContext';
import { useRememberPublicRoute } from './utils/siteNavigation';
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
  loadMetaAppsHeroVisual,
  loadNotFound,
  loadOffer,
  loadPrivacyPolicy,
  loadRoiPage,
  loadServiceLandingPage,
  loadThankYou,
} from './utils/routePreload';
const CookieConsentManager = lazy(() => import('./components/cookie/CookieConsentManager'));

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

const MetaAdsPage = lazyServiceLanding('meta-ads');
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

function LazyWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<RouteSkeleton />}>
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
    const frame = window.requestAnimationFrame(() => {
      delete document.documentElement.dataset.wwInstantScroll;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.key]);

  return <ScrollRestoration />;
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
      {!isContentPreview ? (
        <>
          <InstantScrollRestoration />
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
