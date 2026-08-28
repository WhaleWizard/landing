import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  applyStoredSiteContentCompatibility,
  LEGACY_META_ADS_CASES,
  loadPublishedSiteContent,
  mergePublishedContent,
  SITE_CONTENT_KEYS,
  writeSiteContentSnapshot,
} from './site-content-sync.js';

const silentLogger = { warn() {} };

test('published partial content uses the same safe merge rules as the live React page', () => {
  const base = {
    seo: { title: 'Source title', description: 'Source description', url: '/fixed' },
    hero: {
      paragraphs: ['Source first', 'Source second'],
      cards: [
        { title: 'First', icon: 'keep-first' },
        { title: 'Second', icon: 'keep-second' },
      ],
    },
  };

  const merged = mergePublishedContent(base, {
    seo: { title: 'Published title', unknown: 'kept after API sanitization' },
    hero: {
      paragraphs: ['Published paragraph'],
      cards: [{ title: 'Published second, moved first', visualSlot: 1 }],
    },
    unknown: 'kept after API sanitization',
  });

  assert.deepEqual(merged.seo, {
    title: 'Published title',
    description: 'Source description',
    url: '/fixed',
    unknown: 'kept after API sanitization',
  });
  assert.deepEqual(merged.hero.paragraphs, ['Published paragraph']);
  assert.deepEqual(merged.hero.cards, [
    { title: 'Published second, moved first', icon: 'keep-second', visualSlot: 1 },
  ]);
  assert.equal(merged.unknown, 'kept after API sanitization');
});

test('published block arrays control additions, deletions and empty optional lists', () => {
  const base = {
    cards: [
      { title: 'First', icon: 'first-icon' },
      { title: 'Second', icon: 'second-icon' },
    ],
    stats: [{ value: '1', label: 'Source' }],
  };
  const merged = mergePublishedContent(base, {
    cards: [
      { title: 'Only retained card', visualSlot: 1 },
      { title: 'New card', visualSlot: 0 },
      { title: 'Another new card', visualSlot: 1 },
    ],
    stats: [],
  });

  assert.deepEqual(merged.cards, [
    { title: 'Only retained card', icon: 'second-icon', visualSlot: 1 },
    { title: 'New card', icon: 'first-icon', visualSlot: 0 },
    { title: 'Another new card', icon: 'second-icon', visualSlot: 1 },
  ]);
  assert.deepEqual(merged.stats, []);
});

test('build compatibility removes only the exact superseded Meta Ads cases', () => {
  const legacy = applyStoredSiteContentCompatibility('service:meta-ads', {
    hero: { badge: 'Published hero stays' },
    cases: structuredClone(LEGACY_META_ADS_CASES),
  });
  assert.deepEqual(legacy, { hero: { badge: 'Published hero stays' } });

  const edited = structuredClone(LEGACY_META_ADS_CASES);
  edited.items[0].description = 'Владелец изменил карточку.';
  const current = applyStoredSiteContentCompatibility('service:meta-ads', { cases: edited });
  assert.equal(current.cases.items[0].description, edited.items[0].description);
});

