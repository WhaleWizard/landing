import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';

/**
 * Находки построчного аудита в серверной части админки: вход и второй фактор,
 * сохранение статей, загрузки, «Доступ к страницам», тестовое событие Meta.
 *
 * Всё проверяется поведением — настоящий обработчик, настоящий SQLite с
 * настоящими миграциями, — а не поиском строк в исходниках.
 */

const ALL_MIGRATIONS = readdirSync('migrations').filter((name) => name.endsWith('.sql')).sort();

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

function freshDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ALL_MIGRATIONS) sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  return sqlite;
}

/** Каждый вызов — свежий модуль: состояние в памяти воркера не переезжает между тестами. */
async function loadModule(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'node',
    write: false,
    logLevel: 'silent',
  });
  const code = `${result.outputFiles[0].text}\n//${randomUUID()}`;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

/** Cache API воркера: общий на все ключи, как `caches.default` в дата-центре. */
function installMemoryCache() {
  const store = new Map();
  const original = globalThis.caches;
  globalThis.caches = {
    default: {
      match: async (request) => {
        const hit = store.get(typeof request === 'string' ? request : request.url);
        return hit ? hit.clone() : undefined;
      },
      put: async (request, response) => {
        store.set(typeof request === 'string' ? request : request.url, response.clone());
      },
      delete: async (request) => store.delete(typeof request === 'string' ? request : request.url),
    },
  };
  return () => { globalThis.caches = original; };
}

/** Перехват отправок в Telegram: считаем сообщения, наружу ничего не уходит. */
function installTelegramSpy() {
  const messages = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('https://api.telegram.org/')) {
      messages.push(JSON.parse(String(init?.body || '{}')).text || '');
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    throw new Error(`Неожиданный внешний запрос в тесте: ${url}`);
  };
  return { messages, restore: () => { globalThis.fetch = original; } };
}

function base32Decode(secret) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const char of secret.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(char).toString(2).padStart(5, '0');
  const bytes = [];
  for (let index = 0; index + 8 <= bits.length; index += 8) bytes.push(Number.parseInt(bits.slice(index, index + 8), 2));
  return Buffer.from(bytes);
}

function totpCode(secret, nowMs = Date.now()) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(nowMs / 1000 / 30)));
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 15;
  const value = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(value % 1_000_000).padStart(6, '0');
}

// ─── Вход в админку и второй фактор ─────────────────────────────────────────

const ADMIN_PASSWORD = 'audit-admin-api-core-password';

async function authHarness({ ip = '203.0.113.7' } = {}) {
  const auth = await loadModule('functions/api/admin/auth.ts');
  const sqlite = freshDatabase();
  const env = {
    DB: new D1Database(sqlite),
    ADMIN_PASSWORD,
    TELEGRAM_BOT_TOKEN: 'test-token',
    TELEGRAM_CHAT_ID: '1',
  };
  const call = async (body, { cookie = '', fromIp = ip } = {}) => {
    const background = [];
    const response = await auth.onRequestPost({
      request: new Request('https://www.example.test/api/admin/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Connecting-IP': fromIp,
          ...(cookie ? { Cookie: cookie } : {}),
        },
        body: JSON.stringify(body),
      }),
      env,
      waitUntil: (promise) => background.push(promise),
    });
    await Promise.allSettled(background);
    return {
      status: response.status,
      payload: await response.json(),
      cookie: (response.headers.get('Set-Cookie') || '').split(';')[0],
    };
  };
  return { sqlite, env, call };
}

test('F-073: при включённой защите «setup» одним паролем не стирает секрет и резервные коды', async (t) => {
  const restoreCache = installMemoryCache();
  const telegram = installTelegramSpy();
  t.after(() => { restoreCache(); telegram.restore(); });

  const { sqlite, call } = await authHarness();

  const setup = await call({ action: 'setup', password: ADMIN_PASSWORD });
  assert.equal(setup.status, 200);
  const enable = await call({ action: 'enable', password: ADMIN_PASSWORD, code: totpCode(setup.payload.secret) });
  assert.equal(enable.status, 200);
  assert.ok(telegram.messages.some((text) => text.includes('Создан новый ключ')), 'создание ключа сообщается владельцу');

  const before = sqlite.prepare('SELECT totp_secret, enabled_at, backup_codes FROM admin_2fa WHERE id = 1').get();
  assert.ok(before.enabled_at, 'защита включена');

  // Человек, знающий только пароль: без сессии и без кода.
  const attack = await call({ action: 'setup', password: ADMIN_PASSWORD });
  assert.equal(attack.status, 409);
  assert.equal(attack.payload.error, 'disable_first');
  assert.equal(attack.payload.secret, undefined, 'новый секрет не выдаётся');

  const after = sqlite.prepare('SELECT totp_secret, enabled_at, backup_codes FROM admin_2fa WHERE id = 1').get();
  assert.deepEqual({ ...after }, { ...before }, 'строка admin_2fa не изменилась');

  const login = await call({ action: 'login', password: ADMIN_PASSWORD });
  assert.equal(login.status, 401);
  assert.equal(login.payload.error, 'code_required', 'вход одним паролем по-прежнему требует код');
  assert.equal(login.cookie, '', 'сессия не выдана');
});

test('F-073: без включённой защиты ключ создаётся и пересоздаётся как раньше', async (t) => {
  const restoreCache = installMemoryCache();
  const telegram = installTelegramSpy();
  t.after(() => { restoreCache(); telegram.restore(); });

  const { call } = await authHarness();
  const first = await call({ action: 'setup', password: ADMIN_PASSWORD });
  const second = await call({ action: 'setup', password: ADMIN_PASSWORD });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.notEqual(first.payload.secret, second.payload.secret);
});

test('F-090: перебор пароля даёт одно предупреждение в Telegram за окно, а не сообщение на каждый отказ', async (t) => {
  const restoreCache = installMemoryCache();
  const telegram = installTelegramSpy();
  t.after(() => { restoreCache(); telegram.restore(); });

  const { call } = await authHarness();
  const statuses = [];
  for (let attempt = 0; attempt < 45; attempt += 1) {
    // Часть запросов с других адресов: метка общая, а не по адресу.
    const fromIp = attempt < 30 ? '203.0.113.7' : '198.51.100.9';
    statuses.push((await call({ action: 'login', password: 'wrong' }, { fromIp })).status);
  }

  assert.ok(statuses.filter((status) => status === 429).length >= 15, 'ограничитель по-прежнему отвечает 429');
  const floodAlerts = telegram.messages.filter((text) => text.includes('много попыток входа'));
  assert.equal(floodAlerts.length, 1);
});

