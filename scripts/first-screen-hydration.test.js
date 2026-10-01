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
const { renderRoute, SSR_ROUTES, articleVersion } = serverModule.exports;

// Страницы статей и кейсов рендерятся из той же статьи, что уедет в
// <script id="ww-article-seed">; фикстура — опубликованный seed сборки.
const { readFileSync } = await import('node:fs');
const seedFile = JSON.parse(readFileSync('data/articles.build.json', 'utf8'));
const ARTICLES = (Array.isArray(seedFile) ? seedFile : seedFile.articles || []).filter((article) => article.content);
const isCase = (article) => String(article.category || '').trim().toLowerCase() === 'кейсы';
const BLOG_ARTICLE = ARTICLES.find((article) => !isCase(article));
const CASE_ARTICLE = ARTICLES.find(isCase);

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
  'sessionStorage', 'location', 'history', 'matchMedia', 'HTMLCanvasElement', 'HTMLScriptElement', 'HTMLImageElement', 'HTMLAnchorElement',
  'Image', 'DOMRect', 'SVGElement', 'self'];

function installDom(route, html, { head = '', attributes = '', trailingSlash = true } = {}) {
  const dom = new JSDOM(
    `<!doctype html><html lang="ru" data-ww-first-screen="${route}" data-ww-prehydrate="1"${attributes}><head><title>t</title>${head}</head><body><div id="root">${html}</div><div id="ww-static-shell">seo</div></body></html>`,
    { url: `https://www.whalewzrd.com${route === '/' ? '' : route}${trailingSlash ? '/' : ''}`, pretendToBeVisual: true },
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

      // Сетевые запросы в Node не уходят (относительные адреса) — это шум окружения, а не ошибка разметки.
      const problems = logged.filter((line) => /hydrat|did not match|Warning: |mismatch|Uncaught|caught the following error/i.test(line) && !/Failed to parse URL/.test(line));
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

for (const [label, article, section] of [['blog article', BLOG_ARTICLE, 'blog'], ['case', CASE_ARTICLE, 'cases']]) {
  test(`hydrates a ${label} page from its seed without rebuilding the text`, async () => {
    assert.ok(article, `no ${label} with content in data/articles.build.json`);
    const route = `/${section}/${article.slug}`;
    const seed = JSON.parse(JSON.stringify(article));
    const html = await renderRoute(route, { articleSeed: seed });
    assert.doesNotMatch(html, /<script/i, 'серверная разметка статьи не должна содержать <script>');
    const seedJson = JSON.stringify(seed).replace(/</g, '\\u003c');
    const { window, restore } = installDom(route, html, {
      head: `<script type="application/json" id="ww-article-seed">${seedJson}</script>`,
      attributes: ` data-ww-article-version="${articleVersion(seed)}"`,
      // Канонический адрес статьи — без завершающего слеша.
      trailingSlash: false,
    });
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
      const titleBefore = root.querySelector('h1');
      const bodyBefore = root.querySelector('.blog-article-content, .case-article-content, .case-article-body');
      assert.ok(titleBefore, `${route}: server markup has no h1`);
      assert.ok(bodyBefore, `${route}: server markup has no article body`);
      const bodyHtmlBefore = bodyBefore.innerHTML;
      assert.ok(bodyHtmlBefore.length > 200, `${route}: article body is suspiciously short`);
      const recoverable = [];
      hydrateRoot(root, createElement(AppErrorBoundary, null, createElement(App)), {
        onRecoverableError(error) { recoverable.push(String(error)); },
      });
      await new Promise((resolve) => setTimeout(resolve, 400));

      // Сетевые запросы в Node не уходят (относительные адреса) — это шум окружения, а не ошибка разметки.
      const problems = logged.filter((line) => /hydrat|did not match|Warning: |mismatch|Uncaught|caught the following error/i.test(line) && !/Failed to parse URL/.test(line));
      assert.deepEqual(problems, [], `${route}: React reported hydration problems`);
      assert.deepEqual(recoverable, [], `${route}: hydration fell back to client render`);
      assert.equal(root.querySelector('h1'), titleBefore, `${route}: article title must be adopted, not recreated`);
      const bodyAfter = root.querySelector('.blog-article-content, .case-article-content, .case-article-body');
      assert.equal(bodyAfter, bodyBefore, `${route}: article body must be adopted, not recreated`);
      assert.equal(bodyAfter.innerHTML, bodyHtmlBefore, `${route}: hydration must not rewrite the sanitized article text`);
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

test('the pre-paint title fit mirrors the hook and hands its result over through one attribute', async () => {
  const { readFile } = await import('node:fs/promises');
  const prefit = await readFile('scripts/title-prefit.js', 'utf8');
  const hook = await readFile('src/app/utils/contentTypography.ts', 'utf8');
  const generator = await readFile('scripts/generate-pages.js', 'utf8');
  // Один и тот же признак передачи: скрипт ставит, хук снимает.
  assert.match(prefit, /var DONE_ATTR = 'data-ww-title-prefit'/);
  assert.match(hook, /TITLE_PREFIT_ATTRIBUTE = 'data-ww-title-prefit'/);
  assert.match(hook, /element\.hasAttribute\(TITLE_PREFIT_ATTRIBUTE\)/);
  // Те же правила поиска, иначе хук после гидратации пришёл бы к другому кеглю и сдвинул текст.
  for (const source of [prefit, hook]) {
    assert.match(source, /< 12 && (?:high - low|safeHigh - safeLow) > 0\.1/, 'двоичный поиск: 12 шагов до 0,1 px');
    assert.match(source, /Math\.floor\(best \* 10\) \/ 10/, 'одинаковое округление результата');
    assert.match(source, /overlap > smaller \/ 2/, 'строки считаются по перекрытию прямоугольников');
  }
  assert.match(prefit, /DESKTOP_MIN_WIDTH = 768/);
  assert.match(hook, /: 768;/, 'порог десктопа у хука тот же');
  // Скрипт встраивается только на страницы с заголовком под лимитом строк.
  assert.match(generator, /bodyHtml\.includes\('data-ww-title-fit'\)/);
  assert.match(await readFile('src/app/pages/BlogPage.tsx', 'utf8'), /data-ww-title-fit=/);
  assert.match(await readFile('src/app/components/CaseArticleView.tsx', 'utf8'), /data-ww-title-fit=/);
});
