const { build } = require('esbuild');
const { ssrBuildOptions } = require('../ssr-bundle.js');
const { createRequire } = require('node:module');
const { JSDOM } = require('jsdom');

async function testHydration() {
  const serverBundle = await build(ssrBuildOptions({
    stdin: {
      contents: `
        import React from 'react';
        import { renderToString } from 'react-dom/server';
        import { createStaticHandler, createStaticRouter, StaticRouterProvider } from 'react-router';
        import { routes } from './src/app/routes';
        import { AppFrame } from './src/app/App';
        import { loadCookiePolicy } from './src/app/utils/routePreload';

        export async function render(url) {
          await loadCookiePolicy();
          const handler = createStaticHandler(routes);
          const context = await handler.query(new Request('https://www.whalewzrd.com' + url));
          const router = createStaticRouter(handler.dataRoutes, context);
          return renderToString(
            <AppFrame>
              <StaticRouterProvider router={router} context={context} />
            </AppFrame>
          );
        }
      `,
      resolveDir: process.cwd(),
      loader: 'tsx',
    },
    format: 'cjs',
    write: false,
  }));

  const m = { exports: {} };
  new Function('require', 'module', 'exports', serverBundle.outputFiles[0].text)(require, m, m.exports);
  const html = await m.exports.render('/cookie-policy');

  const dom = new JSDOM(
    `<!doctype html><html lang="ru" data-ww-first-screen="/cookie-policy" data-ww-prehydrate="1"><head><title>t</title></head><body><div id="root">${html}</div></body></html>`,
    { url: 'https://www.whalewzrd.com/cookie-policy/', pretendToBeVisual: true }
  );

  const GLOBALS = ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent', 'MutationObserver',
    'IntersectionObserver', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'localStorage',
    'sessionStorage', 'location', 'history', 'matchMedia', 'HTMLCanvasElement', 'HTMLScriptElement', 'HTMLImageElement', 'HTMLAnchorElement',
    'Image', 'DOMRect', 'SVGElement', 'self'];
  
  const define = (key, value) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  for (const k of GLOBALS) {
    if (k in dom.window) define(k, dom.window[k]);
  }
  globalThis.window.matchMedia = () => ({ matches: false, addListener: () => {}, removeListener: () => {} });
  class Observer { observe() {} unobserve() {} disconnect() {} }
  globalThis.window.IntersectionObserver = Observer;
  globalThis.window.ResizeObserver = Observer;

  // Now client bundle executed AFTER globals are set
  const clientBundle = await build(ssrBuildOptions({
    stdin: {
      contents: `
        export { default as App } from './src/app/App';
        export { default as AppErrorBoundary } from './src/app/components/AppErrorBoundary';
        export { prepareRoute } from './src/app/utils/routePreload';
        export { hydrateRoot } from 'react-dom/client';
        export { createElement } from 'react';
      `,
      resolveDir: process.cwd(),
      loader: 'tsx',
    },
    format: 'cjs',
    write: false,
  }));

  const clientModule = { exports: {} };
  new Function('require', 'module', 'exports', clientBundle.outputFiles[0].text)(require, clientModule, clientModule.exports);

  const logged = [];
  console.warn = (...args) => logged.push(args.join(' '));
  console.error = (...args) => logged.push(args.join(' '));

  await clientModule.exports.prepareRoute('https://www.whalewzrd.com/cookie-policy/');

  const root = dom.window.document.getElementById('root');
  const recoverable = [];
  clientModule.exports.hydrateRoot(root, clientModule.exports.createElement(clientModule.exports.App), {
    onRecoverableError(err) { recoverable.push(String(err)); }
  });

  await new Promise(r => setTimeout(r, 400));

  console.log('Hydration check:');
  console.log('Recoverable errors:', recoverable);
  console.log('Console logs/warns:', logged);
}

testHydration().catch(console.error);
