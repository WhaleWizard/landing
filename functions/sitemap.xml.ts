import { CACHE_CONTROL, matchCache, putCache } from './_lib/cache';
import { fetchArticlesWithFallback, filterVisibleArticles } from './_lib/articles';
import { renderSitemapXml } from './_lib/seo';
import { xml } from './_lib/http';
import type { Env } from './_lib/types';

const STATIC_ROUTES = ['/', '/blog', '/cases', '/faq', '/marketing-glossary', '/calculator', '/roi-calculator', '/privacy-policy', '/offer', '/cookie-policy', '/feed.xml', '/llms.txt', '/meta-ads', '/google-ads', '/consult', '/meta-apps'];

function getSiteUrl(env: Env, request: Request): string {
  if (env.SITE_URL) return env.SITE_URL.replace(/\/$/, '');
  return new URL(request.url).origin.replace(/\/$/, '');
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const cacheKey = new Request(request.url, { method: 'GET' });
  const cached = await matchCache(cacheKey);
  if (cached) return cached;

  try {
    const siteUrl = getSiteUrl(env, request);
    const articles = filterVisibleArticles(await fetchArticlesWithFallback(env, request));
    const articleRoutes = articles.map((article) => article.category === 'Кейсы' ? `/cases/${article.slug}` : `/blog/${article.slug}`);
    const articleDates = Object.fromEntries(
      articles.map((article) => [
        article.category === 'Кейсы' ? `/cases/${article.slug}` : `/blog/${article.slug}`,
        article.updatedAt || article.publishedAt || new Date().toISOString(),
      ]),
    );

    const sitemapXml = renderSitemapXml(siteUrl, [...STATIC_ROUTES, ...articleRoutes], articleDates);

    const response = xml(sitemapXml, {
      headers: {
        'Cache-Control': CACHE_CONTROL.sitemap,
      },
    });

    waitUntil(putCache(cacheKey, response));
    return response;
  } catch {
    return xml('<!-- sitemap generation failed -->', {
      status: 502,
      headers: {
        'Cache-Control': CACHE_CONTROL.noStore,
      },
    });
  }
};
