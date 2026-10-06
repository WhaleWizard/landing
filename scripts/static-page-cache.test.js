/**
 * Кэш готовых страниц в дата-центре (functions/_middleware.ts, staticPage).
 *
 * Страницы со сборки шли через воркер при каждом заходе: TTFB 0,2–0,45 с из
 * Ташкента. Теперь ответ 200 статики минуту лежит в Cache API. Проверяется то,
 * что сломалось бы молча: второй запрос не ходит на диск Pages, ?utm не плодит
 * копий, браузер по-прежнему получает «всегда спроси сервер», а ответы
 * Functions (статьи, 404, бот-версии с Vary) в кэш не попадают. Cache API —
 * поддельный, в памяти; middleware настоящий.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { build } from 'esbuild';

const store = new Map();
globalThis.caches = { default: {
  match: async (req) => store.get(req.url) ? store.get(req.url).clone() : undefined,
  put: async (req, res) => { store.set(req.url, res); },
  delete: async (req) => store.delete(req.url),
} };

const result = await build({ entryPoints: ['functions/_middleware.ts'], bundle: true, format: 'esm', platform: 'node', write: false, target: 'es2022' });
const mod = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text + `\n//${randomUUID()}`).toString('base64')}`);

const html = (body, headers = {}) => new Response(body, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=0, must-revalidate', ...headers } });
const call = (url, nextImpl, method = 'GET') => mod.onRequest({ request: new Request(url, { method }), env: {}, next: nextImpl, waitUntil: (p) => p });

test('статическая страница: первый запрос мимо кэша, второй — из кэша, параметры не плодят копии', async () => {
  let hits = 0;
  const next = async () => { hits += 1; return html('<html><head></head><body>v1</body></html>'); };
  const first = await call('https://www.whalewzrd.com/faq/', next);
  assert.equal(first.headers.get('X-WW-Static-Cache'), 'miss');
  assert.equal(await first.text(), '<html><head></head><body>v1</body></html>');
  const second = await call('https://www.whalewzrd.com/faq/?utm_source=x', next);
  assert.equal(second.headers.get('X-WW-Static-Cache'), 'hit');
  assert.equal(second.headers.get('Cache-Control'), 'public, max-age=0, must-revalidate');
  assert.equal(await second.text(), '<html><head></head><body>v1</body></html>');
  assert.equal(hits, 1, 'второй запрос не ходил в next()');
  assert.ok(second.headers.get('Content-Security-Policy'), 'заголовки безопасности на ответе из кэша');
});

test('ответы Functions (no-store, Vary, не 200) в кэш не попадают', async () => {
  store.clear();
  for (const res of [
    html('a', { 'Cache-Control': 'no-store' }),
    html('b', { 'Cache-Control': 'public, s-maxage=300', Vary: 'User-Agent' }),
    new Response('c', { status: 404, headers: { 'Content-Type': 'text/html', 'Cache-Control': 'public, max-age=0, must-revalidate' } }),
  ]) {
    const r = await call('https://www.whalewzrd.com/blog/x', async () => res);
    assert.notEqual(r.headers.get('X-WW-Static-Cache'), 'stored');
  }
  assert.equal(store.size, 0);
});

test('HEAD не кэшируется и не читает кэш как GET', async () => {
  store.clear();
  const r = await call('https://www.whalewzrd.com/faq/', async () => html('h'), 'HEAD');
  assert.equal(r.headers.get('X-WW-Static-Cache'), null);
  assert.equal(store.size, 0);
});
