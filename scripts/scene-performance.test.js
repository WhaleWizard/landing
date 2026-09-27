import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

const require = createRequire(import.meta.url);
async function loadModule(path) {
  const result = await build({
    entryPoints: [new URL(path, import.meta.url).pathname.replace(/^\/(\w:)/, '$1')],
    bundle: true, write: false, format: 'cjs', platform: 'node', jsx: 'automatic',
    external: ['react', 'motion/react'], loader: { '.css': 'empty' },
  });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}
const { createSceneFrameClock } = await loadModule('../src/app/utils/motionPerformance.ts');
const scenes = await Promise.all([
  ['Cosmic', '../src/app/components/CosmicHeroScene.tsx'],
  ['Consult', '../src/app/components/service-heroes/ConsultDeskScene.tsx'],
  ['Thanks', '../src/app/components/ThanksCosmicScene.tsx'],
].map(async ([name, path]) => [name, (await loadModule(path)).default]));

function fixture(t, Component, { reduced = false, compact = false } = {}) {
  const dom = new JSDOM('<html><body><div id="mount"></div></body></html>', { url: 'https://example.test' });
  const { window } = dom;
  const globals = ['window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame', 'IntersectionObserver', 'ResizeObserver'];
  const previous = Object.fromEntries(globals.map((key) => [key, globalThis[key]]));
  const frames = new Map();
  const timers = new Map();
  const intersections = new Set();
  const resizes = new Set();
  let nextId = 0;
  let hidden = false;
  let paints = 0;
  let points = [];
  const context = {
    clearRect() { paints += 1; points = []; },
    beginPath() {}, arc(x, y, r) { points.push({ x, y, r }); }, fill() {},
  };
  Object.defineProperties(window.document, { hidden: { get: () => hidden } });
  Object.defineProperties(window.HTMLElement.prototype, {
    clientWidth: { get: () => compact ? 390 : 1200 },
    clientHeight: { get: () => 700 },
  });
  window.HTMLCanvasElement.prototype.getContext = () => context;
  window.devicePixelRatio = 2;
  const media = new Map();
  window.matchMedia = (query) => {
    if (!media.has(query)) {
      const target = new window.EventTarget();
      target.matches = query.includes('reduced-motion') ? reduced : compact;
      media.set(query, target);
    }
    return media.get(query);
  };
  window.requestAnimationFrame = (callback) => { const id = ++nextId; frames.set(id, callback); return id; };
  window.cancelAnimationFrame = (id) => frames.delete(id);
  window.setTimeout = (callback) => { const id = ++nextId; timers.set(id, callback); return id; };
  window.clearTimeout = (id) => timers.delete(id);
  class Observer {
    constructor(callback, collection) { this.callback = callback; this.collection = collection; collection.add(this); }
    observe(target) { this.target = target; }
    disconnect() { this.collection.delete(this); }
  }
  class Intersection extends Observer { constructor(callback) { super(callback, intersections); } }
  class Resize extends Observer { constructor(callback) { super(callback, resizes); } }
  Object.assign(globalThis, {
    window, document: window.document,
    requestAnimationFrame: window.requestAnimationFrame,
    cancelAnimationFrame: window.cancelAnimationFrame,
    IntersectionObserver: Intersection, ResizeObserver: Resize,
  });
  const root = createRoot(window.document.getElementById('mount'));
  flushSync(() => root.render(createElement(Component)));
  for (const observer of intersections) observer.callback([{ isIntersecting: true }]);
  const unmount = () => flushSync(() => root.unmount());
  t.after(() => {
    unmount();
    window.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  return {
    window, frames, timers, intersections, resizes, media, unmount,
    get paints() { return paints; }, get points() { return points; },
    step(now) {
      const pending = [...frames.values()]; frames.clear();
      for (const callback of pending) callback(now);
    },
    reduced(value) {
      const target = media.get('(prefers-reduced-motion: reduce)');
      target.matches = value;
      target.dispatchEvent(new window.Event('change'));
    },
    hidden(value) {
      hidden = value;
      window.document.dispatchEvent(new window.Event('visibilitychange'));
    },
    resize(width, height) {
      for (const observer of resizes) observer.callback([{ contentRect: { width, height } }]);
    },
  };
}

for (const compact of [false, true]) {
  for (const hz of [60, 120, 144]) {
    test(`frame clock: ${compact ? '24' : '60'} paints per second on ${hz} Hz without changing movement speed`, () => {
      const clock = createSceneFrameClock(compact);
      let frames = 0;
      let distance = 0;
      for (let i = 0; i < hz * 4; i += 1) {
        const step = clock.step(i * 1000 / hz);
        if (step) frames += 1;
        distance += step;
      }
      assert.ok(Math.abs(frames - (compact ? 24 : 60) * 4) <= 1, String(frames));
      assert.ok(Math.abs(distance - 240) < 3, String(distance));
      clock.reset();
      assert.equal(clock.step(100000), 1, 'resuming after a long pause must not jump');
    });
  }
}

for (const [name, Component] of scenes) {
  test(`${name}: actual scene limits desktop paints to 60 Hz and releases its work`, (t) => {
    const browser = fixture(t, Component);
    const before = browser.paints;
    for (let i = 0; i < 120; i += 1) browser.step(i * 1000 / 120);
    assert.ok(browser.paints - before >= 59 && browser.paints - before <= 61);
    browser.hidden(true);
    assert.equal(browser.frames.size, 0);
    browser.hidden(false);
    assert.equal(browser.frames.size, 1);
    browser.unmount();
    assert.equal(browser.frames.size + browser.timers.size + browser.resizes.size + browser.intersections.size, 0);
  });

  test(`${name}: reduced motion reacts live; resize keeps and redraws the static particle pattern`, (t) => {
    const browser = fixture(t, Component, { reduced: true });
    assert.equal(browser.frames.size, 0);
    const old = browser.points[0];
    const before = browser.paints;
    browser.resize(1440, 840);
    assert.equal(browser.paints, before + 1, 'resized paused bitmap must not stay empty');
    assert.ok(Math.abs(browser.points[0].x - old.x * 1.2) < 0.001);
    assert.ok(Math.abs(browser.points[0].y - old.y * 1.2) < 0.001);
    assert.equal(browser.frames.size, 0);
    browser.reduced(false);
    assert.equal(browser.frames.size, 1);
    browser.step(16);
    browser.reduced(true);
    assert.equal(browser.frames.size, 0);
  });

  test(`${name}: compact canvas keeps the scene at a bounded pixel resolution`, (t) => {
    const browser = fixture(t, Component, { reduced: true, compact: true });
    const canvas = browser.window.document.querySelector('canvas');
    assert.equal(canvas.width, Math.round(390 * 1.25));
    assert.equal(canvas.height, Math.round(700 * 1.25));
  });
}

for (const [name, Component] of scenes.filter(([name]) => name !== 'Cosmic')) {
  test(`${name}: CSS ambient state pauses with tab visibility and restores only on-screen scenes`, (t) => {
    const browser = fixture(t, Component);
    const scene = browser.window.document.querySelector('[data-ambient]');
    assert.equal(scene.dataset.ambient, 'on');
    browser.hidden(true);
    assert.equal(scene.dataset.ambient, 'off');
    browser.hidden(false);
    assert.equal(scene.dataset.ambient, 'on');
    for (const observer of browser.intersections) observer.callback([{ isIntersecting: false }]);
    assert.equal(browser.frames.size, 0);
    browser.hidden(true);
    browser.hidden(false);
    assert.equal(scene.dataset.ambient, 'off');
    assert.equal(browser.frames.size, 0);
  });
}
