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

async function loadEndpoint(path) {
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

const [endpoint, publicArticles, sitemap, feed, blogPage, casePage, scheduleEndpoint] = await Promise.all([
  'functions/api/admin/articles.ts',
  'functions/api/articles.ts',
  'functions/sitemap.xml.ts',
  'functions/feed.xml.ts',
  'functions/blog/[slug].ts',
  'functions/cases/[slug].ts',
  'functions/api/admin/articles-schedule.ts',
].map(loadEndpoint));
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

test('удалённая статья или кейс не меняют сохранённый порядок на главной', async () => {
  const sqlite = freshDatabase();
  await patch(sqlite, { article: article({ slug: 'first' }) });
  await patch(sqlite, { article: article({ slug: 'second' }) });
  await patch(sqlite, { article: article({ slug: 'case', category: '  КЕЙСЫ  ' }) });
  assert.equal((await putFeatured(sqlite, ['first', 'second'])).status, 200);

  for (const unavailable of ['missing', 'case']) {
    assert.equal((await putFeatured(sqlite, ['second', unavailable])).status, 409);
    const saved = sqlite.prepare('SELECT slug FROM articles WHERE featured_order > 0 ORDER BY featured_order').all();
    assert.deepEqual(saved.map((row) => row.slug), ['first', 'second']);
  }
});

test('лимит главной — 10 новых закреплений, старый список можно сокращать', async () => {
  const sqlite = freshDatabase();
  const slugs = Array.from({ length: 12 }, (_, index) => `story-${index}`);
  for (const slug of slugs) await patch(sqlite, { article: article({ slug }) });
  const count = () => sqlite.prepare('SELECT COUNT(*) AS total FROM articles WHERE featured_order > 0').get().total;

  assert.equal((await putFeatured(sqlite, slugs.slice(0, 11))).status, 409);
  assert.equal(count(), 0);
  assert.equal((await putFeatured(sqlite, slugs.slice(0, 10))).status, 200);
  sqlite.prepare('UPDATE articles SET featured_order = 11 WHERE slug = ?').run(slugs[10]);
  const legacy = slugs.slice(0, 11).reverse();
  assert.equal((await putFeatured(sqlite, legacy)).status, 200);
  assert.equal((await putFeatured(sqlite, [...legacy.slice(1), slugs[11]])).status, 409);
  assert.equal(count(), 11);
  assert.equal((await putFeatured(sqlite, legacy.slice(1))).status, 200);
  assert.equal(count(), 10);
});

test('без миграции 0042 закрепление объясняет себя, а не падает', async () => {
  // Свежие модули: список колонок кэшируется на пять минут внутри загруженного
  // кода, и после тестов с миграцией он помнил бы колонку, которой здесь нет.
  const freshArticles = await loadEndpoint('functions/api/admin/articles.ts');
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

async function publicRequest(sqlite, endpoint, path, slug) {
  const background = [];
  const response = await endpoint.onRequestGet({
    request: new Request('https://example.test' + path, { headers: { 'User-Agent': 'Googlebot' } }),
    env: makeEnv(sqlite),
    params: { slug },
    waitUntil: promise => background.push(promise),
  });
  await Promise.allSettled(background);
  return response;
}

test('saved drafts stay absent from public summary, detail, sitemap and feed', async (t) => {
  const sqlite = freshDatabase();
  t.after(() => sqlite.close());
  const slug = 'unpublished-draft';
  const saved = await patch(sqlite, { article: article({ slug, status: 'draft' }) });
  assert.equal(saved.status, 200);
  const summary = await publicRequest(sqlite, publicArticles, '/api/articles?view=summary');
  assert.deepEqual((await summary.json()).articles, []);
  assert.equal((await publicRequest(sqlite, publicArticles, '/api/articles?slug=' + slug)).status, 404);
  assert.equal((await publicRequest(sqlite, blogPage, '/blog/' + slug, slug)).status, 404);
  for (const [handler, path] of [[sitemap, '/sitemap.xml'], [feed, '/feed.xml']]) {
    const response = await publicRequest(sqlite, handler, path);
    assert.equal(response.status, 200);
    assert.doesNotMatch(await response.text(), new RegExp(slug));
  }
});

test('scheduled content enters the public collections when the deadline arrives', async (t) => {
  const sqlite = freshDatabase();
  t.after(() => sqlite.close());
  const now = Date.parse('2026-11-10T09:00:00.000Z');
  t.mock.timers.enable({ apis: ['Date'], now });
  const slug = 'scheduled-at-boundary';
  assert.equal((await patch(sqlite, { article: article({ slug: 'already-live' }) })).status, 200);
  assert.equal((await patch(sqlite, { article: article({ slug, status: 'draft' }) })).status, 200);
  const result = await putSchedule(sqlite, [{ slug, publishedAt: new Date(now + 10_000).toISOString() }]);
  assert.deepEqual(result.payload.scheduled, [slug]);
  const collections = [[publicArticles, '/api/articles?view=summary'], [sitemap, '/sitemap.xml'], [feed, '/feed.xml']];
  for (const [handler, path] of collections) {
    const response = await publicRequest(sqlite, handler, path);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get('Cache-Control'), 'public, s-maxage=10, must-revalidate', path);
    assert.doesNotMatch(await response.text(), new RegExp(slug));
  }
  t.mock.timers.setTime(now + 9_999);
  const almost = await publicRequest(sqlite, publicArticles, '/api/articles?view=summary');
  assert.equal(almost.headers.get('Cache-Control'), 'no-store');
  assert.equal((await publicRequest(sqlite, blogPage, '/blog/' + slug, slug)).status, 404);
  t.mock.timers.setTime(now + 10_000);
  for (const [handler, path] of collections) {
    const response = await publicRequest(sqlite, handler, path);
    assert.match(await response.text(), new RegExp(slug));
  }
  assert.equal((await publicRequest(sqlite, blogPage, '/blog/' + slug, slug)).status, 200);
});

test('changing a saved address is rejected without duplicating its public entry', async (t) => {
  const sqlite = freshDatabase();
  t.after(() => sqlite.close());
  const created = await patch(sqlite, { article: article({ slug: 'original-address' }) });
  assert.equal(created.status, 200);
  const renamed = await patch(sqlite, { article: { ...created.payload.article, slug: 'different-address' } });
  assert.equal(renamed.status, 409);
  assert.equal(renamed.payload.code, 'SLUG_CHANGE_FORBIDDEN');
  const summary = await publicRequest(sqlite, publicArticles, '/api/articles?view=summary');
  assert.deepEqual((await summary.json()).articles.map(item => item.slug), ['original-address']);
  assert.equal((await publicRequest(sqlite, blogPage, '/blog/original-address', 'original-address')).status, 200);
  assert.equal((await publicRequest(sqlite, blogPage, '/blog/different-address', 'different-address')).status, 404);
});

test('moving a publication in either direction keeps its canonical URL and does not cache a reversible redirect', async (t) => {
  const sqlite = freshDatabase();
  t.after(() => sqlite.close());
  const slug = 'moving-publication';
  const created = await patch(sqlite, { article: article({ slug }) });
  assert.equal(created.status, 200);
  for (const [category, oldPage, newPage, from, to] of [
    ['Кейсы', blogPage, casePage, '/blog', '/cases'],
    ['Google Ads', casePage, blogPage, '/cases', '/blog'],
  ]) {
    const moved = await patch(sqlite, { article: { ...created.payload.article, category } });
    assert.equal(moved.status, 200);
    const redirect = await publicRequest(sqlite, oldPage, from + '/' + slug + '?utm_source=audit', slug);
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.get('Location'), 'https://example.test' + to + '/' + slug + '?utm_source=audit');
    assert.equal(redirect.headers.get('Cache-Control'), 'no-store');
    const destination = await publicRequest(sqlite, newPage, to + '/' + slug, slug);
    assert.equal(destination.status, 200);
    assert.ok((await destination.text()).includes('rel="canonical" href="https://example.test' + to + '/' + slug + '"'));
  }
});

test('cover replacement reaches the public card, detail and social preview', async (t) => {
  const sqlite = freshDatabase();
  t.after(() => sqlite.close());
  const slug = 'cover-update';
  const created = await patch(sqlite, { article: article({ slug, image: '/old-cover.webp' }) });
  assert.equal(created.status, 200);
  assert.equal((await patch(sqlite, { article: { ...created.payload.article, image: '/new-cover.webp' } })).status, 200);
  const summary = await publicRequest(sqlite, publicArticles, '/api/articles?view=summary');
  assert.equal((await summary.json()).articles[0].image, '/new-cover.webp');
  const detail = await publicRequest(sqlite, publicArticles, '/api/articles?slug=' + slug);
  assert.equal((await detail.json()).article.image, '/new-cover.webp');
  const page = await publicRequest(sqlite, blogPage, '/blog/' + slug, slug);
  assert.match(await page.text(), /property="og:image" content="https:\/\/example\.test\/new-cover\.webp"/);
});

// ─── Две вкладки, удалённая статья, номер новой статьи (DA-02, DA-03, DA-05) ──

test('DA-02: сохранение из старой вкладки не затирает свежие правки — 409 и текст в базе не меняется', async () => {
  const sqlite = freshDatabase();
  const created = await patch(sqlite, { mode: 'create', article: article({ slug: 'two-tabs' }) });
  assert.equal(created.status, 200);
  const opened = created.payload.article;

  // Вкладка A меняет заголовок.
  const tabA = await patch(sqlite, { mode: 'update', expected_updated_at: opened.updatedAt, article: { ...opened, title: 'Новый заголовок A' } });
  assert.equal(tabA.status, 200, JSON.stringify(tabA.payload));
  // Вкладка B сохраняет снимок, открытый до правки A.
  const tabB = await patch(sqlite, { mode: 'update', expected_updated_at: opened.updatedAt, article: { ...opened, description: 'Описание B' } });
  assert.equal(tabB.status, 409);
  assert.equal(tabB.payload.code, 'ARTICLE_CONFLICT');
  assert.match(tabB.payload.error, /другой вкладке/);
  const stored = sqlite.prepare("SELECT title, description FROM articles WHERE slug = 'two-tabs'").get();
  assert.equal(stored.title, 'Новый заголовок A', 'правка A на месте');
  assert.notEqual(stored.description, 'Описание B');

  // После повторного открытия (новая версия) вкладка B сохраняет нормально.
  const reopened = await patch(sqlite, { mode: 'update', expected_updated_at: tabA.payload.article.updatedAt, article: { ...tabA.payload.article, description: 'Описание B' } });
  assert.equal(reopened.status, 200);
});

test('DA-03: старая вкладка не воскрешает удалённую статью, явное создание адреса работает', async () => {
  const sqlite = freshDatabase();
  const created = await patch(sqlite, { mode: 'create', article: article({ slug: 'removed-one' }) });
  const opened = created.payload.article;
  assert.equal((await adminDelete(sqlite, 'removed-one')).status, 200);

  const stale = await patch(sqlite, { mode: 'update', expected_updated_at: opened.updatedAt, article: opened });
  assert.equal(stale.status, 409);
  assert.equal(stale.payload.code, 'ARTICLE_DELETED');
  assert.equal(rows(sqlite).length, 0, 'статья не вернулась');

  const fresh = await patch(sqlite, { mode: 'create', article: article({ slug: 'removed-one', title: 'Новая на старом адресе' }) });
  assert.equal(fresh.status, 200);
  assert.equal(fresh.payload.created, true);
});

test('DA-03: новая статья на занятом адресе не перезаписывает существующую', async () => {
  const sqlite = freshDatabase();
  await patch(sqlite, { mode: 'create', article: article({ slug: 'taken', title: 'Первая' }) });
  const second = await patch(sqlite, { mode: 'create', article: article({ slug: 'taken', title: 'Вторая' }) });
  assert.equal(second.status, 409);
  assert.equal(second.payload.code, 'SLUG_TAKEN');
  assert.equal(sqlite.prepare("SELECT title FROM articles WHERE slug = 'taken'").get().title, 'Первая');
});

test('DA-05: одновременные новые статьи получают разные id', async () => {
  const sqlite = freshDatabase();
  const results = await Promise.all([
    patch(sqlite, { mode: 'create', article: article({ slug: 'parallel-a' }) }),
    patch(sqlite, { mode: 'create', article: article({ slug: 'parallel-b' }) }),
    patch(sqlite, { mode: 'create', article: article({ slug: 'parallel-c' }) }),
  ]);
  assert.ok(results.every((result) => result.status === 200));
  const ids = rows(sqlite).map((row) => row.id);
  assert.equal(new Set(ids).size, 3, `id: ${ids.join(', ')}`);
});

test('DA-45: очистка будущей даты при публикации выпускает статью сейчас; дату вышедшей не сдвигает', async () => {
  const sqlite = freshDatabase();
  const tomorrow = new Date(Date.now() + 864e5).toISOString();
  const created = await patch(sqlite, { mode: 'create', article: article({ slug: 'planned', publishedAt: tomorrow }) });
  const opened = created.payload.article;
  assert.equal(opened.publishedAt, tomorrow);

  const untouched = await patch(sqlite, { mode: 'update', expected_updated_at: opened.updatedAt, article: { ...opened, publishedAt: undefined, title: 'Правка без даты' } });
  assert.equal(untouched.payload.article.publishedAt, tomorrow, 'пустое поле без флага — дату не трогали');

  const cleared = await patch(sqlite, { mode: 'update', clear_published_at: true, expected_updated_at: untouched.payload.article.updatedAt, article: { ...untouched.payload.article, publishedAt: undefined } });
  assert.equal(cleared.status, 200);
  assert.ok(Date.parse(cleared.payload.article.publishedAt) <= Date.now(), 'статья вышла сейчас');

  const pastDate = cleared.payload.article.publishedAt;
  const again = await patch(sqlite, { mode: 'update', clear_published_at: true, expected_updated_at: cleared.payload.article.updatedAt, article: { ...cleared.payload.article, publishedAt: undefined } });
  assert.equal(again.payload.article.publishedAt, pastDate, 'дата уже вышедшей статьи не сдвигается');
});

test('DA-57: правка краткого ответа сдвигает дату изменения', async () => {
  const sqlite = freshDatabase();
  const created = await patch(sqlite, { mode: 'create', article: article({ slug: 'summary-edit', publishedAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }) });
  const opened = created.payload.article;
  const edited = await patch(sqlite, { mode: 'update', expected_updated_at: opened.updatedAt, article: { ...opened, summary: 'Новый краткий ответ' } });
  assert.equal(edited.status, 200);
  assert.ok(Date.parse(edited.payload.article.updatedAt) > Date.parse(opened.updatedAt), `${opened.updatedAt} → ${edited.payload.article.updatedAt}`);
});

test('DA-44: расписание не снимает статью, опубликованную между чтением и записью, и не назначает удалённую', async () => {
  for (const race of ['published', 'deleted']) {
    const sqlite = freshDatabase();
    await patch(sqlite, { mode: 'create', article: article({ slug: 'race-draft', status: 'draft' }) });
    const db = new D1Database(sqlite);
    const realBatch = db.batch.bind(db);
    db.batch = async (statements) => {
      if (race === 'published') {
        sqlite.prepare("UPDATE articles SET status = 'published', published_at = ? WHERE slug = 'race-draft'").run(new Date(Date.now() - 1000).toISOString());
      } else {
        sqlite.prepare("DELETE FROM articles WHERE slug = 'race-draft'").run();
      }
      return realBatch(statements);
    };
    const background = [];
    const tomorrow = new Date(Date.now() + 864e5).toISOString();
    const response = await scheduleEndpoint.onRequestPut({
      request: new Request('https://example.test/api/admin/articles-schedule', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': PASSWORD },
        body: JSON.stringify({ items: [{ slug: 'race-draft', publishedAt: tomorrow }] }),
      }),
      env: { ...makeEnv(sqlite), DB: db },
      waitUntil: (promise) => background.push(promise),
    });
    await Promise.allSettled(background);
    const payload = await response.json();
    assert.equal(response.status, 200, race);
    assert.deepEqual(payload.scheduled, [], `${race}: в ответе нет того, что не записано`);
    assert.ok(payload.skipped.includes('race-draft'), race);
    if (race === 'published') {
      const row = sqlite.prepare("SELECT published_at FROM articles WHERE slug = 'race-draft'").get();
      assert.ok(Date.parse(row.published_at) <= Date.now(), 'опубликованная статья осталась на сайте');
    } else {
      assert.equal(rows(sqlite).length, 0);
    }
  }
});

