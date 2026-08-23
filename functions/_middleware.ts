import { normalizeFormState, renderPageLockResponse } from './_lib/page-lock-page';
import { createFormStamp, resolvePreviewAccess } from './_lib/page-lock-preview';
import {
  findPageLock,
  normalizePagePath,
  readPageLockSnapshot,
  readSubscriberFields,
  serializeLockPaths,
  type PageLockSnapshot,
} from './_lib/page-locks';
import type { Env } from './_lib/types';

const CANONICAL_HOST = 'www.whalewzrd.com';
const LEGACY_HOSTS = new Set(['whalewzrd.com']);

const IS_DEV = false;

/** Как отработала форма на заглушке: ?ww=ok, ?ww=email и так далее. */
const LOCK_STATE_QUERY = 'ww';

function buildCsp(): string {
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self' https://www.facebook.com https://connect.facebook.net https://www.googletagmanager.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://www.google-analytics.com https://mc.yandex.ru https://mc.yandex.com https://mc.webvisor.org https://mc.webvisor.com https://connect.facebook.net https://analytics.tiktok.com",
    "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://stats.g.doubleclick.net https://www.googletagmanager.com https://www.google.com https://mc.yandex.ru https://mc.yandex.com wss://mc.yandex.ru wss://mc.yandex.com https://mc.webvisor.org https://mc.webvisor.com https://connect.facebook.net https://www.facebook.com https://graph.facebook.com https://analytics.tiktok.com https://api.jsonbin.io https://script.google.com https://ipwho.is",
    // Метрика ставит собственный кадр на mc.yandex.ru и без него писала в
    // консоль ошибку CSP на каждой странице: домены счётчика есть в script-src
    // и connect-src, а во frame-src их забыли. Вебвизор живёт на своих доменах,
    // поэтому они здесь тоже нужны.
    "frame-src 'self' https://www.googletagmanager.com https://www.facebook.com https://connect.facebook.net https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://mc.yandex.ru https://mc.yandex.com https://mc.webvisor.org https://mc.webvisor.com",
    "manifest-src 'self'",
    'upgrade-insecure-requests',
  ];

  if (IS_DEV) directives.push("script-src-elem 'self' 'unsafe-inline' 'unsafe-eval'");

  return directives.join('; ');
}

function withSecurityHeaders(response: Response, request: Request, previewActive = false): Response {
  const headers = new Headers(response.headers);

  // JSON служебных эндпоинтов не должен попадать в поиск как отдельная
  // страница. Закрывать их в robots.txt нельзя: тогда Googlebot не сможет
  // прочитать /api/articles при рендеринге блога и увидит пустой список.
  if (new URL(request.url).pathname.startsWith('/api/')) {
    headers.set('X-Robots-Tag', 'noindex, nofollow');
  }

  // Страница, открытая по ссылке предпросмотра, для всех остальных закрыта.
  // Её нельзя ни отдать из общего кэша, ни пустить в индекс.
  if (previewActive) {
    headers.set('X-Robots-Tag', 'noindex, nofollow');
    headers.set('Cache-Control', 'private, no-store');
  }

  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  headers.set('Content-Security-Policy', buildCsp());
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Запрос за страницей сайта, а не за файлом, служебным адресом или админкой.
 *
 * Картинки, шрифты и скрипты проверку блокировок вообще не проходят — иначе
 * каждая мелочь на странице стоила бы лишней работы. `/admin` и `/api/*`
 * исключены жёстко: закрыть себе вход в админку или приём заявок нельзя.
 */
function isPageRequest(request: Request, url: URL): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;

  const path = url.pathname;
  if (path.startsWith('/api/')) return false;
  if (path === '/admin' || path.startsWith('/admin/')) return false;

  const lastSegment = path.slice(path.lastIndexOf('/') + 1);
  return !lastSegment.includes('.');
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Вписывает список закрытых страниц в HTML.
 *
 * Внутри сайта переходы обрабатывает React и на сервер за новой страницей не
 * идёт. Список в разметке даёт ему знать о блокировках с нулевого байта: без
 * лишнего запроса, без мигания закрытой страницы и без загрузки её кода.
 */
function injectLockState(response: Response, snapshot: PageLockSnapshot, previewActive: boolean): Response {
  const contentType = response.headers.get('Content-Type') || '';
  if (!response.body || !contentType.includes('text/html')) return response;

  const locks = escapeAttribute(serializeLockPaths(snapshot.locks));
  const markup = `<meta name="ww-page-locks" content="${locks}">`
    + (previewActive ? '<meta name="ww-page-preview" content="1">' : '');

  return new HTMLRewriter()
    .on('head', {
      element(element) {
        element.append(markup, { html: true });
      },
    })
    .transform(response);
}

export const onRequest: PagesFunction<Env> = async ({ request, env, next, waitUntil }) => {
  const url = new URL(request.url);

  if (LEGACY_HOSTS.has(url.hostname)) {
    const redirectUrl = new URL(request.url);
    redirectUrl.hostname = CANONICAL_HOST;
    redirectUrl.protocol = 'https:';
    return withSecurityHeaders(Response.redirect(redirectUrl.toString(), 301), request);
  }

  if (!isPageRequest(request, url)) {
    return withSecurityHeaders(await next(), request);
  }

  const preview = await resolvePreviewAccess(request, env, url);
  if (preview.redirect) return withSecurityHeaders(preview.redirect, request);

  const snapshot = await readPageLockSnapshot(env, waitUntil);
  if (snapshot.locks.length === 0 && !preview.active) {
    return withSecurityHeaders(await next(), request);
  }

  const lock = findPageLock(snapshot.locks, url.pathname);
  if (lock && !preview.active) {
    const response = renderPageLockResponse({
      lock,
      path: normalizePagePath(url.pathname),
      formState: normalizeFormState(url.searchParams.get(LOCK_STATE_QUERY)),
      formStamp: lock.showSubscribe ? await createFormStamp(env) : '',
      fields: lock.showSubscribe ? await readSubscriberFields(env) : undefined,
      // Подсказки «куда пойти» не должны вести на вторую заглушку подряд.
      otherLocks: snapshot.locks,
    });
    return withSecurityHeaders(response, request);
  }

  const response = await next();
  return withSecurityHeaders(injectLockState(response, snapshot, preview.active), request, preview.active);
};
