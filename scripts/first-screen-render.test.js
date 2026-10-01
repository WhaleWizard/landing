import test from 'node:test';
import assert from 'node:assert/strict';
import { build, transform } from 'esbuild';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';
import sharp from 'sharp';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SSR_ASSET_PLACEHOLDER, ssrBuildOptions } from './ssr-bundle.js';

/**
 * Первый экран маркетинговых страниц рендерится на сборке настоящими
 * компонентами и гидратируется в браузере. Эти тесты стерегут контракт
 * серверной разметки: текст виден без JavaScript, нет «появлений» с
 * opacity:0, нет адресов из бандла, которые разошлись бы с браузером.
 */
const compiled = await build(ssrBuildOptions({
  entryPoints: ['scripts/ssr-entry.tsx'], format: 'cjs', write: false,
}));
const module = { exports: {} };
new Function('require', 'module', 'exports', compiled.outputFiles[0].text)(createRequire(import.meta.url), module, module.exports);
const { renderRoute, SSR_ROUTES } = module.exports;

const homeOverride = {
  hero: {
    badge: 'Реклама для бизнеса', titlePrefix: 'Первый экран', titleAccent: 'без мигания',
    paragraphs: ['Сохранённый владельцем текст'], primaryButton: 'Обсудить', secondaryButton: 'Кейсы',
    stats: [{ value: '1', label: 'Первый' }, { value: '2', label: 'Второй' }, { value: '3', label: 'Третий' }],
    titleAnimation: { effect: 'typewriter', speed: 'slow' },
  },
};

const renderHome = () => renderRoute('/', { siteContent: { key: 'site:home', content: homeOverride } });

test('server-rendered home shows the real hero, published text and visible, link-driven calls to action', async () => {
  const html = await renderHome();
  const { document } = parseHTML(html);
  assert.equal(document.querySelectorAll('h1').length, 1);
  assert.match(document.querySelector('h1').textContent, /Первый экран.*без мигания/);
  assert.ok(document.querySelector('#hero.cosmic-hero .cosmic-stage .cosmic-whale img'));
  assert.equal(document.querySelector('#hero')?.getAttribute('data-hero-effects'), 'settled');
  // Пауза петель до гидратации живёт на <html> (ставит генератор), а не в
  // атрибуте секции: атрибут из рендера разошёлся бы с разметкой у тех, кто
  // просит меньше движения, и React перестроил бы первый экран.
  assert.equal(document.querySelector('#hero')?.hasAttribute('data-hero-ambient'), false);
  assert.ok(document.querySelector('a[href="#contact"]'));
  assert.ok(document.querySelector('a[href="#cases"]'));
  assert.match(html, /Сохранённый владельцем текст/);
  assert.doesNotMatch(html, /Загружаем интерактивную/);
  // Отложенные секции — заглушки своей высоты: их код не грузится на сборке,
  // а браузер в первом кадре рисует ровно то же.
  assert.ok(document.querySelectorAll('[data-home-placeholder]').length >= 8);
});

test('every hydratable route renders a visible hero without entrance styles or bundled asset URLs', async () => {
  assert.deepEqual([...SSR_ROUTES], ['/', '/meta-ads', '/meta-apps', '/google-ads', '/consult']);
  for (const route of SSR_ROUTES) {
    const key = route === '/' ? 'site:home' : `service:${route.slice(1)}`;
    const html = await renderRoute(route, { siteContent: { key, content: null } });
    const { document } = parseHTML(html);
    assert.ok(document.querySelector('#hero'), `${route}: hero is missing`);
    assert.ok(document.querySelector('nav.ww-public-navbar'), `${route}: navbar is missing`);
    assert.equal(document.querySelectorAll('h1').length, 1, `${route}: exactly one h1`);
    assert.equal(document.querySelector('#hero')?.getAttribute('data-hero-effects'), 'settled', `${route}: title effects must not replay`);
    for (const node of document.querySelectorAll('[style]')) {
      assert.doesNotMatch(node.getAttribute('style'), /(?:^|;)opacity:\s*0(?:;|$)/, `${route}: SSR must not hide content pending JS`);
    }
    assert.doesNotMatch(html, new RegExp(SSR_ASSET_PLACEHOLDER.replace(/[/]/g, '\\/')), `${route}: bundled asset URL leaked into markup`);
    assert.doesNotMatch(html, /Загружаем интерактивную/);
    assert.ok(/--home-deferred-mobile|--deferred-height-mobile/.test(html), `${route}: deferred sections must stay placeholders`);
  }
});

test('a route outside the hydratable list is refused instead of rendered half-way', async () => {
  await assert.rejects(() => renderRoute('/blog'), /not server-rendered/);
});