test('F-090: сбой Cache API не превращает отказы в поток сообщений', async (t) => {
  const telegram = installTelegramSpy();
  const originalCaches = globalThis.caches;
  let limiterCount = 0;
  globalThis.caches = {
    default: {
      // Ограничитель видит переполненный счётчик, а метку предупреждения
      // записать нельзя: кэш сломан на записи.
      match: async (request) => (String(request.url).includes('/admin_login/') ? new Response(String(99 + (limiterCount += 1))) : undefined),
      put: async () => { throw new Error('Cache API unavailable'); },
      delete: async () => false,
    },
  };
  t.after(() => { globalThis.caches = originalCaches; telegram.restore(); });

  const { call } = await authHarness();
  for (let attempt = 0; attempt < 5; attempt += 1) {
    assert.equal((await call({ action: 'login', password: 'wrong' })).status, 429);
  }
  assert.equal(telegram.messages.length, 0);
});

// ─── Статьи: сохранение по слагу (PATCH /api/admin/articles) ───────────────

function sampleArticle(overrides = {}) {
  return {
    id: 0,
    slug: 'sample',
    title: 'Тестовая статья',
    category: 'Google Ads',
    readTime: '5',
    date: 'сентябрь 2026',
    description: 'Описание тестовой статьи.',
    content: '<p>Текст.</p>',
    image: '/og-image-v2.jpg',
    tags: [],
    summary: '',
    keyTakeaways: [],
    faq: [],
    status: 'published',
    ...overrides,
  };
}

/** Настоящий обработчик на настоящем SQLite в режиме D1 (как на production). */
async function articlesHarness() {
  const endpoint = await loadModule('functions/api/admin/articles.ts');
  const sqlite = freshDatabase();
  const env = { DB: new D1Database(sqlite), ADMIN_PASSWORD, USE_D1_ARTICLES: 'true', SITE_URL: 'https://example.test' };
  const patch = async (article) => {
    const background = [];
    const response = await endpoint.onRequestPatch({
      request: new Request('https://example.test/api/admin/articles', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': ADMIN_PASSWORD },
        body: JSON.stringify({ article }),
      }),
      env,
      waitUntil: (promise) => background.push(promise),
    });
    await Promise.allSettled(background);
    return { status: response.status, payload: await response.json() };
  };
  const row = (slug) => sqlite.prepare('SELECT * FROM articles WHERE slug = ?').get(slug);
  const count = () => sqlite.prepare('SELECT COUNT(*) AS n FROM articles').get().n;
  return { endpoint, sqlite, env, patch, row, count };
}

test('F-019: смена адреса у сохранённой статьи отклоняется, а не создаёт вторую копию', async (t) => {
  const restoreCache = installMemoryCache();
  const outbound = installTelegramSpy();
  t.after(() => { restoreCache(); outbound.restore(); });

  const { patch, row, count } = await articlesHarness();
  const created = await patch(sampleArticle({ slug: 'old-address' }));
  assert.equal(created.status, 200);
  const id = created.payload.article.id;

  // Редактор прислал ту же статью (тот же id) под новым адресом.
  const renamed = await patch(sampleArticle({ id, slug: 'new-address' }));
  assert.equal(renamed.status, 409);
  assert.equal(renamed.payload.code, 'SLUG_CHANGE_FORBIDDEN');
  assert.equal(renamed.payload.currentSlug, 'old-address');
  assert.equal(count(), 1, 'дубль не создан');
  assert.equal(row('new-address'), undefined);

  // Обычная правка под прежним адресом проходит.
  const edited = await patch(sampleArticle({ id, slug: 'old-address', title: 'Правка' }));
  assert.equal(edited.status, 200);
  assert.equal(row('old-address').title, 'Правка');

  // Копия из редактора (id 0) и статья без id — новые, им можно.
  const copy = await patch(sampleArticle({ id: 0, slug: 'copy-address' }));
  assert.equal(copy.status, 200);
  assert.equal(copy.payload.created, true);
  const { id: _omitted, ...withoutId } = sampleArticle({ slug: 'no-id-address' });
  assert.equal((await patch(withoutId)).status, 200);
  assert.equal(count(), 3);
});

test('F-019: в режиме JSONBin смена адреса тоже отклоняется до записи', async (t) => {
  const restoreCache = installMemoryCache();
  const writes = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url === 'https://api.jsonbin.io/v3/b/bin-1/latest') {
      return new Response(JSON.stringify({ record: [{ id: 1, slug: 'old-address', title: 'Старая', content: '<p>Текст.</p>' }] }));
    }
    if (url === 'https://api.jsonbin.io/v3/b/bin-1' && init.method === 'PUT') {
      writes.push(JSON.parse(String(init.body)));
      return new Response('{}');
    }
    throw new Error(`Неожиданный внешний запрос в тесте: ${url}`);
  };
  t.after(() => { restoreCache(); globalThis.fetch = originalFetch; });

  const endpoint = await loadModule('functions/api/admin/articles.ts');
  const env = { ADMIN_PASSWORD, JSONBIN_BIN_ID: 'bin-1', JSONBIN_MASTER_KEY: 'key', SITE_URL: 'https://example.test' };
  const response = await endpoint.onRequestPatch({
    request: new Request('https://example.test/api/admin/articles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Password': ADMIN_PASSWORD },
      body: JSON.stringify({ article: sampleArticle({ id: 1, slug: 'new-address' }) }),
    }),
    env,
    waitUntil: () => {},
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).code, 'SLUG_CHANGE_FORBIDDEN');
  assert.equal(writes.length, 0, 'в JSONBin ничего не записано');
});

