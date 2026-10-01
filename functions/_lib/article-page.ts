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

/**
 * `Vary: User-Agent` обязателен: этот обработчик отдаёт боту голую SEO-разметку,
 * а человеку — оболочку SPA, то есть содержимое зависит от заголовка запроса.
 * Ответ для бота при этом кэшируемый (`public, s-maxage=300`), и без `Vary`
 * любой общий кэш — CDN, корпоративный прокси — вправе отдать сохранённую
 * версию следующему запросу того же адреса независимо от User-Agent. Человек
 * получил бы страницу без стилей и без React.
 */
function htmlResponse(html: string, status: number, cacheControl: string): Response {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': cacheControl,
      Vary: 'User-Agent',
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

function unavailableArticleShell(): Response {
  return new Response('Страница временно недоступна. Попробуйте обновить её через минуту.', {
    status: 503,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': CACHE_CONTROL.noStore,
      'Retry-After': '60',
    },
  });
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
  if (!sectionShell.ok) {
    // The article exists in the CMS. Missing/broken build assets are a
    // temporary availability problem, never a successful empty article or a
    // permanent article deletion that crawlers should remove from the index.
    return new Response(sectionShell.body, {
      status: sectionShell.status >= 500 ? sectionShell.status : 503,
      headers: {
        'Content-Type': sectionShell.headers.get('content-type') || 'text/html; charset=utf-8',
        'Cache-Control': CACHE_CONTROL.noStore,
        'Retry-After': '60',
      },
    });
  }
  if (!sectionShell.headers.get('content-type')?.includes('text/html')) return unavailableArticleShell();

  // Заголовки собираются заново, а не копируются с исходного ответа. Тело уже
  // прочитано `.text()` и переписано, поэтому старые `Content-Length` и —
  // что опаснее — `Content-Encoding: gzip` описывали бы совсем другое
  // содержимое: браузер попытался бы распаковать обычный текст.
  return new Response(neutralizeSectionShell(await sectionShell.text()), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': CACHE_CONTROL.noStore,
    },
  });
}

/**
 * Нейтральная оболочка раздела: `${sectionPath}/index.html` без хлебных
 * крошек списка и с пустым `<div id="root">`. Она же служит честному 404 для
 * человека: раньше туда уходил корневой `/index.html` — с заголовком и
 * canonical главной, preload-ами картинок хиро на 280 КБ и мельканием первого
 * экрана главной перед тем, как SPA уведёт человека в список раздела.
 */
