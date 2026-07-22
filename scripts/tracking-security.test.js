import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { transform } from 'esbuild';

async function importTypeScript(path) {
  const source = readFileSync(path, 'utf8');
  const compiled = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022' });
  return import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);
}

const { readRequestText } = await importTypeScript('functions/_lib/http.ts');
const { verifyTrackingSignature } = await importTypeScript('functions/_lib/tracking-signature.ts');

async function hmac(secretHex, message) {
  const secret = Uint8Array.from(secretHex.match(/.{2}/g).map((byte) => Number.parseInt(byte, 16)));
  const key = await crypto.subtle.importKey('raw', secret, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const digest = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Buffer.from(digest).toString('hex');
}

function createNonceDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync('migrations/0018_tracking_request_nonces.sql', 'utf8'));
  return {
    sqlite,
    prepare(sql) {
      return {
        bind(...values) {
          return {
            async run() {
              const result = sqlite.prepare(sql).run(...values);
              return { meta: { changes: Number(result.changes || 0) } };
            },
          };
        },
      };
    },
  };
}

test('bounded request reader measures UTF-8 bytes and stops above the limit', async () => {
  const exact = await readRequestText(new Request('https://example.test', { method: 'POST', body: '🐋' }), 4);
  assert.deepEqual(exact, { ok: true, text: '🐋', bytes: 4 });

  const oversized = await readRequestText(new Request('https://example.test', { method: 'POST', body: '🐋' }), 3);
  assert.equal(oversized.ok, false);
  assert.equal(oversized.error, 'payload_too_large');
});

test('nonce remains claimed across a rolling TTL increase', async () => {
  const originalNow = Date.now;
  const initialNowSeconds = 2_000_000_000;
  const timestamp = String(initialNowSeconds);
  const nonce = 'rolling_nonce_123456';
  const body = '{"event_id":"same"}';
  const secret = '11'.repeat(32);
  const signature = await hmac(secret, `${timestamp}.${nonce}.${body}`);
  const request = new Request('https://www.whalewzrd.com/api/pageview', {
    method: 'POST',
    headers: {
      'x-track-ts': timestamp,
      'x-track-nonce': nonce,
      'x-track-signature': signature,
    },
    body,
  });
  const db = createNonceDb();
  const env = {
    DB: db,
    TRACKING_HMAC_SECRET: secret,
    TRACKING_SIGNATURE_MODE: 'enforce',
    TRACKING_SIG_TTL_SEC: '10',
  };

  try {
    Date.now = () => initialNowSeconds * 1000;
    const first = await verifyTrackingSignature(request, env, body);
    assert.deepEqual(first, { ok: true, replayProtection: 'd1' });
    assert.equal(db.sqlite.prepare('SELECT expires_at FROM tracking_request_nonces').get().expires_at, initialNowSeconds + 600);

    Date.now = () => (initialNowSeconds + 121) * 1000;
    env.TRACKING_SIG_TTL_SEC = '300';
    const replay = await verifyTrackingSignature(request, env, body);
    assert.deepEqual(replay, { ok: false, reason: 'replayed_nonce' });
  } finally {
    Date.now = originalNow;
  }
});

test('D1 nonce claim admits only one concurrent signed request', async () => {
  const originalNow = Date.now;
  const nowSeconds = 2_000_000_100;
  const timestamp = String(nowSeconds);
  const nonce = 'concurrent_nonce_123456';
  const body = '{"event_id":"concurrent"}';
  const secret = '22'.repeat(32);
  const signature = await hmac(secret, `${timestamp}.${nonce}.${body}`);
  const makeRequest = () => new Request('https://www.whalewzrd.com/api/meta-event', {
    method: 'POST',
    headers: {
      'x-track-ts': timestamp,
      'x-track-nonce': nonce,
      'x-track-signature': signature,
    },
    body,
  });
  const db = createNonceDb();
  const env = {
    DB: db,
    TRACKING_HMAC_SECRET: secret,
    TRACKING_SIGNATURE_MODE: 'enforce',
    TRACKING_SIG_TTL_SEC: '60',
  };

  try {
    Date.now = () => nowSeconds * 1000;
    const results = await Promise.all([
      verifyTrackingSignature(makeRequest(), env, body),
      verifyTrackingSignature(makeRequest(), env, body),
    ]);
    assert.equal(results.filter((result) => result.ok).length, 1);
    assert.equal(results.filter((result) => !result.ok && result.reason === 'replayed_nonce').length, 1);
  } finally {
    Date.now = originalNow;
  }
});