test('F-020: введённые SEO-заголовок и описание не обрезаются, выжимка режется по слову', async (t) => {
  const restoreCache = installMemoryCache();
  const outbound = installTelegramSpy();
  t.after(() => { restoreCache(); outbound.restore(); });

  const { patch, row } = await articlesHarness();
  const longTitle = 'Как настроить рекламу в Instagram для салона красоты и не слить бюджет за первую неделю после запуска';
  assert.ok(longTitle.length > 70);
  const longDescription = Array.from({ length: 40 }, (_, index) => `слово${index + 1}`).join(' ');
  assert.ok(longDescription.length > 160);
  const ownSeoTitle = 'Длинный SEO-заголовок '.repeat(5).trim();
  assert.ok(ownSeoTitle.length > 70 && ownSeoTitle.length <= 120);

  // 1. SEO-заголовок не задан: подставляется заголовок целиком, а не 70 знаков.
  await patch(sampleArticle({ slug: 'long-title', title: longTitle, seoTitle: '', description: longDescription, seoDescription: '' }));
  const stored = row('long-title');
  assert.equal(stored.seo_title, longTitle);
  assert.equal(stored.description, longDescription, 'описание владельца сохранено целиком');
  // Выжимка для meta description: по границе слова, с многоточием.
  assert.ok(stored.seo_description.length <= 161, stored.seo_description);
  assert.ok(stored.seo_description.endsWith('…'));
  const head = stored.seo_description.slice(0, -1);
  assert.ok(longDescription.startsWith(head));
  assert.equal(longDescription[head.length], ' ', 'обрыв не посреди слова');

  // 2. Введённый SEO-заголовок длиннее 70 знаков сохраняется как есть.
  await patch(sampleArticle({ slug: 'own-seo', seoTitle: ownSeoTitle, seoDescription: 'Своё описание для поиска.' }));
  assert.equal(row('own-seo').seo_title, ownSeoTitle);
  assert.equal(row('own-seo').seo_description, 'Своё описание для поиска.');

  // 3. Без описания: выжимка из текста статьи тоже по слову.
  const words = Array.from({ length: 60 }, (_, index) => `текст${index + 1}`);
  await patch(sampleArticle({ slug: 'auto-excerpt', description: '', content: `<p>${words.join(' ')}</p>` }));
  const excerpt = row('auto-excerpt').description;
  assert.ok(excerpt.length <= 161 && excerpt.endsWith('…'), excerpt);
  assert.ok(words.join(' ').startsWith(excerpt.slice(0, -1)));
  assert.ok(words.includes(excerpt.slice(0, -1).split(' ').pop()), 'последнее слово выжимки — целое слово');
});

test('F-024: черновик без даты её не получает, первая публикация ставит текущее время, снятая статья дату сохраняет', async (t) => {
  const restoreCache = installMemoryCache();
  const outbound = installTelegramSpy();
  t.after(() => { restoreCache(); outbound.restore(); });

  const { patch, row, sqlite } = await articlesHarness();
  const draft = await patch(sampleArticle({ slug: 'draft-first', status: 'draft' }));
  assert.equal(draft.status, 200);
  assert.equal(row('draft-first').published_at, null, 'у черновика нет даты выхода');
  assert.equal(draft.payload.article.publishedAt, undefined);

  // Черновик лежал две недели: время правки давно в прошлом.
  sqlite.prepare("UPDATE articles SET updated_at = '2026-01-01T00:00:00.000Z' WHERE slug = 'draft-first'").run();
  const before = Date.now();
  const published = await patch(sampleArticle({ slug: 'draft-first', status: 'published' }));
  assert.equal(published.status, 200);
  const publishedAt = Date.parse(row('draft-first').published_at);
  assert.ok(publishedAt >= before - 1000 && publishedAt <= Date.now() + 1000, 'дата выхода — момент публикации, а не создания');

  // Статья выходила, была снята в черновик и опубликована снова: дата первой публикации на месте.
  await patch(sampleArticle({ slug: 'was-live', publishedAt: '2026-03-01T10:00:00.000Z' }));
  await patch(sampleArticle({ slug: 'was-live', status: 'draft' }));
  assert.equal(row('was-live').status, 'draft');
  assert.equal(row('was-live').published_at, '2026-03-01T10:00:00.000Z');
  await patch(sampleArticle({ slug: 'was-live', status: 'published' }));
  assert.equal(row('was-live').published_at, '2026-03-01T10:00:00.000Z');

  // Запланированная публикация по-прежнему работает: будущая дата принимается.
  await patch(sampleArticle({ slug: 'planned', status: 'draft' }));
  await patch(sampleArticle({ slug: 'planned', status: 'published', publishedAt: '2099-01-01T09:00:00.000Z' }));
  assert.equal(row('planned').published_at, '2099-01-01T09:00:00.000Z');
});

test('F-129: дата изменения не раньше даты выхода у запланированной статьи', async (t) => {
  const restoreCache = installMemoryCache();
  const outbound = installTelegramSpy();
  t.after(() => { restoreCache(); outbound.restore(); });

  const { patch, row } = await articlesHarness();
  const future = '2099-05-01T09:00:00.000Z';
  await patch(sampleArticle({ slug: 'scheduled', publishedAt: future }));
  assert.equal(row('scheduled').updated_at, future, 'новая статья с будущей датой');

  await patch(sampleArticle({ slug: 'scheduled', content: '<p>Опечатка исправлена.</p>' }));
  assert.equal(row('scheduled').published_at, future);
  assert.equal(row('scheduled').updated_at, future, 'правка до выхода не даёт dateModified раньше datePublished');

  // Вышедшая статья: правка двигает дату изменения вперёд, как и задумано.
  await patch(sampleArticle({ slug: 'old', publishedAt: '2026-01-01T00:00:00.000Z' }));
  await patch(sampleArticle({ slug: 'old', content: '<p>Правка.</p>' }));
  assert.ok(Date.parse(row('old').updated_at) > Date.parse('2026-01-01T00:00:00.000Z'));
  assert.equal(row('old').published_at, '2026-01-01T00:00:00.000Z');
});

// ─── Импорт статей из папки (scripts/import-articles.mjs) ──────────────────

function runNode(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: process.cwd(), env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

/** Админка-заглушка: список статей и приём PATCH, пароль проверяется по заголовку. */
async function fakeAdminServer(existing) {
  const { createServer } = await import('node:http');
  const state = { patches: [], summaryRequests: 0 };
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      const reply = (status, payload) => {
        response.writeHead(status, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify(payload));
      };
      if (request.headers['x-admin-password'] !== 'import-test-password') return reply(401, { success: false, error: 'Unauthorized' });
      if (request.method === 'GET' && request.url.startsWith('/api/admin/articles?view=summary')) {
        state.summaryRequests += 1;
        return reply(200, { success: true, articles: existing });
      }
      if (request.method === 'PATCH' && request.url === '/api/admin/articles') {
        const { article } = JSON.parse(body);
        state.patches.push(article);
        const known = existing.find((item) => item.slug === article.slug);
        return reply(200, { success: true, created: !known, article: { id: known ? known.id : 99, ...article } });
      }
      return reply(404, { success: false, error: 'not found' });
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, state, port: server.address().port };
}