// ─── История версий: длинные адреса, повторный адрес, длинная статья (DA-46, DA-47, DA-56) ──

const versionsEndpoint = await loadEndpoint('functions/api/admin/article-versions.ts');

async function versionCall(sqlite, method, { slug, article: body } = {}) {
  const url = new URL('https://example.test/api/admin/article-versions');
  if (method === 'GET') url.searchParams.set('slug', slug);
  const handler = method === 'GET' ? versionsEndpoint.onRequestGet : versionsEndpoint.onRequestPost;
  const response = await handler({
    request: new Request(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'X-Admin-Password': PASSWORD },
      body: method === 'GET' ? undefined : JSON.stringify({ slug, article: body }),
    }),
    env: makeEnv(sqlite),
    waitUntil: () => {},
  });
  return { status: response.status, payload: await response.json() };
}

test('DA-46: истории двух длинных адресов с общим началом не смешиваются', async () => {
  const sqlite = freshDatabase();
  const base = 'a'.repeat(70) + '-' + 'b'.repeat(69);
  const slugA = `${base}-cccccc`;
  const slugB = `${base}-cccccd`;
  assert.equal(slugA.slice(0, 140), slugB.slice(0, 140), 'первые 140 знаков совпадают');
  assert.equal((await versionCall(sqlite, 'POST', { slug: slugA, article: article({ slug: slugA, title: 'A' }) })).status, 200);
  assert.equal((await versionCall(sqlite, 'POST', { slug: slugB, article: article({ slug: slugB, title: 'B' }) })).status, 200);
  const historyA = await versionCall(sqlite, 'GET', { slug: slugA });
  assert.equal(historyA.status, 200);
  const titles = (historyA.payload.versions || []).map((version) => JSON.parse(version.version_data).title);
  assert.deepEqual(titles, ['A']);
});

