import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';

const compiled = await build({
  entryPoints: [fileURLToPath(new URL('../src/app/utils/contentTypography.ts', import.meta.url))],
  bundle: true, write: false, format: 'cjs', platform: 'node', packages: 'external',
});
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { useManagedTitleFit } = module.exports;

async function fixture(t) {
  const dom = new JSDOM('<html><body><div id="root"></div></body></html>');
  const { window } = dom;
  const keys = ['window', 'document', 'MutationObserver', 'ResizeObserver'];
  const previous = Object.fromEntries(keys.map(key => [key, globalThis[key]]));
  const frames = new Map();
  const timers = new Map();
  let sequence = 0;
  let width = 200;
  let fontScale = 1;
  let fontWrites = 0;
  let geometryReads = 0;
  let observer;
  window.innerWidth = 390;
  window.requestAnimationFrame = callback => { const id = ++sequence; frames.set(id, callback); return id; };
  window.cancelAnimationFrame = id => frames.delete(id);
  window.setTimeout = callback => { const id = ++sequence; timers.set(id, callback); return id; };
  window.clearTimeout = id => timers.delete(id);
  const size = element => Number.parseFloat(element.style.fontSize) || 40;
  const textWidth = element => element.textContent.length * size(element) * fontScale;
  Object.defineProperties(window.HTMLElement.prototype, {
    clientWidth: { get() { geometryReads++; return width; } },
    clientHeight: { get() { geometryReads++; return Math.round(size(this) * 1.2); } },
    offsetWidth: { get() { geometryReads++; return width; } },
    offsetHeight: { get() { geometryReads++; return Math.round(size(this) * 1.2); } },
    scrollWidth: { get() { geometryReads++; return Math.max(width, textWidth(this)); } },
  });
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    geometryReads++;
    return { top: 0, left: 0, right: width, bottom: size(this) * 1.2, width, height: size(this) * 1.2 };
  };
  const originalComputed = window.getComputedStyle.bind(window);
  window.getComputedStyle = element => {
    const computed = originalComputed(element);
    return new Proxy(computed, { get(target, key) {
      if (key === 'fontSize') return `${size(element)}px`;
      if (key === 'fontFamily') return 'TestFont';
      if (key === 'lineHeight') return `${size(element) * 1.2}px`;
      return target[key];
    } });
  };
  const originalSet = window.CSSStyleDeclaration.prototype.setProperty;
  window.CSSStyleDeclaration.prototype.setProperty = function (key, ...values) {
    if (key === 'font-size' && this === window.document.querySelector('h1')?.style) fontWrites++;
    return originalSet.call(this, key, ...values);
  };
  window.Range.prototype.getClientRects = function () {
    const node = this.commonAncestorContainer.nodeType === 1 ? this.commonAncestorContainer : this.commonAncestorContainer.parentElement;
    return [{ top: 0, bottom: size(node) * 1.2, left: 0, right: textWidth(node), width: textWidth(node), height: size(node) * 1.2 }];
  };
  const fonts = new window.EventTarget();
  fonts.ready = Promise.resolve();
  Object.defineProperty(window.document, 'fonts', { value: fonts });
  class ResizeObserver {
    constructor(callback) { this.callback = callback; observer = this; }
    observe() {}
    disconnect() {}
  }
  Object.assign(globalThis, { window, document: window.document, MutationObserver: window.MutationObserver, ResizeObserver });
  function Heading() {
    const ref = useManagedTitleFit(undefined, { nowrap: true, minFontSize: 8 });
    return createElement('h1', { ref }, 'ABCDEFGHIJ');
  }
  const root = createRoot(window.document.getElementById('root'));
  flushSync(() => root.render(createElement(Heading)));
  const heading = window.document.querySelector('h1');
  const drain = async () => {
    for (let i = 0; i < 6; i++) {
      await Promise.resolve();
      const pending = [...frames.values()]; frames.clear();
      pending.forEach(callback => callback());
    }
  };
  await drain();
  t.after(() => {
    flushSync(() => root.unmount());
    window.CSSStyleDeclaration.prototype.setProperty = originalSet;
    dom.window.close();
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  });
  return {
    heading, window, drain,
    get fontWrites() { return fontWrites; },
    get geometryReads() { return geometryReads; },
    resize(nextWidth) {
      width = nextWidth;
      observer.callback([{ borderBoxSize: [{ inlineSize: width, blockSize: Math.round(size(heading) * 1.2) }], contentRect: { width, height: size(heading) * 1.2 } }]);
    },
    timers() { const pending = [...timers.values()]; timers.clear(); pending.forEach(callback => callback()); },
    font(family, scale = fontScale) {
      fontScale = scale;
      const event = new window.Event('loadingdone');
      Object.defineProperty(event, 'fontfaces', { value: [{ family }] });
      fonts.dispatchEvent(event);
    },
  };
}

test('late guards reuse a settled heading without repeating font-size writes', async (t) => {
  const browser = await fixture(t);
  assert.equal(browser.heading.style.fontSize, '20px');
  const writes = browser.fontWrites;
  browser.timers();
  await browser.drain();
  assert.equal(browser.fontWrites, writes);
  assert.equal(browser.heading.style.fontSize, '20px');
});

test('ResizeObserver reads its entry only; a wider container restores authored typography', async (t) => {
  const browser = await fixture(t);
  const before = browser.geometryReads;
  browser.resize(500);
  assert.equal(browser.geometryReads, before, 'no layout reads inside the observer callback');
  await browser.drain();
  assert.equal(browser.heading.style.fontSize, '', 'the 40px CSS size fits at 500px');
  browser.resize(100);
  await browser.drain();
  assert.equal(browser.heading.style.fontSize, '10px');
});

test('unrelated font arrivals do no work; the heading font arrival refits real glyph widths', async (t) => {
  const browser = await fixture(t);
  const before = browser.fontWrites;
  browser.font('UnrelatedFont');
  await browser.drain();
  assert.equal(browser.fontWrites, before);
  browser.font('TestFont', 1.25);
  await browser.drain();
  assert.equal(browser.heading.style.fontSize, '16px');
  assert.ok(browser.fontWrites > before);
});

test('CMS text edits invalidate the cache even when container dimensions stay unchanged', async (t) => {
  const browser = await fixture(t);
  browser.heading.textContent = 'ABCDEFGHIJKLMNOPQRST';
  await browser.drain();
  assert.equal(browser.heading.style.fontSize, '10px');
});
