import { CACHE_CONTROL, matchCache, putCache } from './cache';
import { fetchArticleCandidatesWithFallback, filterVisibleArticles } from './articles';
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

function serializeInlineJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function articleRedirect(requestUrl: URL, siteUrl: string, path: string): Response {
  const target = new URL(path, `${siteUrl}/`);
  target.search = requestUrl.search;
  return Response.redirect(target.toString(), 301);
}

async function getArticleShell(
  request: Request,
  next: (request?: Request) => Promise<Response>,
  path: string,
  sectionPath: SectionPath,
): Promise<Response> {
  const articleShell = await next(assetRequest(request, `${path}/index.html`));
  if (articleShell.ok || articleShell.status !== 404) return articleShell;

  // A CMS article can be published between static builds. In that short window
  // its generated directory does not exist yet. The section shell already has
  // the BlogPage chunk and route CSS, while the root shell would eagerly fetch
  // the home hero and Home-only chunks before discovering the article route.
  const sectionShell = await next(assetRequest(request, `${sectionPath}/index.html`));
  if (!sectionShell.headers.get('content-type')?.includes('text/html')) return articleShell;

  const source = await sectionShell.text();
  const withoutSectionBreadcrumbs = source.replace(
    /<script\b[^>]*\bid=(["'])ld-breadcrumbs\1[^>]*>[\s\S]*?<\/script>\s*/gi,
    '',
  );
  const neutral = withoutSectionBreadcrumbs.replace(
    /(<body\b[^>]*>)[\s\S]*?<\/body>/i,
    '$1<div id="root"></div></body>',
  );
  return new Response(neutral, { status: 200, headers: sectionShell.headers });
}

/**
 * Ставит на страницу-оболочку SPA мета-теги конкретной статьи.
 *
 * Раньше человеку и любому нераспознанному краулеру отдавался корневой
 * /index.html как есть — с заголовком и `canonical` главной страницы. Google
 * из-за этого помечал материалы как копию главной и не индексировал их.
 */
function applyArticleMeta(
  response: Response,
  siteUrl: string,
  article: Article,
  sectionPath: SectionPath,
): Response {
  const meta = buildArticleMeta(siteUrl, article, sectionPath);
  const articleSeed = serializeInlineJson(article);
  const setContent = (value: string) => ({
    element(element: HTMLRewriterElement) {
      element.setAttribute('content', value);
    },
  });

  const rewriter = new HTMLRewriter()
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
    // Remove any build-time snapshot and append exactly one live, safely
    // serialized article. This also seeds the neutral section-shell fallback
    // used before a newly published article goes through a static build.
    .on('script#ww-article-seed', {
      element(element) {
        element.remove();
      },
    })
    .on('head', {
      element(element) {
        element.append(
          `<script type="application/json" id="ww-article-seed">${articleSeed}</script>`,
          { html: true },
        );
      },
    });

  return rewriter
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
      return articleRedirect(requestUrl, siteUrl, `${sectionPath}/${slug}`);
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
      articles = filterVisibleArticles(await fetchArticleCandidatesWithFallback(env, request, slug));
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
        return articleRedirect(requestUrl, siteUrl, getArticlePath(redirectArticle));
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
      const shell = await getArticleShell(request, next, `${sectionPath}/${slug}`, sectionPath);
      if (!shell.headers.get('content-type')?.includes('text/html')) return shell;

      const withMeta = applyArticleMeta(shell, siteUrl, article, sectionPath);
      return new Response(withMeta.body, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          // The HTML carries the current article payload. Do not let a browser
          // or intermediary retain an older CMS revision as its next seed.
          'Cache-Control': CACHE_CONTROL.noStore,
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