test('F-075: повторный импорт не снимает статью с публикации и не трогает обложку и цифры кейса', async (t) => {
  const { ARTICLE_CATEGORY_VALUES } = await loadModule('src/app/data/blogSections.ts');
  const category = ARTICLE_CATEGORY_VALUES[0];
  const existing = [{
    id: 7,
    slug: 'live-post',
    title: 'Вышедшая статья',
    category,
    status: 'published',
    publishedAt: '2026-09-01T09:00:00.000Z',
    image: 'https://pub-test.r2.dev/uploads/2026-09-01/1-cover--1200x800.webp',
    date: 'сентябрь 2026',
    caseData: { niche: 'Салон красоты', leadsValue: 120 },
    tags: ['meta'],
    seoTitle: 'SEO-заголовок из админки',
    seoDescription: 'SEO-описание из админки',
    keyTakeaways: ['Тезис из админки'],
    faq: [{ question: 'Вопрос', answer: 'Ответ' }],
    content: '',
  }];
  const { server, state, port } = await fakeAdminServer(existing);
  t.after(() => server.close());

  const dir = mkdtempSync(join(tmpdir(), 'ww-import-'));
  writeFileSync(join(dir, 'env'), `ADMIN_PASSWORD=import-test-password\nSITE_URL=http://127.0.0.1:${port}\n`);
  mkdirSync(join(dir, 'articles'));
  writeFileSync(join(dir, 'articles', 'live.json'), JSON.stringify({ id: 3, title: 'Вышедшая статья', slug: 'live-post', category, content: '<p>Опечатка исправлена.</p>' }));
  writeFileSync(join(dir, 'articles', 'new.json'), JSON.stringify({ title: 'Новая статья', slug: 'new-post', category, content: '<p>Новый текст.</p>' }));

  const childEnv = { ...process.env, ADMIN_PASSWORD: '', SITE_URL: '', ADMIN_TOTP_CODE: '' };
  const baseArgs = ['scripts/import-articles.mjs', '--dir', join(dir, 'articles'), '--env-file', join(dir, 'env'), '--delay-ms', '0'];

  const run = await runNode([...baseArgs, '--report', join(dir, 'report.json')], childEnv);
  assert.equal(run.code, 0, run.stdout + run.stderr);
  assert.equal(state.summaryRequests, 1, 'список статей читается один раз на весь импорт');
  assert.equal(state.patches.length, 2);

  const live = state.patches.find((article) => article.slug === 'live-post');
  assert.equal(live.status, 'published', 'вышедшая статья не стала черновиком');
  assert.equal(live.publishedAt, undefined, 'дата выхода не отправляется — сервер сохраняет прежнюю');
  assert.equal(live.image, existing[0].image, 'обложка из админки сохранена');
  assert.deepEqual(live.caseData, existing[0].caseData, 'цифры кейса сохранены');
  assert.equal(live.date, 'сентябрь 2026');
  assert.equal(live.seoTitle, existing[0].seoTitle);
  assert.equal(live.seoDescription, existing[0].seoDescription);
  assert.deepEqual(live.tags, ['meta']);
  assert.deepEqual(live.keyTakeaways, ['Тезис из админки']);
  assert.deepEqual(live.faq, existing[0].faq);
  assert.equal(live.content, '<p>Опечатка исправлена.</p>', 'текст обновлён');
  assert.equal(live.id, undefined, 'id из файла не отправляется');

  const fresh = state.patches.find((article) => article.slug === 'new-post');
  assert.equal(fresh.status, 'draft', 'новая статья — черновик');
  assert.equal(fresh.image, '/og-image-v2.jpg');

  const report = JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8'));
  assert.deepEqual(report.updated.map((item) => item.slug), ['live-post']);
  assert.ok(report.updated[0].kept.includes('status') && report.updated[0].kept.includes('image'));
  assert.match(run.stdout, /статус published/);

  // Явный --status draft снимает с сайта только осознанно и с предупреждением.
  state.patches.length = 0;
  const forced = await runNode([...baseArgs, '--status', 'draft', '--only', 'live-post'], childEnv);
  assert.equal(forced.code, 0, forced.stdout + forced.stderr);
  assert.equal(state.patches[0].status, 'draft');
  assert.match(forced.stdout, /ВНИМАНИЕ/);

  // Без списка статей импорт не идёт: иначе вернулась бы та же ошибка.
  server.close();
  const blind = await runNode(baseArgs, childEnv);
  assert.equal(blind.code, 2);
  assert.match(blind.stderr, /список статей/i);
});

// ─── Доступ к страницам (api/admin/page-locks) ──────────────────────────────

async function pageLocksHarness(dbOverride) {
  const endpoint = await loadModule('functions/api/admin/page-locks.ts');
  const sqlite = dbOverride ? null : freshDatabase();
  const env = { DB: dbOverride || new D1Database(sqlite), ADMIN_PASSWORD, SITE_URL: 'https://www.example.test' };
  const call = async (method, body) => {
    const handler = method === 'GET' ? endpoint.onRequestGet : endpoint.onRequestPost;
    const response = await handler({
      request: new Request('https://www.example.test/api/admin/page-locks', {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': ADMIN_PASSWORD },
        ...(method === 'GET' ? {} : { body: JSON.stringify(body) }),
      }),
      env,
      waitUntil: () => {},
    });
    return { status: response.status, payload: await response.json() };
  };
  const lockRow = (path) => sqlite.prepare('SELECT locked, locked_at FROM page_locks WHERE path = ?').get(path);
  return { sqlite, env, get: () => call('GET'), post: (body) => call('POST', body), lockRow };
}

test('F-080: «Открыть все» сбрасывает дату закрытия, повторное закрытие ставит новую', async (t) => {
  const restoreCache = installMemoryCache();
  t.after(restoreCache);
  const { sqlite, post, lockRow } = await pageLocksHarness();

  assert.equal((await post({ action: 'save', path: '/meta-ads', locked: true })).status, 200);
  const first = lockRow('/meta-ads');
  assert.equal(first.locked, 1);
  assert.ok(first.locked_at);

  const opened = await post({ action: 'unlock_all' });
  assert.equal(opened.payload.opened, 1);
  const after = lockRow('/meta-ads');
  assert.equal(after.locked, 0);
  assert.equal(after.locked_at, null, 'дата закрытия обнулена');

  // Строка, испорченная прошлым «Открыть все»: открыта, но старая дата осталась.
  const stale = '2026-08-01 10:00:00';
  sqlite.prepare("UPDATE page_locks SET locked = 0, locked_at = ? WHERE path = '/meta-ads'").run(stale);
  await post({ action: 'save', path: '/meta-ads', locked: true });
  const relocked = lockRow('/meta-ads');
  assert.equal(relocked.locked, 1);
  assert.notEqual(relocked.locked_at, stale, 'повторное закрытие ставит новую дату, а не «закрыта 54 дня»');
  assert.ok(Date.now() - Date.parse(`${relocked.locked_at.replace(' ', 'T')}Z`) < 60_000);

  // Правка текстов у закрытой страницы дату не сбрасывает.
  sqlite.prepare("UPDATE page_locks SET locked_at = ? WHERE path = '/meta-ads'").run(stale);
  await post({ action: 'save', path: '/meta-ads', locked: true, title: 'Новый заголовок' });
  assert.equal(lockRow('/meta-ads').locked_at, stale);
});

