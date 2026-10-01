import React from 'react';
import { renderToString } from 'react-dom/server';
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router';
import { AppFrame } from '../src/app/App';
import { routes } from '../src/app/routes';
import { primeSiteContent, resetSiteContentCache } from '../src/app/hooks/useServiceContent';
import {
  loadConsultStudioHero,
  loadCosmicHeroScene,
  loadHero,
  loadHome,
  loadMetaAdsEditorialHero,
  loadMetaAppsHeroVisual,
  loadServiceLandingPage,
} from '../src/app/utils/routePreload';

/**
 * Маршруты, первый экран которых сборка рисует настоящими компонентами, а
 * браузер потом гидратирует (`main.tsx` → `hydrateRoot`), а не перестраивает.
 *
 * Это маркетинговые страницы: на них приходит реклама, и именно на них
 * владелец видел «сначала одна страница, потом другая». Остальные маршруты
 * пока получают прежнюю текстовую оболочку и монтируются поверх неё.
 */
export const SSR_ROUTES = ['/', '/meta-ads', '/meta-apps', '/google-ads', '/consult'] as const;

export type SsrRoute = (typeof SSR_ROUTES)[number];

type RenderRouteOptions = {
  /** Опубликованный в CMS текст страницы — тот же, что уедет в `ww-site-content-seed`. */
  siteContent?: { key: string; content: Record<string, unknown> | null } | null;
};

/** Код первого экрана должен быть загружен до рендера: `preloadable` рисует только готовые модули. */
async function preloadFirstScreenModules(): Promise<void> {
  await Promise.all([
    loadHome(),
    loadServiceLandingPage(),
    loadHero(),
    loadCosmicHeroScene(),
    loadMetaAppsHeroVisual(),
    loadConsultStudioHero(),
    loadMetaAdsEditorialHero(),
  ]);
}

/**
 * Рендерит страницу маршрута так, как её нарисует браузер в первом кадре:
 * те же компоненты, тот же опубликованный текст, тот же каркас `AppFrame`.
 * Отложенные секции остаются заглушками своей высоты — их код не грузится.
 */
export async function renderRoute(route: string, options: RenderRouteOptions = {}): Promise<string> {
  const normalized = route.replace(/\/+$/, '') || '/';
  if (!(SSR_ROUTES as readonly string[]).includes(normalized)) {
    throw new Error(`Route ${route} is not server-rendered. Allowed: ${SSR_ROUTES.join(', ')}`);
  }

  resetSiteContentCache();
  if (options.siteContent) primeSiteContent(options.siteContent.key, options.siteContent.content);
  await preloadFirstScreenModules();

  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request(`https://www.whalewzrd.com${normalized}`));
  if (context instanceof Response) {
    throw new Error(`Route ${route} answered with a redirect (${context.status}) during static rendering`);
  }
  const router = createStaticRouter(handler.dataRoutes, context);

  // Признак «первый экран уже показан» читают Home и лендинги: появления
  // через motion отключаются, иначе текст ушёл бы в HTML с opacity:0.
  globalThis.__WW_SSR_ROUTE__ = normalized;
  try {
    return renderToString(
      <AppFrame>
        <StaticRouterProvider router={router} context={context} hydrate={false} />
      </AppFrame>,
    );
  } finally {
    delete globalThis.__WW_SSR_ROUTE__;
    resetSiteContentCache();
  }
}
