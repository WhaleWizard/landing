import assert from 'node:assert/strict';
import { randomUUID, webcrypto } from 'node:crypto';
import test from 'node:test';
import { build } from 'esbuild';
import { parseHTML } from 'linkedom';

globalThis.crypto ??= webcrypto;

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

class FakeD1 {
  constructor(rows = []) {
    this.rows = rows;
    this.error = null;
    this.queries = [];
  }

  prepare(sql) {
    if (/PRAGMA table_info\(articles\)/i.test(sql)) {
      return {
        all: async () => ({
          results: Object.keys(this.rows[0] || d1Row('schema')).map((name) => ({ name })),
        }),
      };
    }

    assert.match(sql, /SELECT[\s\S]+FROM articles/i);
    const query = { sql, bindings: [] };
    this.queries.push(query);
    const statement = {
      bind: (...bindings) => {
        query.bindings = bindings;
        return statement;
      },
      all: async () => {
        if (this.error) throw this.error;
        if (!/\bWHERE\b/i.test(sql)) {
          const isSummaryQuery = /''\s+AS\s+content/i.test(sql);
          const schemaHasStatus = this.rows.length === 0
            || Object.prototype.hasOwnProperty.call(this.rows[0], 'status');
          if (isSummaryQuery && !schemaHasStatus && /faq_json\s*,\s*status\b/i.test(sql)) {
            throw new Error('D1_ERROR: no such column: status');
          }

          const rows = isSummaryQuery
            ? this.rows.map((row) => ({ ...row, content: '' }))
            : this.rows;
          if (/['"]published['"]\s+AS\s+status/i.test(sql)) {
            return { results: rows.map((row) => ({ ...row, status: 'published' })) };
          }
          return { results: rows };
        }

        const [slug, prefixStart] = query.bindings;
        const exactOnly = query.bindings.length === 1;
        return {
          results: this.rows.filter((row) => (
            row.slug === slug || (!exactOnly && row.slug.startsWith(String(prefixStart || '')))
          )),
        };
      },
    };
    return statement;
  }
}

class FakeBucket {
  constructor() {
    this.objects = new Map();
  }

  async put(key, value, options) {
    this.objects.set(key, { value: String(value), options });
  }

  async get(key) {
    const stored = this.objects.get(key);
    if (!stored) return null;
    const bytes = new TextEncoder().encode(stored.value);
    return {
      key,
      size: bytes.byteLength,
      uploaded: new Date(),
      arrayBuffer: async () => bytes.buffer,
    };
  }
}

function d1Row(slug, id = 1) {
  return {
    id,
    slug,
    title: `Title ${slug}`,
    category: 'Blog',
    read_time: '5 min',
    date: '2026-08-09',
    description: `Description ${slug}`,
    content: `<p>${slug}</p>`,
    image: '/og-image-v2.jpg',
    seo_title: null,
    seo_description: null,
    published_at: '2026-08-09T10:00:00.000Z',
    updated_at: '2026-08-09T10:00:00.000Z',
    tags_json: '[]',
    summary: '',
    key_takeaways_json: '[]',
    faq_json: '[]',
    status: 'published',
    case_data_json: null,
  };
}

function seedArticle(slug, id = 1) {
  return {
    id,
    slug,
    title: `Seed ${slug}`,
    category: 'Blog',
    readTime: '5 min',
    date: '2026-08-09',
    description: `Description ${slug}`,
    content: `<p>${slug}</p>`,
    image: '/og-image-v2.jpg',
    status: 'published',
  };
}

function makeEnv({ db, bucket = new FakeBucket(), emergency = false } = {}) {
  return {
    DB: db,
    BUCKET: bucket,
    ADMIN_PASSWORD: 'runtime-article-test-secret-with-enough-entropy',
    SITE_URL: 'https://www.whalewzrd.com',
    USE_D1_ARTICLES: 'true',
    ALLOW_EMERGENCY_ARTICLE_SEED: emergency ? 'true' : 'false',
    JSONBIN_BIN_ID: 'must-not-be-read',
    JSONBIN_MASTER_KEY: 'must-not-be-read',
  };
}

function makeWaitUntil() {
  const pending = [];
  return {
    waitUntil: (promise) => pending.push(promise),
    flush: async () => {
      await Promise.all(pending.splice(0));
    },
    pending,
  };
}

function blockNetwork(t) {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    throw new Error('unexpected network access');
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  return calls;
}

class TestHTMLRewriter {
  constructor() {
    this.handlers = [];
  }

