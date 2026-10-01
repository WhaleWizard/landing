import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import { ssrBuildOptions } from './ssr-bundle.js';

/**
 * Главная проверка первого экрана: разметка сборки должна гидратироваться
 * без единого расхождения. Иначе React молча перестраивает страницу с
 * клиента — и владелец снова видит «сначала одна страница, потом другая».
 *
 * Серверный бандл и клиентский собираются одинаково, но живут раздельно:
 * у каждого свой кэш текстов и свой список закрытых страниц, как и в бою.
 * React здесь в dev-сборке намеренно: только она ругается на расхождение
 * атрибутов, production пропускает его молча.
 */
const require = createRequire(import.meta.url);

const serverBundle = await build(ssrBuildOptions({ entryPoints: ['scripts/ssr-entry.tsx'], format: 'cjs', write: false }));
const serverModule = { exports: {} };
new Function('require', 'module', 'exports', serverBundle.outputFiles[0].text)(require, serverModule, serverModule.exports);
const { renderRoute, SSR_ROUTES } = serverModule.exports;

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

const GLOBALS = ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent', 'MutationObserver',
  'IntersectionObserver', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'localStorage',
  'sessionStorage', 'location', 'history', 'matchMedia', 'HTMLCanvasElement', 'Image', 'DOMRect', 'SVGElement', 'self'];

function installDom(route, html) {
  const dom = new JSDOM(
    `<!doctype html><html lang="ru" data-ww-first-screen="${route}" data-ww-prehydrate="1"><head><title>t</title></head><body><div id="root">${html}</div><div id="ww-static-shell">seo</div></body></html>`,
    { url: `https://www.whalewzrd.com${route === '/' ? '' : route}/`, pretendToBeVisual: true },
  );
  const { window } = dom;
  const media = new Map();
  window.matchMedia = (query) => {
    if (!media.has(query)) {
      const target = new window.EventTarget();
      // Телефон: узкий экран и грубый указатель. Именно здесь первый рендер
      // раньше расходился с серверным (компактная сцена вместо полной).
      target.matches = /max-width: (?:900|767)px|pointer: coarse|hover: none/.test(query) && !/prefers-reduced-motion/.test(query);
      target.media = query;
      target.addListener = () => {};
      target.removeListener = () => {};
      media.set(query, target);
    }
    return media.get(query);
  };
  class Observer {
    constructor() {}
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.IntersectionObserver = Observer;
  window.ResizeObserver = Observer;
  window.HTMLCanvasElement.prototype.getContext = () => ({
    clearRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {}, setTransform() {}, moveTo() {}, lineTo() {},
  });
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  // `navigator` и часть других глобалов Node отдаёт через геттер — обычное
  // присваивание падает, поэтому подменяем через defineProperty и так же
  // возвращаем исходные дескрипторы после теста.
  const previous = new Map(GLOBALS.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const define = (key, value) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  for (const key of GLOBALS) {
    if (key in window) define(key, window[key]);
  }
  define('requestAnimationFrame', window.requestAnimationFrame.bind(window));
  define('cancelAnimationFrame', window.cancelAnimationFrame.bind(window));
  return {
    window,
    restore() {
      for (const key of GLOBALS) {
        const descriptor = previous.get(key);
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
      window.close();
    },
  };
}

for (const route of SSR_ROUTES) {
  test(`hydrates ${route} without rebuilding the generated first screen`, async () => {
    const key = route === '/' ? 'site:home' : `service:${route.slice(1)}`;
    const html = await renderRoute(route, { siteContent: { key, content: null } });
    const { window, restore } = installDom(route, html);
    const logged = [];
    const originalError = console.error;
    const originalWarn = console.warn;
    console.error = (...args) => { logged.push(args.map(String).join(' ')); };
    console.warn = (...args) => { logged.push(args.map(String).join(' ')); };
    try {
      const client = { exports: {} };
      new Function('require', 'module', 'exports', clientBundle.outputFiles[0].text)(require, client, client.exports);
      const { App, AppErrorBoundary, prepareRoute, hydrateRoot, createElement } = client.exports;
      await prepareRoute(window.location.href);

      const root = window.document.getElementById('root');
      const heroBefore = root.querySelector('#hero');
      const imageBefore = root.querySelector('#hero img');
      const recoverable = [];
      hydrateRoot(root, createElement(AppErrorBoundary, null, createElement(App)), {
        onRecoverableError(error) { recoverable.push(String(error)); },
      });
      // Гидратация асинхронна, а ленивые границы React гидратирует отдельными
      // проходами: ждём, пока закоммитится всё дерево и пройдут эффекты.
      await new Promise((resolve) => setTimeout(resolve, 400));

      const problems = logged.filter((line) => /hydrat|did not match|Warning: |mismatch/i.test(line));
      assert.deepEqual(problems, [], `${route}: React reported hydration problems`);
      assert.deepEqual(recoverable, [], `${route}: hydration fell back to client render`);
      assert.equal(root.querySelector('#hero'), heroBefore, `${route}: hero element must be adopted, not recreated`);
      if (imageBefore) assert.equal(root.querySelector('#hero img'), imageBefore, `${route}: hero image must survive hydration`);
      assert.equal(root.querySelectorAll('h1').length, 1);
    } finally {
      console.error = originalError;
      console.warn = originalWarn;
      restore();
    }
  });
}

test('the hydration release is wired into main.tsx and the pre-hydration pause into the stylesheet', async () => {
  const { readFile } = await import('node:fs/promises');
  const main = await readFile('src/main.tsx', 'utf8');
  assert.match(main, /hydrateRoot\(rootElement/);
  assert.match(main, /delete document\.documentElement\.dataset\.wwPrehydrate/);
  assert.match(main, /getElementById\(STATIC_SHELL_ID\)\?\.remove\(\)/);
  const css = await readFile('src/styles/index.css', 'utf8');
  assert.match(css, /html\[data-ww-prehydrate\]/);
});
