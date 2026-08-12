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
    platform: 'neutral',
    write: false,
  });
  const code = `${result.outputFiles[0].text}\n//${randomUUID()}`;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function auditRequest() {
  const params = new URLSearchParams({
    url: 'https://www.whalewzrd.com/blog',
    strategy: 'mobile',
    force: '1',
  });
  return new Request(`https://www.whalewzrd.com/api/admin/performance?${params}`, {
    headers: { 'X-Admin-Password': 'performance-test-password' },
  });
}

test('PageSpeed retry response controls HTTP error classification', async () => {
  const originalFetch = globalThis.fetch;
  const originalCaches = globalThis.caches;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;

  globalThis.caches = {
    default: {
      match: async () => undefined,
      put: async () => {},
    },
  };
  // The production delay is useful for PSI, but the fetch mock does not need it.
  globalThis.setTimeout = (callback) => {
    callback();
    return 0;
  };
  globalThis.clearTimeout = () => {};

  try {
    const { onRequestGet } = await bundleTypeScript('functions/api/admin/performance.ts');
    const scenarios = [
      {
        name: 'quota',
        retry: jsonResponse({
          error: { code: 429, status: 'RESOURCE_EXHAUSTED', message: 'Quota exceeded' },
        }, 429),
        expectedStatus: 429,
        expectedCode: 'PAGESPEED_QUOTA_EXCEEDED',
        expectedError: null,
      },
      {
        name: 'configuration',
        retry: jsonResponse({
          error: { code: 403, status: 'PERMISSION_DENIED', message: 'API key not valid' },
        }, 403),
        expectedStatus: 503,
        expectedCode: 'PAGESPEED_CONFIGURATION_ERROR',
        expectedError: null,
      },
      {
        name: 'generic upstream error',
        retry: jsonResponse({ error: { code: 500, message: 'Retry server exploded' } }, 500),
        expectedStatus: 502,
        expectedCode: null,
        expectedError: 'Retry server exploded',
      },
    ];

    for (const scenario of scenarios) {
      let fetchCalls = 0;
      globalThis.fetch = async () => {
        fetchCalls += 1;
        if (fetchCalls === 1) {
          return jsonResponse({
            lighthouseResult: { runtimeError: { message: 'Something went wrong' } },
          });
        }
        if (fetchCalls === 2) return scenario.retry;
        throw new Error(`Unexpected fetch call in ${scenario.name}`);
      };

      const response = await onRequestGet({
        request: auditRequest(),
        env: {
          ADMIN_PASSWORD: 'performance-test-password',
          PAGESPEED_API_KEY: 'test-key',
          SITE_URL: 'https://www.whalewzrd.com',
        },
      });
      const payload = await response.json();

      assert.equal(fetchCalls, 2, `${scenario.name}: one retry should be made`);
      assert.equal(response.status, scenario.expectedStatus, scenario.name);
      assert.equal(payload.success, false, scenario.name);
      if (scenario.expectedCode) assert.equal(payload.code, scenario.expectedCode, scenario.name);
      if (scenario.expectedError) assert.equal(payload.error, scenario.expectedError, scenario.name);
      assert.notEqual(payload.error, 'Something went wrong', scenario.name);
    }
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.caches = originalCaches;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