function neutralizeSectionShell(source: string): string {
  const withoutSectionBreadcrumbs = source.replace(
    /<script\b[^>]*\bid=(["'])ld-breadcrumbs\1[^>]*>[\s\S]*?<\/script>\s*/gi,
    '',
  );
  return withoutSectionBreadcrumbs.replace(
    /(<body\b[^>]*>)[\s\S]*?<\/body>/i,
    '$1<div id="root"></div></body>',
  );
}

/**
 * 404 для человека на оболочке раздела. Разметка приводится в согласие с
 * заголовком `X-Robots-Tag`: `robots` → `noindex, follow`, canonical и
 * hreflang убираются — иначе ответ противоречил бы сам себе. SPA на этом
 * адресе рисует BlogPage и уводит в список раздела; `dist/404.html` здесь не
 * подходит: он заставил бы качать чанк и картинки экрана NotFound впустую.
 */
async function notFoundSectionShell(
  request: Request,
  next: (request?: Request) => Promise<Response>,
  siteUrl: string,
  sectionPath: SectionPath,
): Promise<Response> {
  const notFoundHeaders = {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': CACHE_CONTROL.noStore,
    'X-Robots-Tag': 'noindex, follow',
  };
  const sectionShell = await next(assetRequest(request, `${sectionPath}/index.html`));
  if (!sectionShell.ok || !sectionShell.headers.get('content-type')?.includes('text/html')) {
    // К корневому /index.html не возвращаемся ни при каких условиях.
    return new Response(renderArticleNotFoundHtml(siteUrl, sectionPath), { status: 404, headers: notFoundHeaders });
  }

  const neutral = new Response(neutralizeSectionShell(await sectionShell.text()), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
  const marked = new HTMLRewriter()
    .on('meta[name="robots"]', {
      element(element) {
        element.setAttribute('content', 'noindex, follow');
      },
    })
    .on('link[rel="canonical"]', {
      element(element) {
        element.remove();
      },
    })
    .on('link[rel="alternate"][hreflang]', {
      element(element) {
        element.remove();
      },
    })
    .transform(neutral);
  return new Response(marked.body, { status: 404, headers: notFoundHeaders });
}

/**
 * HEAD как GET без тела.
 *
 * Cloudflare Pages для HEAD без своего обработчика отдаёт статику: статья
 * уходила в 308 на адрес со слешем, а `/feed.xml` и `/api/articles` отвечали
 * 404. SEO-сервисы, мониторинги и агрегаторы лент проверяют адреса именно
 * HEAD-ом и видели цепочки редиректов и «битую» ленту. Заголовки копируются
 * целиком — `Location` у 301 и `X-Robots-Tag` у 404 должны совпадать с GET.
 * Ключи кэша внутри обработчиков строятся с `method: 'GET'`, а статика
 * запрашивается через `assetRequest` тоже GET-ом, поэтому HEAD ничего не
 * дублирует.
 */
export function headFromGet(handler: PagesFunction<Env>): PagesFunction<Env> {
  return async (context) => {
    const response = await handler(context);
    // Не ждать: тело уже разветвлено `clone()`-ом для записи в кэш, а отмена
    // одной ветки по спецификации потоков завершается только когда закрыта
    // вторая — то есть после того, как кэш дочитает свою копию.
    void response.body?.cancel().catch(() => undefined);
    return new Response(null, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  };
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
    const cacheKey = new Request(new URL(requestUrl.pathname, requestUrl.origin).toString(), { method: 'GET' });

    if (isBot) {
      try {
        const cached = await matchCache(cacheKey);
        if (cached) return cached;
      } catch {
        // An unavailable cache must not hide an otherwise healthy CMS article.
      }
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
      // Статья переехала между блогом и кейсами (владелец сменил категорию).
      // Старый адрес уже в индексе и в ссылках из соцсетей: 404 выбросил бы
      // его из поиска вместе с позициями, поэтому 301 на правильный раздел —
      // и человеку, и боту. Зацикливание невозможно: найденная статья лежит
      // в другом разделе, иначе её нашёл бы поиск выше; черновики и будущие
      // даты уже отфильтрованы. 301 в кэш бота не пишется (`putCache` — только
      // для 200), query (UTM, gclid) сохраняется.
      const moved = articles.find((item) => item.slug === slug);
      if (moved) {
        return articleRedirect(requestUrl, siteUrl, getArticlePath(moved));
      }

      const redirectArticle = findArticleBySlugPrefix(articles, slug, sectionPath);
      if (redirectArticle) {
        return articleRedirect(requestUrl, siteUrl, getArticlePath(redirectArticle));
      }

      if (!isBot) {
        // Честный 404 на нейтральной оболочке раздела: SPA на этом адресе
        // перенаправляет человека в список раздела, а Google получает честный
        // код ответа. Корневой /index.html сюда не подставляется (см.
        // notFoundSectionShell).
        return notFoundSectionShell(request, next, siteUrl, sectionPath);
      }

      return htmlResponse(renderArticleNotFoundHtml(siteUrl, sectionPath), 404, CACHE_CONTROL.noStore);
    }

    if (!isBot) {
      const shell = await getArticleShell(request, next, `${sectionPath}/${slug}`, sectionPath);
      if (!shell.ok) return shell;
      if (!shell.headers.get('content-type')?.includes('text/html')) return unavailableArticleShell();

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

    waitUntil(putCache(cacheKey, response).catch(() => undefined));
    return response;
  };
}
