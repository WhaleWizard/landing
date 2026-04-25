export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  if (!headers.has('Cache-Control')) {
    headers.set('Cache-Control', 'no-store');
  }
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function text(body: string, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'text/plain; charset=utf-8');
  }
  return new Response(body, { ...init, headers });
}

export function xml(body: string, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/xml; charset=utf-8');
  return new Response(body, { ...init, headers });
}

export function getClientIp(request: Request): string {
  const cfIp = request.headers.get('CF-Connecting-IP');
  if (cfIp) return cfIp;

  const host = new URL(request.url).hostname;
  if (host === 'localhost' || host === '127.0.0.1') {
    return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  }

  return 'unknown';
}
