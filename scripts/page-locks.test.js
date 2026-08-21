import { strict as assert } from 'node:assert';
import { readFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { STATIC_ROUTES } from './config.js';

/**
 * Контракт «Доступа к страницам».
 *
 * Проверка блокировки живёт на сервере, а знание о ней — ещё и в браузере.
 * Два списка обязаны совпадать, иначе меню и заглушка разъедутся. Плюс здесь
 * закреплено то, что нельзя ломать никогда: закрыть админку или приём заявок,
 * протащить разметку в текст заглушки и увести кнопку на чужой адрес.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function importModule(relativePath, suffix) {
  const esbuild = await import('esbuild');
  const outfile = join(ROOT, 'scripts', `.page-locks.test.${suffix}.${process.pid}.mjs`);
  await esbuild.build({
    entryPoints: [join(ROOT, relativePath)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    outfile,
    packages: 'external',
    logLevel: 'silent',
  });
  try {
    return await import(`${pathToFileURL(outfile).href}?t=${Date.now()}`);
  } finally {
    try { unlinkSync(outfile); } catch { /* временный файл */ }
  }
}

const server = await importModule('functions/_lib/page-locks.ts', 'server');
const page = await importModule('functions/_lib/page-lock-page.ts', 'page');
const client = await importModule('src/app/utils/pageLocks.ts', 'client');

const catalogPaths = server.PAGE_LOCK_ROUTES.map((route) => route.path);

test('каталог страниц совпадает с картой разделов сайта', () => {
  const source = readFileSync(join(ROOT, 'src/app/utils/siteNavigation.ts'), 'utf8');
  const start = source.indexOf('export const ROUTE_LABELS');
  assert.ok(start >= 0, 'в siteNavigation.ts нет ROUTE_LABELS');
  const block = source.slice(start, source.indexOf('};', start));
  const routes = [...block.matchAll(/'(\/[^']*)':/g)].map((match) => match[1]);

  assert.deepEqual(
    [...catalogPaths].sort(),
    [...routes].sort(),
    'PAGE_LOCK_ROUTES и ROUTE_LABELS разошлись: страница либо не закрывается, либо закрывается несуществующая',
  );
});

test('все предрендеренные страницы есть в каталоге', () => {
  for (const route of STATIC_ROUTES) {
    assert.ok(catalogPaths.includes(route), `маршрут ${route} собирается в статику, но им нельзя управлять`);
  }
});

test('админку, API и служебные файлы закрыть нельзя', () => {
  for (const path of ['/admin', '/admin/content-preview', '/api/lead', '/api/page-locks', '/sitemap.xml', '/feed.xml', '/robots.txt', '/llms.txt']) {
    assert.equal(server.isLockablePath(path), false, `${path} не должен поддаваться блокировке`);
  }
  for (const path of ['/blog', '/google-ads', '/']) {
    assert.equal(server.isLockablePath(path), true, `${path} должен закрываться`);
  }
  assert.equal(server.isLockablePath('/whatever'), false, 'неизвестный адрес не должен записываться в блокировки');
});

test('раздел закрывается вместе с вложенными адресами, главная — нет', () => {
  const blog = { ...server.emptyLock('/blog'), includeChildren: true };
  assert.ok(server.findPageLock([blog], '/blog'));
  assert.ok(server.findPageLock([blog], '/blog/kak-schitat-cpl'));
  assert.equal(server.findPageLock([blog], '/cases'), null);

  const home = { ...server.emptyLock('/'), includeChildren: true };
  assert.ok(server.findPageLock([home], '/'));
  assert.equal(server.findPageLock([home], '/google-ads'), null, 'блокировка главной не должна гасить весь сайт');
});

test('список для разметки читается браузером без потерь', () => {
  const locks = [
    { ...server.emptyLock('/blog'), includeChildren: true, hideInNav: true },
    { ...server.emptyLock('/google-ads'), includeChildren: false, hideInNav: false },
  ];
  const serialized = server.serializeLockPaths(locks);
  assert.equal(serialized, '/blog/* ~/google-ads');

  const parsed = client.parseLockList(serialized);
  assert.deepEqual(parsed, [
    { path: '/blog', includeChildren: true, hideInNav: true },
    { path: '/google-ads', includeChildren: false, hideInNav: false },
  ]);
});

test('тексты заглушки остаются простым текстом', () => {
  const dirty = '<script>alert(1)</script> Скоро    откроем';
  const clean = server.sanitizeLockText(dirty, server.LOCK_TITLE_MAX);
  assert.ok(!clean.includes('<'), 'разметка обязана вырезаться');
  assert.ok(!clean.includes('>'), 'разметка обязана вырезаться');
  assert.equal(clean, 'scriptalert(1)/script Скоро откроем');
  assert.equal(server.sanitizeLockText('a'.repeat(500), server.LOCK_TITLE_MAX).length, server.LOCK_TITLE_MAX);
});

test('вторая кнопка ведёт только внутрь сайта', () => {
  assert.equal(server.normalizeCtaPath('https://example.com/phish'), '/');
  assert.equal(server.normalizeCtaPath('//example.com'), '/');
  assert.equal(server.normalizeCtaPath('/nope'), '/');
  assert.equal(server.normalizeCtaPath('/consult'), '/consult');
});

test('заглушка отдаётся кодом 503 и не индексируется', async () => {
  const lock = { ...server.emptyLock('/blog'), title: 'Тест "кавычки" & <b>', message: 'Текст' };
  const response = page.renderPageLockResponse({ lock, path: '/blog', formState: 'idle', formStamp: '' });

  assert.equal(response.status, 503, 'закрытая страница обязана отвечать «временно недоступна», а не 404 и не 200');
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.ok(response.headers.get('Retry-After'));

  const html = await response.text();
  assert.ok(!html.includes('<b>'), 'текст владельца обязан экранироваться');
  assert.ok(html.includes('&lt;b&gt;'));
  assert.ok(html.includes('name="robots" content="noindex, nofollow"'));
  assert.ok(!/<script/i.test(html), 'заглушка не должна содержать скриптов');
});

test('форма на заглушке появляется только когда её включили', () => {
  const base = server.emptyLock('/blog');
  const withForm = page.renderPageLockHtml({ lock: base, path: '/blog', formState: 'idle', formStamp: 'stamp' });
  assert.ok(withForm.includes('/api/page-lock-notify'));

  const withoutForm = page.renderPageLockHtml({
    lock: { ...base, showSubscribe: false },
    path: '/blog',
    formState: 'idle',
    formStamp: '',
  });
  assert.ok(!withoutForm.includes('/api/page-lock-notify'));
});
