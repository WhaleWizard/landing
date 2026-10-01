import React from 'react';
import { renderToString } from 'react-dom/server';
import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router';
import { JSDOM } from 'jsdom';
import { AppFrame } from '../src/app/App';
import { routes } from '../src/app/routes';
import { primeSiteContent, resetSiteContentCache } from '../src/app/hooks/useServiceContent';
import { articleVersion, primeArticleSeed } from '../src/app/context/ArticlesContext';
import { bindSanitizerWindow } from '../src/app/utils/sanitizeHtml';
import { isCaseArticle } from '../src/app/utils/articleCategory';
import type { Article } from '../src/app/components/hooks/useArticlesApi';
import {
  loadBlogPage,
  loadCaseArticleView,
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
 * владелец видел «сначала одна страница, потом другая». Страницы статей и
 * кейсов рендерятся так же (см. `SSR_ARTICLE_ROUTE`): на них приходит
 * трафик из поиска, а до этого они встречали читателя общей карточкой
 * «Загружаем…». Остальные маршруты пока получают прежнюю текстовую
 * оболочку и монтируются поверх неё.
 */
export const SSR_ROUTES = ['/', '/meta-ads', '/meta-apps', '/google-ads', '/consult'] as const;

export type SsrRoute = (typeof SSR_ROUTES)[number];

/** Страница статьи или кейса: рендерится из той статьи, что уедет в `ww-article-seed`. */
export const SSR_ARTICLE_ROUTE = /^\/(blog|cases)\/([^/]+)$/;

export { articleVersion };

type RenderRouteOptions = {
  /** Опубликованный в CMS текст страницы — тот же, что уедет в `ww-site-content-seed`. */
  siteContent?: { key: string; content: Record<string, unknown> | null } | null;
  /** Статья для маршрута `/blog/:slug` или `/cases/:slug` — та же, что уедет в `ww-article-seed`. */
  articleSeed?: Article | null;
};

function normalizeRoute(route: string): string {
  return route.replace(/\/+$/, '') || '/';
}

export function isSsrArticleRoute(route: string): boolean {
  return SSR_ARTICLE_ROUTE.test(normalizeRoute(route));
}

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
    loadBlogPage(),
    loadCaseArticleView(),
  ]);
}

let sanitizerBound = false;

/**
 * DOMPurify в браузере привязан к window; на сборке окна нет, и санитайзер
 * статей отказывается работать (см. `sanitizeHtml.ts`). Окно даёт jsdom —
 * тот же движок, что у санитайзера генератора. Глобальный `window` при этом
 * не трогаем: по нему код различает сервер и браузер.
 */
function ensureSanitizerWindow(): void {
  if (sanitizerBound) return;
  const { window } = new JSDOM('<!doctype html><html><body></body></html>');
  bindSanitizerWindow(window as unknown as Parameters<typeof bindSanitizerWindow>[0]);
  sanitizerBound = true;
}

function assertArticleMatchesRoute(route: string, article: Article): void {
  const match = route.match(SSR_ARTICLE_ROUTE);
  if (!match) return;
  const [, section, slug] = match;
  if (article.slug !== slug) {
    throw new Error(`Route ${route} received article "${article.slug}" instead of "${slug}"`);
  }
  const wantsCase = section === 'cases';
  if (isCaseArticle(article) !== wantsCase) {
    throw new Error(`Route ${route} and article "${article.slug}" disagree on whether it is a case`);
  }
  if (!article.content) {
    throw new Error(`Route ${route}: article "${article.slug}" has no content to render`);
  }
}

/**
 * Рендерит страницу маршрута так, как её нарисует браузер в первом кадре:
 * те же компоненты, тот же опубликованный текст, тот же каркас `AppFrame`.
 * Отложенные секции остаются заглушками своей высоты — их код не грузится.
 */
export async function renderRoute(route: string, options: RenderRouteOptions = {}): Promise<string> {
  const normalized = normalizeRoute(route);
  const isArticle = SSR_ARTICLE_ROUTE.test(normalized);
  if (!(SSR_ROUTES as readonly string[]).includes(normalized) && !isArticle) {
    throw new Error(`Route ${route} is not server-rendered. Allowed: ${SSR_ROUTES.join(', ')} and article pages`);
  }
  if (isArticle) {
    if (!options.articleSeed) throw new Error(`Route ${route} is an article page and needs its article (articleSeed)`);
    assertArticleMatchesRoute(normalized, options.articleSeed);
    ensureSanitizerWindow();
  }

  resetSiteContentCache();
  if (options.siteContent) primeSiteContent(options.siteContent.key, options.siteContent.content);
  primeArticleSeed(isArticle && options.articleSeed ? [options.articleSeed] : null);
  await preloadFirstScreenModules();

  const handler = createStaticHandler(routes);
  const context = await handler.query(new Request(`https://www.whalewzrd.com${normalized}`));
  if (context instanceof Response) {
    throw new Error(`Route ${route} answered with a redirect (${context.status}) during static rendering`);
  }
  const router = createStaticRouter(handler.dataRoutes, context);

  // Признак «первый экран уже показан» читают Home, лендинги и страница
  // статьи: появления через motion отключаются, иначе текст ушёл бы в HTML
  // с opacity:0.
  globalThis.__WW_SSR_ROUTE__ = normalized;
  try {
    return renderToString(
      <AppFrame>
        <StaticRouterProvider router={router} context={context} hydrate={false} />
      </AppFrame>,
    );
  } finally {
    delete globalThis.__WW_SSR_ROUTE__;
    primeArticleSeed(null);
    resetSiteContentCache();
  }
}
