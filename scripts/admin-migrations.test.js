import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';

/**
 * Раздел «Миграции»: что применено, что ждёт.
 *
 * Раннера миграций в проекте нет, и до этого раздела состояние базы можно было
 * узнать только методом «открой раздел и посмотри, не ругается ли он». Раздел
 * отвечает на вопрос прямо — значит, его ответ обязан быть верным: сказать
 * «применена» про неприменённую миграцию хуже, чем не говорить ничего.
 *
 * Поэтому статусы проверяются на настоящем SQLite с настоящими файлами
 * миграций, а не на выдуманной схеме.
 */

globalThis.caches ??= { default: { match: async () => undefined, put: async () => {} } };

const PASSWORD = 'migrations-test-password';

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
    return { success: true, meta: { changes: 0, last_row_id: 0 } };
  }
}

class D1Database {
  constructor(db) { this.db = db; }
  prepare(sql) { return new D1Statement(this.db, sql); }
}

async function loadEndpoint() {
  const result = await build({
    entryPoints: ['functions/api/admin/migrations.ts'],
    bundle: true,
    format: 'esm',
    target: 'es2022',
    platform: 'neutral',
    write: false,
  });
  const code = `${result.outputFiles[0].text}\n//${randomUUID()}`;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
}

const endpoint = await loadEndpoint();
const ALL_MIGRATIONS = readdirSync('migrations').filter((name) => name.endsWith('.sql')).sort();

/** База, в которой применены только перечисленные миграции. */
function databaseWith(files) {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of files) sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  return sqlite;
}

async function report(sqlite, { query = '' } = {}) {
  const response = await endpoint.onRequestGet({
    request: new Request(`https://example.com/api/admin/migrations${query}`, {
      headers: { 'X-Admin-Password': PASSWORD },
    }),
    env: { DB: sqlite ? new D1Database(sqlite) : undefined, ADMIN_PASSWORD: PASSWORD },
  });
  return { status: response.status, payload: await response.json() };
}

const byFile = (payload, file) => payload.migrations.find((item) => item.file === file);

test('на полностью применённой базе все миграции считаются применёнными', async () => {
  const { status, payload } = await report(databaseWith(ALL_MIGRATIONS));

  assert.equal(status, 200);
  assert.equal(payload.total, ALL_MIGRATIONS.length);
  assert.equal(payload.applied, ALL_MIGRATIONS.length, `не применёнными сочтены: ${
    payload.migrations.filter((m) => m.state !== 'applied').map((m) => `${m.file} (${m.missing.join(', ')})`).join('; ')
  }`);
  assert.equal(payload.pending, 0);
  assert.equal(payload.partial, 0);
  assert.equal(payload.next, null, 'применять больше нечего');
});

test('неприменённые миграции видны, и названа ближайшая по порядку', async () => {
  const applied = ALL_MIGRATIONS.slice(0, 20);
  const { payload } = await report(databaseWith(applied));

  assert.equal(payload.applied, 20);
  assert.equal(payload.pending, ALL_MIGRATIONS.length - 20);
  // Порядок важен: поздние миграции опираются на таблицы ранних.
  assert.equal(payload.next, ALL_MIGRATIONS[20]);
});

test('миграция, которая только добавляет колонки, не считается применённой заранее', async () => {
  // Ради этого случая и делались подписи: таблица `leads` существует с 0008,
  // и по карте таблиц 0039 выглядела бы применённой с самого начала.
  const withoutDedupe = ALL_MIGRATIONS.filter((file) => !file.startsWith('0039'));
  const { payload } = await report(databaseWith(withoutDedupe));

  const dedupe = byFile(payload, '0039_leads_dedupe_index.sql');
  assert.equal(dedupe.state, 'pending');
  assert.ok(dedupe.missing.includes('колонка leads.dedupe_phone'), `не хватает не того: ${dedupe.missing.join(', ')}`);
});

test('миграция, которая только ставит триггеры, тоже определяется', async () => {
  const withoutRetention = ALL_MIGRATIONS.filter((file) => !file.startsWith('0040'));
  const { payload } = await report(databaseWith(withoutRetention));

  const retention = byFile(payload, '0040_versions_retention.sql');
  assert.equal(retention.state, 'pending');
  assert.ok(retention.missing.some((item) => item.includes('trg_article_versions_retention')));
});

test('наполовину выполненная миграция не выдаётся за применённую', async () => {
  // Реальный случай: одна из команд файла упала посреди выполнения. Считать
  // такую применённой нельзя — раздел админки упадёт на недостающей колонке.
  const sqlite = databaseWith(ALL_MIGRATIONS.filter((file) => !file.startsWith('0039')));
  sqlite.exec('ALTER TABLE leads ADD COLUMN dedupe_email TEXT');

  const { payload } = await report(sqlite);
  const dedupe = byFile(payload, '0039_leads_dedupe_index.sql');

  assert.equal(dedupe.state, 'partial');
  assert.equal(dedupe.found, 1);
  assert.ok(dedupe.checked > 1);
  assert.ok(dedupe.missing.includes('колонка leads.dedupe_phone'));
  assert.equal(payload.partial, 1);
  assert.equal(payload.next, '0039_leads_dedupe_index.sql', 'частично применённая — тоже следующая на очереди');
});

test('у каждой миграции подписан её смысл для владельца', async () => {
  const { payload } = await report(databaseWith(ALL_MIGRATIONS));
  for (const item of payload.migrations) {
    assert.ok(item.unlocks, `${item.file} не объясняет, что включает`);
    assert.match(item.number, /^\d{4}$/);
  }
});

test('текст миграции отдаётся по одной штуке и только известной', async () => {
  const { payload } = await report(null, { query: '?sql=0040_versions_retention.sql' });
  assert.equal(payload.success, true);
  assert.match(payload.sql, /CREATE TRIGGER IF NOT EXISTS trg_article_versions_retention/);

  const missing = await report(null, { query: '?sql=9999_nope.sql' });
  assert.equal(missing.status, 404);
});

test('без пароля состояние базы не отдаётся', async () => {
  const response = await endpoint.onRequestGet({
    request: new Request('https://example.com/api/admin/migrations'),
    env: { DB: new D1Database(databaseWith(ALL_MIGRATIONS)), ADMIN_PASSWORD: PASSWORD },
  });
  assert.equal(response.status, 401);
});

test('без базы раздел объясняется, а не падает', async () => {
  const { status, payload } = await report(null);
  assert.equal(status, 503);
  assert.equal(payload.code, 'D1_NOT_BOUND');
});
