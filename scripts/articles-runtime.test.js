import assert from 'node:assert/strict';
import { randomUUID, webcrypto } from 'node:crypto';
import test from 'node:test';
import { build } from 'esbuild';

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
  }

  prepare(sql) {
    assert.match(sql, /SELECT \* FROM articles/i);
    return {
      all: async () => {
        if (this.error) throw this.error;
        return { results: this.rows };
      },
    };
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

const { fetchArticlesWithFallback, shouldUseD1Articles } = await bundleTypeScript('functions/_lib/articles.ts');
const request = new Request('https://www.whalewzrd.com/api/articles');

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
