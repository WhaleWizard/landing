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

// ——— Пакеты 2–3: список без текстов, статья по слагу, удаление, закрепление ———

async function loadFeaturedEndpoint() {
  const result = await build({
    entryPoints: ['functions/api/admin/articles-featured.ts'],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'node',
    write: false,
  });
  const code = `${result.outputFiles[0].text}\n//${randomUUID()}`;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const featuredEndpoint = await loadFeaturedEndpoint();

function databaseWithout(prefix) {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ALL_MIGRATIONS.filter((name) => !name.startsWith(prefix))) {
    sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  }
  return sqlite;
}

async function adminGet(sqlite, query) {
  const background = [];
  const response = await endpoint.onRequestGet({
    request: new Request(`https://example.test/api/admin/articles${query}`, {
      headers: { 'X-Admin-Password': PASSWORD },
    }),
    env: makeEnv(sqlite),
    waitUntil: (promise) => background.push(promise),
  });
  await Promise.allSettled(background);
  return { status: response.status, payload: await response.json() };
}

async function adminDelete(sqlite, slug) {
  const background = [];
  const response = await endpoint.onRequestDelete({
    request: new Request(`https://example.test/api/admin/articles?slug=${encodeURIComponent(slug)}`, {
      method: 'DELETE',
      headers: { 'X-Admin-Password': PASSWORD },
    }),
    env: makeEnv(sqlite),
    waitUntil: (promise) => background.push(promise),
  });
  await Promise.allSettled(background);
  return { status: response.status, payload: await response.json() };
}

async function putFeatured(sqlite, slugs) {
  const background = [];
  const response = await featuredEndpoint.onRequestPut({
    request: new Request('https://example.test/api/admin/articles-featured', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Password': PASSWORD },
      body: JSON.stringify({ slugs }),
    }),
    env: makeEnv(sqlite),
    waitUntil: (promise) => background.push(promise),
  });
  await Promise.allSettled(background);
  return { status: response.status, payload: await response.json() };
}

test('краткий список админки отдаёт черновики и запланированные, но без текстов', async () => {
  const sqlite = freshDatabase();
  await patch(sqlite, { article: article({ slug: 'live', content: '<p>Большой текст.</p>' }) });
  await patch(sqlite, { article: article({ slug: 'draft', status: 'draft' }) });
  await patch(sqlite, { article: article({ slug: 'scheduled', publishedAt: '2099-01-01T09:00:00.000Z' }) });

  const { status, payload } = await adminGet(sqlite, '?view=summary');
  assert.equal(status, 200);
  assert.deepEqual(payload.articles.map((item) => item.slug), ['live', 'draft', 'scheduled']);
  assert.ok(payload.articles.every((item) => item.content === '' && item._summary === true), 'в кратком виде текста нет');
  assert.equal(payload.articles.find((item) => item.slug === 'draft').status, 'draft');
});

test('статья по слагу приходит целиком, включая черновик; чужой слаг — 404', async () => {
  const sqlite = freshDatabase();
  await patch(sqlite, { article: article({ slug: 'draft', status: 'draft', content: '<p>Черновой текст.</p>' }) });

  const found = await adminGet(sqlite, '?slug=draft');
  assert.equal(found.status, 200);
  assert.equal(found.payload.article.content, '<p>Черновой текст.</p>');
  assert.equal(found.payload.article.status, 'draft');

  assert.equal((await adminGet(sqlite, '?slug=nope')).status, 404);
  assert.equal((await adminGet(sqlite, '?slug=Bad%20Slug')).status, 400);
});

test('удаление убирает одну статью и не трогает соседей; опорную удалить нельзя', async () => {
  const sqlite = freshDatabase();
  await patch(sqlite, { article: article({ slug: 'first' }) });
  await patch(sqlite, { article: article({ slug: 'second' }) });
  await patch(sqlite, { article: article({ slug: PROTECTED_SLUG, title: 'Опорная' }) });

  const removed = await adminDelete(sqlite, 'first');
  assert.equal(removed.status, 200);
  assert.deepEqual(rows(sqlite).map((row) => row.slug), ['second', PROTECTED_SLUG]);

  assert.equal((await adminDelete(sqlite, 'first')).status, 404, 'повторное удаление — 404, а не 200');
  assert.equal((await adminDelete(sqlite, PROTECTED_SLUG)).status, 409);
  assert.equal(rows(sqlite).length, 2);
});

