import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { build } from 'esbuild';

async function bundleTypeScript(path) {
  const result = await build({
    entryPoints: [path],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'node',
    write: false,
  });
  const code = `${result.outputFiles[0].text}\n//${randomUUID()}`;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('site-content API separates browser revalidation from Cloudflare edge caching', async () => {
  const { onRequestGet } = await bundleTypeScript('functions/api/site-content.ts');
  const row = {
    published_json: JSON.stringify({ hero: { title: 'Fresh title' } }),
    published_version: 7,
    published_at: '2026-08-13T10:00:00.000Z',
  };
  const env = {
    DB: {
      prepare: () => ({
        bind: () => ({ first: async () => row }),
      }),
    },
  };

  const response = await onRequestGet({
    request: new Request('https://example.test/api/site-content?key=site%3Ahome'),
    env,
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=0, must-revalidate');
  assert.equal(
    response.headers.get('Cloudflare-CDN-Cache-Control'),
    'public, max-age=60, stale-if-error=300',
  );
  assert.equal(response.headers.get('ETag'), '"site-content-site-home-7"');

  const revalidated = await onRequestGet({
    request: new Request('https://example.test/api/site-content?key=site%3Ahome', {
      headers: { 'If-None-Match': response.headers.get('ETag') },
    }),
    env,
  });
  assert.equal(revalidated.status, 304);
  assert.equal(await revalidated.text(), '');
});

test('parallel preloads share one request and cache an authoritative null response', async (t) => {
  const { preloadSiteContent } = await bundleTypeScript('src/app/hooks/useServiceContent.ts');
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let resolveRequest;
  let requests = 0;
  globalThis.fetch = () => {
    requests += 1;
    return new Promise((resolve) => {
      resolveRequest = () => resolve(jsonResponse({ success: true, content: null, source: 'static' }));
    });
  };

  const first = preloadSiteContent('site:home');
  const second = preloadSiteContent('site:home');
  assert.equal(requests, 1);
  resolveRequest();
  assert.deepEqual(await Promise.all([first, second]), [null, null]);
  assert.equal(await preloadSiteContent('site:home'), null);
  assert.equal(requests, 1);
});

test('expired cache revalidates but an older published version cannot downgrade it', async (t) => {
  const { preloadSiteContent, SITE_CONTENT_CACHE_TTL_MS } = await bundleTypeScript('src/app/hooks/useServiceContent.ts');
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  t.after(() => {
    globalThis.fetch = originalFetch;
    Date.now = originalNow;
  });
  let now = 10_000;
  Date.now = () => now;
  const payloads = [
    { success: true, content: { hero: { title: 'Version 2' } }, version: 2 },
    { success: true, content: { hero: { title: 'Version 1' } }, version: 1 },
  ];
  let requests = 0;
  globalThis.fetch = async () => {
    const payload = payloads[requests];
    requests += 1;
    return jsonResponse(payload);
  };

  assert.deepEqual(await preloadSiteContent('site:home'), { hero: { title: 'Version 2' } });
  now += SITE_CONTENT_CACHE_TTL_MS + 1;
  assert.deepEqual(await preloadSiteContent('site:home'), { hero: { title: 'Version 2' } });
  assert.equal(requests, 2);
  assert.deepEqual(await preloadSiteContent('site:home'), { hero: { title: 'Version 2' } });
  assert.equal(requests, 2);
});

test('an HTTP failure does not poison the module cache with a static fallback', async (t) => {
  const { preloadSiteContent } = await bundleTypeScript('src/app/hooks/useServiceContent.ts');
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let requests = 0;
  globalThis.fetch = async () => {
    requests += 1;
    return requests === 1
      ? jsonResponse({ success: false }, 503)
      : jsonResponse({ success: true, content: { seo: { title: 'Recovered' } }, version: 3 });
  };

  assert.equal(await preloadSiteContent('site:home'), undefined);
  assert.deepEqual(await preloadSiteContent('site:home'), { seo: { title: 'Recovered' } });
  assert.equal(requests, 2);
});
