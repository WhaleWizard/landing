import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import {
  collectArticleMedia,
  normalizeProductionArticles,
  normalizeProductionSiteContent,
  syncProductionContent,
  writeJsonTransaction,
} from './sync-production-content.js';

test('production article snapshot preserves deletions instead of merging stale local rows', () => {
  const payload = normalizeProductionArticles({
    articles: [{ slug: 'live-only', title: 'Live', content: '<p>Current</p>' }],
  }, '2026-08-13T00:00:00.000Z');
  assert.equal(payload.total, 1);
  assert.deepEqual(payload.articles.map((article) => article.slug), ['live-only']);
});

test('invalid or empty production articles never overwrite local snapshots', () => {
  assert.throws(() => normalizeProductionArticles({ articles: [] }), /invalid article collection/);
  assert.throws(() => normalizeProductionArticles({ articles: [
    { slug: 'duplicate', title: 'One' },
    { slug: 'duplicate', title: 'Two' },
  ] }), /invalid article collection/);
});

test('only published D1 page overrides enter the local production snapshot', () => {
  const rows = new Map([
    ['site:home', { success: true, source: 'static', content: null }],
    ['service:meta-ads', { success: true, source: 'd1', content: { hero: { titlePrefix: 'Live' } } }],
    ['service:meta-apps', { success: true, source: 'static', content: null }],
    ['service:google-ads', { success: true, source: 'static', content: null }],
    ['service:consult', { success: true, source: 'static', content: null }],
    ['site:faq', { success: true, source: 'static', content: null }],
  ]);
  const payload = normalizeProductionSiteContent(rows, '2026-08-13T00:00:00.000Z');
  assert.deepEqual(Object.keys(payload.sections), ['service:meta-ads']);
});

test('article covers and body images are retained as production media references', () => {
  assert.deepEqual(collectArticleMedia([{
    image: '/cover.webp',
    content: '<img src="https://cdn.example/body.png"><img src="/cover.webp">',
  }]), ['/cover.webp', 'https://cdn.example/body.png']);
});

test('snapshot transaction restores every old file when a later commit fails', () => {
  const root = mkdtempSync(join(tmpdir(), 'ww-production-sync-'));
  const paths = ['articles.local.json', 'articles.seed.json', 'site-content.local.json']
    .map((name) => join(root, name));
  try {
    paths.forEach((pathname, index) => writeFileSync(pathname, `old-${index}`, 'utf8'));
    let targetCommits = 0;
    const rename = (from, to) => {
      if (paths.includes(to) && ++targetCommits === 3) throw new Error('simulated commit failure');
      renameSync(from, to);
    };

    assert.throws(() => writeJsonTransaction(paths.map((pathname, index) => ({
      pathname,
      payload: { value: `new-${index}` },
    })), { rename, transactionId: 'rollback-test' }), /simulated commit failure/);

    paths.forEach((pathname, index) => assert.equal(readFileSync(pathname, 'utf8'), `old-${index}`));
    assert.equal(paths.some((pathname) => existsSync(`${pathname}.sync-rollback-test.tmp`)), false);
    assert.equal(paths.some((pathname) => existsSync(`${pathname}.sync-rollback-test.bak`)), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('a failed rollback preserves the recovery backup instead of deleting old data', () => {
  const root = mkdtempSync(join(tmpdir(), 'ww-production-sync-recovery-'));
  const paths = ['articles.local.json', 'articles.seed.json', 'site-content.local.json']
    .map((name) => join(root, name));
  const transactionId = 'recovery-test';
  try {
    paths.forEach((pathname, index) => writeFileSync(pathname, `old-${index}`, 'utf8'));
    let targetCommits = 0;
    const rename = (from, to) => {
      if (paths.includes(to) && from.endsWith('.tmp') && ++targetCommits === 3) {
        throw new Error('simulated commit failure');
      }
      if (to === paths[2] && from === `${paths[2]}.sync-${transactionId}.bak`) {
        throw new Error('simulated rollback failure');
      }
      renameSync(from, to);
    };

    assert.throws(() => writeJsonTransaction(paths.map((pathname, index) => ({
      pathname,
      payload: { value: `new-${index}` },
    })), { rename, transactionId }), AggregateError);

    const recoveryBackup = `${paths[2]}.sync-${transactionId}.bak`;
    assert.equal(readFileSync(recoveryBackup, 'utf8'), 'old-2');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('successful backup cleanup failure does not turn a committed sync into an error', () => {
  const root = mkdtempSync(join(tmpdir(), 'ww-production-sync-cleanup-'));
  const pathname = join(root, 'articles.local.json');
  const transactionId = 'cleanup-test';
  try {
    writeFileSync(pathname, 'old', 'utf8');
    assert.doesNotThrow(() => writeJsonTransaction([{
      pathname,
      payload: { value: 'new' },
    }], {
      transactionId,
      unlink(pathToDelete) {
        if (pathToDelete.endsWith('.bak')) throw new Error('simulated locked backup');
        rmSync(pathToDelete);
      },
    }));
    assert.deepEqual(JSON.parse(readFileSync(pathname, 'utf8')), { value: 'new' });
    assert.equal(readFileSync(`${pathname}.sync-${transactionId}.bak`, 'utf8'), 'old');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('end-to-end sync validates every response before writing all three snapshots', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ww-production-sync-e2e-'));
  const seenSignals = [];
  try {
    const result = await syncProductionContent({
      root,
      now: () => new Date('2026-08-13T00:00:00.000Z'),
      fetchImpl: async (url, options) => {
        seenSignals.push(options?.signal);
        if (url.pathname === '/api/articles') {
          return new Response(JSON.stringify({
            articles: [{ slug: 'live-only', title: 'Live', content: '<p>Current</p>' }],
          }));
        }
        return new Response(JSON.stringify({ success: true, source: 'static', content: null }));
      },
    });

    assert.deepEqual(result, { articles: 1, siteSections: 0, mediaReferences: 0 });
    assert.equal(seenSignals.length, 7);
    assert.ok(seenSignals.every((signal) => signal instanceof AbortSignal));
    const privateArticles = JSON.parse(readFileSync(join(root, 'data', 'articles.local.json'), 'utf8'));
    const publicArticles = JSON.parse(readFileSync(join(root, 'public', 'articles.seed.json'), 'utf8'));
    const siteContent = JSON.parse(readFileSync(join(root, 'data', 'site-content.local.json'), 'utf8'));
    assert.deepEqual(privateArticles, publicArticles);
    assert.deepEqual(privateArticles.articles.map((article) => article.slug), ['live-only']);
    assert.deepEqual(siteContent.sections, {});
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
