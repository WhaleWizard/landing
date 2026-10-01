import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { ssrBuildOptions } from './ssr-bundle.js';

/**
 * Паутинка: телефон и планшет получают SVG-созвездие с CSS-движением, экран с
 * курсором — прежний интерактивный холст. Тест стережёт сам выбор режима и
 * то, что созвездие строится из того же узора: плотность, дистанция связи,
 * слои дрейфа и бродящее свечение.
 */
const require = createRequire(import.meta.url);
const compiled = await build(ssrBuildOptions({
  entryPoints: ['src/app/components/PlexusBackdrop.tsx'], format: 'cjs', write: false,
  external: ['react', 'react-dom', 'motion/react'],
}));

function mount({ coarse }) {
  const dom = new JSDOM('<html><body><section style="width:900px;height:600px"><div id="mount"></div></section></body></html>', { url: 'https://example.test', pretendToBeVisual: true });
  const { window } = dom;
  window.matchMedia = (query) => ({
    matches: /pointer: coarse|max-width: 900px/.test(query) ? coarse : false,
    media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  });
  class Observer { observe() {} disconnect() {} unobserve() {} }
  window.IntersectionObserver = Observer;
  window.ResizeObserver = Observer;
  window.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 900, height: 600, left: 0, top: 0, right: 900, bottom: 600 });
  window.HTMLCanvasElement.prototype.getContext = () => ({ clearRect() {}, setTransform() {}, stroke() {}, fill() {}, beginPath() {}, moveTo() {}, lineTo() {}, arc() {} });
  const globals = ['window', 'document', 'navigator', 'HTMLElement', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver', 'IntersectionObserver', 'matchMedia', 'Path2D'];
  const previous = new Map(globals.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const define = (key, value) => Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  for (const key of globals) if (key in window) define(key, window[key]);
  define('requestAnimationFrame', () => 1);
  define('cancelAnimationFrame', () => {});
  define('Path2D', class { moveTo() {} lineTo() {} arc() {} });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(require, module, module.exports);
  const root = createRoot(window.document.getElementById('mount'));
  flushSync(() => root.render(createElement(module.exports.default, { className: 'absolute inset-0' })));
  return {
    document: window.document,
    cleanup() {
      flushSync(() => root.unmount());
      for (const key of globals) {
        const descriptor = previous.get(key);
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete globalThis[key];
      }
      window.close();
    },
  };
}

test('touch devices get the SVG constellation, not a canvas', () => {
  const { document, cleanup } = mount({ coarse: true });
  try {
    assert.equal(document.querySelector('canvas'), null, 'на телефоне холста быть не должно');
    const layers = document.querySelectorAll('svg.plexus-static__layer');
    assert.equal(layers.length, 2, 'два слоя дрейфа');
    for (const layer of layers) assert.ok(layer.classList.contains('ww-ambient-motion'), 'слой встаёт на паузу вне экрана');
    const nodes = document.querySelectorAll('.plexus-static__layer--near circle');
    const count = Math.min(56, Math.max(36, Math.round((900 * 600) / 25000)));
    assert.equal(nodes.length, count, 'плотность та же, что у холста на компактном экране');
    const links = document.querySelectorAll('.plexus-static__layer--near line');
    assert.ok(links.length > 0, 'связи между близкими точками есть');
    for (const line of links) {
      const alpha = Number(line.getAttribute('stroke-opacity'));
      assert.ok(alpha > 0 && alpha <= 0.16, 'прозрачность связи убывает с расстоянием');
    }
    assert.ok(document.querySelector('.plexus-static__glow.ww-ambient-motion'), 'бродящее свечение на месте');
    assert.match(document.querySelector('.plexus-static').getAttribute('style'), /--plexus-w:\s*900px/);
  } finally {
    cleanup();
  }
});

test('pointer devices keep the interactive canvas', () => {
  const { document, cleanup } = mount({ coarse: false });
  try {
    assert.ok(document.querySelector('canvas'), 'на десктопе остаётся холст');
    assert.equal(document.querySelector('svg.plexus-static__layer'), null);
  } finally {
    cleanup();
  }
});

test('constellation is deterministic for the same box', async () => {
  const { readFile } = await import('node:fs/promises');
  const source = await readFile('src/app/components/PlexusBackdrop.tsx', 'utf8');
  assert.doesNotMatch(source.slice(source.indexOf('function buildConstellation'), source.indexOf('function PlexusConstellation')), /Math\.random/);
  const css = await readFile('src/styles/plexus-static.css', 'utf8');
  assert.match(css, /@keyframes plexus-static-glow/);
  assert.doesNotMatch(css, /filter:\s*blur/, 'свечение без blur: один слой с градиентом');
});
