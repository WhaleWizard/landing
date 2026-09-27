import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import { JSDOM } from 'jsdom';

const compiled = await transform(await readFile('src/app/utils/routeFocus.ts', 'utf8'), { loader: 'ts', format: 'cjs' });

function fixture(t) {
  const dom = new JSDOM('<div id="root"><main></main></div>', { pretendToBeVisual: true });
  const module = { exports: {} };
  const { window } = dom;
  new Function('module', 'exports', 'window', 'document', 'HTMLElement', 'MutationObserver', compiled.code)(
    module, module.exports, window, window.document, window.HTMLElement, window.MutationObserver,
  );
  t.after(() => window.close());
  return { window, document: window.document, focus: module.exports.focusRouteHeading };
}

test('focus waits for a lazy route heading and stops watching after it appears', async t => {
  const { window, document, focus } = fixture(t);
  const stop = focus();
  await new Promise(resolve => window.setTimeout(resolve, 25));
  document.querySelector('main').innerHTML = '<h1>Страница</h1>';
  await Promise.resolve();
  assert.equal(document.activeElement, document.querySelector('h1'));
  document.querySelector('main').innerHTML = '<h1>Другая</h1>';
  await Promise.resolve();
  assert.equal(document.activeElement, document.body, 'completed focus must not run again');
  stop();
});

test('a visitor interaction cancels pending focus before a slow route arrives', async t => {
  const { window, document, focus } = fixture(t);
  const stop = focus();
  document.dispatchEvent(new window.Event('pointerdown', { bubbles: true }));
  document.querySelector('main').innerHTML = '<h1>Страница</h1>';
  await Promise.resolve();
  assert.equal(document.activeElement, document.body);
  stop();
});

test('an open modal owns focus even when a new heading arrives', async t => {
  const { document, focus } = fixture(t);
  const stop = focus();
  document.querySelector('main').innerHTML = '<h1>Страница</h1><div role="dialog" aria-modal="true"></div>';
  await Promise.resolve();
  assert.equal(document.activeElement, document.body);
  stop();
});
