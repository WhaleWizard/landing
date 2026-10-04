import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build, transform } from 'esbuild';
import React, { Component, createElement, Suspense, useLayoutEffect, useRef, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { MemoryRouter, Routes, Route, useLocation, useNavigate, useNavigationType } from 'react-router';
import { parseHTML } from 'linkedom';

// Находки аудита группы routing: F-001 (цикл при сбое загрузки куска кода),
// F-002 (запрещённое хранилище ронял сайт), F-003 (смена параметров адреса не
// прокручивает наверх), F-044 (пункты меню главной на закрытые разделы).

const require = createRequire(import.meta.url);
const src = (path) => fileURLToPath(new URL(`../src/app/${path}`, import.meta.url));

async function bundle(path) {
  const compiled = await build({
    entryPoints: [src(path)], bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}

const { preloadable } = await bundle('utils/preloadable.ts');
// Переводы строк приводятся к LF: на Windows git отдаёт исходники с CRLF,
// и поиск конца функции по «\n}\n» иначе не срабатывал.
const lf = (text) => text.replace(/\r\n/g, '\n');
const routesSource = lf(await readFile(src('routes.tsx'), 'utf8'));

async function routeFixture(functionName, params) {
  const start = routesSource.indexOf(`function ${functionName}(`);
  const end = routesSource.indexOf('\n}\n', start) + 3;
  assert.ok(start >= 0 && end > start, `${functionName} must exist in routes.tsx`);
  const compiled = await transform(`export function fixture(${params}) {
${routesSource.slice(start, end)}
return ${functionName};
}`, { loader: 'tsx', format: 'esm', target: 'es2022' });
  const { fixture } = await import(`data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`);
  return fixture;
}

function domFixture(t, html = '<html><body><div id="root"></div></body></html>') {
  const previous = { window: globalThis.window, document: globalThis.document, MutationObserver: globalThis.MutationObserver };
  const { window } = parseHTML(html);
  const scrolls = [];
  window.scrollTo = (position) => scrolls.push(position);
  window.setTimeout = setTimeout;
  window.clearTimeout = clearTimeout;
  window.requestAnimationFrame = (callback) => setTimeout(callback, 0);
  window.cancelAnimationFrame = clearTimeout;
  window.MutationObserver = window.MutationObserver ?? class { observe() {} disconnect() {} };
  window.history = window.history ?? { state: null };
  Object.assign(globalThis, { window, document: window.document, MutationObserver: window.MutationObserver });
  const element = window.document.getElementById('root');
  const root = createRoot(element);
  t.after(() => {
    flushSync(() => root.unmount());
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  return { root, element, window, scrolls };
}

class Boundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    return this.state.error ? createElement('p', { id: 'error' }, String(this.state.error.message)) : this.props.children;
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test('F-001: a failed page chunk reaches the error boundary once instead of looping on the skeleton', async (t) => {
  const { root, element } = domFixture(t);
  const previousError = console.error;
  console.error = () => {};
  t.after(() => { console.error = previousError; });
  let calls = 0;
  const Page = preloadable(async () => {
    calls += 1;
    throw new Error('Failed to fetch dynamically imported module: /assets/Offer-x.js');
  });
  await new Promise((resolve) => {
    root.render(createElement(Boundary, null,
      createElement(Suspense, { fallback: createElement('p', { id: 'skeleton' }, 'skeleton') }, createElement(Page))));
    setTimeout(resolve, 0);
  });
  await settle();
  assert.match(element.textContent, /Failed to fetch dynamically imported module/);
  assert.equal(element.querySelector('#skeleton'), null, 'the skeleton must give way to the error element');
  assert.equal(calls, 1, 'the import is attempted once; RouteErrorBoundary reloads the page itself');
});

test('F-001: lazyServiceLanding keeps the failure and throws it on the next render', async () => {
  const fixture = await routeFixture('lazyServiceLanding', 'createElement, loadServiceLandingPage');
  let calls = 0;
  let heroCalls = 0;
  const loader = async () => { calls += 1; return (loader.resolved = { ServiceLandingPage: () => null }); };
  const hero = async () => { heroCalls += 1; throw new Error('Importing a module script failed.'); };
  const Landing = fixture(createElement, loader)('consult', [hero]);
  let pending;
  try { Landing(); } catch (thrown) { pending = thrown; }
  assert.ok(pending instanceof Promise);
  await pending;
  assert.throws(() => Landing(), /Importing a module script failed/);
  assert.throws(() => Landing(), /Importing a module script failed/, 'failure is not reset by the throw');
  assert.equal(calls, 1);
  assert.equal(heroCalls, 1);
});

test('F-001: the route error boundary still recognises chunk failures for its one-time reload', () => {
  assert.match(routesSource, /Failed to fetch dynamically imported module\|Importing a module script failed\|error loading dynamically imported module/);
  assert.ok(routesSource.includes("'ww_chunk_reload_once_v1'"));
});

test('F-002: blocked storage does not crash the public route layout', async (t) => {
  const { root, element, window } = domFixture(t);
  const denied = () => { throw new DOMException('The operation is insecure.', 'SecurityError'); };
  Object.defineProperty(window, 'sessionStorage', { get: denied, configurable: true });
  const { useRememberPublicRoute } = await bundle('utils/siteNavigation.ts');
  function Layout() {
    useRememberPublicRoute();
    return createElement('h1', null, 'Лендинг открылся');
  }
  const previousError = console.error;
  console.error = () => {};
  t.after(() => { console.error = previousError; });
  flushSync(() => root.render(createElement(Boundary, null,
    createElement(MemoryRouter, { initialEntries: ['/meta-ads'] },
      createElement(Routes, null, createElement(Route, { path: '*', element: createElement(Layout) }))))));
  await settle();
  await new Promise((resolve) => setTimeout(resolve, 520)); // таймер на 500 мс вызывает тот же save()
  assert.equal(element.textContent, 'Лендинг открылся');
  assert.equal(element.querySelector('#error'), null, 'storage denial must not reach the error boundary');
});

test('F-003: changing only the query string (sort, search, filters) keeps the scroll position; a new pathname starts at the top', async (t) => {
  const { root, scrolls } = domFixture(t);
  const restores = [];
  const Restoration = (await routeFixture(
    'StableScrollPositionRestoration',
    'useLocation, useNavigationType, useRef, useEffect, useIsomorphicLayoutEffect, readDocumentScrollY, restoreWindowScrollPosition, onUserScrollIntent',
  ))(useLocation, useNavigationType, useRef, useEffect, useLayoutEffect, () => 0, (y) => { restores.push(y); }, () => () => {});
  let navigate;
  function Grab() { navigate = useNavigate(); return null; }
  flushSync(() => root.render(createElement(MemoryRouter, { initialEntries: ['/blog'] },
    createElement(Grab), createElement(Restoration))));
  // React Router applies navigation in a transition; wait for the commit.
  const go = async (to, options) => { navigate(to, options); await settle(); };
  await go('/blog?sort=oldest', { replace: true });
  await go('/blog?sort=oldest&q=мета', { replace: true });
  assert.deepEqual(scrolls, [], 'sorting and typing in the blog search must not scroll to the top');
  await go('/cases', { replace: true });
  assert.equal(scrolls.length, 1, 'a replace to a different page still opens from the top');
  await go('/blog/some-article');
  assert.equal(scrolls.length, 2, 'opening an article starts at the top');
  assert.deepEqual(restores, [], 'no POP happened, so nothing is restored');
});

test('F-003: route focus is not moved when only the query string changes', async (t) => {
  const { root } = domFixture(t);
  const focuses = [];
  const FocusManager = (await routeFixture(
    'RouteFocusManager',
    'useLocation, useNavigationType, useRef, useEffect, focusRouteHeading',
  ))(useLocation, useNavigationType, useRef, useEffect, () => { focuses.push(1); return () => {}; });
  let navigate;
  function Grab() { navigate = useNavigate(); return null; }
  flushSync(() => root.render(createElement(MemoryRouter, { initialEntries: ['/cases'] },
    createElement(Grab), createElement(FocusManager))));
  const go = async (to, options) => { navigate(to, options); await settle(); };
  await go('/cases?filter=meta', { replace: true });
  assert.equal(focuses.length, 0, 'a filter click must leave keyboard focus on the button');
  await go('/blog');
  assert.equal(focuses.length, 1, 'a real page change still announces the heading');
});

test('F-003: blog and cases filters ask the router not to reset scroll', async () => {
  for (const page of ['BlogPage', 'CasesPage']) {
    const source = lf(await readFile(src(`pages/${page}.tsx`), 'utf8'));
    assert.ok(source.includes('navigate(nextUrl, { replace: true, preventScrollReset: true'), `${page} filter sync must keep the scroll position`);
  }
});

test('F-044: home menu items for cases and blog disappear together with a closed section', async () => {
  const source = lf(await readFile(src('components/Navbar.tsx'), 'utf8'));
  assert.ok(source.includes("{ label: 'Кейсы', action: () => scrollToSection('cases'), routePath: '/cases' }"));
  assert.ok(source.includes("{ label: 'Блог', action: () => scrollToSection('blog'), routePath: '/blog' }"));
  assert.ok(source.includes('allNavItems.filter((item) => !item.routePath || !isHiddenInNav(item.routePath))'));
  const home = lf(await readFile(src('pages/Home.tsx'), 'utf8'));
  assert.ok(home.includes("!isHiddenInNav('/cases')") && home.includes("!isHiddenInNav('/blog')"), 'the sections the menu scrolls to are hidden by the same rule');
});
