import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createElement, lazy, Suspense, useLayoutEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { parseHTML } from 'linkedom';

const compiled = await build({
  entryPoints: [fileURLToPath(new URL('../src/app/utils/preloadable.ts', import.meta.url))],
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
});
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(
  createRequire(import.meta.url), module, module.exports,
);
const { preloadable } = module.exports;

function domFixture(t) {
  const previous = { window: globalThis.window, document: globalThis.document };
  const { window } = parseHTML('<html><body><div id="root"></div></body></html>');
  Object.assign(globalThis, { window, document: window.document });
  const element = window.document.getElementById('root');
  const root = createRoot(element);
  t.after(() => {
    flushSync(() => root.unmount());
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  return { root, element };
}

test('prepared hero skips the fallback commit that React.lazy still produces', async (t) => {
  const { root, element } = domFixture(t);
  let heroMounts = 0;
  let fallbackMounts = 0;
  function Hero({ text }) {
    useLayoutEffect(() => { heroMounts += 1; }, []);
    return createElement('h1', null, text);
  }
  function Fallback() {
    useLayoutEffect(() => { fallbackMounts += 1; }, []);
    return createElement('p', null, 'loading');
  }
  const loaded = { default: Hero };
  const promise = Promise.resolve(loaded);
  await promise; // Same condition as bootstrap awaiting prepareRoute.
  const loader = Object.assign(() => promise, { resolved: loaded });
  const Legacy = lazy(loader);
  const render = (Component) => flushSync(() => root.render(
    createElement(Suspense, { fallback: createElement(Fallback) }, createElement(Component, { text: 'Hero ready' })),
  ));
  render(Legacy);
  assert.equal(element.textContent, 'loading', 'regression reproduction: fulfilled promise still suspends');
  assert.equal(fallbackMounts, 1);
  const Prepared = preloadable(loader);
  render(Prepared);
  assert.equal(element.textContent, 'Hero ready');
  assert.equal(fallbackMounts, 1, 'no second fallback commit for a prepared module');
  const heading = element.querySelector('h1');
  render(Prepared);
  assert.equal(element.querySelector('h1'), heading);
  assert.equal(heroMounts, 1, 'ordinary renders must not restart entrance effects');
});

test('a wrapper defined before bootstrap resolves still renders synchronously afterwards', () => {
  let calls = 0;
  const loader = () => { calls += 1; return Promise.resolve(loader.resolved); };
  const Prepared = preloadable(loader);
  const Component = () => null;
  loader.resolved = { default: Component };
  assert.equal(Prepared({ value: 42 }).type, Component);
  assert.equal(Prepared({ value: 42 }).props.value, 42);
  assert.equal(calls, 0, 'already prepared chunks are not imported again');
});

test('a genuinely cold component keeps Suspense, sharing one pending task', async () => {
  let finish;
  let calls = 0;
  const promise = new Promise((resolve) => { finish = resolve; });
  const Prepared = preloadable(() => { calls += 1; return promise; });
  const getPending = () => {
    try { Prepared({}); } catch (pending) { return pending; }
    assert.fail('cold import must suspend');
  };
  const pending = getPending();
  assert.equal(getPending(), pending);
  const Component = () => null;
  finish({ default: Component });
  await pending;
  assert.equal(Prepared({}).type, Component);
  assert.equal(calls, 1);
});

test('a rejected component import remains retryable', async () => {
  let calls = 0;
  const Component = () => null;
  const Prepared = preloadable(async () => {
    if (++calls === 1) throw new Error('chunk unavailable');
    return { default: Component };
  });
  let pending;
  try { Prepared({}); } catch (error) { pending = error; }
  await assert.rejects(pending, /chunk unavailable/);
  try { Prepared({}); } catch (retry) { await retry; }
  assert.equal(Prepared({}).type, Component);
  assert.equal(calls, 2);
});

test('first-screen consumers use the same loaders that bootstrap prepares', async () => {
  const hero = await readFile(new URL('../src/app/components/Hero.tsx', import.meta.url), 'utf8');
  const service = await readFile(new URL('../src/app/pages/ServiceLandingPage.tsx', import.meta.url), 'utf8');
  for (const name of ['CosmicHeroScene', 'MetaAppsHeroVisual']) {
    assert.ok(hero.includes(`const ${name} = preloadable(load${name});`), `${name} must consume its prepared module`);
  }
  for (const name of ['Hero', 'ConsultStudioHero', 'MetaAdsEditorialHero']) {
    assert.ok(service.includes(`const ${name} = preloadable(load${name});`), `${name} must consume its prepared module`);
  }
  assert.ok(!hero.includes("from '../utils/routePreload'"), 'hero must not import the entire route registry');
  assert.ok(!service.includes("from '../utils/routePreload'"), 'service content extraction must not import the entire route registry');
  const routes = await readFile(new URL('../src/app/utils/routePreload.ts', import.meta.url), 'utf8');
  assert.ok(routes.includes("from './heroPreload'"), 'bootstrap must share the hero registry rather than duplicate its loaders');
});