test('desktop-only SSR decoration provides a non-network mobile source', async () => {
  const { document } = parseHTML(await renderHome());
  const sources = [...document.querySelectorAll('picture source[media="(max-width: 900px)"]')]
    .filter((source) => (source.getAttribute('srcSet') || source.getAttribute('srcset')).startsWith('data:image/'));
  assert.equal(sources.length, 6);
  for (const source of sources) assert.match(source.getAttribute('srcSet') || source.getAttribute('srcset'), /^data:image\//);
});

test('compact cosmic decoration preserves transparent 3x assets without competing with the hero', async () => {
  const config = JSON.parse(await readFile('src/app/data/cosmicCompactImages.json', 'utf8'));
  const { document } = parseHTML(await renderHome());
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
  const compiledScene = await build(ssrBuildOptions({
    entryPoints: ['src/app/components/CosmicHeroScene.tsx'], format: 'cjs', write: false,
  }));
  for (const width of [375, 430, 896, 932, 1440]) {
    const sceneModule = { exports: {} };
    const window = { matchMedia: () => ({ matches: width <= 900 }) };
    // Обычный переход внутри сайта (не гидратация): телефон сразу получает
    // компактную сцену, иначе WebKit запрашивал бы и оригиналы, и копии.
    const document = { documentElement: { dataset: {} } };
    new Function('require', 'module', 'exports', 'window', 'document', compiledScene.outputFiles[0].text)(
      createRequire(import.meta.url), sceneModule, sceneModule.exports, window, document,
    );
    const { document: rendered } = parseHTML(renderToStaticMarkup(createElement(sceneModule.exports.default)));
    const decorations = [...rendered.querySelectorAll('.cosmic-moon,.cosmic-shard')];
    assert.equal(decorations.length, width <= 900 ? 6 : 12);
    for (const image of decorations) {
      assert.equal(image.getAttribute('src').endsWith('-compact.webp'), width <= 900,
        `width ${width}: detached img must not start an unnecessary original request`);
    }
    assert.equal(rendered.querySelector('.cosmic-whale img').getAttribute('src'), '/images/cosmic/whale.webp');
  }

  // Гидратация первого экрана из HTML: первый рендер совпадает с серверным
  // (полный набор), компактный набор включает эффект после монтирования.
  const sceneModule = { exports: {} };
  const window = { matchMedia: () => ({ matches: true }) };
  const document = { documentElement: { dataset: {} } };
  new Function('require', 'module', 'exports', 'window', 'document', compiledScene.outputFiles[0].text)(
    createRequire(import.meta.url), sceneModule, sceneModule.exports, window, document,
  );
  const { document: hydrating } = parseHTML(renderToStaticMarkup(createElement(sceneModule.exports.default, { hydrating: true })));
  assert.equal(hydrating.querySelectorAll('.cosmic-moon,.cosmic-shard').length, 12);

  const { document: server } = parseHTML(await renderHome());
  assert.equal([...server.querySelectorAll('.cosmic-moon,.cosmic-shard')]
    .every(image => !image.getAttribute('src').endsWith('-compact.webp')), true,
  'SSR retains desktop fallbacks; media sources choose compact before JavaScript');
});

test('first-screen handoff recognises a reloaded history entry without suppressing later SPA entrances', async () => {
  const source = await readFile('src/app/utils/firstScreen.ts', 'utf8');
  const compiled = await transform(source, { loader: 'ts', format: 'cjs' });
  for (const key of ['default', 'existing-home-entry']) {
    const module = { exports: {} };
    const document = { documentElement: { dataset: { wwFirstScreen: '/' } } };
    new Function('module', 'exports', 'document', 'window', compiled.code)(module, module.exports, document, { history: { state: { key } } });
    assert.equal(module.exports.hasGeneratedFirstScreen('/', key), true);
    assert.equal(module.exports.hasGeneratedFirstScreen('/', 'another-entry'), false);
    assert.equal(module.exports.hasGeneratedFirstScreen('/admin/content-preview', key), false);
    assert.equal(module.exports.generatedFirstScreenRoute(), '/');
  }
  // Адрес со слешем и без — один маршрут.
  const module = { exports: {} };
  const document = { documentElement: { dataset: { wwFirstScreen: '/meta-ads' } } };
  new Function('module', 'exports', 'document', 'window', compiled.code)(module, module.exports, document, { history: { state: null } });
  assert.equal(module.exports.hasGeneratedFirstScreen('/meta-ads/', 'default'), true);
  assert.equal(module.exports.hasGeneratedFirstScreen('/', 'default'), false);
});
