import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { parseHTML } from 'linkedom';

const compiled = await build({
  entryPoints: [fileURLToPath(new URL('../src/app/components/hooks/useScrollTo.tsx', import.meta.url))],
  bundle: true, platform: 'node', format: 'cjs', packages: 'external', write: false,
});

const deferredCompiled = await build({
  entryPoints: [fileURLToPath(new URL('../src/app/utils/deferredAnchor.ts', import.meta.url))],
  bundle: true, platform: 'node', format: 'cjs', write: false,
});

function fixture(t) {
  const previous = { window: globalThis.window, document: globalThis.document, Element: globalThis.Element, MutationObserver: globalThis.MutationObserver };
  const { document, Element } = parseHTML('<html><body></body></html>').window;
  const timers = new Map();
  const frames = new Map();
  const observers = new Set();
  const listeners = new Map();
  const scrolls = [];
  const cleanups = [];
  let id = 0;
  const window = {
    scrollY: 500, innerWidth: 390,
    location: { hash: '#contact' },
    requestAnimationFrame: (callback) => { frames.set(++id, callback); return id; },
    cancelAnimationFrame: (key) => frames.delete(key),
    matchMedia: () => ({ matches: false }),
    setTimeout: (callback) => { timers.set(++id, callback); return id; },
    clearTimeout: (key) => timers.delete(key),
    scrollTo: (position) => scrolls.push(position),
    addEventListener: (name, listener) => {
      if (!listeners.has(name)) listeners.set(name, new Set());
      listeners.get(name).add(listener);
    },
    removeEventListener: (name, listener) => listeners.get(name)?.delete(listener),
  };
  class MutationObserver {
    constructor(callback) { this.callback = callback; }
    observe() { observers.add(this); }
    disconnect() { observers.delete(this); }
  }
  Object.assign(globalThis, { window, document, Element, MutationObserver });
  // Test callback lifetime/cleanup with the actual hook and its actual scroll
  // helpers. Hook primitives are deterministic; this is not a browser test.
  const react = {
    useCallback: (callback) => callback,
    useRef: (current) => ({ current }),
    useEffect: (effect) => cleanups.push(effect()),
  };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(
    (name) => { assert.equal(name, 'react'); return react; }, module, module.exports,
  );
  const hook = module.exports.useScrollTo();
  const deferredModule = { exports: {} };
  new Function('module', 'exports', deferredCompiled.outputFiles[0].text)(deferredModule, deferredModule.exports);
  const unmount = () => cleanups.forEach((cleanup) => cleanup?.());
  t.after(() => {
    unmount();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key];
      else globalThis[key] = value;
    }
  });
  return {
    hook, timers, scrolls, unmount, window, document, frames, observers,
    onCleanup: (callback) => cleanups.push(callback),
    ...deferredModule.exports,
    mutate: () => [...observers].forEach((observer) => observer.callback()),
    frame: () => { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach((fn) => fn()); },
    listenerCount: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
    fire: (name) => [...(listeners.get(name) ?? [])].forEach((listener) => listener({ target: document.body })),
    tick: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((callback) => callback()); },
    addTarget: (id, top = 200) => {
      const element = document.createElement('section');
      element.id = id;
      element.getBoundingClientRect = () => ({ top });
      document.body.append(element);
    },
  };
}

function deferredFixture(t) {
  const f = fixture(t);
  f.document.body.innerHTML = '<main><nav></nav><section data-home-section data-home-anchor="services"><div data-home-placeholder></div></section><section data-home-section data-home-anchor="contact"><div id="contact"></div></section><section data-home-section><div data-home-placeholder></div></section></main>';
  f.document.querySelector('nav').getBoundingClientRect = () => ({ height: 96 });
  let top = 200;
  f.document.getElementById('contact').getBoundingClientRect = () => ({ top });
  const sections = [...f.document.querySelectorAll('[data-home-section]')];
  sections[1].getBoundingClientRect = () => ({ top });
  const cleanup = f.alignDeferredAnchor('contact', sections[1]);
  f.onCleanup(cleanup);
  return { ...f, sections, cleanup, changeTop: (next) => { top = next; }, ready: () => {
    sections[0].querySelector('[data-home-placeholder]').remove();
    f.mutate();
  } };
}

test('deep anchors wait for real predecessor commits and align only once below navbar', (t) => {
  const f = deferredFixture(t);
  f.frame();
  assert.equal(f.scrolls.length, 0, 'do not jump to a placeholder estimate');
  assert.equal(f.frames.size, 0, 'do not poll RAF while waiting for the chunk');
  f.changeTop(460);
  f.ready();
  f.frame();
  f.changeTop(480);
  f.frame();
  assert.equal(f.scrolls.length, 0, 'wait until post-commit geometry settles');
  f.frame();
  assert.deepEqual(f.scrolls, [{ top: 876, left: 0, behavior: 'auto' }]);
  assert.equal(f.observers.size, 0);
  assert.equal(f.timers.size, 0);
  assert.equal(f.listenerCount(), 0);
  f.mutate(); f.frame();
  assert.equal(f.scrolls.length, 1, 'later unrelated mutations cannot move the visitor');
});