test('F-081/F-091: сбой базы не выдаётся за «Примените миграцию 0034»', async (t) => {
  const restoreCache = installMemoryCache();
  t.after(restoreCache);
  const failing = (message) => ({
    prepare: () => {
      const statement = {
        bind: () => statement,
        all: async () => { throw new Error(message); },
        first: async () => { throw new Error(message); },
        run: async () => { throw new Error(message); },
      };
      return statement;
    },
  });

  const outage = await pageLocksHarness(failing('D1_ERROR: too many requests, daily write limit'));
  const read = await outage.get();
  assert.equal(read.status, 503);
  assert.notEqual(read.payload.code, 'MIGRATION_REQUIRED');
  assert.equal(read.payload.migration, undefined, 'раздел не подменяется экраном миграции');
  assert.match(read.payload.error, /daily write limit/, 'настоящая причина видна');
  const save = await outage.post({ action: 'save', path: '/blog', locked: true });
  assert.equal(save.status, 503);
  assert.notEqual(save.payload.code, 'MIGRATION_REQUIRED');
  assert.equal(save.payload.migration, undefined);

  const missing = await pageLocksHarness(failing('D1_ERROR: no such table: page_locks'));
  const readMissing = await missing.get();
  assert.equal(readMissing.status, 503);
  assert.equal(readMissing.payload.code, 'MIGRATION_REQUIRED');
  assert.match(readMissing.payload.migration, /^0034_/);
  const saveMissing = await missing.post({ action: 'save', path: '/blog', locked: true });
  assert.equal(saveMissing.payload.code, 'MIGRATION_REQUIRED');
});

// ─── Заглушка закрытой страницы: предпросмотр и форма ───────────────────────

test('F-082: переадресация предпросмотра остаётся на своём домене', async () => {
  const preview = await loadModule('functions/_lib/page-lock-preview.ts');
  const env = { ADMIN_PASSWORD };
  const hostile = [
    'https://www.whalewzrd.com//16843009?ww_preview=off',
    'https://www.whalewzrd.com//evil.example/x?ww_preview=off',
    'https://www.whalewzrd.com//evil.example/x?ww_preview=zz',
    'https://www.whalewzrd.com/\\evil.example?ww_preview=off',
    'https://www.whalewzrd.com////evil.example?ww_preview=1.1.2.3',
  ];
  for (const raw of hostile) {
    const access = await preview.resolvePreviewAccess(new Request(raw), env, new URL(raw));
    assert.ok(access.redirect, raw);
    const location = access.redirect.headers.get('Location');
    assert.ok(location.startsWith('/') && !location.startsWith('//'), `${raw} → ${location}`);
    assert.equal(new URL(location, raw).host, 'www.whalewzrd.com', `${raw} → ${location}`);
    assert.ok(!location.includes('ww_preview'));
  }

  // Обычный адрес: ссылка убирается, остальное на месте.
  const plain = 'https://www.whalewzrd.com/blog?ww_preview=off&x=1#top';
  const access = await preview.resolvePreviewAccess(new Request(plain), env, new URL(plain));
  assert.equal(access.redirect.headers.get('Location'), '/blog?x=1#top');
});

test('F-083: форма «сообщить, когда откроется» работает на статье закрытого раздела', async (t) => {
  const restoreCache = installMemoryCache();
  const outbound = installTelegramSpy();
  const originalNow = Date.now;
  t.after(() => { restoreCache(); outbound.restore(); Date.now = originalNow; });

  const notify = await loadModule('functions/api/page-lock-notify.ts');
  const preview = await loadModule('functions/_lib/page-lock-preview.ts');
  const sqlite = freshDatabase();
  sqlite.prepare('INSERT INTO page_locks (path, locked, include_children, show_subscribe) VALUES (?, 1, 1, 1)').run('/blog');
  sqlite.prepare('INSERT INTO page_locks (path, locked, include_children, show_subscribe) VALUES (?, 1, 0, 1)').run('/cases');
  const env = { DB: new D1Database(sqlite), ADMIN_PASSWORD };
  const stamp = await preview.createFormStamp(env);

  // Форму отправил человек: через три секунды после показа страницы.
  const shown = originalNow();
  Date.now = () => shown + 3_000;

  const submit = async (fields) => {
    const background = [];
    const response = await notify.onRequestPost({
      request: new Request('https://www.whalewzrd.com/api/page-lock-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'CF-Connecting-IP': '203.0.113.5' },
        body: new URLSearchParams({ stamp, consent: '1', ...fields }).toString(),
      }),
      env,
      waitUntil: (promise) => background.push(promise),
    });
    await Promise.allSettled(background);
    return { status: response.status, location: response.headers.get('Location') };
  };

  const article = await submit({ path: '/blog/kak-schitat-cpl', email: 'reader@example.com' });
  assert.equal(article.status, 303);
  assert.equal(article.location, '/blog/kak-schitat-cpl?ww=ok', 'человек возвращается на ту же статью');
  assert.deepEqual(
    sqlite.prepare('SELECT path, email FROM page_lock_subscribers ORDER BY id').all().map((item) => ({ ...item })),
    [{ path: '/blog', email: 'reader@example.com' }],
    'контакт записан на раздел, а не на статью',
  );

  // Кириллический слаг приходит из адреса в виде %D0%…: его нельзя уводить на главную.
  const cyrillic = '/blog/%D1%81%D1%82%D0%B0%D1%82%D1%8C%D1%8F';
  assert.equal((await submit({ path: cyrillic, email: 'second@example.com' })).location, `${cyrillic}?ww=ok`);

  // Вложенный адрес под замком БЕЗ «вместе с вложенными» — не закрыт, формы там нет.
  const notLocked = await submit({ path: '/cases/some-case', email: 'third@example.com' });
  assert.equal(notLocked.location, '/?ww=error');

  // Чужой адрес и перевод строки не попадают в Location.
  for (const path of ['//evil.example/x', '/blog/x\r\nSet-Cookie: a=b', '/blog/../admin']) {
    const hostile = await submit({ path, email: `${Math.random()}@example.com` });
    assert.ok(hostile.location.startsWith('/?ww='), `${path} → ${hostile.location}`);
  }
});