test('DA-47: новая статья на освобождённом адресе начинает историю с нуля, старая уходит в архив', async () => {
  const sqlite = freshDatabase();
  await patch(sqlite, { mode: 'create', article: article({ slug: 'reused', title: 'Старая' }) });
  await versionCall(sqlite, 'POST', { slug: 'reused', article: article({ slug: 'reused', title: 'Старая' }) });
  assert.equal((await adminDelete(sqlite, 'reused')).status, 200);
  await patch(sqlite, { mode: 'create', article: article({ slug: 'reused', title: 'Новая' }) });
  const history = await versionCall(sqlite, 'GET', { slug: 'reused' });
  assert.deepEqual(history.payload.versions || [], [], 'чужих версий нет');
  const archived = sqlite.prepare("SELECT COUNT(*) AS n FROM article_versions WHERE slug LIKE 'reused~deleted-%'").get().n;
  assert.equal(archived, 1, 'старая история сохранена в архиве');
});

test('DA-56: версия длинной статьи, которую принимает сохранение, принимается и историей', async () => {
  const sqlite = freshDatabase();
  const longContent = `<p>${'Длинный абзац «с кавычками» и разметкой. '.repeat(2600)}</p>`.slice(0, 114_000);
  const faq = Array.from({ length: 20 }, (_, index) => ({ question: `Вопрос ${index}`, answer: 'Ответ '.repeat(60) }));
  const big = article({ slug: 'long-read', content: longContent, faq, keyTakeaways: Array.from({ length: 20 }, () => 'Тезис '.repeat(20)) });
  const saved = await patch(sqlite, { mode: 'create', article: big });
  assert.equal(saved.status, 200, JSON.stringify(saved.payload).slice(0, 200));
  const version = await versionCall(sqlite, 'POST', { slug: 'long-read', article: saved.payload.article });
  assert.equal(version.status, 200, JSON.stringify(version.payload));
});

test('FX-03: у запланированной статьи правка из старой вкладки тоже ловится — версия растёт', async () => {
  const sqlite = freshDatabase();
  const nextWeek = new Date(Date.now() + 7 * 864e5).toISOString();
  const created = await patch(sqlite, { mode: 'create', article: article({ slug: 'planned-two-tabs', publishedAt: nextWeek }) });
  const opened = created.payload.article;
  const tabA = await patch(sqlite, { mode: 'update', expected_updated_at: opened.updatedAt, article: { ...opened, title: 'Правка A' } });
  assert.equal(tabA.status, 200);
  assert.notEqual(tabA.payload.article.updatedAt, opened.updatedAt, 'версия изменилась, хотя дата изменения прижата к дате выхода');
  const tabB = await patch(sqlite, { mode: 'update', expected_updated_at: opened.updatedAt, article: { ...opened, description: 'Правка B' } });
  assert.equal(tabB.status, 409);
});
