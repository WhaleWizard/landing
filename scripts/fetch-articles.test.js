import assert from 'node:assert/strict';
import test from 'node:test';
import {
  fallbackViolatesFreshness,
  isUsableArticleList,
  resolveArticlesForBuild,
  selectFallbackSource,
} from './fetch-articles.js';

function articles(count, prefix) {
  return Array.from({ length: count }, (_, index) => ({
    slug: `${prefix}-${index + 1}`,
    title: `${prefix} ${index + 1}`,
  }));
}

function snapshot(source, value, fetchedAt = '2026-08-09T12:00:00.000Z') {
  return { source, fetchedAt, articles: value };
}

test('D1 fallback keeps the last authoritative public snapshot even when stale seed has more posts', () => {
  const freshBuild = articles(14, 'live');
  const staleSeed = articles(26, 'legacy');
  const selected = selectFallbackSource({
    useD1Articles: true,
    buildSnapshot: snapshot('public-api', freshBuild),
    publicSeedSnapshot: snapshot('knowledge-hub-rebuild', staleSeed),
    localSnapshot: snapshot('knowledge-hub-rebuild', staleSeed),
  });

  assert.equal(selected.source, 'build-cache-fallback');
  assert.equal(selected.articles.length, 14);
  assert.equal(selected.preserveBuildCache, true);
  assert.equal(selected.articles.some((article) => article.slug.startsWith('legacy-')), false);
});

test('D1 mode never calls JSONBin after the public API fails', async () => {
  let jsonBinCalls = 0;
  const selected = await resolveArticlesForBuild({
    useD1Articles: true,
    fetchPublicArticles: async () => { throw new Error('public API down'); },
    fetchJsonBinArticles: async () => {
      jsonBinCalls += 1;
      return articles(99, 'stale-jsonbin');
    },
    fallback: {
      source: 'build-cache-fallback',
      articles: articles(14, 'live'),
      preserveBuildCache: true,
    },
  });

  assert.equal(jsonBinCalls, 0);
  assert.equal(selected.source, 'build-cache-fallback');
});

test('D1 mode rejects a JSONBin-tagged build cache and falls back to the committed seed', () => {
  const selected = selectFallbackSource({
    useD1Articles: true,
    buildSnapshot: snapshot('jsonbin', articles(40, 'stale-jsonbin')),
    publicSeedSnapshot: snapshot('knowledge-hub-rebuild', articles(26, 'seed')),
    localSnapshot: null,
  });

  assert.equal(selected.source, 'public-seed-fallback');
  assert.equal(selected.articles.length, 26);
});

test('JSONBin mode uses a valid live JSONBin response before local snapshots', async () => {
  const selected = await resolveArticlesForBuild({
    useD1Articles: false,
    fetchPublicArticles: async () => [],
    fetchJsonBinArticles: async () => articles(12, 'jsonbin-live'),
    fallback: {
      source: 'build-cache-fallback',
      articles: articles(14, 'previous'),
      preserveBuildCache: true,
    },
  });

  assert.equal(selected.source, 'jsonbin');
  assert.equal(selected.fallback, false);
  assert.equal(selected.articles.length, 12);
});

test('empty, duplicate, and malformed article lists are not usable snapshots', () => {
  assert.equal(isUsableArticleList([]), false);
  assert.equal(isUsableArticleList([{ slug: 'ok', title: '' }]), false);
  assert.equal(isUsableArticleList([
    { slug: 'same', title: 'One' },
    { slug: 'same', title: 'Two' },
  ]), false);
});

test('a corrupt build snapshot is skipped instead of overwriting a valid seed', () => {
  const selected = selectFallbackSource({
    useD1Articles: false,
    buildSnapshot: snapshot('jsonbin', []),
    publicSeedSnapshot: snapshot('knowledge-hub-rebuild', articles(3, 'seed')),
    localSnapshot: snapshot('knowledge-hub-rebuild', articles(4, 'local')),
  });

  assert.equal(selected.source, 'public-seed-fallback');
  assert.equal(selected.articles.length, 3);
});

test('strict freshness fails on fallback unless emergency fallback is explicit', () => {
  assert.equal(fallbackViolatesFreshness(true, false), true);
  assert.equal(fallbackViolatesFreshness(true, true), false);
  assert.equal(fallbackViolatesFreshness(false, false), false);
});
