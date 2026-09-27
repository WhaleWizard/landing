import test from 'node:test';
import assert from 'node:assert/strict';
import { build, transform } from 'esbuild';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import sharp from 'sharp';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const compiled = await build({
  entryPoints: ['scripts/first-screen-entry.tsx'], bundle: true, platform: 'node',
  format: 'cjs', packages: 'external', write: false, loader: { '.css': 'empty' }, jsx: 'automatic',
});
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);

const content = {
  badge: 'Реклама для бизнеса', titlePrefix: 'Первый экран', titleAccent: 'без мигания',
  paragraphs: ['Сохранённый владельцем текст'], primaryButton: 'Обсудить', secondaryButton: 'Кейсы',
  stats: [{ value: '1', label: 'Первый' }, { value: '2', label: 'Второй' }, { value: '3', label: 'Третий' }],
  titleAnimation: { effect: 'typewriter', speed: 'slow' },
};

test('static first screen renders the real hero, published text, links and visible entrance', () => {
  const html = module.exports.renderHomeFirstScreen(content);
  const { document } = parseHTML(html);
  assert.equal(document.querySelectorAll('h1').length, 1);
  assert.match(document.querySelector('h1').textContent, /Первый экран.*без мигания/);
  assert.equal(document.querySelector('[data-ww-first-screen]')?.getAttribute('data-ww-first-screen'), '/');
  assert.ok(document.querySelector('#hero.cosmic-hero .cosmic-stage .cosmic-whale img'));
  assert.equal(document.querySelector('#hero')?.getAttribute('data-hero-effects'), 'settled');
  assert.equal(document.querySelector('#hero')?.getAttribute('data-hero-ambient'), 'off', 'static first paint must not start CSS animation loops before React');
  assert.ok(document.querySelector('a[href="#contact"]'));
  assert.ok(document.querySelector('a[href="#cases"]'));
  assert.match(html, /Сохранённый владельцем текст/);
  for (const node of document.querySelectorAll('.cosmic-copy [style]')) {
    assert.doesNotMatch(node.getAttribute('style'), /(?:^|;)opacity:0(?:;|$)/, 'SSR must not hide text or statistic cards pending JS');
  }
  assert.doesNotMatch(html, /Загружаем интерактивную/);
});

test('desktop-only SSR decoration provides a non-network mobile source', () => {
  const { document } = parseHTML(module.exports.renderHomeFirstScreen(content));
  const sources = [...document.querySelectorAll('picture source[media="(max-width: 900px)"]')]
    .filter((source) => (source.getAttribute('srcSet') || source.getAttribute('srcset')).startsWith('data:image/'));
  assert.equal(sources.length, 6);
  for (const source of sources) assert.match(source.getAttribute('srcSet') || source.getAttribute('srcset'), /^data:image\//);
});

test('compact cosmic decoration preserves transparent 3x assets without competing with the hero', async () => {
  const config = JSON.parse(await readFile('src/app/data/cosmicCompactImages.json', 'utf8'));
  const { document } = parseHTML(module.exports.renderHomeFirstScreen(content));
  const sources = [...document.querySelectorAll('picture source')]
    .filter((source) => (source.getAttribute('srcSet') || source.getAttribute('srcset')).endsWith('-compact.webp'));
  assert.equal(sources.length, Object.keys(config.widths).length);
  const css = await readFile('src/styles/cosmic-hero.css', 'utf8');
  for (const source of sources) {
    const img = source.parentElement.querySelector('img');
    const href = source.getAttribute('srcSet') || source.getAttribute('srcset');
    const name = href.split('/').at(-1).replace('-compact.webp', '');
    const variant = await readFile(`public${href}`);
    const original = await readFile(`public/images/cosmic/${name}.webp`);
    const meta = await sharp(variant).metadata();
    const originalMeta = await sharp(original).metadata();
    const className = [...img.classList].find((value) => /^cosmic-[mc]\d+$/.test(value));
    const cap = Number(css.match(new RegExp(`\\.${className}\\s*\\{[^}]*width:\\s*min\\([^,]+,\\s*(\\d+)px\\)`))?.[1]);
    assert.ok(cap > 0, `${name}: missing compact CSS size cap`);
    assert.equal(meta.width, config.widths[name]);
    assert.ok(meta.width >= cap * 3, `${name}: variant must cover an iPhone DPR 3 display`);
    assert.equal(meta.hasAlpha, true);
    assert.ok(Math.abs(meta.height - originalMeta.height * meta.width / originalMeta.width) <= 1, `${name}: preserve aspect ratio`);
    assert.ok(variant.length < original.length, `${name}: compact file must save network bytes`);
    assert.equal(img.getAttribute('loading'), 'eager', 'transformed decorations must still load reliably');
    assert.equal(img.getAttribute('fetchpriority'), 'low');
    assert.equal(source.getAttribute('media'), `(max-width: ${config.maxViewportWidth}px)`);
  }
  assert.equal(document.querySelector('.cosmic-whale img').getAttribute('fetchpriority'), 'high');
});

test('first client render gives detached images the correct viewport fallback before picture is attached', async () => {
  const compiledScene = await build({
    entryPoints: ['src/app/components/CosmicHeroScene.tsx'], bundle: true, platform: 'node',
    format: 'cjs', packages: 'external', write: false, loader: { '.css': 'empty' }, jsx: 'automatic',
  });
  for (const width of [375, 430, 896, 932, 1440]) {
    const sceneModule = { exports: {} };
    const window = { matchMedia: () => ({ matches: width <= 900 }) };
    new Function('require', 'module', 'exports', 'window', compiledScene.outputFiles[0].text)(
      createRequire(import.meta.url), sceneModule, sceneModule.exports, window,
    );
    const { document } = parseHTML(renderToStaticMarkup(createElement(sceneModule.exports.default)));
    const decorations = [...document.querySelectorAll('.cosmic-moon,.cosmic-shard')];
    assert.equal(decorations.length, width <= 900 ? 6 : 12);
    for (const image of decorations) {
      assert.equal(image.getAttribute('src').endsWith('-compact.webp'), width <= 900,
        `width ${width}: detached img must not start an unnecessary original request`);
    }
    assert.equal(document.querySelector('.cosmic-whale img').getAttribute('src'), '/images/cosmic/whale.webp');
  }
  const { document } = parseHTML(module.exports.renderHomeFirstScreen(content));
  assert.equal([...document.querySelectorAll('.cosmic-moon,.cosmic-shard')]
    .every(image => !image.getAttribute('src').endsWith('-compact.webp')), true,
  'SSR retains desktop fallbacks; media sources choose compact before JavaScript');
});

test('first-screen handoff recognises a reloaded history entry without suppressing later SPA entrances', async () => {
  const source = await readFile('src/app/utils/firstScreen.ts', 'utf8');
  const compiled = await transform(source, { loader: 'ts', format: 'cjs' });
  for (const key of ['default', 'existing-home-entry']) {
    const module = { exports: {} };
    const document = { querySelector: () => ({ getAttribute: () => '/' }) };
    new Function('module', 'exports', 'document', 'window', compiled.code)(module, module.exports, document, { history: { state: { key } } });
    assert.equal(module.exports.hasGeneratedFirstScreen('/', key), true);
    assert.equal(module.exports.hasGeneratedFirstScreen('/', 'another-entry'), false);
    assert.equal(module.exports.hasGeneratedFirstScreen('/admin/content-preview', key), false);
  }
});