// ─── Тестовое событие Meta (api/meta-test-event) ────────────────────────────

async function metaTestEventCall(env, headers = {}) {
  const endpoint = await loadModule('functions/api/meta-test-event.ts');
  const response = await endpoint.onRequestPost({
    request: new Request('https://www.example.test/api/meta-test-event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.9', ...headers },
      body: JSON.stringify({ event_name: 'Lead' }),
    }),
    env,
    waitUntil: () => {},
  });
  return { status: response.status, payload: await response.json() };
}

function enableTwoFactor(sqlite) {
  sqlite.prepare(
    `INSERT INTO admin_2fa (id, totp_secret, enabled_at, backup_codes, last_step, updated_at)
     VALUES (1, 'JBSWY3DPEHPK3PXP', strftime('%s','now'), '[]', 0, strftime('%s','now'))`,
  ).run();
}

test('F-084/F-094: тестовое событие принимает сессию админки; голый пароль — только без двухфакторной защиты', async (t) => {
  const restoreCache = installMemoryCache();
  const outbound = installTelegramSpy();
  t.after(() => { restoreCache(); outbound.restore(); });

  const session = await loadModule('functions/_lib/admin-session.ts');
  const sqlite = freshDatabase();
  // Без META_* переменных допущенный запрос отвечает 400 про переменные,
  // а не 403: так видно, что проверка доступа пройдена, и наружу ничего не уходит.
  const env = { DB: new D1Database(sqlite), ADMIN_PASSWORD };
  const token = await session.createAdminSessionToken(env);
  const cookie = { Cookie: `ww_admin_session=${token}` };

  const bySession = await metaTestEventCall(env, cookie);
  assert.equal(bySession.status, 400, JSON.stringify(bySession.payload));
  assert.match(bySession.payload.error, /META_CAPI_ACCESS_TOKEN/);

  assert.equal((await metaTestEventCall(env)).status, 403);
  assert.equal((await metaTestEventCall(env, { 'X-Admin-Password': ADMIN_PASSWORD })).status, 400, 'без 2FA пароль принимается');
  assert.equal((await metaTestEventCall(env, { 'X-Admin-Password': 'wrong' })).status, 403);

  const expired = await session.createAdminSessionToken(env, Date.now() - 13 * 60 * 60 * 1000);
  assert.equal((await metaTestEventCall(env, { Cookie: `ww_admin_session=${expired}` })).status, 403, 'просроченная сессия');
  assert.equal((await metaTestEventCall(env, { Cookie: 'ww_admin_session=1.9999999999.00' })).status, 403, 'подделка');

  enableTwoFactor(sqlite);
  const passwordOnly = await metaTestEventCall(env, { 'X-Admin-Password': ADMIN_PASSWORD });
  assert.equal(passwordOnly.status, 403, 'при включённой защите один пароль не проходит');
  assert.match(passwordOnly.payload.error, /сесси/i, 'ошибка говорит про сессию, а не про секрет');
  assert.equal((await metaTestEventCall(env, cookie)).status, 400, 'сессия проходит и при включённой защите');
});

// ─── Сессия админки через 12 часов (api/admin/_middleware) ──────────────────

test('F-095: без сессии при включённой защите админка отвечает понятным SESSION_EXPIRED', async (t) => {
  const restoreCache = installMemoryCache();
  t.after(restoreCache);

  const middleware = await loadModule('functions/api/admin/_middleware.ts');
  const session = await loadModule('functions/_lib/admin-session.ts');
  const sqlite = freshDatabase();
  enableTwoFactor(sqlite);
  const env = { DB: new D1Database(sqlite), ADMIN_PASSWORD };

  let reached = false;
  const response = await middleware.onRequest({
    request: new Request('https://www.example.test/api/admin/planner', { headers: { 'X-Admin-Password': ADMIN_PASSWORD } }),
    env,
    next: async () => { reached = true; return new Response('{}'); },
  });
  assert.equal(response.status, 401);
  const payload = await response.json();
  assert.equal(payload.code, 'SESSION_EXPIRED');
  assert.match(payload.error, /войдите/);
  assert.equal(reached, false, 'обработчик не вызывается');

  const token = await session.createAdminSessionToken(env);
  let forwarded = '';
  const allowed = await middleware.onRequest({
    request: new Request('https://www.example.test/api/admin/planner', { headers: { Cookie: `ww_admin_session=${token}` } }),
    env,
    next: async (request) => { forwarded = request.headers.get('X-Admin-Password'); return new Response('{}'); },
  });
  assert.equal(allowed.status, 200);
  assert.equal(forwarded, ADMIN_PASSWORD, 'при живой сессии пароль подставляется на месте');
});

