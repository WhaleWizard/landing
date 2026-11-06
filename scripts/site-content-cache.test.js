import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { build } from 'esbuild';
import { loadPublishedSiteContent } from './site-content-sync.js';

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

test('About drafts stay private and the SEO build reads the published About revision', async (t) => {
  const originalCaches = globalThis.caches;
  const originalFetch = globalThis.fetch;
  const hook = 'https://api.cloudflare.com/client/v4/pages/webhooks/deploy_hooks/local-test-only';
  let buildRequests = 0;
  globalThis.caches = { default: { match: async () => undefined, put: async () => {}, delete: async () => true } };
  globalThis.fetch = async (url, options) => {
    assert.equal(url, hook);
    assert.equal(options.method, 'POST');
    buildRequests += 1;
    return new Response(null, { status: 200 });
  };
  t.after(() => { globalThis.caches = originalCaches; globalThis.fetch = originalFetch; });
  const [admin, publicApi] = await Promise.all([
    bundleTypeScript('functions/api/admin/site-sections.ts'),
    bundleTypeScript('functions/api/site-content.ts'),
  ]);
  const sqlite = new DatabaseSync(':memory:');
  t.after(() => sqlite.close());
  sqlite.exec(readFileSync('migrations/0013_site_sections.sql', 'utf8'));
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return { bind: (...args) => ({
        first: async () => statement.get(...args) ?? null,
        all: async () => ({ results: statement.all(...args) }),
        run: async () => statement.run(...args),
      }) };
    },
    batch: async (statements) => Promise.all(statements.map((statement) => statement.run())),
  };
  const env = { DB: db, ADMIN_PASSWORD: 'local-test-only', CF_PAGES_DEPLOY_HOOK_URL: hook };
  const endpoint = 'https://example.test/api/site-content';
  const publicRead = (url = endpoint + '?key=site%3Aabout') => publicApi.onRequestGet({ request: new Request(url), env });
  const write = async (action, title) => {
    const response = await admin.onRequestPost({
      env, waitUntil: () => {},
      request: new Request('https://example.test/api/admin/site-sections', {
        method: 'POST',
        headers: { 'X-Admin-Password': env.ADMIN_PASSWORD, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action, key: 'site:about', pagePath: '/unrelated',
          content: {
            seo: { title, description: 'Отредактированное описание' },
            aboutStory: { title, paragraphs: [] },
            aboutProjects: { items: [{ title: 'Проект', text: 'Текст', href: 'javascript:alert(1)', linkLabel: 'Ссылка' }] },
            hiddenSections: ['aboutWork', 'aboutIntro', 'unknown'],
          },
        }),
      }),
    });
    const payload = await response.json();
    assert.equal(response.status, 200, JSON.stringify(payload));
    assert.equal(Boolean(payload.seoBuild?.triggered), action === 'publish');
  };

  await write('save', 'Только черновик');
  assert.equal((await (await publicRead()).json()).source, 'static');
  await write('publish', 'На сайте');
  await write('save', 'Следующий черновик');
  assert.equal(buildRequests, 1);
  const live = await (await publicRead()).json();
  assert.equal(live.version, 2);
  assert.deepEqual(live.content.aboutStory, { title: 'На сайте', paragraphs: [] });
  assert.deepEqual(live.content.hiddenSections, ['aboutWork']);
  assert.equal(live.content.aboutProjects.items[0].href, '');
  assert.equal(sqlite.prepare('SELECT page_path FROM site_sections').get().page_path, '/about');
  const content = await loadPublishedSiteContent({ endpoint, strict: true, fetchImpl: publicRead, logger: { warn() {} } });
  assert.deepEqual(content['site:about'], live.content);
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