test('only the target and its real DOM predecessors wake for a deep hash', (t) => {
  const f = deferredFixture(t);
  assert.deepEqual(f.sections.map(f.precedesDeferredHashTarget), [true, true, false]);
  f.window.location.hash = '';
  assert.deepEqual(f.sections.map(f.precedesDeferredHashTarget), [false, false, false]);
  f.window.location.hash = '#unknown';
  assert.deepEqual(f.sections.map(f.precedesDeferredHashTarget), [false, false, false]);
});

test('a child reveal transform does not change the section anchor offset', (t) => {
  const f = deferredFixture(t);
  f.document.getElementById('contact').getBoundingClientRect = () => ({ top: 220 });
  f.ready(); f.frame(); f.frame();
  assert.deepEqual(f.scrolls, [{ top: 596, left: 0, behavior: 'auto' }]);
});

for (const intent of ['wheel', 'touchmove', 'pointerdown']) {
  test(`deferred commit cannot undo ${intent} before the target is ready`, (t) => {
    const f = deferredFixture(t);
    f.frame(); f.fire(intent); f.ready(); f.frame();
    assert.equal(f.scrolls.length, 0);
    assert.equal(f.observers.size, 0);
    assert.equal(f.listenerCount(), 0);
  });
}

test('font completion schedules one alignment, but never revives a cancelled task', async (t) => {
  const f = deferredFixture(t);
  let resolve;
  const fonts = { status: 'loading', ready: new Promise((done) => { resolve = done; }) };
  Object.defineProperty(f.document, 'fonts', { value: fonts });
  f.ready(); f.frame();
  assert.equal(f.frames.size, 0);
  f.cleanup();
  fonts.status = 'loaded'; resolve(); await fonts.ready;
  assert.equal(f.frames.size, 0);
  assert.equal(f.scrolls.length, 0);
});

test('failed lazy load expires without forcing a late scroll', (t) => {
  const f = deferredFixture(t);
  f.frame(); f.tick(); f.ready(); f.frame();
  assert.equal(f.scrolls.length, 0);
  assert.equal(f.observers.size, 0);
  assert.equal(f.listenerCount(), 0);
});

test('Home wires readiness markers and the shared anchor coordinator', async () => {
  const source = await readFile(new URL('../src/app/pages/Home.tsx', import.meta.url), 'utf8');
  assert.match(source, /data-home-placeholder=""/);
  assert.match(source, /data-home-section="" data-home-anchor=\{anchorId\}/);
  assert.match(source, /precedesDeferredHashTarget\(section\)/);
  assert.match(source, /return alignDeferredAnchor\(anchorId, section\)/);
  assert.match(source, /\[anchorId, location\.hash, location\.key, navigationType, shouldRender\]/);
  assert.doesNotMatch(source, /scrollIntoView|window\.scrollTo/);
});

for (const intent of ['wheel', 'touchmove']) {
  test(`${intent} cancels an anchor that appears after the visitor moves`, (t) => {
    const f = fixture(t);
    f.hook.scrollToWhenReady('contact');
    assert.equal(f.timers.size, 1);
    f.fire(intent);
    f.addTarget('contact');
    f.tick();
    assert.equal(f.scrolls.length, 0);
    assert.equal(f.listenerCount(), 0);
  });
}

test('a new immediate destination cancels the old delayed destination', (t) => {
  const f = fixture(t);
  f.hook.scrollToWhenReady('contact');
  f.hook.scrollToHome();
  f.addTarget('contact');
  f.tick();
  assert.deepEqual(f.scrolls, [{ top: 0, behavior: 'smooth' }]);
  assert.equal(f.listenerCount(), 0);
});

test('ready targets preserve offset and native smooth behavior and release listeners', (t) => {
  const f = fixture(t);
  f.addTarget('cases');
  f.hook.scrollToWhenReady('cases', { offset: 88 });
  assert.deepEqual(f.scrolls, [{ top: 612, behavior: 'smooth' }]);
  assert.equal(f.listenerCount(), 0);
  assert.equal(f.timers.size, 0);
});

test('replacement, exhausted attempts and unmount leave no delayed work', (t) => {
  const f = fixture(t);
  f.hook.scrollToWhenReady('old');
  f.hook.scrollToWhenReady('new', { attempts: 1 });
  assert.equal(f.timers.size, 1);
  f.tick();
  assert.equal(f.timers.size, 0);
  assert.equal(f.listenerCount(), 0);
  f.hook.scrollToWhenReady('contact');
  f.unmount();
  f.addTarget('contact');
  f.tick();
  assert.equal(f.scrolls.length, 0);
  assert.equal(f.listenerCount(), 0);
});
