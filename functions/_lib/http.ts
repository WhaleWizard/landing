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

export type RequestTextResult =
  | { ok: true; text: string; bytes: number }
  | { ok: false; error: 'payload_too_large'; maxBytes: number };

// `request.text()` has no upper bound and allocates the whole body before the
// handler can reject it. Tracking endpoints are public, so read their UTF-8
// JSON streams incrementally and stop as soon as the endpoint-specific limit
// is exceeded.
export async function readRequestText(request: Request, maxBytes: number): Promise<RequestTextResult> {
  const limit = Math.max(1, Math.floor(maxBytes));
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > limit) {
    return { ok: false, error: 'payload_too_large', maxBytes: limit };
  }

  if (!request.body) return { ok: true, text: '', bytes: 0 };
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let textValue = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > limit) {
        await reader.cancel('payload_too_large').catch(() => undefined);
        return { ok: false, error: 'payload_too_large', maxBytes: limit };
      }
      textValue += decoder.decode(value, { stream: true });
    }
    textValue += decoder.decode();
    return { ok: true, text: textValue, bytes };
  } finally {
    reader.releaseLock();
  }
}