test('закрепление на главной: порядок 1..N, остальным пусто, правка статьи его не снимает', async () => {
  const sqlite = freshDatabase();
  for (const slug of ['a', 'b', 'c']) await patch(sqlite, { article: article({ slug }) });

  const set = await putFeatured(sqlite, ['c', 'a']);
  assert.equal(set.status, 200);
  const orderOf = () => Object.fromEntries(sqlite.prepare('SELECT slug, featured_order FROM articles').all().map((row) => [row.slug, row.featured_order]));
  assert.deepEqual(orderOf(), { a: 2, b: null, c: 1 });

  // Краткий список несёт порядок наружу — по нему админка рисует бейджи.
  const summary = await adminGet(sqlite, '?view=summary');
  assert.equal(summary.payload.articles.find((item) => item.slug === 'c').featuredOrder, 1);
  assert.equal(summary.payload.articles.find((item) => item.slug === 'b').featuredOrder, undefined);

  // Обычное сохранение статьи (без поля) закрепление не сбрасывает.
  await patch(sqlite, { article: article({ slug: 'c', title: 'Третья, исправленная' }) });
  assert.equal(orderOf().c, 1);

  // Пустой список снимает закрепление со всех.
  await putFeatured(sqlite, []);
  assert.deepEqual(orderOf(), { a: null, b: null, c: null });

  assert.equal((await putFeatured(sqlite, ['a', 'a'])).status, 400, 'дубли не принимаются');
  assert.equal((await putFeatured(sqlite, Array.from({ length: 16 }, (_, i) => `s${i}`))).status, 400, 'больше 15 нельзя');
});

test('без миграции 0042 закрепление объясняет себя, а не падает', async () => {
  // Свежие модули: список колонок кэшируется на пять минут внутри загруженного
  // кода, и после тестов с миграцией он помнил бы колонку, которой здесь нет.
  const freshArticles = await loadEndpoint();
  const freshFeatured = await loadFeaturedEndpoint();
  const sqlite = databaseWithout('0042');
  const call = async (handler, request) => {
    const background = [];
    const response = await handler({ request, env: makeEnv(sqlite), waitUntil: (promise) => background.push(promise) });
    await Promise.allSettled(background);
    return { status: response.status, payload: await response.json() };
  };
  const patchFresh = (body) => call(freshArticles.onRequestPatch, new Request('https://example.test/api/admin/articles', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': PASSWORD }, body: JSON.stringify(body),
  }));

  assert.equal((await patchFresh({ article: article({ slug: 'a' }) })).status, 200);

  const { status, payload } = await call(freshFeatured.onRequestPut, new Request('https://example.test/api/admin/articles-featured', {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': PASSWORD }, body: JSON.stringify({ slugs: ['a'] }),
  }));
  assert.equal(status, 503);
  assert.equal(payload.code, 'MIGRATION_REQUIRED');
  assert.equal(payload.migration, '0042_articles_featured_order.sql');

  // Остальное без миграции работает как раньше.
  const summary = await call(freshArticles.onRequestGet, new Request('https://example.test/api/admin/articles?view=summary', {
    headers: { 'X-Admin-Password': PASSWORD },
  }));
  assert.equal(summary.status, 200);
  assert.equal((await patchFresh({ article: article({ slug: 'b' }) })).status, 200);
});

// ——— Пакет 5: расписание публикаций ———

