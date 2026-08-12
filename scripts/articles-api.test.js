import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { build } from 'esbuild';

async function bundleTypeScript(path) {
  const result = await build({
    entryPoints: [path],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'node',
    write: false,
  });
  const code = `${result.outputFiles[0].text}\n//${randomUUID()}`;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const { toPublicArticleSummary } = await bundleTypeScript('functions/api/articles.ts');
const {
  articleVersion,
  mergeArticleDetailResult,
  mergePublicArticleSummaries,
  shouldReuseArticleDetailRequest,
} = await bundleTypeScript('src/app/context/ArticlesContext.tsx');

function fullArticle(overrides = {}) {
  return {
    id: 7,
    slug: 'fast-article',
    title: 'Fast article',
    category: 'Blog',
    readTime: '7 min',
    date: '2026-08-13',
    description: 'Description',
    content: '<p>'.concat('heavy body '.repeat(10_000), '</p>'),
    image: '/cover.webp',
    summary: 'Summary',
    keyTakeaways: ['One'],
    status: 'published',
    ...overrides,
  };
}

test('public list summary keeps card metadata but removes the heavy article body', () => {
  const original = fullArticle();
  const summary = toPublicArticleSummary(original);

  assert.equal(summary.slug, original.slug);
  assert.equal(summary.title, original.title);
  assert.equal(summary.image, original.image);
  assert.equal(summary.summary, original.summary);
  assert.deepEqual(summary.keyTakeaways, original.keyTakeaways);
  assert.equal(summary.content, '');
  assert.equal(summary._summary, true);
  assert.ok(JSON.stringify(summary).length < JSON.stringify(original).length / 100);
  assert.match(original.content, /heavy body/);
});

test('a stale cached summary never downgrades a newer full article seed', () => {
  const current = fullArticle({
    title: 'New title',
    content: '<p>New body</p>',
    updatedAt: '2026-08-13T12:00:00.000Z',
  });
  const staleSummary = toPublicArticleSummary(fullArticle({
    title: 'Old title',
    updatedAt: '2026-08-12T12:00:00.000Z',
  }));

  assert.deepEqual(mergePublicArticleSummaries([current], [staleSummary]), [current]);
});

test('an older summary list cannot remove a newly seeded live article', () => {
  const seeded = fullArticle({
    slug: 'just-published',
    updatedAt: '2026-08-13T12:00:00.000Z',
  });
  const olderListArticle = toPublicArticleSummary(fullArticle({
    slug: 'older-list-item',
    updatedAt: '2026-08-12T12:00:00.000Z',
  }));

  const result = mergePublicArticleSummaries([seeded], [olderListArticle]);
  assert.equal(result.some((article) => article.slug === 'just-published' && !article._summary), true);
});

test('a newer summary requests a fresh body while an equal revision preserves the loaded body', () => {
  const current = fullArticle({ content: '<p>Loaded body</p>', updatedAt: '2026-08-12T12:00:00.000Z' });
  const newer = toPublicArticleSummary(fullArticle({ updatedAt: '2026-08-13T12:00:00.000Z' }));
  const equal = toPublicArticleSummary(fullArticle({ updatedAt: current.updatedAt }));

  assert.equal(mergePublicArticleSummaries([current], [newer])[0]._summary, true);
  const equalResult = mergePublicArticleSummaries([current], [equal])[0];
  assert.equal(equalResult.content, '<p>Loaded body</p>');
  assert.equal(equalResult._summary, false);
});

test('a stale cached summary never downgrades a newer summary', () => {
  const current = toPublicArticleSummary(fullArticle({
    title: 'New summary',
    updatedAt: '2026-08-13T12:00:00.000Z',
  }));
  const stale = toPublicArticleSummary(fullArticle({
    title: 'Old summary',
    updatedAt: '2026-08-12T12:00:00.000Z',
  }));

  assert.deepEqual(mergePublicArticleSummaries([current], [stale]), [current]);
});

test('articleVersion falls back from an invalid update timestamp to publication and legacy dates', () => {
  assert.equal(
    articleVersion(fullArticle({ updatedAt: 'invalid', publishedAt: '2026-08-12T12:00:00.000Z' })),
    Date.parse('2026-08-12T12:00:00.000Z'),
  );
  assert.equal(
    articleVersion(fullArticle({ updatedAt: undefined, publishedAt: undefined, date: '13.08.2026' })),
    Date.UTC(2026, 7, 13),
  );
});

test('a stale detail response cannot replace a newer summary or loaded full body', () => {
  const expected = toPublicArticleSummary(fullArticle({ updatedAt: '2026-08-12T12:00:00.000Z' }));
  const newerSummary = toPublicArticleSummary(fullArticle({
    title: 'New summary',
    updatedAt: '2026-08-13T12:00:00.000Z',
  }));
  const staleDetail = fullArticle({
    title: 'Old detail',
    content: '<p>Old body</p>',
    updatedAt: expected.updatedAt,
  });
  const newerFull = fullArticle({
    title: 'New detail',
    content: '<p>New body</p>',
    updatedAt: newerSummary.updatedAt,
  });

  assert.equal(mergeArticleDetailResult([newerSummary], expected.slug, staleDetail, expected)[0], newerSummary);
  assert.equal(mergeArticleDetailResult([newerFull], expected.slug, staleDetail, expected)[0], newerFull);
});

test('a stale 404 cannot delete a newer summary or a full body loaded in parallel', () => {
  const expected = toPublicArticleSummary(fullArticle({ updatedAt: '2026-08-12T12:00:00.000Z' }));
  const newerSummary = toPublicArticleSummary(fullArticle({ updatedAt: '2026-08-13T12:00:00.000Z' }));
  const loadedFull = fullArticle({ updatedAt: expected.updatedAt, content: '<p>Loaded</p>' });

  assert.equal(mergeArticleDetailResult([newerSummary], expected.slug, null, expected)[0], newerSummary);
  assert.equal(mergeArticleDetailResult([loadedFull], expected.slug, null, expected)[0], loadedFull);
  assert.deepEqual(mergeArticleDetailResult([expected], expected.slug, null, expected), []);
});

test('a newer summary starts a new detail request instead of reusing stale pending work', () => {
  const oldVersion = Date.parse('2026-08-12T12:00:00.000Z');
  const newVersion = Date.parse('2026-08-13T12:00:00.000Z');

  assert.equal(shouldReuseArticleDetailRequest(oldVersion, oldVersion), true);
  assert.equal(shouldReuseArticleDetailRequest(newVersion, oldVersion), true);
  assert.equal(shouldReuseArticleDetailRequest(oldVersion, newVersion), false);
});