  on(selector, handlers) {
    this.handlers.push({ selector, handlers });
    return this;
  }

  transform(response) {
    const registeredHandlers = this.handlers;
    const body = new ReadableStream({
      async start(controller) {
        try {
          const source = await response.text();
          const { document } = parseHTML(source);

          for (const { selector, handlers } of registeredHandlers) {
            for (const node of document.querySelectorAll(selector)) {
              const element = {
                setAttribute(name, value) {
                  node.setAttribute(name, value);
                  return element;
                },
                getAttribute(name) {
                  return node.getAttribute(name);
                },
                setInnerContent(content, options) {
                  if (options?.html) node.innerHTML = content;
                  else node.textContent = content;
                  return element;
                },
                append(content, options) {
                  if (options?.html) node.insertAdjacentHTML('beforeend', content);
                  else node.append(document.createTextNode(content));
                  return element;
                },
                remove() {
                  node.remove();
                  return element;
                },
              };
              await handlers.element?.(element);
            }
          }

          const output = `<!doctype html>${document.documentElement.outerHTML}`;
          controller.enqueue(new TextEncoder().encode(output));
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    return new Response(body, {
      status: response.status,
      headers: response.headers,
    });
  }
}

globalThis.HTMLRewriter = TestHTMLRewriter;

const {
  fetchArticleWithFallback,
  fetchArticleCandidatesWithFallback,
  fetchArticleSummariesWithFallback,
  fetchArticlesWithFallback,
  shouldUseD1Articles,
} = await bundleTypeScript('functions/_lib/articles.ts');
const { createArticlePageHandler } = await bundleTypeScript('functions/_lib/article-page.ts');
const { onRequestGet: getPublicArticles } = await bundleTypeScript('functions/api/articles.ts');
const request = new Request('https://www.whalewzrd.com/api/articles');

function articleShell(seed = null, marker = 'article-shell') {
  const seedScript = seed === null
    ? ''
    : `<script type="application/json" id="ww-article-seed">${JSON.stringify(seed)}</script>`;
  return `<!doctype html><html><head>
    <title>Build-time title</title>
    <meta name="description" content="Build-time description">
    <meta name="robots" content="index, follow">
    <meta property="og:title" content="Build-time title">
    <meta property="og:description" content="Build-time description">
    <meta property="og:type" content="article">
    <meta property="og:url" content="https://www.whalewzrd.com/old">
    <meta property="og:image" content="/old.jpg">
    <meta name="twitter:title" content="Build-time title">
    <meta name="twitter:description" content="Build-time description">
    <meta name="twitter:image" content="/old.jpg">
    <meta name="twitter:url" content="https://www.whalewzrd.com/old">
    <link rel="canonical" href="https://www.whalewzrd.com/old">
    <link rel="alternate" hreflang="ru" href="https://www.whalewzrd.com/old">
    ${seedScript}
  </head><body><div id="root" data-marker="${marker}"></div></body></html>`;
}

function runArticleHandler({ slug, url, db, next }) {
  const handler = createArticlePageHandler('/blog');
  return handler({
    request: new Request(url, { headers: { 'user-agent': 'Mozilla/5.0 Test Browser' } }),
    params: { slug },
    env: makeEnv({ db }),
    next,
    waitUntil: () => {},
    data: {},
  });
}

test('successful empty D1 is authoritative and its snapshot does not resurrect a deleted article', { concurrency: false }, async (t) => {
  const networkCalls = blockNetwork(t);
  const db = new FakeD1([d1Row('to-delete')]);
  const bucket = new FakeBucket();
  const env = makeEnv({ db, bucket });

  const firstBackground = makeWaitUntil();
  const first = await fetchArticlesWithFallback(env, request, firstBackground.waitUntil);
  assert.deepEqual(first.map((article) => article.slug), ['to-delete']);
  assert.equal(firstBackground.pending.length, 1, 'snapshot write must be scheduled, not awaited by the response');
  await firstBackground.flush();

  db.rows = [];
  const deletionBackground = makeWaitUntil();
  assert.deepEqual(await fetchArticlesWithFallback(env, request, deletionBackground.waitUntil), []);
  await deletionBackground.flush();

  db.error = new Error('D1 outage');
  assert.deepEqual(await fetchArticlesWithFallback(env, request), []);
  assert.equal(networkCalls.length, 0);
});

test('D1 outage reads the last successful D1 snapshot from a system R2 key', { concurrency: false }, async (t) => {
  const networkCalls = blockNetwork(t);
  const db = new FakeD1([d1Row('last-known-good')]);
  const bucket = new FakeBucket();
  const env = makeEnv({ db, bucket });
  const background = makeWaitUntil();

  await fetchArticlesWithFallback(env, request, background.waitUntil);
  await background.flush();
  assert.equal(bucket.objects.size, 1);
  const [snapshotKey] = bucket.objects.keys();
  assert.match(snapshotKey, /^_system\/article-snapshots\/[a-f0-9]{64}\.json$/);
  assert.equal(snapshotKey.startsWith('uploads/'), false);

  db.error = new Error('D1 outage');
  const recovered = await fetchArticlesWithFallback(env, request);
  assert.deepEqual(recovered.map((article) => article.slug), ['last-known-good']);
  assert.equal(networkCalls.length, 0);
});

test('D1 mode with no binding or snapshot never reads JSONBin and fails closed', { concurrency: false }, async (t) => {
  const networkCalls = blockNetwork(t);
  const env = makeEnv();

  assert.equal(shouldUseD1Articles(env), true);
  await assert.rejects(
    fetchArticlesWithFallback(env, request),
    /D1 articles are unavailable and no last-known-good D1 snapshot can be read/,
  );
  assert.equal(networkCalls.length, 0);
});

test('a corrupt R2 snapshot is rejected instead of becoming canonical or reaching JSONBin', { concurrency: false }, async (t) => {
  const networkCalls = blockNetwork(t);
  const db = new FakeD1([d1Row('before-corruption')]);
  const bucket = new FakeBucket();
  const env = makeEnv({ db, bucket });
  const background = makeWaitUntil();

  await fetchArticlesWithFallback(env, request, background.waitUntil);
  await background.flush();
  const [snapshotKey] = bucket.objects.keys();
  bucket.objects.set(snapshotKey, { value: '{not-valid-json', options: {} });
  db.error = new Error('D1 outage');

  await assert.rejects(fetchArticlesWithFallback(env, request), /D1 articles are unavailable/);
  assert.equal(networkCalls.length, 0);
});

test('the static seed is read only with explicit emergency opt-in', { concurrency: false }, async (t) => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    calls.push(url);
    if (url === 'https://www.whalewzrd.com/articles.seed.json') {
      return Response.json({ articles: [seedArticle('emergency-seed')] });
    }
    throw new Error(`unexpected URL: ${url}`);
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const db = new FakeD1();
  db.error = new Error('D1 outage');
  const recovered = await fetchArticlesWithFallback(makeEnv({ db, emergency: true }), request);

  assert.deepEqual(recovered.map((article) => article.slug), ['emergency-seed']);
  assert.deepEqual(calls, ['https://www.whalewzrd.com/articles.seed.json']);
  assert.equal(calls.some((url) => url.includes('jsonbin')), false);
});

test('article route reads only exact and legacy-prefix D1 candidates without replacing the R2 snapshot', { concurrency: false }, async (t) => {
  const networkCalls = blockNetwork(t);
  const db = new FakeD1([
    d1Row('exact-slug', 1),
    d1Row('exact-slug-expanded', 2),
    d1Row('unrelated-article', 3),
  ]);
  const bucket = new FakeBucket();
  const env = makeEnv({ db, bucket });

  const resolved = await fetchArticleCandidatesWithFallback(env, request, 'exact-slug');

  assert.deepEqual(resolved.map((article) => article.slug), ['exact-slug', 'exact-slug-expanded']);
  assert.equal(db.queries.length, 1);
  assert.match(db.queries[0].sql, /\bWHERE\b/i, 'article request must not select the whole table');
  assert.deepEqual(db.queries[0].bindings, ['exact-slug', 'exact-slug-', 'exact-slug.']);
  assert.equal(bucket.objects.size, 0, 'a partial route read must never overwrite the full R2 snapshot');
  assert.equal(networkCalls.length, 0);
});

test('public article detail reads only the exact D1 row and never replaces the R2 snapshot', { concurrency: false }, async (t) => {
  const networkCalls = blockNetwork(t);
  const db = new FakeD1([
    d1Row('exact-slug', 1),
    d1Row('exact-slug-expanded', 2),
    d1Row('unrelated-article', 3),
  ]);
  const bucket = new FakeBucket();
  const env = makeEnv({ db, bucket });

  const resolved = await fetchArticleWithFallback(env, request, 'exact-slug');

  assert.equal(resolved?.slug, 'exact-slug');
  assert.equal(db.queries.length, 1);
  assert.match(db.queries[0].sql, /WHERE\s+slug\s*=\s*\?/i);
  assert.match(db.queries[0].sql, /LIMIT\s+1/i);
  assert.deepEqual(db.queries[0].bindings, ['exact-slug']);
  assert.equal(bucket.objects.size, 0, 'an exact detail read must never overwrite the full R2 snapshot');
  assert.equal(networkCalls.length, 0);
});

test('public detail API does not turn a shortened slug into a prefix match', { concurrency: false }, async (t) => {
  const networkCalls = blockNetwork(t);
  const db = new FakeD1([d1Row('short-expanded', 1)]);
  const bucket = new FakeBucket();
  const response = await getPublicArticles({
    request: new Request('https://www.whalewzrd.com/api/articles?slug=short&_=test'),
    env: makeEnv({ db, bucket }),
    waitUntil: () => {},
    params: {},
    data: {},
    next: async () => { throw new Error('public API must not request a page asset'); },
    functionPath: '/api/articles',
  });

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'Article not found' });
  assert.equal(db.queries.length, 1);
  assert.deepEqual(db.queries[0].bindings, ['short']);
  assert.equal(bucket.objects.size, 0);
  assert.equal(networkCalls.length, 0);
});

test('an empty exact detail query is authoritative and does not revive a prefix or snapshot match', { concurrency: false }, async (t) => {
  const networkCalls = blockNetwork(t);
  const db = new FakeD1([
    d1Row('short-expanded', 1),
    d1Row('saved-exact', 2),
  ]);
  const bucket = new FakeBucket();
  const env = makeEnv({ db, bucket });
  const background = makeWaitUntil();

  await fetchArticlesWithFallback(env, request, background.waitUntil);
  await background.flush();
  assert.equal(bucket.objects.size, 1, 'test setup must create a full snapshot');

  db.rows = [d1Row('short-expanded', 1)];
  const resolved = await fetchArticleWithFallback(env, request, 'short');

  assert.equal(resolved, null);
  assert.deepEqual(db.queries.at(-1).bindings, ['short']);
  assert.equal(bucket.objects.size, 1);
  assert.equal(networkCalls.length, 0);
});

test('exact detail fallback reads only the exact slug from the last good snapshot', { concurrency: false }, async (t) => {
  const networkCalls = blockNetwork(t);
  const db = new FakeD1([d1Row('short-expanded', 1)]);
  const bucket = new FakeBucket();
  const env = makeEnv({ db, bucket });
  const background = makeWaitUntil();

  await fetchArticlesWithFallback(env, request, background.waitUntil);
  await background.flush();
  db.error = new Error('D1 outage');

  assert.equal(await fetchArticleWithFallback(env, request, 'short'), null);
  assert.equal((await fetchArticleWithFallback(env, request, 'short-expanded'))?.slug, 'short-expanded');
  assert.equal(bucket.objects.size, 1);
  assert.equal(networkCalls.length, 0);
});

test('public summaries treat pre-0006 article rows without status as published', { concurrency: false }, async () => {
  const { fetchArticleSummariesFromD1 } = await bundleTypeScript('functions/_lib/d1.ts');
  const legacyRow = d1Row('legacy-published');
  delete legacyRow.status;
  delete legacyRow.case_data_json;
  const db = new FakeD1([legacyRow]);

  const summaries = await fetchArticleSummariesFromD1({ DB: db });

  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].slug, 'legacy-published');
  assert.equal(summaries[0].status, 'published');
  assert.equal(summaries[0].content, '');
  assert.match(db.queries[0].sql, /['"]published['"]\s+AS\s+status/i);
  assert.doesNotMatch(db.queries[0].sql, /faq_json\s*,\s*status\b/i);
});

test('public article summaries omit D1 content without overwriting the full R2 snapshot', { concurrency: false }, async (t) => {
  const networkCalls = blockNetwork(t);
  const db = new FakeD1([d1Row('summary-only')]);
  const bucket = new FakeBucket();
  const env = makeEnv({ db, bucket });

  const summaries = await fetchArticleSummariesWithFallback(env, request);

  assert.equal(summaries.length, 1);
  assert.equal(summaries[0].slug, 'summary-only');
  assert.equal(summaries[0].content, '');
  const select = db.queries.find((query) => /FROM articles/i.test(query.sql));
  assert.ok(select, 'summary read must execute a D1 SELECT');
  assert.match(select.sql, /''\s+AS\s+content/i);
  assert.doesNotMatch(select.sql, /SELECT\s+\*/i);
  assert.equal(bucket.objects.size, 0, 'a summary read must never replace the full snapshot');
  assert.equal(networkCalls.length, 0);
});

test('an empty article-candidate query is authoritative and does not resurrect an R2 match', { concurrency: false }, async (t) => {
  const networkCalls = blockNetwork(t);
  const db = new FakeD1([d1Row('deleted-slug')]);
  const bucket = new FakeBucket();
  const env = makeEnv({ db, bucket });
  const background = makeWaitUntil();

  await fetchArticlesWithFallback(env, request, background.waitUntil);
  await background.flush();
  assert.equal(bucket.objects.size, 1, 'test setup must create a last-known-good snapshot');

  db.rows = [];
  const resolved = await fetchArticleCandidatesWithFallback(env, request, 'deleted-slug');
  assert.deepEqual(resolved, []);
  assert.equal(bucket.objects.size, 1);
  assert.equal(networkCalls.length, 0);
});

test('article-candidate read falls back to the matching part of R2 only after a D1 error', { concurrency: false }, async (t) => {
  const networkCalls = blockNetwork(t);
  const db = new FakeD1([
    d1Row('wanted-slug', 1),
    d1Row('wanted-slug-expanded', 2),
    d1Row('unrelated-article', 3),
  ]);
  const bucket = new FakeBucket();
  const env = makeEnv({ db, bucket });
  const background = makeWaitUntil();

  await fetchArticlesWithFallback(env, request, background.waitUntil);
  await background.flush();
  db.error = new Error('D1 outage');

  const resolved = await fetchArticleCandidatesWithFallback(env, request, 'wanted-slug');
  assert.deepEqual(resolved.map((article) => article.slug), ['wanted-slug', 'wanted-slug-expanded']);
  assert.equal(networkCalls.length, 0);
});

test('human article HTML replaces a stale build seed with one safely serialized live article', { concurrency: false }, async () => {
  const liveRow = d1Row('live-article');
  liveRow.content = '<p>Live</p></script><script id="injected">owned</script>\u2028';
  const db = new FakeD1([liveRow, d1Row('unrelated-article', 2)]);
  const staleSeed = seedArticle('stale-build-article');

  const response = await runArticleHandler({
    slug: 'live-article',
    url: 'https://www.whalewzrd.com/blog/live-article',
    db,
    next: async () => new Response(articleShell(staleSeed), {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }),
  });
  const html = await response.text();
  const { document } = parseHTML(html);
  const seeds = document.querySelectorAll('#ww-article-seed');

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(seeds.length, 1, 'the stale static seed must be removed, not duplicated');
  assert.equal(document.querySelector('#injected'), null, 'article JSON must not break out of its script element');
  assert.equal(JSON.parse(seeds[0].textContent).slug, 'live-article');
  assert.equal(JSON.parse(seeds[0].textContent).content, liveRow.content);
  assert.match(html, /\\u003c\/script\\u003e/, 'markup-significant JSON characters must stay escaped');
  assert.match(db.queries[0].sql, /\bWHERE\b/i, 'human article HTML must use a targeted D1 query');
});

test('a live article without a generated directory keeps the neutral section shell and its BlogPage preload', { concurrency: false }, async () => {
  const db = new FakeD1([d1Row('just-published')]);
  const requestedAssets = [];
  const sectionHead = `
    <link rel="modulepreload" href="/assets/BlogPage-test.js">
    <link rel="stylesheet" href="/assets/BlogPage-test.css">
    <script id="ld-organization" type="application/ld+json">{"@type":"ProfessionalService","name":"Whale Wizard"}</script>
    <script id="ld-breadcrumbs" type="application/ld+json">{"@type":"BreadcrumbList","name":"Blog index"}</script>
  `;
  const homeHead = `
    <link rel="modulepreload" href="/assets/Home-test.js">
    <link rel="preload" as="image" href="/images/hero-portrait.jpg" fetchpriority="high">
  `;
  const response = await runArticleHandler({
    slug: 'just-published',
    url: 'https://www.whalewzrd.com/blog/just-published',
    db,
    next: async (asset) => {
      const pathname = new URL(asset.url).pathname;
      requestedAssets.push(pathname);
      if (pathname === '/blog/just-published/index.html') {
        return new Response(articleShell(null, '404-shell'), {
          status: 404,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }
      if (pathname === '/blog/index.html') {
        return new Response(
          articleShell(null, 'section-shell').replace('</head>', `${sectionHead}</head>`),
          {
            status: 200,
            headers: { 'content-type': 'text/html; charset=utf-8' },
          },
        );
      }
      return new Response(articleShell(null, 'root-shell').replace('</head>', `${homeHead}</head>`), {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
    },
  });
  const html = await response.text();
  const { document } = parseHTML(html);

  assert.equal(response.status, 200);
  assert.deepEqual(requestedAssets, ['/blog/just-published/index.html', '/blog/index.html']);
  assert.ok(document.querySelector('#root'));
  assert.equal(document.querySelector('#root').textContent, '');
  assert.equal(document.querySelector('[data-marker="section-shell"]'), null);
  assert.equal(document.querySelector('[data-marker="root-shell"]'), null);
  assert.equal(document.querySelector('[data-marker="404-shell"]'), null);
  assert.ok(document.querySelector('link[href="/assets/BlogPage-test.js"]'));
  assert.ok(document.querySelector('link[href="/assets/BlogPage-test.css"]'));
  assert.equal(document.querySelector('link[href="/assets/Home-test.js"]'), null);
  assert.equal(document.querySelector('link[href="/images/hero-portrait.jpg"]'), null);
  assert.equal(document.querySelector('#ld-breadcrumbs'), null);
  assert.equal(document.querySelector('script[type="application/ld+json"]')?.textContent.includes('BreadcrumbList'), false);
  assert.ok(document.querySelector('#ld-organization'), 'global organization schema must remain');
  assert.equal(document.title, 'Title just-published — Blog | Whale Wizard');
  assert.equal(document.querySelector('link[rel="canonical"]').getAttribute('href'), 'https://www.whalewzrd.com/blog/just-published');
  assert.equal(document.querySelector('meta[name="description"]').getAttribute('content'), 'Description just-published');
  assert.equal(JSON.parse(document.querySelector('#ww-article-seed').textContent).slug, 'just-published');
});

test('article canonical redirects preserve the original query string', { concurrency: false }, async () => {
  const db = new FakeD1([d1Row('short-full-slug')]);

  const trailing = await runArticleHandler({
    slug: 'short-full-slug',
    url: 'https://www.whalewzrd.com/blog/short-full-slug/?utm_source=meta&gclid=a%2Bb',
    db,
    next: async () => { throw new Error('redirect must not request an asset'); },
  });
  assert.equal(trailing.status, 301);
  assert.equal(
    trailing.headers.get('location'),
    'https://www.whalewzrd.com/blog/short-full-slug?utm_source=meta&gclid=a%2Bb',
  );

  const prefix = await runArticleHandler({
    slug: 'short',
    url: 'https://www.whalewzrd.com/blog/short?utm_campaign=launch&fbclid=abc',
    db,
    next: async () => { throw new Error('redirect must not request an asset'); },
  });
  assert.equal(prefix.status, 301);
  assert.equal(
    prefix.headers.get('location'),
    'https://www.whalewzrd.com/blog/short-full-slug?utm_campaign=launch&fbclid=abc',
  );
});