async function loadScheduleEndpoint() {
  const result = await build({
    entryPoints: ['functions/api/admin/articles-schedule.ts'],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'node',
    write: false,
  });
  const code = `${result.outputFiles[0].text}\n//${randomUUID()}`;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const scheduleEndpoint = await loadScheduleEndpoint();

async function putSchedule(sqlite, items) {
  const background = [];
  const response = await scheduleEndpoint.onRequestPut({
    request: new Request('https://example.test/api/admin/articles-schedule', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Password': PASSWORD },
      body: JSON.stringify({ items }),
    }),
    env: makeEnv(sqlite),
    waitUntil: (promise) => background.push(promise),
  });
  await Promise.allSettled(background);
  return { status: response.status, payload: await response.json() };
}

test('расписание ставит черновикам дату выхода и не трогает текст', async () => {
  const sqlite = freshDatabase();
  await patch(sqlite, { article: article({ slug: 'draft-a', status: 'draft', content: '<p>Текст А.</p>' }) });
  await patch(sqlite, { article: article({ slug: 'draft-b', status: 'draft', content: '<p>Текст Б.</p>' }) });

  const at = '2099-03-01T06:30:00.000Z';
  const { status, payload } = await putSchedule(sqlite, [
    { slug: 'draft-a', publishedAt: at },
    { slug: 'draft-b', publishedAt: '2099-03-01T12:10:00.000Z' },
  ]);
  assert.equal(status, 200);
  assert.deepEqual(payload.scheduled, ['draft-a', 'draft-b']);
  assert.deepEqual(payload.skipped, []);

  const row = sqlite.prepare('SELECT status, published_at, updated_at, content FROM articles WHERE slug = ?').get('draft-a');
  assert.equal(row.status, 'published');
  assert.equal(row.published_at, at);
  assert.equal(row.updated_at, at, 'дата изменения не раньше даты выхода');
  assert.equal(row.content, '<p>Текст А.</p>', 'текст не тронут');

  // До даты выхода статья не видна публично.
  const listing = await adminGet(sqlite, '?view=summary');
  assert.equal(listing.payload.articles.find((item) => item.slug === 'draft-a').status, 'published');
});

test('уже вышедшую и опорную статью расписание не двигает', async () => {
  const sqlite = freshDatabase();
  await patch(sqlite, { article: article({ slug: 'live', publishedAt: '2026-01-10T10:00:00.000Z' }) });
  await patch(sqlite, { article: article({ slug: PROTECTED_SLUG, title: 'Опорная', status: 'draft' }) });
  await patch(sqlite, { article: article({ slug: 'later', publishedAt: '2099-01-01T10:00:00.000Z' }) });

  const { payload } = await putSchedule(sqlite, [
    { slug: 'live', publishedAt: '2099-05-01T10:00:00.000Z' },
    { slug: PROTECTED_SLUG, publishedAt: '2099-05-01T11:00:00.000Z' },
    { slug: 'later', publishedAt: '2099-06-01T10:00:00.000Z' },
    { slug: 'missing', publishedAt: '2099-06-01T10:00:00.000Z' },
  ]);
  assert.deepEqual(payload.scheduled, ['later'], 'перепланируется только ещё не вышедшая');
  assert.deepEqual(payload.skipped.sort(), ['live', 'missing', PROTECTED_SLUG].sort());
  assert.equal(sqlite.prepare('SELECT published_at FROM articles WHERE slug = ?').get('live').published_at, '2026-01-10T10:00:00.000Z');
});

test('расписание отклоняет мусор до записи', async () => {
  const sqlite = freshDatabase();
  await patch(sqlite, { article: article({ slug: 'draft-a', status: 'draft' }) });
  assert.equal((await putSchedule(sqlite, [])).status, 400);
  assert.equal((await putSchedule(sqlite, [{ slug: 'draft-a', publishedAt: 'завтра' }])).status, 400);
  assert.equal((await putSchedule(sqlite, [{ slug: 'draft-a', publishedAt: '2099-01-01T00:00:00Z' }, { slug: 'draft-a', publishedAt: '2099-01-02T00:00:00Z' }])).status, 400);
  assert.equal(sqlite.prepare('SELECT status FROM articles WHERE slug = ?').get('draft-a').status, 'draft');
});
