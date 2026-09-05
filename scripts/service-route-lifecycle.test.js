import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import { createElement, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { parseHTML } from 'linkedom';

// Exercise the actual route factory, with its imports supplied as fixtures.
// Do not import the full router: that would start unrelated browser services.
const source = await readFile(new URL('../src/app/routes.tsx', import.meta.url), 'utf8');
const start = source.indexOf('function lazyServiceLanding(');
const end = source.indexOf('\nconst MetaAdsPage =', start);
assert.ok(start >= 0 && end > start, 'service route factory must be available for the lifecycle test');
const compiled = await transform(`export function fixture(createElement, loadServiceLandingPage) {
${source.slice(start, end)}
return lazyServiceLanding;
}`, { loader: 'tsx', format: 'esm', target: 'es2022' });
const { fixture } = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);

function resolvedLoader(value) {
  return Object.assign(async () => value, { resolved: value });
}

for (const service of ['consult', 'meta-ads', 'meta-apps', 'google-ads']) {
  test(`${service}: ordinary parent renders preserve DOM, state and mounted animations`, (t) => {
    const previous = { window: globalThis.window, document: globalThis.document };
    const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
    Object.assign(globalThis, { window, document: window.document });
    const root = createRoot(window.document.getElementById('root'));
    t.after(() => {
      flushSync(() => root.unmount());
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete globalThis[key];
        else globalThis[key] = value;
      }
    });
    let mounts = 0;
    let cleanups = 0;
    function Landing({ service }) {
      useLayoutEffect(() => {
        mounts += 1;
        return () => { cleanups += 1; };
      }, []);
      return createElement('input', { 'data-service': service, defaultValue: '' });
    }
    const factory = fixture(createElement, resolvedLoader({ ServiceLandingPage: Landing }));
    const Route = factory(service, [resolvedLoader({})]);
    flushSync(() => root.render(createElement(Route)));
    const input = window.document.querySelector('input');
    input.value = 'Unsubmitted draft';
    flushSync(() => root.render(createElement(Route)));
    flushSync(() => root.render(createElement(Route)));
    assert.equal(mounts, 1, 'a parent update must not restart landing effects');
    assert.equal(cleanups, 0, 'the scene must not be torn down during a parent update');
    assert.equal(window.document.querySelector('input'), input, 'keep the same live DOM');
    assert.equal(input.value, 'Unsubmitted draft');
    assert.equal(input.getAttribute('data-service'), service);
  });
}

test('cold service and hero imports share one pending task, then retain component identity', async () => {
  let finishRoute;
  let finishHero;
  let routeCalls = 0;
  let heroCalls = 0;
  const routePromise = new Promise((resolve) => { finishRoute = resolve; });
  const heroPromise = new Promise((resolve) => { finishHero = resolve; });
  const routeLoader = () => { routeCalls += 1; return routePromise; };
  const heroLoader = () => { heroCalls += 1; return heroPromise; };
  const Route = fixture(createElement, routeLoader)('consult', [heroLoader]);
  const suspended = () => {
    try { Route(); } catch (pending) { return pending; }
    assert.fail('must suspend until both modules resolve');
  };
  const pending = suspended();
  assert.equal(suspended(), pending);
  const module = { ServiceLandingPage: () => null };
  routeLoader.resolved = module;
  finishRoute(module);
  await Promise.resolve();
  assert.equal(suspended(), pending, 'the hero must be ready before hand-off');
  heroLoader.resolved = {};
  finishHero(heroLoader.resolved);
  await pending;
  assert.equal(Route().type, Route().type, 'resolved wrapper identity must be stable');
  assert.equal(routeCalls, 1);
  assert.equal(heroCalls, 1);
});

test('failed service preload can retry instead of poisoning the route forever', async () => {
  let calls = 0;
  const loader = async () => {
    calls += 1;
    if (calls === 1) throw new Error('temporary chunk failure');
    return (loader.resolved = { ServiceLandingPage: () => null });
  };
  const Route = fixture(createElement, loader)('meta-ads');
  let first;
  try { Route(); } catch (pending) { first = pending; }
  await assert.rejects(first, /temporary chunk failure/);
  let retry;
  try { Route(); } catch (pending) { retry = pending; }
  await retry;
  assert.ok(Route().type);
  assert.equal(calls, 2);
});
