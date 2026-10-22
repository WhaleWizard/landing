import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';

globalThis.caches ??= { default: { match: async () => undefined, put: async () => {} } };

class D1StatementAdapter {
  constructor(database, sql, values = []) {
    this.database = database;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new D1StatementAdapter(this.database, this.sql, values);
  }

  async first() {
    return this.database.prepare(this.sql).get(...this.values) ?? null;
  }

  async all() {
    return { success: true, results: this.database.prepare(this.sql).all(...this.values) };
  }

  async run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return {
      success: true,
      meta: {
        changes: Number(result.changes || 0),
        last_row_id: Number(result.lastInsertRowid || 0),
      },
    };
  }
}

class D1DatabaseAdapter {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new D1StatementAdapter(this.database, sql);
  }

  async batch(statements) {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec('COMMIT');
      return results;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}

function createProductionDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  const files = readdirSync('migrations').filter((name) => name.endsWith('.sql')).sort();
  for (const file of files) sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  return { sqlite, d1: new D1DatabaseAdapter(sqlite) };
}

async function bundleEndpoint(path) {
  const result = await build({
    entryPoints: [path],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'neutral',
    write: false,
  });
  const code = `${result.outputFiles[0].text}\n//${randomUUID()}`;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

function makeTrustedRequest(url, body) {
  return new Request(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0 Safari/537.36',
      'CF-Connecting-IP': '1.2.3.4',
      'CF-IPCountry': 'UZ',
      Origin: 'https://www.whalewzrd.com',
      Referer: 'https://www.whalewzrd.com/',
    },
    body: JSON.stringify(body),
  });
}

