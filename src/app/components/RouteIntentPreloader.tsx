import { memo, useEffect } from 'react';
import { preloadPublicRoute } from '../utils/routePreload';
import { isPathLocked } from '../utils/pageLocks';

const SITE_CONTENT_KEY_BY_PATH: Record<string, string> = {
  '/': 'site:home',
  '/meta-ads': 'service:meta-ads',
  '/google-ads': 'service:google-ads',
  '/consult': 'service:consult',
  '/meta-apps': 'service:meta-apps',
};

function targetRoute(event: Event): string | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;

  const explicit = target.closest<HTMLElement>('[data-route-preload]');
  const explicitRoute = explicit?.dataset.routePreload?.trim();
  if (explicitRoute) return explicitRoute;

  const anchor = target.closest<HTMLAnchorElement>('a[href]');
  if (!anchor || anchor.hasAttribute('download')) return null;
  return anchor.href;
}

function RouteIntentPreloader() {
  useEffect(() => {
    const handleIntent = (event: Event) => {
      const route = targetRoute(event);
      if (!route) return;
      // Код закрытой страницы не скачивается вовсе — ни по наведению, ни при
      // переходе: показывать её всё равно нельзя.
      try {
        const target = new URL(route, window.location.href);
        if (target.origin === window.location.origin && isPathLocked(target.pathname)) return;
      } catch {
        return;
      }
      preloadPublicRoute(route);
      try {
        const url = new URL(route, window.location.href);
        if (url.origin !== window.location.origin) return;
        const key = SITE_CONTENT_KEY_BY_PATH[url.pathname.replace(/\/+$/, '') || '/'];
        if (key) {
          void import('../hooks/useServiceContent')
            .then(({ preloadSiteContent }) => preloadSiteContent(key));
        }
        if (url.pathname === '/faq' || url.pathname === '/faq/') {
          void import('../hooks/useFaqContent').then(({ preloadFaqContent }) => preloadFaqContent());
        }
      } catch {
        // Malformed links are ignored just like unsupported routes.
      }
    };

    document.addEventListener('pointerover', handleIntent, { passive: true });
    document.addEventListener('pointerdown', handleIntent, { passive: true });
    document.addEventListener('focusin', handleIntent);

    return () => {
      document.removeEventListener('pointerover', handleIntent);
      document.removeEventListener('pointerdown', handleIntent);
      document.removeEventListener('focusin', handleIntent);
    };
  }, []);

  return null;
}

export default memo(RouteIntentPreloader);
