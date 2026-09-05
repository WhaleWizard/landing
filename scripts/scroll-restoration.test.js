import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import { parseHTML } from 'linkedom';

const source = await readFile(new URL('../src/app/utils/scrollRestoration.ts', import.meta.url), 'utf8');
const compiled = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022' });
const { onUserScrollIntent, readDocumentScrollY, restoreWindowScrollPosition } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.code).toString('base64')}`
);

function browserFixture(t) {
  const original = { window: globalThis.window, document: globalThis.document, Element: globalThis.Element };
  const { document, Element } = parseHTML('<html><body><input id="input"><button id="button">Go</button></body></html>').window;
  let height = 6000;
  Object.defineProperties(document.documentElement, {
    scrollHeight: { get: () => height },
    clientWidth: { value: 390 },
  });
  const listeners = new Map();
  const frames = new Map();
  const timers = new Map();
  const positions = [];
  let nextId = 0;
  const window = {
    innerWidth: 390,
    innerHeight: 800,
    scrollY: 0,
    addEventListener(name, listener) {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
    },
    removeEventListener(name, listener) { listeners.get(name)?.delete(listener); },
    requestAnimationFrame(callback) { const id = ++nextId; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout(callback) { const id = ++nextId; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); },
    scrollTo(position) { positions.push(position); window.scrollY = position.top; },
  };
  Object.assign(globalThis, { window, document, Element });
  t.after(() => {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  const fire = (name, properties = {}) => {
    const event = { target: document.body, ...properties };
    for (const listener of [...(listeners.get(name) ?? [])]) listener(event);
  };
  const stepFrames = (count = 1) => {
    for (let step = 0; step < count; step += 1) {
      const pending = [...frames.values()];
      frames.clear();
      for (const callback of pending) callback();
    }
  };
  const runTimers = () => {
    const pending = [...timers.values()];
    timers.clear();
    for (const callback of pending) callback();
  };
  return {
    window, document, positions, frames, timers, fire, stepFrames, runTimers,
    resizeDocument: (nextHeight) => { height = nextHeight; },
    listenerCount: () => [...listeners.values()].reduce((count, set) => count + set.size, 0),
  };
}

test('document position survives a dialog body-lock even when the window reports zero', (t) => {
  const browser = browserFixture(t);
  browser.window.scrollY = 2300;
  assert.equal(readDocumentScrollY(), 2300);
  Object.assign(browser.document.body.style, { position: 'fixed', overflow: 'hidden', top: '-2300px' });
  browser.window.scrollY = 0;
  assert.equal(readDocumentScrollY(), 2300);
  // Opening a nested document must keep the same outer lock position.
  assert.equal(readDocumentScrollY(), 2300);
  Object.assign(browser.document.body.style, { position: '', overflow: '', top: '' });
  browser.window.scrollY = 2300;
  assert.equal(readDocumentScrollY(), 2300);
});

test('a missing or unrelated body offset does not manufacture a scroll position', (t) => {
  const browser = browserFixture(t);
  browser.window.scrollY = 125;
  browser.document.body.style.top = '-900px';
  assert.equal(readDocumentScrollY(), 125);
  Object.assign(browser.document.body.style, { position: 'fixed', overflow: 'hidden', top: 'auto' });
  assert.equal(readDocumentScrollY(), 125);
  browser.document.body.style.top = '0px';
  assert.equal(readDocumentScrollY(), 0);
});

test('history restore retains the late correction for content that grows after initial layout', (t) => {
  const browser = browserFixture(t);
  browser.resizeDocument(1200);
  restoreWindowScrollPosition(4000);
  browser.stepFrames(4);
  assert.equal(browser.window.scrollY, 400);
  browser.resizeDocument(6000);
  browser.runTimers();
  assert.equal(browser.window.scrollY, 4000);
  assert.equal(browser.listenerCount(), 0);
});

test('wheel after initial restoration cannot be undone by the 1200ms correction', (t) => {
  const browser = browserFixture(t);
  restoreWindowScrollPosition(2000);
  browser.stepFrames(4);
  assert.equal(browser.window.scrollY, 2000);
  browser.fire('wheel', { deltaY: 200 });
  browser.window.scrollY = 2200;
  browser.runTimers();
  browser.stepFrames(120);
  assert.equal(browser.window.scrollY, 2200);
  assert.equal(browser.positions.length, 1);
  assert.equal(browser.listenerCount(), 0);
});

test('touch scrolling before first layout cancels every pending restore', (t) => {
  const browser = browserFixture(t);
  restoreWindowScrollPosition(2000);
  browser.fire('touchmove');
  browser.stepFrames(120);
  browser.runTimers();
  assert.equal(browser.positions.length, 0);
  assert.equal(browser.frames.size + browser.timers.size, 0);
});

test('the initiating click and normal pointerdown do not cancel an anchor task', (t) => {
  const browser = browserFixture(t);
  let cancelled = 0;
  const stop = onUserScrollIntent(() => { cancelled += 1; });
  browser.fire('pointerdown', { button: 0, pointerType: 'mouse', clientX: 100 });
  browser.fire('click');
  assert.equal(cancelled, 0);
  browser.fire('touchmove');
  browser.fire('wheel');
  assert.equal(cancelled, 1);
  stop();
  assert.equal(browser.listenerCount(), 0);
});

test('scroll keys cancel restoration but form controls and consumed keys do not', (t) => {
  const browser = browserFixture(t);
  let cancelled = 0;
  onUserScrollIntent(() => { cancelled += 1; });
  browser.fire('keydown', { key: 'ArrowDown', target: browser.document.getElementById('input') });
  browser.fire('keydown', { key: ' ', target: browser.document.getElementById('button') });
  browser.fire('keydown', { key: 'Home', ctrlKey: true });
  browser.fire('keydown', { key: 'PageDown', defaultPrevented: true });
  assert.equal(cancelled, 0);
  browser.fire('keydown', { key: 'PageDown' });
  assert.equal(cancelled, 1);
  assert.equal(browser.listenerCount(), 0);
});

test('dragging a classic scrollbar cancels restoration without treating page buttons as scroll', (t) => {
  const browser = browserFixture(t);
  browser.window.innerWidth = 405;
  let cancelled = 0;
  onUserScrollIntent(() => { cancelled += 1; });
  browser.fire('pointerdown', { button: 0, pointerType: 'mouse', clientX: 200 });
  assert.equal(cancelled, 0);
  browser.fire('pointerdown', { button: 0, pointerType: 'mouse', clientX: 399 });
  assert.equal(cancelled, 1);
});

test('unmount cleanup prevents both RAF and timer corrections and removes listeners', (t) => {
  const browser = browserFixture(t);
  const cleanup = restoreWindowScrollPosition(2000);
  cleanup();
  cleanup();
  browser.stepFrames(120);
  browser.runTimers();
  assert.equal(browser.positions.length, 0);
  assert.equal(browser.listenerCount(), 0);
});