test('F-112: Lead endpoint strictly gates Meta CAPI on marketing consent', async () => {
  const { d1, sqlite } = createProductionDatabase();
  const leadEndpoint = await bundleEndpoint('functions/api/lead.ts');

  const capturedRequests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const urlStr = String(url);
    capturedRequests.push({ url: urlStr, options });
    if (urlStr.includes('graph.facebook.com')) {
      return new Response(JSON.stringify({ events_received: 1, fbtrace_id: 'test-trace' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    const env = {
      DB: d1,
      META_CAPI_ACCESS_TOKEN: 'test-token',
      VITE_META_PIXEL_ID: '1234567890',
      META_CAPI_API_VERSION: 'v25.0',
    };

    // 1. Without marketing consent
    const pendingNoConsent = [];
    const eventIdNoConsent = randomUUID();
    const requestNoConsent = makeTrustedRequest('https://www.whalewzrd.com/api/lead', {
      event_id: eventIdNoConsent,
      name: 'Тест Без Согласия',
      email: 'test-no-consent@example.com',
      phone: '+998901234567',
      marketing_consent: false,
    });

    const responseNoConsent = await leadEndpoint.onRequestPost({
      request: requestNoConsent,
      env,
      waitUntil: (promise) => pendingNoConsent.push(promise),
    });

    assert.equal(responseNoConsent.status, 200);
    await Promise.allSettled(pendingNoConsent);

    const capiRequestsNoConsent = capturedRequests.filter((r) => r.url.includes('graph.facebook.com'));
    assert.equal(capiRequestsNoConsent.length, 0, 'No Meta CAPI request must be sent without marketing consent');

    const outboxNoConsent = sqlite.prepare('SELECT COUNT(*) as count FROM meta_outbox').get();
    assert.equal(Number(outboxNoConsent.count), 0, 'meta_outbox must be empty without marketing consent');

    // 2. With marketing consent
    const pendingWithConsent = [];
    const eventIdWithConsent = randomUUID();
    const requestWithConsent = makeTrustedRequest('https://www.whalewzrd.com/api/lead', {
      event_id: eventIdWithConsent,
      name: 'Иван Иванов',
      email: 'ivan@example.com',
      phone: '+998901234567',
      marketing_consent: true,
    });

    const responseWithConsent = await leadEndpoint.onRequestPost({
      request: requestWithConsent,
      env,
      waitUntil: (promise) => pendingWithConsent.push(promise),
    });

    assert.equal(responseWithConsent.status, 200);
    await Promise.allSettled(pendingWithConsent);

    const capiRequestsWithConsent = capturedRequests.filter((r) => r.url.includes('graph.facebook.com'));
    assert.equal(capiRequestsWithConsent.length, 1, 'Exactly one Meta CAPI request must be sent when consent is granted');

    const payload = JSON.parse(capiRequestsWithConsent[0].options.body);
    assert.equal(payload.data[0].event_id, eventIdWithConsent);
    assert.match(payload.data[0].user_data.em[0], /^[a-f0-9]{64}$/, 'Email must be sha256 hex hashed');
    assert.match(payload.data[0].user_data.ph[0], /^[a-f0-9]{64}$/, 'Phone must be sha256 hex hashed');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('F-112: PageView endpoint strictly gates Meta CAPI on marketing consent', async () => {
  const { d1, sqlite } = createProductionDatabase();
  const pageviewEndpoint = await bundleEndpoint('functions/api/pageview.ts');

  const capturedRequests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const urlStr = String(url);
    capturedRequests.push({ url: urlStr, options });
    if (urlStr.includes('graph.facebook.com')) {
      return new Response(JSON.stringify({ events_received: 1, fbtrace_id: 'test-trace' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    const env = {
      DB: d1,
      META_CAPI_ACCESS_TOKEN: 'test-token',
      VITE_META_PIXEL_ID: '1234567890',
      META_CAPI_API_VERSION: 'v25.0',
    };

    // 1. Without marketing consent
    const pendingNoConsent = [];
    const eventIdNoConsent = randomUUID();
    const requestNoConsent = makeTrustedRequest('https://www.whalewzrd.com/api/pageview', {
      event_id: eventIdNoConsent,
      page_url: 'https://www.whalewzrd.com/meta-ads/',
      page_path: '/meta-ads/',
      marketing_consent: false,
    });

    const responseNoConsent = await pageviewEndpoint.onRequestPost({
      request: requestNoConsent,
      env,
      waitUntil: (promise) => pendingNoConsent.push(promise),
    });

    assert.equal(responseNoConsent.status, 200);
    await Promise.allSettled(pendingNoConsent);

    const capiRequestsNoConsent = capturedRequests.filter((r) => r.url.includes('graph.facebook.com'));
    assert.equal(capiRequestsNoConsent.length, 0, 'No Meta CAPI request must be sent for PageView without marketing consent');

    const outboxNoConsent = sqlite.prepare('SELECT COUNT(*) as count FROM meta_outbox').get();
    assert.equal(Number(outboxNoConsent.count), 0, 'meta_outbox must be empty for PageView without consent');

    // 1b. Anonymous stats_only request (analytics consent without marketing - F-089)
    const pendingStatsOnly = [];
    const eventIdStatsOnly = randomUUID();
    const requestStatsOnly = makeTrustedRequest('https://www.whalewzrd.com/api/pageview', {
      event_id: eventIdStatsOnly,
      page_url: 'https://www.whalewzrd.com/meta-apps/',
      page_path: '/meta-apps/',
      marketing_consent: false,
      stats_only: true,
    });

    const responseStatsOnly = await pageviewEndpoint.onRequestPost({
      request: requestStatsOnly,
      env,
      waitUntil: (promise) => pendingStatsOnly.push(promise),
    });

    assert.equal(responseStatsOnly.status, 200);
    await Promise.allSettled(pendingStatsOnly);

    const capiRequestsStatsOnly = capturedRequests.filter((r) => r.url.includes('graph.facebook.com'));
    assert.equal(capiRequestsStatsOnly.length, 0, 'No Meta CAPI request must be sent for stats_only PageView');

    const statsOnlyRow = sqlite.prepare("SELECT views FROM page_stats_daily WHERE page_path = '/meta-apps'").get();
    assert.ok(statsOnlyRow && Number(statsOnlyRow.views) >= 1, 'page_stats_daily must record the stats_only pageview');

    // 2. With marketing consent
    const pendingWithConsent = [];
    const eventIdWithConsent = randomUUID();
    const requestWithConsent = makeTrustedRequest('https://www.whalewzrd.com/api/pageview', {
      event_id: eventIdWithConsent,
      page_url: 'https://www.whalewzrd.com/meta-ads/',
      page_path: '/meta-ads/',
      marketing_consent: true,
    });

    const responseWithConsent = await pageviewEndpoint.onRequestPost({
      request: requestWithConsent,
      env,
      waitUntil: (promise) => pendingWithConsent.push(promise),
    });

    assert.equal(responseWithConsent.status, 200);
    await Promise.allSettled(pendingWithConsent);

    const capiRequestsWithConsent = capturedRequests.filter((r) => r.url.includes('graph.facebook.com'));
    assert.equal(capiRequestsWithConsent.length, 1, 'Exactly one Meta CAPI request must be sent for PageView when consent is granted');

    const payload = JSON.parse(capiRequestsWithConsent[0].options.body);
    assert.equal(payload.data[0].event_id, eventIdWithConsent);
    assert.equal(payload.data[0].event_name, 'PageView');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('F-112: Meta Event (ViewContent/Contact) strictly gates Meta CAPI on marketing consent', async () => {
  const { d1, sqlite } = createProductionDatabase();
  const metaEventEndpoint = await bundleEndpoint('functions/api/meta-event.ts');

  const capturedRequests = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    const urlStr = String(url);
    capturedRequests.push({ url: urlStr, options });
    if (urlStr.includes('graph.facebook.com')) {
      return new Response(JSON.stringify({ events_received: 1, fbtrace_id: 'test-trace' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };

  try {
    const env = {
      DB: d1,
      META_CAPI_ACCESS_TOKEN: 'test-token',
      VITE_META_PIXEL_ID: '1234567890',
      META_CAPI_API_VERSION: 'v25.0',
    };

    // 1. Without marketing consent
    const pendingNoConsent = [];
    const eventIdNoConsent = randomUUID();
    const requestNoConsent = makeTrustedRequest('https://www.whalewzrd.com/api/meta-event', {
      event_id: eventIdNoConsent,
      event_name: 'ViewContent',
      page_url: 'https://www.whalewzrd.com/meta-ads/',
      page_path: '/meta-ads/',
      marketing_consent: false,
    });

    const responseNoConsent = await metaEventEndpoint.onRequestPost({
      request: requestNoConsent,
      env,
      waitUntil: (promise) => pendingNoConsent.push(promise),
    });

    assert.equal(responseNoConsent.status, 200);
    await Promise.allSettled(pendingNoConsent);

    const capiRequestsNoConsent = capturedRequests.filter((r) => r.url.includes('graph.facebook.com'));
    assert.equal(capiRequestsNoConsent.length, 0, 'No Meta CAPI request must be sent for ViewContent without marketing consent');

    const outboxNoConsent = sqlite.prepare('SELECT COUNT(*) as count FROM meta_outbox').get();
    assert.equal(Number(outboxNoConsent.count), 0, 'meta_outbox must be empty without marketing consent');

    // 2. With marketing consent
    const pendingWithConsent = [];
    const eventIdWithConsent = randomUUID();
    const requestWithConsent = makeTrustedRequest('https://www.whalewzrd.com/api/meta-event', {
      event_id: eventIdWithConsent,
      event_name: 'ViewContent',
      page_url: 'https://www.whalewzrd.com/meta-ads/',
      page_path: '/meta-ads/',
      marketing_consent: true,
    });

    const responseWithConsent = await metaEventEndpoint.onRequestPost({
      request: requestWithConsent,
      env,
      waitUntil: (promise) => pendingWithConsent.push(promise),
    });

    assert.equal(responseWithConsent.status, 200);
    await Promise.allSettled(pendingWithConsent);

    const capiRequestsWithConsent = capturedRequests.filter((r) => r.url.includes('graph.facebook.com'));
    assert.equal(capiRequestsWithConsent.length, 1, 'Exactly one Meta CAPI request must be sent for ViewContent when consent is granted');

    const payload = JSON.parse(capiRequestsWithConsent[0].options.body);
    assert.equal(payload.data[0].event_id, eventIdWithConsent);
    assert.equal(payload.data[0].event_name, 'ViewContent');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