test('D1 content is fetched for every supported section and stored as a build snapshot', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'whalewzrd-site-content-'));
  const snapshotPath = join(directory, 'snapshot.json');
  const requested = [];

  try {
    const fetchImpl = async (url) => {
      const key = new URL(url).searchParams.get('key');
      requested.push(key);
      const content = key === 'site:home' ? { seo: { title: 'Published home' } } : null;
      return new Response(JSON.stringify({
        success: true,
        source: content ? 'd1' : 'static',
        content,
      }), { status: 200 });
    };

    const result = await loadPublishedSiteContent({
      endpoint: 'https://example.test/api/site-content',
      snapshotPath,
      fetchImpl,
      logger: silentLogger,
    });

    assert.deepEqual(new Set(requested), new Set(SITE_CONTENT_KEYS));
    assert.equal(result['site:home'].seo.title, 'Published home');
    assert.deepEqual(Object.keys(result), ['site:home']);
    const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
    assert.equal(snapshot.sections['site:home'].seo.title, 'Published home');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('network failure uses the last snapshot and never fails generation', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'whalewzrd-site-content-'));
  const snapshotPath = join(directory, 'snapshot.json');

  try {
    writeSiteContentSnapshot(snapshotPath, {
      'service:meta-apps': { hero: { titlePrefix: 'Last published value' } },
    });
    const result = await loadPublishedSiteContent({
      endpoint: 'https://example.test/api/site-content',
      snapshotPath,
      fetchImpl: async () => { throw new Error('offline'); },
      timeoutMs: 10,
      logger: silentLogger,
    });

    assert.equal(result['service:meta-apps'].hero.titlePrefix, 'Last published value');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('strict mode fails the build instead of publishing stale SEO text', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'whalewzrd-site-content-'));
  const snapshotPath = join(directory, 'snapshot.json');

  try {
    writeSiteContentSnapshot(snapshotPath, {
      'site:home': { seo: { title: 'Stale snapshot' } },
    });
    await assert.rejects(
      loadPublishedSiteContent({
        endpoint: 'https://example.test/api/site-content',
        snapshotPath,
        fetchImpl: async () => { throw new Error('offline'); },
        timeoutMs: 10,
        strict: true,
        logger: silentLogger,
      }),
      /Strict refresh failed/,
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('an authoritative static response removes a stale published snapshot', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'whalewzrd-site-content-'));
  const snapshotPath = join(directory, 'snapshot.json');

  try {
    writeSiteContentSnapshot(snapshotPath, {
      'site:faq': { items: [{ question: 'Stale' }] },
    });
    const result = await loadPublishedSiteContent({
      endpoint: 'https://example.test/api/site-content',
      snapshotPath,
      fetchImpl: async () => new Response(JSON.stringify({ success: true, source: 'static', content: null }), { status: 200 }),
      logger: silentLogger,
    });

    assert.deepEqual(result, {});
    const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8'));
    assert.deepEqual(snapshot.sections, {});
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

/**
 * Схема организации живёт в двух местах: React рисует её в браузере
 * (`SEO.tsx`), а генератор — в статическом HTML для роботов
 * (`generate-pages.js`). Разойтись они могут молча, и тогда Google увидит на
 * одной и той же странице разные сведения о компании в зависимости от того,
 * выполнил он скрипты или нет.
 *
 * Это ровно та ловушка, что уже была с тремя санитайзерами статей.
 */
test('сведения об организации совпадают в React и в статическом HTML', () => {
  const seo = readFileSync('src/app/components/SEO.tsx', 'utf8');
  const generator = readFileSync('scripts/generate-pages.js', 'utf8');

  // Без регулярных выражений: ищем строку по началу. Так виднее, что именно
  // сравнивается, и не приходится экранировать шаблон.
  const field = (source, name) => {
    const line = source.split('\n')
      .map((item) => item.trim())
      .find((item) => item.startsWith(`${name}:`));
    return line ? line.slice(name.length + 1).replace(/,$/, '').trim() : null;
  };

  for (const name of ['areaServed', 'availableLanguage', 'serviceType', 'email', 'sameAs']) {
    const left = field(seo, name);
    const right = field(generator, name);
    assert.ok(left, `${name} пропало из SEO.tsx`);
    assert.equal(left, right, `${name} разошлось: в SEO.tsx ${left}, в generate-pages.js ${right}`);
  }
});

test('охват не заявляет стран, под которыми нет языковых версий', () => {
  // Прежде здесь стоял список RU/US/AE/TR/EU: сайт обещал поиску пять
  // регионов, не имея ни одной локализованной версии и ни одного упоминания
  // географии в текстах. Заявленный охват должен подкрепляться языком.
  for (const path of ['src/app/components/SEO.tsx', 'scripts/generate-pages.js']) {
    const source = readFileSync(path, 'utf8');
    const areaServed = source.match(/^\s*areaServed:\s*(.+?),\s*$/m);
    assert.ok(areaServed, `${path}: areaServed пропало`);
    assert.ok(
      !areaServed[1].includes('['),
      `${path}: вернулся список стран — под него нужны hreflang и локализованный контент`,
    );
    assert.match(source, /^\s*availableLanguage:\s*'ru',\s*$/m,
      `${path}: охват без указания языка снова заявляет больше, чем есть`);
  }
});
