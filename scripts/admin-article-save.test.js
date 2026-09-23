import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';

/**
 * Сохранение одной статьи (PATCH /api/admin/articles).
 *
 * Раньше админка отправляла весь блог одним запросом при лимите тела 256 КБ:
 * тринадцать статей уже весили 168 КБ. Точечное сохранение обязано
 * (1) не трогать остальные статьи, (2) не перенумеровывать id,
 * (3) держать защиту опорной статьи, (4) отдавать 4xx на мусор — и всё это
 * проверяется на настоящем SQLite с настоящими миграциями, а не на моках.
 */

globalThis.caches ??= {
  default: {
    match: async () => undefined,
    put: async () => {},
    delete: async () => true,
  },
};

const PASSWORD = 'article-save-test-password';
const PROTECTED_SLUG = 'kak-meta-ads-i-google-ads-sozdayut-effektivnuyu-voronku-prodazh';

class D1Statement {
  constructor(db, sql, values = []) {
    this.db = db;
    this.sql = sql;
    this.values = values;
  }

  bind(...values) {
    return new D1Statement(this.db, this.sql, values);
  }

  async first() {
    return this.db.prepare(this.sql).get(...this.values) ?? null;
  }

  async all() {
    return { success: true, results: this.db.prepare(this.sql).all(...this.values) };
  }

  async run() {
    const info = this.db.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: info.changes, last_row_id: info.lastInsertRowid } };
  }
}

class D1Database {
  constructor(db) { this.db = db; }
  prepare(sql) { return new D1Statement(this.db, sql); }
  async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
}

async function loadEndpoint() {
  const result = await build({
    entryPoints: ['functions/api/admin/articles.ts'],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'node',
    write: false,
  });
  const code = `${result.outputFiles[0].text}\n//${randomUUID()}`;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const endpoint = await loadEndpoint();
const ALL_MIGRATIONS = readdirSync('migrations').filter((name) => name.endsWith('.sql')).sort();

function freshDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ALL_MIGRATIONS) sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  return sqlite;
}

function makeEnv(sqlite) {
  return {
    DB: new D1Database(sqlite),
    ADMIN_PASSWORD: PASSWORD,
    USE_D1_ARTICLES: 'true',
    SITE_URL: 'https://example.test',
  };
}

function article(overrides = {}) {
  return {
    id: 0,
    slug: 'test-article',
    title: 'Тестовая статья',
    category: 'Google Ads',
    readTime: '5',
    date: 'сентябрь 2026',
    description: 'Описание тестовой статьи.',
    content: '<p>Текст.</p>',
    image: '/og-image-v2.jpg',
    tags: ['тест'],
    summary: 'Кратко.',
    keyTakeaways: ['Тезис'],
    faq: [],
    status: 'published',
    ...overrides,
  };
}

async function patch(sqlite, body, { password = PASSWORD } = {}) {
  const background = [];
  const response = await endpoint.onRequestPatch({
    request: new Request('https://example.test/api/admin/articles', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(password ? { 'X-Admin-Password': password } : {}),
      },
      body: JSON.stringify(body),
    }),
    env: makeEnv(sqlite),
    waitUntil: (promise) => background.push(promise),
  });
  await Promise.allSettled(background);
  return { status: response.status, payload: await response.json() };
}

const rows = (sqlite) => sqlite.prepare('SELECT id, slug, title, published_at, status FROM articles ORDER BY id').all();

test('без пароля статья не сохраняется', async () => {
  const sqlite = freshDatabase();
  const { status } = await patch(sqlite, { article: article() }, { password: '' });
  assert.equal(status, 401);
  assert.equal(rows(sqlite).length, 0);
});

test('мусорный payload и плохой слаг отклоняются до записи', async () => {
  const sqlite = freshDatabase();
  assert.equal((await patch(sqlite, { article: article({ title: '' }) })).status, 400);
  assert.equal((await patch(sqlite, { article: article({ slug: 'Плохой Slug' }) })).status, 400);
  assert.equal((await patch(sqlite, { articles: [article()] })).status, 400, 'режим списка сюда не принимается');
  assert.equal(rows(sqlite).length, 0);
});

test('новая статья получает следующий id, а соседи остаются на месте', async () => {
  const sqlite = freshDatabase();
  const first = await patch(sqlite, { article: article({ slug: 'first' }) });
  assert.equal(first.status, 200);
  assert.equal(first.payload.created, true);
  assert.equal(first.payload.article.id, 1);

  const second = await patch(sqlite, { article: article({ slug: 'second', title: 'Вторая' }) });
  assert.equal(second.payload.created, true);
  assert.equal(second.payload.article.id, 2);

  const stored = rows(sqlite);
  assert.deepEqual(stored.map((row) => [row.id, row.slug]), [[1, 'first'], [2, 'second']]);
  assert.ok(stored.every((row) => row.published_at), 'у опубликованной статьи есть дата публикации');
});

test('правка меняет только свою строку и не перенумеровывает id', async () => {
  const sqlite = freshDatabase();
  await patch(sqlite, { article: article({ slug: 'first' }) });
  await patch(sqlite, { article: article({ slug: 'second', title: 'Вторая' }) });
  const before = rows(sqlite);

  const edited = await patch(sqlite, { article: article({ slug: 'first', title: 'Первая, исправленная' }) });
  assert.equal(edited.status, 200);
  assert.equal(edited.payload.created, false);
  assert.equal(edited.payload.article.id, 1);
  assert.equal(edited.payload.article.title, 'Первая, исправленная');

  const after = rows(sqlite);
  assert.equal(after.length, 2, 'вторая статья не удалилась');
  assert.equal(after[1].title, 'Вторая');
  assert.equal(after[0].published_at, before[0].published_at, 'дата первой публикации не сдвинулась');
});

test('черновик сохраняется как черновик и не становится опубликованным по умолчанию', async () => {
  const sqlite = freshDatabase();
  const { payload } = await patch(sqlite, { article: article({ slug: 'draft-one', status: 'draft' }) });
  assert.equal(payload.article.status, 'draft');
  assert.equal(rows(sqlite)[0].status, 'draft');
});

test('опорная статья защищена от изменения и через точечное сохранение', async () => {
  const sqlite = freshDatabase();
  const created = await patch(sqlite, { article: article({ slug: PROTECTED_SLUG, title: 'Опорная' }) });
  assert.equal(created.status, 200, 'создать защищённую статью, которой ещё нет, можно');

  const changed = await patch(sqlite, { article: article({ slug: PROTECTED_SLUG, title: 'Опорная, переписанная' }) });
  assert.equal(changed.status, 409);
  assert.equal(rows(sqlite)[0].title, 'Опорная');
});
