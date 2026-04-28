import type { Env } from './_lib/types';

const CANONICAL_HOST = 'www.whalewzrd.com';
const LEGACY_HOSTS = new Set(['whalewzrd.com']);

export const onRequest: PagesFunction<Env> = async ({ request, next }) => {
  const url = new URL(request.url);

  if (LEGACY_HOSTS.has(url.hostname)) {
    const redirectUrl = new URL(request.url);
    redirectUrl.hostname = CANONICAL_HOST;
    redirectUrl.protocol = 'https:';
    return Response.redirect(redirectUrl.toString(), 301);
  }

  return next();
};