test('F-095: скрипты админки входят заново по SESSION_EXPIRED', async (t) => {
  const { createAdminClient } = await import('./admin-client.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'ww-client-'));
  writeFileSync(join(dir, 'env'), 'ADMIN_PASSWORD=client-test-password\nSITE_URL=https://admin.example.test\n');

  const calls = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(input);
    const cookie = init.headers?.Cookie || '';
    calls.push({ path: new URL(url).pathname + new URL(url).search, cookie });
    if (url.endsWith('/api/admin/auth')) {
      return new Response(JSON.stringify({ success: true }), { headers: { 'set-cookie': 'ww_admin_session=fresh-token; Path=/; HttpOnly' } });
    }
    if (!cookie) {
      return new Response(JSON.stringify({ success: false, code: 'SESSION_EXPIRED', error: 'Сессия истекла — войдите в админку заново' }), { status: 401 });
    }
    return new Response(JSON.stringify({ success: true, articles: [] }));
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const client = createAdminClient({ envFile: join(dir, 'env'), code: '123456' });
  const response = await client.request('/api/admin/articles?view=summary');
  assert.equal(response.status, 200);
  assert.deepEqual(calls.map((call) => call.path), [
    '/api/admin/articles?view=summary',
    '/api/admin/auth',
    '/api/admin/articles?view=summary',
  ]);
  assert.equal(calls[2].cookie, 'ww_admin_session=fresh-token');
});

// ─── Загрузки и медиатека (api/admin/upload, api/admin/media) ───────────────

class FakeBucket {
  constructor() { this.objects = new Map(); }

  async put(key, value, options = {}) {
    const bytes = value == null ? new Uint8Array(0) : new Uint8Array(await new Response(value).arrayBuffer());
    this.objects.set(key, {
      key, bytes, size: bytes.byteLength, uploaded: new Date(),
      httpMetadata: options.httpMetadata || {}, customMetadata: options.customMetadata || {},
    });
  }

  async get(key) {
    const object = this.objects.get(key);
    return object ? { ...object, body: new Response(object.bytes).body } : null;
  }

  async head(key) { return this.objects.has(key) ? { ...this.objects.get(key) } : null; }
  async delete(key) { this.objects.delete(key); }

  async list({ prefix = '', limit = 1000 } = {}) {
    const objects = [...this.objects.values()].filter((object) => object.key.startsWith(prefix)).slice(0, limit);
    return { objects, truncated: false };
  }
}

const R2_HOST = 'https://pub-test0000.r2.dev';

function uploadForm(name, type, { width, height, variants = [] } = {}) {
  const form = new FormData();
  form.append('file', new File([new Uint8Array(64).fill(7)], name, { type }));
  if (width !== undefined) form.append('width', String(width));
  if (height !== undefined) form.append('height', String(height));
  for (const variantWidth of variants) {
    form.append(`variant-${variantWidth}`, new File([new Uint8Array(16).fill(1)], `${variantWidth}.webp`, { type: 'image/webp' }), `${variantWidth}.webp`);
  }
  return form;
}

async function callUpload(bucket, form) {
  const upload = await loadModule('functions/api/admin/upload.ts');
  const response = await upload.onRequestPost({
    request: new Request('https://example.test/api/admin/upload', {
      method: 'POST',
      headers: { 'X-Admin-Password': ADMIN_PASSWORD, 'CF-Connecting-IP': '203.0.113.11' },
      body: form,
    }),
    env: { ADMIN_PASSWORD, BUCKET: bucket, R2_PUBLIC_HOST: R2_HOST },
  });
  return { status: response.status, payload: await response.json() };
}

test('F-092: файл с русским именем загружается, расширение берётся из исходного имени', async (t) => {
  const restoreCache = installMemoryCache();
  t.after(restoreCache);
  const bucket = new FakeBucket();

  const pdf = await callUpload(bucket, uploadForm('Договор.pdf', 'application/pdf'));
  assert.equal(pdf.status, 200, JSON.stringify(pdf.payload));
  assert.match(pdf.payload.key, /-dogovor\.pdf$/);
  const stored = bucket.objects.get(pdf.payload.key);
  assert.equal(stored.customMetadata.originalName, 'dogovor.pdf');
  assert.equal(stored.httpMetadata.contentDisposition, 'attachment; filename="dogovor.pdf"');

  const xlsx = await callUpload(bucket, uploadForm('Отчёт клиента (сентябрь).xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'));
  assert.equal(xlsx.status, 200, JSON.stringify(xlsx.payload));
  assert.match(xlsx.payload.key, /-otchet-klienta-sentyabr\.xlsx$/);

  const upper = await callUpload(bucket, uploadForm('Скан.PDF', 'application/pdf'));
  assert.equal(upper.status, 200);
  assert.match(upper.payload.key, /-skan\.pdf$/);

  // Обложка с полным набором копий: суффикс размеров и копии на месте.
  const variants = await loadModule('functions/_lib/image-variants.ts');
  const cover = await callUpload(bucket, uploadForm('Обложка.webp', 'image/webp', { width: 1024, height: 768, variants: variants.variantWidths(1024) }));
  assert.equal(cover.status, 200, JSON.stringify(cover.payload));
  assert.match(cover.payload.key, /-oblozhka--1024x768\.webp$/);
  for (const key of variants.variantKeysFor(cover.payload.key)) {
    assert.ok(bucket.objects.has(key), `нет копии ${key}`);
  }

  // Запреты не ослаблены: чужое расширение, пустое расширение и SVG по-прежнему 400.
  const svg = await callUpload(bucket, uploadForm('evil.svg', 'image/svg+xml'));
  assert.equal(svg.status, 400);
  const mismatch = await callUpload(bucket, uploadForm('x.pdf', 'image/png'));
  assert.equal(mismatch.status, 400);
  assert.match(mismatch.payload.error, /не совпадает/);
  assert.equal((await callUpload(bucket, uploadForm('безрасширения', 'application/pdf'))).status, 400);
  assert.equal((await callUpload(bucket, uploadForm('Договор.pdf.html', 'text/html'))).status, 400);
});

test('F-111: медиатека переносит пачку файлов одним запросом, одиночный перенос работает как раньше', async (t) => {
  const restoreCache = installMemoryCache();
  t.after(restoreCache);
  const bucket = new FakeBucket();
  const variants = await loadModule('functions/_lib/image-variants.ts');
  const keys = ['uploads/2026-09-23/1-a.webp', 'uploads/2026-09-23/2-b.pdf', 'uploads/2026-09-23/3-c--800x600.webp'];
  for (const key of keys) await bucket.put(key, new Uint8Array(4), { httpMetadata: { contentType: 'image/webp' }, customMetadata: { originalName: key.split('/').pop() } });
  for (const key of variants.variantKeysFor(keys[2])) await bucket.put(key, new Uint8Array(2), { httpMetadata: { contentType: 'image/webp' } });

  const media = await loadModule('functions/api/admin/media.ts');
  const post = async (body) => {
    const response = await media.onRequestPost({
      request: new Request('https://example.test/api/admin/media', {
        method: 'POST',
        headers: { 'X-Admin-Password': ADMIN_PASSWORD, 'Content-Type': 'application/json', 'CF-Connecting-IP': '203.0.113.12' },
        body: JSON.stringify(body),
      }),
      env: { ADMIN_PASSWORD, BUCKET: bucket, R2_PUBLIC_HOST: R2_HOST },
    });
    return { status: response.status, payload: await response.json() };
  };

  const bulk = await post({ action: 'move', keys: [...keys, 'uploads/2026-09-23/missing.webp', 'other/key.webp'], folder: 'covers' });
  assert.equal(bulk.status, 200);
  assert.equal(bulk.payload.success, true);
  assert.deepEqual(bulk.payload.moved.map((item) => item.key), keys.map((key) => key.replace('uploads/', 'uploads/covers/')));
  assert.deepEqual(bulk.payload.failed.map((item) => item.key), ['uploads/2026-09-23/missing.webp', 'other/key.webp']);
  assert.deepEqual(bulk.payload.skipped, []);
  for (const key of keys) assert.ok(!bucket.objects.has(key), `исходник ${key} остался`);
  for (const key of variants.variantKeysFor(keys[2].replace('uploads/', 'uploads/covers/'))) {
    assert.ok(bucket.objects.has(key), `копия ${key} не переехала`);
  }

  const single = await post({ action: 'move', key: 'uploads/covers/2026-09-23/1-a.webp', folder: '' });
  assert.equal(single.status, 200);
  assert.deepEqual(single.payload, { success: true, key: 'uploads/2026-09-23/1-a.webp', previousKey: 'uploads/covers/2026-09-23/1-a.webp', moved: true });

  const empty = await post({ action: 'move', keys: [], folder: 'covers' });
  assert.equal(empty.status, 400);
});

/** Bucket, который считает обращения и бросает на заданном по счёту — как R2 при исчерпании подзапросов. */
class CountingBucket extends FakeBucket {
  constructor(failAt = Infinity) {
    super();
    this.ops = 0;
    this.failAt = failAt;
  }

  touch() {
    this.ops += 1;
    if (this.ops >= this.failAt) throw new Error('Too many subrequests');
  }

  async put(...args) { this.touch(); return super.put(...args); }
  async get(...args) { this.touch(); return super.get(...args); }
  async head(...args) { this.touch(); return super.head(...args); }
  async delete(...args) { this.touch(); return super.delete(...args); }
}

async function postMedia(bucket, body, ip) {
  const media = await loadModule('functions/api/admin/media.ts');
  const response = await media.onRequestPost({
    request: new Request('https://example.test/api/admin/media', {
      method: 'POST',
      headers: { 'X-Admin-Password': ADMIN_PASSWORD, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
      body: JSON.stringify(body),
    }),
    env: { ADMIN_PASSWORD, BUCKET: bucket, R2_PUBLIC_HOST: R2_HOST },
  });
  return { status: response.status, payload: await response.json() };
}

test('F-111: бросок хранилища на втором файле останавливает пачку, остальные не тронуты', async (t) => {
  const restoreCache = installMemoryCache();
  t.after(restoreCache);
  // Документ без копий стоит четыре обращения R2: get, put, head, delete.
  // Первый файл — 1–4, у второго get проходит (5), put бросает (6).
  const bucket = new CountingBucket(6);
  const keys = ['uploads/2026-09-23/1-a.pdf', 'uploads/2026-09-23/2-b.pdf', 'uploads/2026-09-23/3-c.pdf'];
  for (const key of keys) await bucket.put(key, new Uint8Array(4), { httpMetadata: { contentType: 'application/pdf' } });
  bucket.ops = 0;

  const result = await postMedia(bucket, { action: 'move', keys, folder: 'docs' }, '203.0.113.13');
  assert.equal(result.status, 200, JSON.stringify(result.payload));
  assert.equal(result.payload.success, true);
  assert.deepEqual(result.payload.moved.map((item) => item.key), ['uploads/docs/2026-09-23/1-a.pdf']);
  assert.deepEqual(result.payload.failed.map((item) => item.key), ['uploads/2026-09-23/2-b.pdf']);
  assert.match(result.payload.failed[0].error, /Перенос прерван: Too many subrequests/);
  assert.deepEqual(result.payload.skipped, ['uploads/2026-09-23/3-c.pdf']);
  assert.match(result.payload.error, /мог остаться в обеих папках/);
  // Второй и третий файлы на месте, копий в новой папке у них нет.
  assert.ok(!bucket.objects.has('uploads/2026-09-23/1-a.pdf'));
  assert.ok(bucket.objects.has('uploads/2026-09-23/2-b.pdf'));
  assert.ok(bucket.objects.has('uploads/2026-09-23/3-c.pdf'));
  assert.ok(!bucket.objects.has('uploads/docs/2026-09-23/2-b.pdf'));
  assert.ok(!bucket.objects.has('uploads/docs/2026-09-23/3-c.pdf'));
  // После броска к хранилищу больше не обращались: ни к третьему файлу, ни для отката.
  assert.equal(bucket.ops, 6);
});

test('F-111: пачка режется по бюджету подзапросов — картинки с копиями переезжают по две за запрос', async (t) => {
  const restoreCache = installMemoryCache();
  t.after(restoreCache);
  const bucket = new CountingBucket();
  const variants = await loadModule('functions/_lib/image-variants.ts');
  // Оригинал 2200 px даёт все четыре копии: перенос стоит 20 обращений R2.
  const keys = [1, 2, 3].map((index) => `uploads/2026-09-23/${index}-shot--2200x1400.webp`);
  for (const key of keys) {
    await bucket.put(key, new Uint8Array(4), { httpMetadata: { contentType: 'image/webp' } });
    for (const variant of variants.variantKeysFor(key)) await bucket.put(variant, new Uint8Array(2), { httpMetadata: { contentType: 'image/webp' } });
  }
  assert.equal(variants.variantKeysFor(keys[0]).length, 4);
  bucket.ops = 0;

  const first = await postMedia(bucket, { action: 'move', keys, folder: 'shots' }, '203.0.113.14');
  assert.equal(first.status, 200, JSON.stringify(first.payload));
  assert.equal(first.payload.success, true);
  assert.deepEqual(first.payload.moved.map((item) => item.previousKey), keys.slice(0, 2));
  assert.deepEqual(first.payload.failed, []);
  assert.deepEqual(first.payload.skipped, [keys[2]]);
  assert.equal(first.payload.error, undefined);
  // Бюджет на бесплатном тарифе — 50 подзапросов на запрос; две картинки уложились.
  assert.ok(bucket.ops <= 42, `обращений к R2: ${bucket.ops}`);
  assert.ok(bucket.objects.has(keys[2]), 'третья картинка должна остаться на месте');
  for (const variant of variants.variantKeysFor(keys[2])) assert.ok(bucket.objects.has(variant), `копия ${variant} тронута`);
  for (const key of keys.slice(0, 2)) {
    const target = key.replace('uploads/', 'uploads/shots/');
    assert.ok(bucket.objects.has(target), `${target} не создан`);
    for (const variant of variants.variantKeysFor(target)) assert.ok(bucket.objects.has(variant), `копия ${variant} не переехала`);
    assert.ok(!bucket.objects.has(key), `исходник ${key} остался`);
  }

  // Остаток клиент шлёт следующим запросом — он переезжает целиком.
  const second = await postMedia(bucket, { action: 'move', keys: first.payload.skipped, folder: 'shots' }, '203.0.113.14');
  assert.equal(second.status, 200);
  assert.deepEqual(second.payload.moved.map((item) => item.previousKey), [keys[2]]);
  assert.deepEqual(second.payload.skipped, []);
  assert.ok(!bucket.objects.has(keys[2]));
});
