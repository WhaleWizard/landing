import { CACHE_CONTROL, matchCache, putCache } from './cache';
import { fetchArticlesWithFallback, filterVisibleArticles } from './articles';
import {
  buildArticleMeta,
  findArticleBySlugPrefix,
  getArticlePath,
  getArticleSectionPath,
  isBotRequest,
  renderArticleHtml,
  renderArticleNotFoundHtml,
} from './seo';
import type { Article, Env } from './types';

type SectionPath = '/blog' | '/cases';

function getSiteUrl(env: Env, request: Request): string {
  if (env.SITE_URL) return env.SITE_URL.replace(/\/$/, '');
  return new URL(request.url).origin.replace(/\/$/, '');
}

function htmlResponse(html: string, status: number, cacheControl: string): Response {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': cacheControl,
    },
  });
}

function assetRequest(request: Request, path: string): Request {
  return new Request(new URL(path, request.url).toString(), {
    method: 'GET',
    headers: request.headers,
  });
}

/**
 * Ставит на страницу-оболочку SPA мета-теги конкретной статьи.
 *
 * Раньше человеку и любому нераспознанному краулеру отдавался корневой
 * /index.html как есть — с заголовком и `canonical` главной страницы. Google
 * из-за этого помечал материалы как копию главной и не индексировал их.
 */
function applyArticleMeta(response: Response, siteUrl: string, article: Article, sectionPath: SectionPath): Response {
  const meta = buildArticleMeta(siteUrl, article, sectionPath);
  const setContent = (value: string) => ({
    element(element: HTMLRewriterElement) {
      element.setAttribute('content', value);
    },
  });

  return new HTMLRewriter()
    .on('title', {
      element(element) {
        element.setInnerContent(meta.title);
      },
    })
    .on('link[rel="canonical"]', {
      element(element) {
        element.setAttribute('href', meta.canonical);
      },
    })
    .on('link[rel="alternate"][hreflang]', {
      element(element) {
        element.setAttribute('href', meta.canonical);
      },
    })
    .on('meta[name="description"]', setContent(meta.description))
    .on('meta[name="robots"]', setContent('index, follow'))
    .on('meta[property="og:title"]', setContent(meta.title))
    .on('meta[property="og:description"]', setContent(meta.description))
    .on('meta[property="og:type"]', setContent('article'))
    .on('meta[property="og:url"]', setContent(meta.canonical))
    .on('meta[property="og:image"]', setContent(meta.image))
    .on('meta[name="twitter:title"]', setContent(meta.title))
    .on('meta[name="twitter:description"]', setContent(meta.description))
    .on('meta[name="twitter:image"]', setContent(meta.image))
    .on('meta[name="twitter:url"]', setContent(meta.canonical))
    // Структурированные данные статьи сюда не добавляются намеренно: пререндер
    // уже несёт свой блок schema.org, а боты получают полную разметку из
    // renderArticleHtml. Вставка вслепую дала бы две конкурирующие схемы.
    .transform(response);
}

export function createArticlePageHandler(sectionPath: SectionPath): PagesFunction<Env> {
  return async ({ request, params, env, next, waitUntil }) => {
    const requestUrl = new URL(request.url);
    const slug = String(params.slug || '').trim().replace(/\/+$/, '');
    const siteUrl = getSiteUrl(env, request);

    // Канонический адрес статьи — без завершающего слеша. Пока оба варианта
    // отвечали 200, один и тот же материал жил по двум URL.
    if (requestUrl.pathname.endsWith('/') && slug) {
      return Response.redirect(`${siteUrl}${sectionPath}/${slug}`, 301);
    }

    if (!slug) {
      return htmlResponse(renderArticleNotFoundHtml(siteUrl, sectionPath), 404, CACHE_CONTROL.noStore);
    }

    const isBot = isBotRequest(request);
    const cacheKey = new Request(request.url, { method: 'GET' });

    if (isBot) {
      const cached = await matchCache(cacheKey);
      if (cached) return cached;
    }

    let articles: Article[];
    try {
      articles = filterVisibleArticles(await fetchArticlesWithFallback(env, request, waitUntil));
    } catch {
      // Хранилище недоступно. Человеку по-прежнему нужна рабочая страница:
      // SPA догрузит статью сам, поэтому отдаём оболочку без своих мета-тегов.
      if (!isBot) return next(assetRequest(request, `${sectionPath}/${slug}/index.html`));
      return htmlResponse(renderArticleNotFoundHtml(siteUrl, sectionPath), 503, CACHE_CONTROL.noStore);
    }

    const article = articles.find(
      (item) => item.slug === slug && getArticleSectionPath(item) === sectionPath,
    );

    if (!article) {
      const redirectArticle = findArticleBySlugPrefix(articles, slug, sectionPath);
      if (redirectArticle) {
        return Response.redirect(`${siteUrl}${getArticlePath(redirectArticle)}`, 301);
      }

      if (!isBot) {
        // Настоящий 404 вместо страницы-копии: SPA нарисует свой экран
        // «не найдено», а Google получит честный код ответа.
        const shell = await next(assetRequest(request, '/index.html'));
        return new Response(shell.body, {
          status: 404,
          headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': CACHE_CONTROL.noStore,
            'X-Robots-Tag': 'noindex, follow',
          },
        });
      }

      return htmlResponse(renderArticleNotFoundHtml(siteUrl, sectionPath), 404, CACHE_CONTROL.noStore);
    }

    if (!isBot) {
      const shell = await next(assetRequest(request, `${sectionPath}/${slug}/index.html`));
      if (!shell.headers.get('content-type')?.includes('text/html')) return shell;

      const withMeta = applyArticleMeta(shell, siteUrl, article, sectionPath);
      return new Response(withMeta.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': CACHE_CONTROL.botArticle,
        },
      });
    }

    const response = htmlResponse(
      renderArticleHtml(siteUrl, article, sectionPath),
      200,
      CACHE_CONTROL.botArticle,
    );

    waitUntil(putCache(cacheKey, response));
    return response;
  };
}
