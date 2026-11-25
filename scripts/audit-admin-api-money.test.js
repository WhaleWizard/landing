import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomUUID, verify } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';

/**
 * Находки построчного аудита в серверной части админки: деньги, CRM, отчёты
 * и сводки (группа admin-api-money).
 *
 * Всё проверяется поведением — настоящий обработчик, настоящий SQLite с
 * настоящими миграциями, — а не поиском строк в исходниках. Даты в данных
 * считаются от текущего момента, чтобы тесты не зависели от дня запуска.
 */

const ALL_MIGRATIONS = readdirSync('migrations').filter((name) => name.endsWith('.sql')).sort();
const ADMIN_PASSWORD = 'audit-admin-api-money-password';

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
    return this.runSync();
  }

  runSync() {
    const info = this.db.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) } };
  }
}

class D1Database {
  constructor(db) { this.db = db; }
  prepare(sql) { return new D1Statement(this.db, sql); }
  async batch(statements) {
    this.db.exec('BEGIN');
    try {
      const results = statements.map((statement) => statement.runSync());
      this.db.exec('COMMIT');
      return results;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
}

function freshDatabase() {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ALL_MIGRATIONS) sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  return sqlite;
}

/** Каждый вызов — свежий модуль: кэш схемы в памяти воркера не переезжает между тестами. */
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

/** Cache API воркера: нужен ограничителю запросов и кэшу замеров. */
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

/** Перехват внешних запросов: Telegram считается, PageSpeed подменяется, остальное — ошибка. */
function installFetchSpy({ pagespeed = null } = {}) {
  const telegram = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('https://api.telegram.org/')) {
      telegram.push(JSON.parse(String(init?.body || '{}')).text || '');
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }
    if (pagespeed && url.includes('pagespeedonline')) {
      return new Response(JSON.stringify(pagespeed), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`Неожиданный внешний запрос в тесте: ${url}`);
  };
  return { telegram, restore: () => { globalThis.fetch = original; } };
}

function adminRequest(path, { query = {}, method = 'GET', body } = {}) {
  const url = new URL(`https://www.whalewzrd.com/api/admin/${path}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, String(value));
  return new Request(url, {
    method,
    headers: {
      'X-Admin-Password': ADMIN_PASSWORD,
      'Content-Type': 'application/json',
      'CF-Connecting-IP': '203.0.113.7',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function invoke(handler, env, request) {
  const background = [];
  const response = await handler({ request, env, waitUntil: (promise) => background.push(promise) });
  await Promise.allSettled(background);
  return { status: response.status, payload: await response.json() };
}

async function harness(entry, { sqlite = freshDatabase(), env: extraEnv = {} } = {}) {
  const module = await loadModule(entry);
  const env = { DB: new D1Database(sqlite), ADMIN_PASSWORD, ...extraEnv };
  const path = entry.replace(/^functions\/api\/admin\//, '').replace(/\.ts$/, '');
  return {
    sqlite,
    env,
    module,
    get: (query = {}) => invoke(module.onRequestGet, env, adminRequest(path, { query })),
    post: (body, query = {}) => invoke(module.onRequestPost, env, adminRequest(path, { method: 'POST', body, query })),
  };
}

// ─── Даты ───────────────────────────────────────────────────────────────────

/** Формат `datetime('now')` в SQLite: так пишутся created_at, closed_at, next_action_at. */
function sqlDateTime(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

function sqlDate(date) {
  return date.toISOString().slice(0, 10);
}

function daysAgo(days, hour = 12) {
  const date = new Date(Date.now() - days * 86_400_000);
  date.setUTCHours(hour, 0, 0, 0);
  return date;
}

function shiftMonth(period, delta) {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function lastDayOf(period) {
  const [year, month] = period.split('-').map(Number);
  return `${period}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, '0')}`;
}

const CURRENT_MONTH = new Date().toISOString().slice(0, 7);
const PREVIOUS_MONTH = shiftMonth(CURRENT_MONTH, -1);
/** Смещение браузера для UTC+5 (Ташкент): getTimezoneOffset() отдаёт −300. */
const TASHKENT_OFFSET = -300;

function insertLead(sqlite, fields = {}) {
  const now = sqlDateTime(new Date());
  const row = {
    event_id: randomUUID(),
    name: '',
    email: '',
    phone: '',
    telegram_username: '',
    status: 'new',
    created_at: now,
    updated_at: now,
    pipeline_stage: 'new',
    deal_value: null,
    deal_currency: 'USD',
    closed_at: null,
    next_action_at: null,
    quality: '',
    ...fields,
  };
  const columns = Object.keys(row);
  const info = sqlite.prepare(
    `INSERT INTO leads (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
  ).run(...columns.map((column) => row[column]));
  return Number(info.lastInsertRowid);
}

test('массовый этап сохраняет ревизии, CRM-метки и аудит, повтор не создаёт новые записи', async (t) => {
  t.after(installMemoryCache());
  const sqlite = freshDatabase();
  const first = insertLead(sqlite);
  const second = insertLead(sqlite, { pipeline_stage: 'contacted', status: 'in_progress', first_response_at: '2026-01-01 00:00:00' });
  const already = insertLead(sqlite, { pipeline_stage: 'proposal', status: 'in_progress' });
  const crm = await harness('functions/api/admin/lead-crm.ts', { sqlite });
  const request = { action: 'bulk_update_stage', pipeline_stage: 'proposal', action_id: 'test-bulk',
    items: [first, second, already].map((id) => ({ id, expected_revision: 0 })) };
  const applied = await crm.post(request);
  assert.equal(applied.status, 200, JSON.stringify(applied.payload));
  assert.equal(applied.payload.count, 2);
  const rows = sqlite.prepare('SELECT pipeline_stage, status, crm_revision, first_response_at, last_contacted_at FROM leads ORDER BY id').all();
  assert.deepEqual(rows.map((row) => [row.pipeline_stage, row.status, row.crm_revision]), [
    ['proposal', 'in_progress', 1], ['proposal', 'in_progress', 1], ['proposal', 'in_progress', 0],
  ]);
  assert.ok(rows[0].first_response_at && rows[0].last_contacted_at);
  assert.equal(rows[1].first_response_at, '2026-01-01 00:00:00');
  const replay = await crm.post(request);
  assert.equal(replay.payload.count, 2);
  assert.equal(replay.payload.idempotent, true);
  assert.deepEqual(sqlite.prepare('SELECT lead_id, "from" AS previous, "to" AS next FROM lead_activity ORDER BY lead_id').all()
    .map((row) => [row.lead_id, row.previous, row.next]), [[first, 'new', 'proposal'], [second, 'contacted', 'proposal']]);
  const closed = await crm.post({ action: 'bulk_update_stage', pipeline_stage: 'won', ids: [first, second] });
  assert.equal(closed.payload.count, 2);
  assert.equal(sqlite.prepare("SELECT count(*) AS count FROM leads WHERE status = 'closed' AND closed_at IS NOT NULL").get().count, 2);
});

test('массовый этап не меняет ни одной сделки при конфликте или ошибке в середине транзакции', async (t) => {
  t.after(installMemoryCache());
  const sqlite = freshDatabase();
  const first = insertLead(sqlite);
  const second = insertLead(sqlite);
  const deleted = insertLead(sqlite, { deleted_at: '2026-01-01 00:00:00' });
  const crm = await harness('functions/api/admin/lead-crm.ts', { sqlite });
  const request = { action: 'bulk_update_stage', pipeline_stage: 'won', action_id: 'test-atomic',
    items: [first, second].map((id) => ({ id, expected_revision: 0 })) };
  const assertUntouched = () => {
    assert.equal(sqlite.prepare("SELECT count(*) AS count FROM leads WHERE pipeline_stage <> 'new'").get().count, 0);
    assert.equal(sqlite.prepare('SELECT count(*) AS count FROM lead_activity').get().count, 0);
  };
  assert.equal((await crm.post({ ...request, items: [{ id: first, expected_revision: 0 }, { id: deleted, expected_revision: 0 }] })).status, 409);
  assertUntouched();
  const batch = crm.env.DB.batch.bind(crm.env.DB);
  crm.env.DB.batch = async (statements) => {
    sqlite.prepare('UPDATE leads SET crm_revision = 1 WHERE id = ?').run(second);
    return batch(statements);
  };
  assert.equal((await crm.post(request)).status, 409);
  assertUntouched();
  crm.env.DB.batch = batch;
  sqlite.prepare('UPDATE leads SET crm_revision = 0 WHERE id = ?').run(second);
  sqlite.exec("CREATE TRIGGER reject_stage BEFORE UPDATE OF pipeline_stage ON leads BEGIN SELECT RAISE(ABORT, 'test write failure'); END");
  assert.equal((await crm.post(request)).status, 500);
  assertUntouched();
});

test('CRM note and task retries cannot acknowledge changed input or recreate deleted records', async (t) => {
  t.after(installMemoryCache());
  const crm = await harness('functions/api/admin/lead-crm.ts');
  t.after(() => crm.sqlite.close());
  const leadId = insertLead(crm.sqlite);
  const otherLeadId = insertLead(crm.sqlite);
  for (const [entity, createAction, field] of [['note', 'add_note', 'body'], ['task', 'create_task', 'title']]) {
    const base = { lead_id: leadId, [field]: 'Первый текст' };
    const create = { ...base, action: createAction, action_id: randomUUID() };
    const created = await crm.post(create);
    assert.equal(created.status, 200, JSON.stringify(created.payload));
    assert.equal((await crm.post(create)).payload.idempotent, true);
    assert.equal((await crm.post({ ...create, [field]: 'Другая запись' })).status, 409);

    const update = { ...base, action: `update_${entity}`, action_id: randomUUID(),
      [`${entity}_id`]: created.payload[entity].id, expected_revision: 0, [field]: 'Обновлённый текст' };
    assert.equal((await crm.post(update)).status, 200);
    assert.equal((await crm.post(update)).payload.idempotent, true);
    assert.equal((await crm.post({ ...update, [field]: 'Третий текст' })).status, 409);
    assert.equal((await crm.post(create)).status, 409);

    const remove = { ...update, action: `delete_${entity}`, action_id: randomUUID(), expected_revision: 1 };
    assert.equal((await crm.post(remove)).status, 200);
    assert.equal((await crm.post(remove)).payload.idempotent, true);
    assert.equal((await crm.post({ ...remove, lead_id: otherLeadId })).status, 404);
    assert.equal((await crm.post(create)).status, 409);
  }
  assert.equal(crm.sqlite.prepare('SELECT COUNT(*) AS total FROM crm_notes').get().total, 0);
  assert.equal(crm.sqlite.prepare('SELECT COUNT(*) AS total FROM crm_tasks').get().total, 0);
});

test('DA-31: a deal trashed between the check and the write keeps its notes and tasks untouched', async (t) => {
  t.after(installMemoryCache());
  const crm = await harness('functions/api/admin/lead-crm.ts');
  t.after(() => crm.sqlite.close());
  const realBatch = crm.env.DB.batch.bind(crm.env.DB);
  for (const [entity, field] of [['note', 'body'], ['task', 'title']]) {
    for (const operation of ['create', 'update', 'delete']) {
      const leadId = insertLead(crm.sqlite);
      let entityId;
      if (operation !== 'create') {
        const created = await crm.post({ lead_id: leadId, action: entity === 'note' ? 'add_note' : 'create_task', action_id: randomUUID(), [field]: 'Исходный текст' });
        entityId = created.payload[entity].id;
      }
      // Корзина срабатывает после проверки обработчика, но до записи.
      let fired = false;
      crm.env.DB.batch = async (statements) => {
        if (!fired) {
          fired = true;
          crm.sqlite.prepare("UPDATE leads SET deleted_at = datetime('now'), crm_revision = crm_revision + 1 WHERE id = ?").run(leadId);
        }
        return realBatch(statements);
      };
      const action = operation === 'create' ? (entity === 'note' ? 'add_note' : 'create_task') : `${operation}_${entity}`;
      const body = { lead_id: leadId, action, action_id: randomUUID(), [field]: 'Новый текст' };
      if (entityId) Object.assign(body, { [`${entity}_id`]: entityId, expected_revision: 0 });
      const result = await crm.post(body);
      crm.env.DB.batch = realBatch;
      assert.equal(result.status, 409, `${action}: ${JSON.stringify(result.payload)}`);
      assert.match(String(result.payload.error), /корзин/);
      const table = entity === 'note' ? 'crm_notes' : 'crm_tasks';
      const rows = crm.sqlite.prepare(`SELECT ${field} AS text, revision FROM ${table} WHERE lead_id = ?`).all(leadId);
      if (operation === 'create') assert.equal(rows.length, 0, `${action}: nothing created`);
      else assert.deepEqual(rows.map((row) => [row.text, row.revision]), [['Исходный текст', 0]], `${action}: record untouched`);
      const history = crm.sqlite.prepare(`SELECT COUNT(*) AS n FROM lead_activity WHERE lead_id = ? AND type LIKE '${entity}_%' AND action_id = ?`).get(leadId, body.action_id).n;
      assert.equal(history, 0, `${action}: no history after the trash`);
    }
  }
});

test('CRM deal and tag retries compare values and tag edits include name and color', async (t) => {
  t.after(installMemoryCache());
  const crm = await harness('functions/api/admin/lead-crm.ts');
  t.after(() => crm.sqlite.close());
  const leadId = insertLead(crm.sqlite);
  const update = { action: 'update_lead', lead_id: leadId, action_id: randomUUID(), expected_revision: 0, deal_value: 25 };
  assert.equal((await crm.post(update)).status, 200);
  assert.equal((await crm.post(update)).payload.idempotent, true);
  assert.equal((await crm.post({ ...update, deal_value: 30 })).status, 409);
  const tags = { action: 'set_tags', lead_id: leadId, action_id: randomUUID(), expected_revision: 1,
    tags: [{ name: 'Тег', color: '#123456' }] };
  assert.equal((await crm.post(tags)).status, 200);
  const edited = { ...tags, tags: [{ name: 'ТЕГ', color: '#654321' }] };
  assert.equal((await crm.post(edited)).status, 409);
  const saved = await crm.post({ ...edited, action_id: randomUUID(), expected_revision: 2 });
  assert.equal(saved.status, 200);
  assert.equal(saved.payload.tags[0].name, 'ТЕГ');
  assert.equal(saved.payload.tags[0].color, '#654321');
  const textOnly = await crm.post({ ...tags, tags: ['ТЕГ', 'Новый'], action_id: randomUUID(), expected_revision: 3 });
  assert.equal(textOnly.status, 200);
  assert.equal(textOnly.payload.tags.find((tag) => tag.slug === saved.payload.tags[0].slug).color, '#654321');
});

test('CRM task scopes use the owner date and omit leads in trash', async (t) => {
  t.after(installMemoryCache());
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-13T20:00:00.750Z') });
  const crm = await harness('functions/api/admin/lead-crm.ts');
  t.after(() => crm.sqlite.close());
  const active = insertLead(crm.sqlite);
  const deleted = insertLead(crm.sqlite, { deleted_at: '2026-11-13 18:00:00' });
  const insert = crm.sqlite.prepare('INSERT INTO crm_tasks (lead_id,title,due_at) VALUES (?,?,?)');
  insert.run(active, 'Сегодня утром', '2026-11-13T21:00:00Z');
  insert.run(active, 'Просрочено', '2026-11-13T20:00:00.250Z');
  insert.run(active, 'Завтра', '2026-11-14T20:00:00Z');
  insert.run(deleted, 'Из корзины', '2026-11-13T22:00:00Z');
  const query = { resource: 'tasks', timezone_offset: -300 };
  assert.deepEqual((await crm.get({ ...query, scope: 'today' })).payload.tasks.map((task) => task.title), ['Просрочено', 'Сегодня утром']);
  assert.deepEqual((await crm.get({ ...query, scope: 'upcoming' })).payload.tasks.map((task) => task.title), ['Завтра']);
  assert.deepEqual((await crm.get({ ...query, scope: 'overdue' })).payload.tasks.map((task) => task.title), ['Просрочено']);
  assert.equal((await crm.get(query)).payload.tasks.length, 3);
  assert.equal((await crm.post({ action: 'create_task', lead_id: deleted, title: 'Ошибка' })).status, 404);
  assert.equal((await crm.get({ lead_id: '9007199254740993' })).status, 400);
});

test('CRM merge preserves work, attribution and ingestion history and replays one result', async (t) => {
  t.after(installMemoryCache());
  const crm = await harness('functions/api/admin/lead-crm.ts');
  const { sqlite } = crm;
  t.after(() => sqlite.close());
  const primary = insertLead(sqlite, { name: 'Основная', submissions_count: 2, utm_source: 'google',
    last_submitted_at: '2026-11-13T13:00:00+05:00' });
  const duplicate = insertLead(sqlite, { email: 'merge@example.test', submissions_count: 3,
    utm_source: 'meta', utm_campaign: 'other', last_submitted_at: '2026-11-13 10:00:00' });
  sqlite.prepare("INSERT INTO clients (name, lead_id) VALUES ('Клиент', ?)").run(primary);
  sqlite.prepare("INSERT INTO crm_notes (lead_id, body) VALUES (?, 'Запись')").run(duplicate);
  sqlite.prepare("INSERT INTO crm_tasks (lead_id, title) VALUES (?, 'Задача')").run(duplicate);
  sqlite.exec("INSERT INTO crm_tags (id, name, slug) VALUES (1, 'Общий', 'shared'), (2, 'Новый', 'new')");
  sqlite.prepare('INSERT INTO crm_lead_tags (lead_id, tag_id) VALUES (?, 1), (?, 1), (?, 2)').run(primary, duplicate, duplicate);
  sqlite.prepare("INSERT INTO lead_ingestions (event_id, claim_token, lead_id) VALUES ('merge-receipt', 'token', ?)").run(duplicate);
  const request = { action: 'merge_lead', lead_id: primary, duplicate_id: duplicate, action_id: 'retry-one',
    expected_revision: 0, duplicate_revision: 0 };
  const responses = await Promise.all([crm.post(request), crm.post(request)]);
  assert.deepEqual(responses.map((item) => item.status), [200, 200]);
  assert.equal(responses.filter((item) => item.payload.idempotent === true).length, 1);
  assert.ok(responses.every((item) => item.payload.revision === 1));
  assert.equal((await crm.post({ ...request, duplicate_id: primary + duplicate })).status, 409);
  const result = sqlite.prepare('SELECT * FROM leads WHERE id = ?').get(primary);
  assert.equal(result.submissions_count, 5);
  assert.equal(result.last_submitted_at, '2026-11-13 10:00:00');
  assert.equal(result.email, 'merge@example.test');
  assert.equal(result.utm_source, 'google');
  assert.equal(result.utm_campaign, '');
  assert.equal(sqlite.prepare('SELECT lead_id FROM clients').get().lead_id, primary);
  assert.equal(sqlite.prepare('SELECT lead_id FROM lead_ingestions').get().lead_id, primary);
  assert.equal(sqlite.prepare('SELECT lead_id FROM crm_tasks').get().lead_id, primary);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM crm_notes WHERE lead_id = ?').get(primary).n, 2);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM crm_lead_tags WHERE lead_id = ?').get(primary).n, 2);
  const trash = await harness('functions/api/admin/lead-trash.ts', { sqlite });
  assert.equal((await trash.post({ action: 'restore', ids: [duplicate] })).payload.restored, 1);
  assert.equal((await crm.post({ ...request, action_id: 'new-retry', expected_revision: 1, duplicate_revision: 1 })).status, 409);
  assert.equal((await crm.post(request)).payload.idempotent, true);
  assert.equal(sqlite.prepare('SELECT submissions_count FROM leads WHERE id = ?').get(primary).submissions_count, 5);
});

test('CRM merge rejects competing edits and rolls back changes if a later write fails', async (t) => {
  t.after(installMemoryCache());
  const crm = await harness('functions/api/admin/lead-crm.ts');
  const { sqlite } = crm;
  t.after(() => sqlite.close());
  const primary = insertLead(sqlite);
  const first = insertLead(sqlite, { submissions_count: 4 });
  const second = insertLead(sqlite, { submissions_count: 6 });
  const request = { action: 'merge_lead', lead_id: primary, expected_revision: 0, duplicate_revision: 0 };
  sqlite.prepare("INSERT INTO crm_tasks (lead_id, title) VALUES (?, 'Срок'), (?, 'Срок')").run(first, second);
  const results = await Promise.all([first, second].map((id) => crm.post({ ...request, duplicate_id: id, action_id: `race-${id}` })));
  assert.deepEqual(results.map((item) => item.status).sort(), [200, 409]);
  const remaining = results[0].status === 409 ? first : second;
  assert.equal(sqlite.prepare('SELECT lead_id FROM crm_tasks WHERE lead_id = ?').get(remaining).lead_id, remaining);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lead_activity WHERE type = ?').get('lead_merged').n, 1);
  assert.equal(sqlite.prepare('SELECT submissions_count FROM leads WHERE id = ?').get(primary).submissions_count, remaining === first ? 7 : 5);
  sqlite.exec("CREATE TRIGGER reject_merge_note BEFORE INSERT ON crm_notes BEGIN SELECT RAISE(ABORT, 'test write failure'); END");
  assert.equal((await crm.post({ ...request, duplicate_id: remaining, expected_revision: 1 })).status, 500);
  assert.equal(sqlite.prepare('SELECT deleted_at FROM leads WHERE id = ?').get(remaining).deleted_at, null);
  assert.equal(sqlite.prepare('SELECT lead_id FROM crm_tasks WHERE lead_id = ?').get(remaining).lead_id, remaining);
  assert.equal(sqlite.prepare('SELECT crm_revision FROM leads WHERE id = ?').get(primary).crm_revision, 1);
});

test('CRM merge protects linked clients and won sales and clients reject stale source IDs', async (t) => {
  t.after(installMemoryCache());
  const crm = await harness('functions/api/admin/lead-crm.ts');
  const { sqlite } = crm;
  t.after(() => sqlite.close());
  const clients = await harness('functions/api/admin/clients.ts', { sqlite });
  const list = await harness('functions/api/admin/crm-leads.ts', { sqlite });
  const primary = insertLead(sqlite);
  const duplicate = insertLead(sqlite, { utm_source: 'meta', utm_campaign: 'sale', utm_content: 'video', utm_term: 'audience' });
  const won = insertLead(sqlite, { pipeline_stage: 'won', deal_value: 150 });
  const linked = insertLead(sqlite);
  assert.equal((await clients.post({ action: 'create', name: 'Связанный', lead_id: linked })).status, 200);
  assert.equal((await list.get({ id: linked })).payload.leads[0].has_client, 1);
  const request = { action: 'merge_lead', lead_id: primary };
  assert.equal((await crm.post({ ...request, duplicate_id: won })).status, 409);
  assert.equal((await crm.post({ ...request, duplicate_id: linked })).status, 409);
  assert.equal((await crm.post({ ...request, duplicate_id: duplicate, duplicate_revision: 99 })).status, 409);
  assert.equal((await crm.post({ ...request, duplicate_id: duplicate })).status, 200);
  const transferred = sqlite.prepare('SELECT utm_source, utm_campaign, utm_content, utm_term FROM leads WHERE id = ?').get(primary);
  assert.deepEqual({ ...transferred }, { utm_source: 'meta', utm_campaign: 'sale', utm_content: 'video', utm_term: 'audience' });
  for (const id of [duplicate, 99999]) {
    assert.equal((await clients.post({ action: 'create', name: 'Отклонить', lead_id: id })).status, 409);
  }
  assert.equal((await clients.post({ action: 'create', name: 'Отклонить', lead_id: 'oops' })).status, 400);
  assert.equal((await clients.post({ action: 'create', name: 'Без заявки' })).status, 200);
  const trash = await harness('functions/api/admin/lead-trash.ts', { sqlite });
  assert.equal((await trash.post(null)).status, 400);
  assert.equal((await trash.post({ action: 'restore', ids: ['9007199254740993'] })).status, 400);
});

test('CRM converts to a client and wins the deal in one batch with safe retries', async (t) => {
  t.after(installMemoryCache());
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-13T21:00:00Z') });
  const crm = await harness('functions/api/admin/lead-crm.ts');
  const { sqlite } = crm;
  t.after(() => sqlite.close());
  const lead = insertLead(sqlite, { name: 'Клиент', phone: '123456', deal_value: 10 });
  const params = { timezone_offset: -300 };
  const request = { action: 'convert_client', action_id: 'convert-this', lead_id: lead, expected_revision: 0, deal_value: 55, deal_currency: 'EUR' };
  assert.equal((await crm.post({ ...request, expected_revision: 2 }, params)).status, 409);
  sqlite.exec("CREATE TRIGGER fail_client BEFORE INSERT ON clients BEGIN SELECT RAISE(ABORT, 'fixture failure'); END");
  assert.equal((await crm.post(request, params)).status, 500);
  assert.equal(sqlite.prepare('SELECT pipeline_stage FROM leads').get().pipeline_stage, 'new');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM lead_activity').get().n, 0);
  sqlite.exec('DROP TRIGGER fail_client');
  const results = await Promise.all([crm.post(request, params), crm.post(request, params)]);
  assert.ok(results.every((result) => result.status === 200));
  assert.equal(results[0].payload.clientId, results[1].payload.clientId);
  assert.equal((await crm.post({ ...request, deal_value: 80 }, params)).status, 409);
  const client = sqlite.prepare('SELECT lead_id,contact_value,retainer_currency,started_at FROM clients').get();
  assert.deepEqual({ ...client }, { lead_id: lead, contact_value: '123456', retainer_currency: 'EUR', started_at: '2026-11-14' });
  assert.equal(sqlite.prepare('SELECT pipeline_stage FROM leads').get().pipeline_stage, 'won');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM clients').get().n, 1);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM lead_activity WHERE type='pipeline_stage_changed'").get().n, 1);
});

test('trash revisions invalidate old CRM forms and purge detaches the client without removing its work', async (t) => {
  t.after(installMemoryCache());
  const trash = await harness('functions/api/admin/lead-trash.ts');
  const { sqlite } = trash;
  t.after(() => sqlite.close());
  const crm = await harness('functions/api/admin/lead-crm.ts', { sqlite });
  const lead = insertLead(sqlite);
  const client = Number(sqlite.prepare("INSERT INTO clients (name, lead_id) VALUES ('Клиент', ?)").run(lead).lastInsertRowid);
  sqlite.prepare("INSERT INTO client_notes(client_id,body) VALUES (?, 'Рабочая история')").run(client);
  const deletes = await Promise.all([1, 2].map(() => trash.post({ action: 'delete', ids: [lead] })));
  assert.deepEqual(deletes.map((item) => item.payload.moved).sort(), [0, 1]);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM lead_activity WHERE type='lead_trashed'").get().n, 1);
  const restores = await Promise.all([1, 2].map(() => trash.post({ action: 'restore', ids: [lead] })));
  assert.deepEqual(restores.map((item) => item.payload.restored).sort(), [0, 1]);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM lead_activity WHERE type='lead_restored'").get().n, 1);
  assert.equal((await crm.post({ action: 'update_lead', lead_id: lead, expected_revision: 0, deal_value: 30 })).status, 409);
  assert.equal((await trash.post({ action: 'purge', ids: [lead] })).payload.purged, 0);
  assert.equal(sqlite.prepare('SELECT lead_id FROM clients').get().lead_id, lead);
  await trash.post({ action: 'delete', ids: [lead] });
  assert.equal((await trash.post({ action: 'purge', ids: [lead] })).payload.purged, 1);
  assert.equal(sqlite.prepare('SELECT lead_id FROM clients').get().lead_id, null);
  assert.equal(sqlite.prepare('SELECT body FROM client_notes').get().body, 'Рабочая история');
});

test('client deletion protects a project added just before the transaction', async (t) => {
  t.after(installMemoryCache());
  const clients = await harness('functions/api/admin/clients.ts');
  const { sqlite } = clients;
  t.after(() => sqlite.close());
  const id = Number(sqlite.prepare("INSERT INTO clients (name) VALUES ('Клиент')").run().lastInsertRowid);
  sqlite.prepare("INSERT INTO client_notes (client_id, body) VALUES (?, 'Заметка')").run(id);
  const batch = clients.env.DB.batch.bind(clients.env.DB);
  clients.env.DB.batch = (statements) => {
    sqlite.prepare("INSERT INTO client_work (client_id, kind, title) VALUES (?, 'project', 'Проект')").run(id);
    return batch(statements);
  };
  assert.equal((await clients.post({ action: 'delete', id })).status, 409);
  assert.equal(sqlite.prepare('SELECT id FROM clients').get().id, id);
  assert.equal(sqlite.prepare('SELECT body FROM client_notes').get().body, 'Заметка');
  clients.env.DB.batch = batch;
  assert.equal((await clients.post({ action: 'delete', id: id + 1 })).status, 404);
});

// ─── F-028: расходы не введены — null, а не ноль ─────────────────────────────

test('F-028: без единой строки ad_spend отчёт, цели и воронка не рисуют нулевой расход', async (t) => {
  t.after(installMemoryCache());
  const sqlite = freshDatabase();
  const now = sqlDateTime(new Date());
  insertLead(sqlite, { name: 'Сделка', pipeline_stage: 'won', deal_value: 1000, closed_at: now });

  const report = await harness('functions/api/admin/report.ts', { sqlite });
  const reportResult = await report.get({ period: CURRENT_MONTH, timezone_offset: 0 });
  assert.equal(reportResult.status, 200);
  assert.equal(reportResult.payload.current.spend, null, 'расход не заведён — null, не 0');
  assert.equal(reportResult.payload.current.revenue, 1000);
  assert.equal(reportResult.payload.derived.profit, null, 'прибыль без расхода не считается');
  assert.equal(reportResult.payload.derived.cpl, null, 'цена заявки без расхода не считается');
  assert.ok(reportResult.payload.notes.some((note) => note.includes('не заведены')));

  const goals = await harness('functions/api/admin/goals.ts', { sqlite });
  const goalsResult = await goals.get({ period: CURRENT_MONTH, timezone_offset: 0 });
  assert.equal(goalsResult.status, 200);
  assert.equal(goalsResult.payload.fact.spend, null);
  assert.equal(goalsResult.payload.fact.revenue, 1000);
  assert.equal(goalsResult.payload.forecast.spend, null);

  const attribution = await harness('functions/api/admin/attribution.ts', { sqlite });
  const attributionResult = await attribution.get({ days: 30 });
  assert.equal(attributionResult.status, 200);
  assert.equal(attributionResult.payload.currency, 'USD', 'валюта для выручки берётся из сделки');
  assert.equal(attributionResult.payload.coverage.revenueAvailable, true);
  assert.equal(attributionResult.payload.summary.spend, null, 'расход в сводке не выдуман');
  assert.equal(attributionResult.payload.coverage.spendAvailable, false, 'цена лида и окупаемость «пока не считаются»');
  assert.equal(attributionResult.payload.dimensions.find((item) => item.key === 'source').hasSpend, false);

  // Честный ноль: владелец сам завёл строку с суммой 0 — это данные, а не выдумка.
  sqlite.prepare("INSERT INTO ad_spend (day, source, amount, currency) VALUES (date('now'), 'facebook', 0, 'USD')").run();
  assert.equal((await report.get({ period: CURRENT_MONTH, timezone_offset: 0 })).payload.current.spend, 0);
  assert.equal((await goals.get({ period: CURRENT_MONTH, timezone_offset: 0 })).payload.fact.spend, 0);
  const withSpend = (await attribution.get({ days: 30 })).payload;
  assert.equal(withSpend.summary.spend, 0);
  assert.equal(withSpend.coverage.spendAvailable, true);
});

// ─── F-038: выручка по дате выигрыша, по местному дню ────────────────────────

test('F-038: выручка в целях и отчёте идёт за датой выигрыша сделки, а не за датой заявки', async (t) => {
  t.after(installMemoryCache());
  const sqlite = freshDatabase();
  // Заявка прошлого месяца, выиграна в последний день прошлого месяца в 22:00
  // по Гринвичу — по Ташкенту это уже первое число текущего месяца.
  insertLead(sqlite, {
    name: 'Клиент',
    created_at: `${PREVIOUS_MONTH}-15 10:00:00`,
    pipeline_stage: 'won',
    deal_value: 2000,
    closed_at: `${lastDayOf(PREVIOUS_MONTH)} 22:00:00`,
  });

  const report = await harness('functions/api/admin/report.ts', { sqlite });
  const goals = await harness('functions/api/admin/goals.ts', { sqlite });

  const localCurrent = (await report.get({ period: CURRENT_MONTH, timezone_offset: TASHKENT_OFFSET })).payload;
  assert.equal(localCurrent.current.leads, 0, 'заявка остаётся в прошлом месяце — по дате заявки');
  assert.equal(localCurrent.current.won, 1, 'сделка — в месяце выигрыша по местному дню');
  assert.equal(localCurrent.current.revenue, 2000);
  assert.equal(localCurrent.previous.leads, 1);
  assert.equal(localCurrent.previous.revenue, 0, 'месяц без выигрышей — 0, а не прочерк: данные о сделках есть');
  assert.ok(localCurrent.notes.some((note) => note.includes('по дате выигрыша')));

  const utcCurrent = (await report.get({ period: CURRENT_MONTH, timezone_offset: 0 })).payload;
  assert.equal(utcCurrent.current.revenue, 0, 'по Гринвичу та же сделка закрыта ещё в прошлом месяце');
  assert.equal(utcCurrent.previous.revenue, 2000);

  const localGoals = (await goals.get({ period: CURRENT_MONTH, timezone_offset: TASHKENT_OFFSET })).payload;
  assert.equal(localGoals.fact.leads, 0);
  assert.equal(localGoals.fact.won, 1);
  assert.equal(localGoals.fact.revenue, 2000);
  assert.ok(localGoals.notes.some((note) => note.includes('по дате выигрыша')));
  const previousGoals = localGoals.history.find((item) => item.period === PREVIOUS_MONTH);
  assert.equal(previousGoals.fact.leads, 1);
  assert.equal(previousGoals.fact.revenue, 0);

  const utcGoals = (await goals.get({ period: CURRENT_MONTH, timezone_offset: 0 })).payload;
  assert.equal(utcGoals.fact.revenue, 0);
});

test('goals and report share the local cutoff and report only known CRM amounts in the selected currency', async (t) => {
  t.after(installMemoryCache());
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-11T12:00:00Z') });
  const sqlite = freshDatabase();
  const cutoffLead = insertLead(sqlite, {
    created_at: '2026-10-31 22:00:00', utm_source: ' META ', quality: 'target',
    pipeline_stage: 'won', deal_currency: 'EUR', deal_value: null, closed_at: '2026-11-01 10:00:00',
  });
  insertLead(sqlite, { created_at: '2026-11-12 12:00:00', utm_source: 'future' });
  insertLead(sqlite, { created_at: '2026-10-10 10:00:00', pipeline_stage: 'won', deal_value: 500, closed_at: '2026-11-02 12:00:00' });
  sqlite.exec("INSERT INTO admin_goals(period,currency) VALUES('2026-11','EUR')");
  sqlite.exec("INSERT INTO ad_spend(day,amount,currency) VALUES('2026-11-04',0,'EUR'),('2026-11-04',300,'USD'),('2026-11-12',200,'EUR')");
  sqlite.exec("INSERT INTO invoices(amount,status,currency,issued_at) VALUES(900,'issued','EUR','2026-11-01')");
  sqlite.exec("INSERT INTO invoice_payments(invoice_id,amount_cents,paid_on,request_key) SELECT id,25000,'2026-11-06','audit-crm-cash' FROM invoices");
  const report = await harness('functions/api/admin/report.ts', { sqlite });
  const goals = await harness('functions/api/admin/goals.ts', { sqlite });
  const query = { period: '2026-11', timezone_offset: TASHKENT_OFFSET };
  const initial = await report.get(query);
  assert.equal(initial.status, 200);
  assert.equal(initial.payload.through, '2026-11-11');
  assert.deepEqual(initial.payload.sources, [{ source: 'meta', leads: 1, qualified: 1 }]);
  assert.equal(initial.payload.current.won, 2);
  assert.equal(initial.payload.current.revenue, null);
  assert.equal(initial.payload.current.spend, 0);
  assert.equal(initial.payload.derived.profit, null);
  const goalsResult = await goals.get(query);
  assert.equal(goalsResult.payload.fact.revenue, null);
  assert.equal(goalsResult.payload.history.find((item) => item.period === '2026-10').currency, 'USD');
  assert.equal((await goals.post({ period: '2026-11', revenue_target: 800 })).status, 200);
  assert.equal(sqlite.prepare("SELECT currency FROM admin_goals WHERE period='2026-11'").get().currency, 'EUR');
  sqlite.prepare('UPDATE leads SET deal_value=700 WHERE id=?').run(cutoffLead);
  assert.equal((await report.get(query)).payload.current.revenue, 700);
  assert.equal((await goals.get(query)).payload.fact.revenue, 700);
});

// ─── F-124 + F-038(4): выручка по месяцам в CRM-аналитике ───────────────────

test('F-124: самый старый из двенадцати месяцев не пропадает и месяц считается по местному дню', async (t) => {
  t.after(installMemoryCache());
  const sqlite = freshDatabase();
  const oldest = shiftMonth(CURRENT_MONTH, -11);
  insertLead(sqlite, { name: 'Давняя', pipeline_stage: 'won', deal_value: 500, closed_at: `${oldest}-01 12:00:00` });
  insertLead(sqlite, {
    name: 'На стыке',
    pipeline_stage: 'won',
    deal_value: 300,
    closed_at: `${lastDayOf(PREVIOUS_MONTH)} 22:00:00`,
  });

  const analytics = await harness('functions/api/admin/crm-analytics.ts', { sqlite });
  const utc = (await analytics.get({ timezone_offset: 0 })).payload;
  assert.equal(utc.success, true);
  const oldestRow = utc.revenueByMonth.find((row) => row.month === oldest);
  assert.ok(oldestRow, `месяц ${oldest} должен быть в выручке по месяцам`);
  assert.equal(oldestRow.value, 500);
  assert.equal(utc.revenueByMonth.find((row) => row.month === PREVIOUS_MONTH)?.value, 300);

  const local = (await analytics.get({ timezone_offset: TASHKENT_OFFSET })).payload;
  assert.equal(local.revenueByMonth.find((row) => row.month === CURRENT_MONTH)?.value, 300, 'по Ташкенту сделка выиграна уже в текущем месяце');
  assert.equal(local.revenueByMonth.find((row) => row.month === PREVIOUS_MONTH), undefined);

  // Почему важен порядок модификаторов: 31-го числа «минус 11 месяцев» до
  // «начала месяца» переезжает на месяц вперёд и теряет самый старый столбик.
  const probe = new DatabaseSync(':memory:');
  const wrong = probe.prepare("SELECT date('2026-08-31', '-11 months', 'start of month') AS day").get().day;
  const right = probe.prepare("SELECT date('2026-08-31', 'start of month', '-11 months') AS day").get().day;
  assert.equal(right, '2025-09-01');
  assert.notEqual(wrong, right);
});

// ─── F-029: сделки без суммы не считаются нулём ─────────────────────────────

test('F-029: средний чек, «выиграно» и «в работе» считаются только по сделкам с суммой', async (t) => {
  t.after(installMemoryCache());
  const sqlite = freshDatabase();
  const now = sqlDateTime(new Date());
  insertLead(sqlite, { name: 'W1', pipeline_stage: 'won', deal_value: 1000, closed_at: now });
  insertLead(sqlite, { name: 'W2', pipeline_stage: 'won', deal_value: 1000, closed_at: now });
  for (const name of ['W3', 'W4', 'W5']) insertLead(sqlite, { name, pipeline_stage: 'won', deal_value: null, closed_at: now });
  insertLead(sqlite, { name: 'O1', pipeline_stage: 'proposal', deal_value: null });
  insertLead(sqlite, { name: 'O2', pipeline_stage: 'contacted', deal_value: null });

  const analytics = await harness('functions/api/admin/crm-analytics.ts', { sqlite });
  const { payload } = await analytics.get({ timezone_offset: 0 });
  assert.equal(payload.totals.won, 5);
  assert.equal(payload.totals.averageDeal, 1000, 'средний чек — по двум сделкам с суммой, а не 400');
  assert.equal(payload.totals.wonValue, 2000);
  assert.equal(payload.totals.wonPriced, 2);
  assert.equal(payload.totals.wonWithoutValue, 3);
  assert.equal(payload.totals.openValue, null, 'в работе две сделки без суммы — сумма неизвестна');
  assert.equal(payload.totals.openWithoutValue, 2);

  // Ни одной суммы — ни одного выдуманного нуля.
  const empty = freshDatabase();
  for (const name of ['A', 'B']) insertLead(empty, { name, pipeline_stage: 'won', deal_value: null, closed_at: now });
  const bare = (await (await harness('functions/api/admin/crm-analytics.ts', { sqlite: empty })).get({ timezone_offset: 0 })).payload;
  assert.equal(bare.totals.won, 2);
  assert.equal(bare.totals.wonValue, null);
  assert.equal(bare.totals.averageDeal, null);
  assert.equal(bare.totals.wonWithoutValue, 2);
});

// ─── F-034: просрочено — только по открытым сделкам ─────────────────────────

test('F-034: закрытые сделки не попадают в «просрочено» и «на сегодня» ни в счётчиках, ни в фильтре', async (t) => {
  t.after(installMemoryCache());
  const sqlite = freshDatabase();
  const overdueAt = sqlDateTime(daysAgo(2));
  // Конец сегодняшних суток: шаг «на сегодня» не должен заодно оказаться просроченным.
  const todayAt = `${sqlDate(new Date())} 23:59:59`;
  insertLead(sqlite, { name: 'Проиграна', pipeline_stage: 'lost', next_action_at: overdueAt, closed_at: overdueAt });
  const openOverdue = insertLead(sqlite, { name: 'Открыта', pipeline_stage: 'new', next_action_at: overdueAt });
  insertLead(sqlite, { name: 'Выиграна сегодня', pipeline_stage: 'won', next_action_at: todayAt, closed_at: todayAt });
  insertLead(sqlite, { name: 'В работе сегодня', pipeline_stage: 'contacted', next_action_at: todayAt });

  const crm = await harness('functions/api/admin/crm-leads.ts', { sqlite });
  const list = (await crm.get({ timezone_offset: 0 })).payload;
  assert.equal(list.success, true);
  assert.equal(list.summary.reminders.overdue, 1);
  assert.equal(list.summary.reminders.today, 1);

  const overdue = (await crm.get({ timezone_offset: 0, due: 'overdue' })).payload;
  assert.deepEqual(overdue.leads.map((lead) => lead.id), [openOverdue], 'клик по плитке показывает ровно столько, сколько на ней написано');
  const today = (await crm.get({ timezone_offset: 0, due: 'today' })).payload;
  assert.deepEqual(today.leads.map((lead) => lead.name), ['В работе сегодня']);

  const analytics = await harness('functions/api/admin/crm-analytics.ts', { sqlite });
  const health = (await analytics.get({ timezone_offset: 0 })).payload.health;
  assert.equal(health.overdue, 1);
  assert.equal(health.today, 1);
});

// ─── F-093: регистр кириллицы в поиске ──────────────────────────────────────

test('F-093: «анна» находит «Анна Петрова» в CRM, по тегу и в корзине', async (t) => {
  t.after(installMemoryCache());
  const sqlite = freshDatabase();
  const anna = insertLead(sqlite, { name: 'Анна Петрова', email: 'anna@example.test' });
  insertLead(sqlite, { name: 'John Smith', email: 'john@example.test' });
  sqlite.prepare("INSERT INTO crm_tags (name, slug) VALUES ('Горячий', 'hot')").run();
  sqlite.prepare('INSERT INTO crm_lead_tags (lead_id, tag_id) VALUES (?, 1)').run(anna);
  insertLead(sqlite, { name: 'Ёлкин Пётр', deleted_at: sqlDateTime(new Date()), deleted_reason: 'Спам' });

  const crm = await harness('functions/api/admin/crm-leads.ts', { sqlite });
  for (const q of ['анна', 'ПЕТРОВА', 'анна петрова', 'Анна']) {
    const { payload } = await crm.get({ timezone_offset: 0, q });
    assert.deepEqual(payload.leads.map((lead) => lead.id), [anna], `поиск «${q}»`);
  }
  assert.deepEqual((await crm.get({ timezone_offset: 0, q: 'горячий' })).payload.leads.map((lead) => lead.id), [anna], 'поиск по тегу');
  assert.deepEqual((await crm.get({ timezone_offset: 0, q: 'JOHN' })).payload.leads.map((lead) => lead.name), ['John Smith'], 'латиница по-прежнему находится');
  assert.equal((await crm.get({ timezone_offset: 0, q: 'нет такого' })).payload.leads.length, 0);

  const trash = await harness('functions/api/admin/lead-trash.ts', { sqlite });
  const found = (await trash.get({ q: 'елкин' })).payload;
  assert.equal(found.success, true);
  assert.equal(found.matched, 1, '«ё» и «е» в корзине равны');
  assert.equal(found.leads[0].name, 'Ёлкин Пётр');
  assert.equal((await trash.get({ q: 'спам' })).payload.matched, 1, 'причина удаления ищется без оглядки на регистр');
});

// ─── F-100: повтор ключа в CSV складывается ─────────────────────────────────

test('F-100: две строки CSV за один день и источник складываются, а повторная загрузка не удваивает', async (t) => {
  t.after(installMemoryCache());
  const spend = await harness('functions/api/admin/ad-spend.ts');
  const csv = 'date,source,amount\n2026-09-01,facebook,100\n2026-09-01,facebook,50\n2026-09-02,google,10\n';

  const first = await spend.post({ action: 'import_csv', csv });
  assert.equal(first.status, 200);
  assert.equal(first.payload.saved, 2, 'в базу ушли две итоговые строки');
  assert.equal(first.payload.merged, 1, 'одна строка файла сложена с соседней');
  assert.equal(first.payload.skipped, 0);
  const row = () => spend.sqlite.prepare("SELECT amount FROM ad_spend WHERE day = '2026-09-01' AND source = 'facebook'").all();
  assert.deepEqual(row().map((item) => item.amount), [150]);

  const again = await spend.post({ action: 'import_csv', csv });
  assert.equal(again.payload.saved, 2);
  assert.deepEqual(row().map((item) => item.amount), [150], 'тот же файл заменяет сумму, а не удваивает её');

  // Ручной ввод — исправление: повтор ключа заменяет сумму.
  const manual = await spend.post({
    action: 'upsert',
    entries: [
      { day: '2026-09-01', source: 'facebook', amount: 100 },
      { day: '2026-09-01', source: 'facebook', amount: 50 },
    ],
  });
  assert.equal(manual.payload.merged, 0);
  assert.deepEqual(row().map((item) => item.amount), [50]);
});

// ─── F-042: неоплаченный счёт не исчезает через год ─────────────────────────

test('F-042: выставленный и не оплаченный счёт старше года остаётся в списке', async (t) => {
  t.after(installMemoryCache());
  const finance = await harness('functions/api/admin/finance.ts');
  const twoYearsAgo = sqlDate(daysAgo(730));
  finance.sqlite.prepare("INSERT INTO invoices (number, period, amount, issued_at, due_at, status) VALUES ('OLD-1', '2024-08', 500, ?, ?, 'issued')")
    .run(twoYearsAgo, twoYearsAgo);
  finance.sqlite.prepare("INSERT INTO invoices (number, period, amount, issued_at, paid_at, status) VALUES ('OLD-2', '2024-08', 500, ?, ?, 'paid')")
    .run(twoYearsAgo, twoYearsAgo);
  finance.sqlite.prepare("INSERT INTO invoices (number, period, amount, issued_at, due_at, status) VALUES ('NEW-1', ?, 700, date('now'), date('now', '+14 day'), 'issued')")
    .run(CURRENT_MONTH);

  const { status, payload } = await finance.get({ timezone_offset: 0 });
  assert.equal(status, 200);
  const numbers = payload.invoices.map((invoice) => invoice.number).sort();
  assert.deepEqual(numbers, ['NEW-1', 'OLD-1'], 'старый неоплаченный виден, давно оплаченный — в истории не нужен');
});

test('monthly report counts only articles already public at the current instant', async (t) => {
  t.after(installMemoryCache());
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-13T10:00:00.000Z') });
  const report = await harness('functions/api/admin/report.ts');
  const add = report.sqlite.prepare(`
    INSERT INTO articles (id, slug, title, date, description, content, published_at, status)
    VALUES (1, ?, 'Проверка', '', '', '', ?, ?)
  `);
  add.run('live', '2026-11-13T10:00:00.000Z', 'published');
  add.run('scheduled', '2026-11-13T10:00:01.000Z', 'published');
  add.run('draft', '2026-11-13T09:00:00.000Z', 'draft');
  const { status, payload } = await report.get({ period: '2026-11', timezone_offset: -300 });
  assert.equal(status, 200);
  assert.equal(payload.publishedArticles, 1);
});

test('site editor rejects a JSON null body with a controlled validation response', async (t) => {
  t.after(installMemoryCache());
  const { module, env } = await harness('functions/api/admin/site-sections.ts');
  const response = await module.onRequestPost({
    env,
    request: new Request('https://example.test/api/admin/site-sections', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Password': ADMIN_PASSWORD },
      body: 'null',
    }),
    waitUntil() {},
  });
  assert.equal(response.status, 400);
});

test('client API validates request shape and never confirms an update to a missing client', async (t) => {
  t.after(installMemoryCache());
  const clients = await harness('functions/api/admin/clients.ts');
  const empty = await clients.module.onRequestPost({
    env: clients.env,
    request: new Request('https://example.test/api/admin/clients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Password': ADMIN_PASSWORD },
      body: 'null',
    }),
  });
  assert.equal(empty.status, 400);
  assert.equal((await clients.post({ action: 'update', id: -1, name: 'Проверка' })).status, 400);
  const missing = await clients.post({ action: 'update', id: 999, name: 'Проверка' });
  assert.equal(missing.status, 404);
  assert.equal(missing.payload.success, false);
});

test('finance preserves stored currency and rejects invalid or stale expense updates', async (t) => {
  t.after(installMemoryCache());
  const finance = await harness('functions/api/admin/finance.ts');
  const expense = { action: 'save_expense', day: '2026-11-01', amount: 23, category: 'Сервис' };
  const invalidJson = await invoke(finance.module.onRequestPost, finance.env, new Request('https://example.test/api/admin/finance', {
    method: 'POST', headers: { 'X-Admin-Password': ADMIN_PASSWORD }, body: 'null',
  }));
  assert.equal(invalidJson.status, 400);
  assert.equal((await finance.post({ ...expense, id: -1 })).status, 400);
  assert.equal((await finance.post({ ...expense, day: '2026-02-30' })).status, 400);
  assert.equal((await finance.post({ ...expense, amount: 'не число' })).status, 400);
  assert.equal((await finance.post({ ...expense, id: 999 })).status, 404);
  finance.sqlite.prepare("INSERT INTO finance_expenses (day,amount,currency) VALUES ('2026-11-01',20,'EUR')").run();
  assert.equal((await finance.post({ ...expense, id: 1 })).status, 200);
  const saved = finance.sqlite.prepare('SELECT amount,currency FROM finance_expenses').get();
  assert.equal(saved.amount, 23);
  assert.equal(saved.currency, 'EUR');
});

test('finance legacy writes reject impossible months, future receipts and missing rows', async (t) => {
  t.after(installMemoryCache());
  const sqlite = new DatabaseSync(':memory:');
  for (const migration of ALL_MIGRATIONS.filter((name) => name < '0044')) {
    sqlite.exec(readFileSync(`migrations/${migration}`, 'utf8'));
  }
  t.after(() => sqlite.close());
  const finance = await harness('functions/api/admin/finance.ts', { sqlite });
  assert.equal((await finance.post({ action: 'issue_month', period: '2026-13' })).status, 400);
  assert.equal((await finance.post({ action: 'mark_paid', id: 999 })).status, 404);
  assert.equal((await finance.post({ action: 'mark_paid', id: 999, paid_at: '2099-01-01' })).status, 400);
  const invoice = { action: 'save_invoice', status: 'issued', amount: 50 };
  assert.equal((await finance.post({ ...invoice, id: 999 })).status, 404);
  assert.equal((await finance.post({ ...invoice, amount: 'не число' })).status, 400);
  assert.equal((await finance.post({ ...invoice, status: 'paid', paid_at: '2099-01-01' })).status, 400);
  sqlite.prepare("INSERT INTO invoices(amount,currency) VALUES (20,'EUR')").run();
  assert.equal((await finance.post({ ...invoice, id: 1 })).status, 200);
  assert.equal(sqlite.prepare('SELECT currency FROM invoices WHERE id=1').get().currency, 'EUR');
  assert.equal((await finance.post(invoice)).status, 200);
  assert.equal(sqlite.prepare('SELECT currency FROM invoices WHERE id=2').get().currency, 'USD');
  assert.equal((await finance.post({ action: 'save_time', id: 999, hours: 1 })).status, 404);
  assert.equal((await finance.post({ action: 'save_time', hours: 0.001 })).status, 400);
  const freshDb = new DatabaseSync(':memory:');
  t.after(() => freshDb.close());
  for (const migration of ALL_MIGRATIONS.filter((name) => name < '0041')) {
    freshDb.exec(readFileSync(`migrations/${migration}`, 'utf8'));
  }
  assert.equal((await finance.get()).payload.oneOffSales, true);
  const fresh = await finance.module.onRequestGet({
    env: { ...finance.env, DB: new D1Database(freshDb) },
    request: adminRequest('finance'),
  });
  assert.equal(fresh.status, 200);
  assert.equal((await fresh.json()).oneOffSales, false);
});

test('workspace time retries match the original hours and reject changed data', async (t) => {
  t.after(installMemoryCache());
  const finance = await harness('functions/api/admin/finance.ts');
  const time = { action: 'save_time', hours: 1, day: '2026-11-01', note: 'Первый', request_key: randomUUID() };
  assert.equal((await finance.post({ ...time, hours: 0.001 })).status, 400);
  assert.equal((await finance.post(time)).status, 200);
  assert.equal((await finance.post(time)).status, 200);
  assert.equal((await finance.post({ ...time, hours: 2 })).status, 409);
  assert.equal(finance.sqlite.prepare('SELECT COUNT(*) AS n FROM time_entries').get().n, 1);
});

test('CRM rejects a JSON null body with a controlled error', async (t) => {
  t.after(installMemoryCache());
  const crm = await harness('functions/api/admin/lead-crm.ts');
  const response = await invoke(crm.module.onRequestPost, crm.env, new Request('https://example.test/api/admin/lead-crm', {
    method: 'POST', headers: { 'X-Admin-Password': ADMIN_PASSWORD }, body: 'null',
  }));
  assert.equal(response.status, 400);
});

test('finance history starts eleven months before the owner’s current month', async (t) => {
  t.after(installMemoryCache());
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-30T20:30:00Z') });
  const finance = await harness('functions/api/admin/finance.ts');
  const utc = await finance.get({ timezone_offset: 0 });
  const local = await finance.get({ timezone_offset: -300 });
  assert.equal(utc.payload.today, '2026-11-30');
  assert.equal(utc.payload.historyFrom, '2025-12-01');
  assert.equal(local.payload.today, '2026-12-01');
  assert.equal(local.payload.historyFrom, '2026-01-01');
});

test('legacy monthly billing replaces a cancelled invoice and concurrent retries skip it', async (t) => {
  t.after(installMemoryCache());
  const finance = await harness('functions/api/admin/finance.ts');
  const { sqlite } = finance;
  sqlite.exec('DROP TRIGGER payment_amount_guard');
  const client = Number(sqlite.prepare("INSERT INTO clients(name,status,retainer_amount,billing_day) VALUES('Проверка','active',450,10)").run().lastInsertRowid);
  const period = CURRENT_MONTH;
  const existing = sqlite.prepare("INSERT INTO invoices(client_id,period,amount,status,kind) VALUES(?,?,?,?,?)");
  existing.run(client, period, 450, 'cancelled', 'retainer');
  existing.run(client, period, 100, 'issued', 'consultation');
  const actions = await Promise.all([
    finance.post({ action: 'issue_month', period }),
    finance.post({ action: 'issue_month', period }),
  ]);
  assert.deepEqual(actions.map((result) => result.status), [200, 200]);
  assert.deepEqual(actions.map(({ payload }) => payload.created).sort(), [0, 1]);
  assert.deepEqual(actions.map(({ payload }) => payload.skipped).sort(), [0, 1]);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM invoices WHERE kind='retainer' AND status='issued'").get().n, 1);
});

// ─── F-085 / F-099: «за сутки» — это 24 часа ────────────────────────────────

test('F-085/F-099: события Meta CAPI считаются ровно за 24 часа и в сводке, и в уведомлении', async (t) => {
  t.after(installMemoryCache());
  const sqlite = freshDatabase();
  const insert = sqlite.prepare('INSERT INTO meta_capi_diagnostics (event_name, status, created_at) VALUES (?, ?, ?)');
  const hoursAgo = (hours) => new Date(Date.now() - hours * 3_600_000).toISOString();
  insert.run('Lead', 'failed', hoursAgo(25));
  insert.run('Lead', 'failed', hoursAgo(23));
  insert.run('Lead', 'sent', hoursAgo(30));
  insert.run('Lead', 'sent', hoursAgo(1));

  // Старое условие сравнивало ISO-строку с форматом SQLite и захватывало весь вчерашний день.
  const legacy = sqlite.prepare("SELECT COUNT(*) AS n FROM meta_capi_diagnostics WHERE status = 'failed' AND created_at >= datetime('now', '-1 day')").get().n;
  assert.equal(legacy, 2, 'ловушка формата: прежнее условие считало и событие 25-часовой давности');

  const stats = await harness('functions/api/admin/stats.ts', { sqlite });
  const { payload } = await stats.get({ timezone_offset: 0 });
  assert.equal(payload.success, true);
  assert.equal(payload.capi.failed24h, 1);
  assert.equal(payload.capi.sent24h, 1);

  const alerts = await loadModule('functions/_lib/admin-alerts.ts');
  const drafts = await alerts.collectAlerts({ DB: new D1Database(sqlite) }, 0);
  const meta = drafts.find((draft) => draft.fingerprint === 'meta-failed-24h');
  assert.ok(meta, 'повод про отказы Meta есть');
  assert.equal(meta.severity, 'attention');
  assert.ok(meta.title.startsWith('Meta отклонила 1 '), meta.title);
});

// ─── F-126: первый из 14 дней — целиком ─────────────────────────────────────

test('F-126: заявки за самый левый день графика «Сегодня» считаются за весь день', async (t) => {
  t.after(installMemoryCache());
  const sqlite = freshDatabase();
  const firstDay = sqlite.prepare("SELECT date('now', '-13 day') AS day").get().day;
  insertLead(sqlite, { name: 'Ночная', created_at: `${firstDay} 00:30:00` });
  insertLead(sqlite, { name: 'Вечерняя', created_at: `${firstDay} 23:30:00` });
  insertLead(sqlite, { name: 'Слишком старая', created_at: sqlDateTime(daysAgo(14, 23)) });

  const stats = await harness('functions/api/admin/stats.ts', { sqlite });
  const { payload } = await stats.get({ timezone_offset: 0 });
  const point = payload.leadsDaily.find((row) => row.day === firstDay);
  assert.ok(point, 'первый день есть на графике');
  assert.equal(point.leads, 2, 'обе заявки первого дня, а не только после текущего времени суток');
  assert.equal(payload.leadsDaily.length, 1, 'день до окна не попадает');
});

// ─── F-127: в фокус попадают самые давние новые заявки ──────────────────────

test('F-127: «Фокус дня» называет тех, кто ждёт ответа дольше всех, а не самых свежих', async (t) => {
  t.after(installMemoryCache());
  const sqlite = freshDatabase();
  const ids = [];
  for (let day = 8; day >= 1; day -= 1) {
    ids.push(insertLead(sqlite, { name: `Заявка ${day} дн.`, created_at: sqlDateTime(daysAgo(day)) }));
  }

  const today = await harness('functions/api/admin/today.ts', { sqlite });
  const { status, payload } = await today.get({ timezone_offset: 0 });
  assert.equal(status, 200);
  const fresh = payload.focus.filter((item) => item.kind === 'lead_new');
  assert.equal(fresh.length, 5);
  assert.deepEqual(
    fresh.map((item) => item.title),
    ['Заявка 8 дн.', 'Заявка 7 дн.', 'Заявка 6 дн.', 'Заявка 5 дн.', 'Заявка 4 дн.'],
    'пять самых давних, от старой к новой',
  );
  assert.equal(payload.items.find((item) => item.id === 'new-leads')?.count, 8, 'счётчик по-прежнему считает всех');
});

// ─── F-132: история PageSpeed — по местному дню ─────────────────────────────

test('F-132: замер пишется в историю местным днём владельца', async (t) => {
  t.after(installMemoryCache());
  const psi = {
    id: 'https://www.whalewzrd.com/blog',
    lighthouseResult: {
      finalUrl: 'https://www.whalewzrd.com/blog',
      fetchTime: new Date().toISOString(),
      lighthouseVersion: '12.0.0',
      categories: {
        performance: { score: 0.91 },
        accessibility: { score: 1 },
        'best-practices': { score: 1 },
        seo: { score: 1 },
      },
      audits: {},
    },
  };
  const spy = installFetchSpy({ pagespeed: psi });
  t.after(spy.restore);

  const performance = await harness('functions/api/admin/performance.ts', { env: { PAGESPEED_API_KEY: 'test-key' } });
  // Смещение −300 — UTC+5: день по Ташкенту.
  const before = new Date(Date.now() - TASHKENT_OFFSET * 60_000).toISOString().slice(0, 10);
  const { status, payload } = await performance.get({
    url: 'https://www.whalewzrd.com/blog',
    strategy: 'mobile',
    force: '1',
    timezone_offset: TASHKENT_OFFSET,
  });
  const after = new Date(Date.now() - TASHKENT_OFFSET * 60_000).toISOString().slice(0, 10);
  assert.equal(status, 200, JSON.stringify(payload));
  assert.equal(payload.success, true);

  const rows = performance.sqlite.prepare('SELECT day, url, strategy, performance FROM pagespeed_history').all();
  assert.equal(rows.length, 1);
  assert.ok([before, after].includes(rows[0].day), `день ${rows[0].day} — местный, а не по Гринвичу`);
  assert.equal(rows[0].performance, 91);
});

test('visitor measurements use bounded UTC days while PageSpeed history uses bounded local days', async (t) => {
  t.after(installMemoryCache());
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-11T20:30:00Z') });
  const sqlite = freshDatabase();
  sqlite.exec(`INSERT INTO web_vitals_daily (day, metric, device, page_path, samples, value_sum, good, needs_improvement, poor)
    VALUES ('2026-11-04','LCP','mobile','/expired',8,48000,0,0,8),
      ('2026-11-05','LCP','mobile','/retained',2,4000,2,0,0),
      ('2026-11-11','LCP','mobile','/retained',2,8000,0,0,2),
      ('2026-11-12','LCP','desktop','/future',8,48000,0,0,8);
    INSERT INTO pagespeed_history (day, url, strategy, performance, checked_at) VALUES
      ('2026-11-05','https://www.whalewzrd.com/','mobile',50,'2026-11-05T12:00:00Z'),
      ('2026-11-06','https://www.whalewzrd.com/','mobile',80,'2026-11-06T12:00:00Z'),
      ('2026-11-12','https://www.whalewzrd.com/','desktop',99,'2026-11-11T20:00:00Z'),
      ('2026-11-13','https://www.whalewzrd.com/','desktop',40,'2026-11-12T20:00:00Z');`);
  const query = { days: 7, timezone_offset: TASHKENT_OFFSET };
  const vitals = await harness('functions/api/admin/vitals.ts', { sqlite });
  const measured = await vitals.get(query);
  assert.equal(measured.status, 200, JSON.stringify(measured.payload));
  assert.equal(measured.payload.metrics[0].samples, 4);
  assert.equal(measured.payload.metrics[0].average, 3000);
  assert.deepEqual(measured.payload.devices, [{ metric: 'LCP', device: 'mobile', samples: 4, goodShare: 50 }]);
  assert.deepEqual(measured.payload.slowestPages, [{ path: '/retained', samples: 4, average: 3000, poor: 2 }]);

  const performance = await harness('functions/api/admin/performance.ts', { sqlite });
  const history = await performance.get({ history: '1', ...query });
  assert.equal(history.status, 200, JSON.stringify(history.payload));
  assert.deepEqual(history.payload.history, [
    { day: '2026-11-06', mobile: 80, desktop: null, pages: 1 },
    { day: '2026-11-12', mobile: null, desktop: 99, pages: 1 },
  ]);
});

// ─── F-032 / F-033: клиенты ─────────────────────────────────────────────────

test('F-032: отчёт за прошлый месяц не требуется у клиента, заведённого в этом месяце', async (t) => {
  t.after(installMemoryCache());
  const clients = await harness('functions/api/admin/clients.ts');
  const create = async (body) => {
    const result = await clients.post({ action: 'create', ...body }, { timezone_offset: 0 });
    assert.equal(result.status, 200, JSON.stringify(result.payload));
    return result.payload.id;
  };
  const fresh = await create({ name: 'Новый', status: 'active', started_at: `${CURRENT_MONTH}-01` });
  const veteran = await create({ name: 'Давний', status: 'active', started_at: `${shiftMonth(CURRENT_MONTH, -2)}-01` });

  const { payload } = await clients.get({ timezone_offset: 0 });
  const byId = new Map(payload.clients.map((client) => [client.id, client]));
  assert.equal(byId.get(fresh).health, 'ok');
  assert.ok(!byId.get(fresh).healthReasons.some((reason) => reason.startsWith('Отчёт за')), 'за месяц до начала работы отчитываться не за что');

  // У давнего клиента тревога зависит от числа месяца — после десятого она законна.
  const dayOfMonth = Number(new Date().toISOString().slice(8, 10));
  const veteranAsksReport = byId.get(veteran).healthReasons.some((reason) => reason.startsWith('Отчёт за'));
  assert.equal(veteranAsksReport, dayOfMonth > 10);
});

test('F-033: дата завершения ставится в день перевода в «Завершён» и не сдвигается, а срок жизни без даты не считается', async (t) => {
  t.after(installMemoryCache());
  const clients = await harness('functions/api/admin/clients.ts');
  const today = sqlDate(new Date());
  const finishedAt = () => clients.sqlite.prepare('SELECT finished_at FROM clients WHERE id = ?').get(id).finished_at;

  const created = await clients.post({ action: 'create', name: 'Ушедший', status: 'finished' }, { timezone_offset: 0 });
  assert.equal(created.status, 200, JSON.stringify(created.payload));
  const id = created.payload.id;
  assert.equal(finishedAt(), today, 'создан сразу завершённым — дата сегодняшняя');

  const update = (body) => clients.post({ action: 'update', id, name: 'Ушедший', ...body }, { timezone_offset: 0 });
  assert.equal((await update({ status: 'finished', finished_at: '' })).status, 200);
  assert.equal(finishedAt(), today, 'пустое поле в теле запроса не стирает сохранённую дату');
  assert.equal((await update({ status: 'finished', finished_at: '2026-05-31' })).status, 200);
  assert.equal(finishedAt(), '2026-05-31', 'явная дата владельца принимается');
  assert.equal((await update({ status: 'active' })).status, 200);
  assert.equal(finishedAt(), null, 'возврат в работу очищает дату');
  assert.equal((await update({ status: 'finished' })).status, 200);
  assert.equal(finishedAt(), today, 'повторный перевод в «Завершён» ставит дату заново');

  // Срок жизни: завершённый без даты (старая карточка) не растёт до сегодня.
  clients.sqlite.prepare("INSERT INTO clients (name, status, started_at, finished_at) VALUES ('Без даты', 'finished', ?, NULL)")
    .run(sqlDate(daysAgo(400)));
  const activeSince = sqlDate(daysAgo(10));
  clients.sqlite.prepare("INSERT INTO clients (name, status, started_at) VALUES ('Активный', 'active', ?)").run(activeSince);
  clients.sqlite.prepare('DELETE FROM clients WHERE id = ?').run(id);
  const { payload } = await clients.get({ timezone_offset: 0 });
  // Срок активного клиента — от полуночи даты начала до сейчас (10 или 11 дней
  // в зависимости от времени суток); с карточкой без даты среднее было бы ~205.
  const expected = Math.round((Date.now() - Date.parse(`${activeSince}T00:00:00Z`)) / 86_400_000);
  assert.equal(payload.summary.averageLifetimeDays, expected, 'считается только клиент с известными границами');
});

// ─── F-036: скрытое уведомление не возвращается, пока повод тот же ──────────

/** База без одной миграции — так выглядит админка владельца, который её ещё не применил. */
function databaseWithout(prefix) {
  const sqlite = new DatabaseSync(':memory:');
  for (const file of ALL_MIGRATIONS.filter((name) => !name.startsWith(prefix))) sqlite.exec(readFileSync(`migrations/${file}`, 'utf8'));
  return sqlite;
}

test('F-036: с колонкой dismissed_at скрытый повод молчит, пока ситуация не исчезнет и не вернётся', async (t) => {
  t.after(installMemoryCache());
  const spy = installFetchSpy();
  t.after(spy.restore);
  assert.ok(ALL_MIGRATIONS.some((file) => file.startsWith('0043_admin_alerts_dismissed')), 'колонку даёт миграция 0043');
  const sqlite = freshDatabase();
  const alerts = await loadModule('functions/_lib/admin-alerts.ts');
  const env = { DB: new D1Database(sqlite), TELEGRAM_BOT_TOKEN: 'token', TELEGRAM_CHAT_ID: '1' };
  const draft = {
    fingerprint: 'leads-no-answer', kind: 'leads', severity: 'attention',
    title: '2 заявки ждут первого ответа', detail: 'Самая старая — уже 3 ч.', destination: 'leads',
  };
  const row = () => sqlite.prepare("SELECT id, resolved_at, dismissed_at, notified_at, title FROM admin_alerts WHERE fingerprint = 'leads-no-answer'").get();

  await alerts.syncAlerts(env, [draft]);
  assert.equal((await alerts.listAlerts(env.DB)).length, 1);

  await alerts.dismissAlert(env.DB, row().id);
  assert.ok(row().resolved_at && row().dismissed_at && row().notified_at, 'скрыто: закрыто, помечено, в Telegram не пойдёт');
  const notifiedAt = row().notified_at;

  // Повод всё ещё есть: при следующем открытии он не возвращается и не уходит в Telegram.
  await alerts.syncAlerts(env, [{ ...draft, title: '3 заявки ждут первого ответа' }]);
  assert.equal((await alerts.listAlerts(env.DB)).length, 0, 'скрытый не вернулся');
  assert.ok(row().resolved_at, 'запись осталась закрытой');
  assert.equal(row().notified_at, notifiedAt, 'отметка об отправке не сброшена');
  assert.equal(row().title, '3 заявки ждут первого ответа', 'текст при этом обновился');
  assert.equal((await alerts.notifyAlerts(env)).sent, 0);
  assert.equal(spy.telegram.length, 0);

  // Ситуация прошла — скрытие снято; вернулась — повод оживает и один раз уходит в Telegram.
  await alerts.syncAlerts(env, []);
  assert.equal(row().dismissed_at, null);
  await alerts.syncAlerts(env, [draft]);
  assert.equal(row().resolved_at, null, 'повод ожил');
  assert.equal(row().dismissed_at, null);
  assert.equal((await alerts.listAlerts(env.DB)).length, 1);
  assert.equal((await alerts.notifyAlerts(env)).sent, 1);
  assert.equal(spy.telegram.length, 1);
});

test('F-036: без колонки dismissed_at раздел не падает и скрытие работает по-старому', async (t) => {
  t.after(installMemoryCache());
  const sqlite = databaseWithout('0043');
  const alerts = await loadModule('functions/_lib/admin-alerts.ts');
  const env = { DB: new D1Database(sqlite) };
  const draft = { fingerprint: 'meta-dead-letter', kind: 'meta', severity: 'critical', title: 'x', detail: 'y', destination: 'meta' };

  await alerts.syncAlerts(env, [draft]);
  const id = sqlite.prepare("SELECT id FROM admin_alerts WHERE fingerprint = 'meta-dead-letter'").get().id;
  await alerts.dismissAlert(env.DB, id);
  assert.equal((await alerts.listAlerts(env.DB)).length, 0);
  // Прежнее поведение: повод вернётся при следующей проверке — до миграции иначе нельзя.
  await alerts.syncAlerts(env, [draft]);
  assert.equal((await alerts.listAlerts(env.DB)).length, 1);
});

// ─── F-125: когорты по понедельникам ────────────────────────────────────────

test('F-125: когорты группируются по понедельнику недели, окно начинается с понедельника', async (t) => {
  t.after(installMemoryCache());
  const sqlite = freshDatabase();
  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);
  const mondayOffset = (today.getUTCDay() + 6) % 7;
  const thisMonday = new Date(today.getTime() - mondayOffset * 86_400_000);
  const dayBefore = (base, days) => new Date(base.getTime() - days * 86_400_000);

  insertLead(sqlite, { name: 'Эта неделя', created_at: sqlDateTime(today) });
  insertLead(sqlite, { name: 'Воскресенье прошлой', created_at: sqlDateTime(dayBefore(thisMonday, 1)) });
  insertLead(sqlite, { name: 'Понедельник прошлой', created_at: sqlDateTime(dayBefore(thisMonday, 7)) });
  insertLead(sqlite, { name: 'Самая старая в окне', created_at: sqlDateTime(dayBefore(thisMonday, 49)) });
  insertLead(sqlite, { name: 'За окном', created_at: sqlDateTime(dayBefore(thisMonday, 50)) });

  const attribution = await harness('functions/api/admin/attribution.ts', { sqlite });
  const { payload } = await attribution.get({ days: 30 });
  const cohorts = payload.cohorts;
  for (const cohort of cohorts) {
    assert.equal(new Date(`${cohort.week}T00:00:00Z`).getUTCDay(), 1, `${cohort.week} — понедельник`);
  }
  const byWeek = new Map(cohorts.map((cohort) => [cohort.week, cohort.leads]));
  assert.equal(byWeek.get(sqlDate(thisMonday)), 1, 'текущая неделя — отдельной строкой, она ещё идёт');
  assert.equal(byWeek.get(sqlDate(dayBefore(thisMonday, 7))), 2, 'воскресенье и понедельник одной недели — одна когорта');
  assert.equal(byWeek.get(sqlDate(dayBefore(thisMonday, 49))), 1, 'восьмая неделя назад начинается с понедельника');
  assert.equal(cohorts.reduce((sum, cohort) => sum + cohort.leads, 0), 4, 'заявка до окна не попадает');
});

// ─── F-036: кнопка «×» в центре уведомлений идёт через dismissAlert ──────────

test('F-036: скрытое через раздел уведомление не возвращается при следующем открытии, пока повод тот же', async (t) => {
  t.after(installMemoryCache());
  const spy = installFetchSpy();
  t.after(spy.restore);
  const sqlite = freshDatabase();
  // Заявка третий час без ответа — повод «leads-no-answer» существует при каждом пересчёте.
  const lead = insertLead(sqlite, { name: 'Ждёт ответа', created_at: sqlDateTime(new Date(Date.now() - 3 * 3_600_000)) });
  const alerts = await harness('functions/api/admin/alerts.ts', { sqlite, env: { TELEGRAM_BOT_TOKEN: 'token', TELEGRAM_CHAT_ID: '1' } });
  const row = () => sqlite.prepare("SELECT id, resolved_at, dismissed_at, notified_at FROM admin_alerts WHERE fingerprint = 'leads-no-answer'").get();

  const opened = await alerts.get({ timezone_offset: 0 });
  assert.equal(opened.status, 200, JSON.stringify(opened.payload));
  const alert = opened.payload.alerts.find((item) => item.fingerprint === 'leads-no-answer');
  assert.ok(alert, 'повод виден в разделе');

  const dismissed = await alerts.post({ action: 'dismiss', id: alert.id });
  assert.equal(dismissed.status, 200, JSON.stringify(dismissed.payload));
  assert.equal(dismissed.payload.alerts.some((item) => item.fingerprint === 'leads-no-answer'), false);
  assert.ok(row().dismissed_at, 'скрытие помечено отдельно от «исчезло само»');
  assert.ok(row().notified_at, 'в Telegram не уйдёт');

  // Повод тот же — следующее открытие раздела его не оживляет (раньше оживляло).
  const reopened = await alerts.get({ timezone_offset: 0 });
  assert.equal(reopened.payload.alerts.some((item) => item.fingerprint === 'leads-no-answer'), false, 'скрытый не вернулся');
  assert.equal((await alerts.post({ action: 'notify' })).payload.sent, 0);
  assert.equal(spy.telegram.length, 0);

  // Ситуация прошла — скрытие снято; вернулась — повод ожил как новый.
  sqlite.prepare("UPDATE leads SET first_response_at = datetime('now') WHERE id = ?").run(lead);
  await alerts.get({ timezone_offset: 0 });
  assert.equal(row().dismissed_at, null);
  sqlite.prepare('UPDATE leads SET first_response_at = NULL WHERE id = ?').run(lead);
  const returned = await alerts.get({ timezone_offset: 0 });
  assert.equal(returned.payload.alerts.some((item) => item.fingerprint === 'leads-no-answer'), true, 'повод ожил');
  assert.equal((await alerts.post({ action: 'notify' })).payload.sent, 1);
  assert.equal(spy.telegram.length, 1);
});

// ─── F-093: узбекская кириллица ─────────────────────────────────────────────

test('F-093: «ғафур» находит «Ғафур Алиев» — узбекские буквы сводятся к строчным вместе с русскими', async (t) => {
  t.after(installMemoryCache());
  const sqlite = freshDatabase();
  const gafur = insertLead(sqlite, { name: 'Ғафур Алиев', email: 'gafur@example.test' });
  const otkir = insertLead(sqlite, { name: 'Ўткир Ҳакимов', email: 'otkir@example.test' });
  insertLead(sqlite, { name: 'Қодир', deleted_at: sqlDateTime(new Date()), deleted_reason: 'Дубль' });

  const crm = await harness('functions/api/admin/crm-leads.ts', { sqlite });
  for (const q of ['ғафур', 'ҒАФУР', 'алиев']) {
    assert.deepEqual((await crm.get({ timezone_offset: 0, q })).payload.leads.map((lead) => lead.id), [gafur], `поиск «${q}»`);
  }
  assert.deepEqual((await crm.get({ timezone_offset: 0, q: 'ўткир' })).payload.leads.map((lead) => lead.id), [otkir]);
  assert.deepEqual((await crm.get({ timezone_offset: 0, q: 'ҳакимов' })).payload.leads.map((lead) => lead.id), [otkir]);

  const trash = await harness('functions/api/admin/lead-trash.ts', { sqlite });
  const found = (await trash.get({ q: 'қодир' })).payload;
  assert.equal(found.matched, 1, 'в корзине тоже');
  assert.equal(found.leads[0].name, 'Қодир');
});

// ─── F-100: переполнение суммы отбрасывает слот целиком ─────────────────────

test('F-100: если сложенная сумма дня больше допустимой, в базу не уходит и часть — слот отбрасывается целиком', async (t) => {
  t.after(installMemoryCache());
  const spend = await harness('functions/api/admin/ad-spend.ts');
  const csv = [
    'date,source,amount',
    '2026-09-01,facebook,600000000',
    '2026-09-01,facebook,600000000',
    '2026-09-01,facebook,5',
    '2026-09-02,google,10',
  ].join('\n');

  const result = await spend.post({ action: 'import_csv', csv });
  assert.equal(result.status, 200, JSON.stringify(result.payload));
  assert.equal(result.payload.saved, 1, 'записана только строка google');
  assert.equal(result.payload.merged, 0, 'сложение отменено вместе со слотом');
  assert.equal(result.payload.skipped, 3, 'все три строки переполненного слота отклонены');
  assert.match(result.payload.errors[0], /не загружены/);
  assert.deepEqual(
    spend.sqlite.prepare('SELECT day, source, amount FROM ad_spend ORDER BY day').all().map((row) => ({ ...row })),
    [{ day: '2026-09-02', source: 'google', amount: 10 }],
    'в базе нет ни 600 000 000, ни 5 под видом расхода дня',
  );
});

// ─── F-089: просмотры считаются только у согласившихся на маркетинг ─────────

test('F-089: у публикации с заявками без строки просмотров — «нет данных», а не ноль; оговорка — в заметках и в воронке', async (t) => {
  t.after(installMemoryCache());
  const sqlite = freshDatabase();
  sqlite.prepare("INSERT INTO page_stats_daily (day, page_path, views) VALUES (date('now'), '/blog/with-views', 100)").run();
  insertLead(sqlite, { name: 'A', page_path: '/blog/with-views', marketing_consent: 1 });
  insertLead(sqlite, { name: 'B', page_path: '/blog/with-views' });
  insertLead(sqlite, { name: 'C', page_path: '/blog/no-consent-views' });

  const content = await harness('functions/api/admin/content-stats.ts', { sqlite });
  const { status, payload } = await content.get({ days: 30 });
  assert.equal(status, 200, JSON.stringify(payload));
  const bySlug = new Map(payload.pages.map((page) => [page.slug, page]));
  assert.deepEqual(bySlug.get('with-views'), { slug: 'with-views', views: 100, leads: 2, conversion: 1 });
  assert.deepEqual(bySlug.get('no-consent-views'), { slug: 'no-consent-views', views: null, leads: 1, conversion: null },
    'заявки есть, просмотров нет в статистике — это пробел в данных, не ноль');
  assert.ok(payload.notes.some((note) => /маркетинговые cookie/.test(note)), 'заметка про согласие');

  const attribution = await harness('functions/api/admin/attribution.ts', { sqlite });
  const funnel = (await attribution.get({ days: 30 })).payload;
  assert.ok(funnel.limitations.some((note) => note.startsWith('Просмотры и посетители считаются только у тех, кто разрешил маркетинговые cookie')), 'оговорка в воронке');
});

test('publication stats keep category history, UTC conversion and local lead totals at the period boundaries', async (t) => {
  t.after(installMemoryCache());
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-11T20:30:00Z') });
  const sqlite = freshDatabase();
  sqlite.exec(`INSERT INTO page_stats_daily (day,page_path,views) VALUES
    ('2026-11-04','/blog/moved',200), ('2026-11-05','/blog/moved/',40),
    ('2026-11-11','/cases/moved',60), ('2026-11-12','/cases/moved',300),
    ('2026-11-11','/blog/moved/nested',500), ('2026-11-11','/blog/empty',0)`);
  insertLead(sqlite, { created_at: '2026-11-05 18:59:00', page_path: '/blog/moved', marketing_consent: 1 });
  insertLead(sqlite, { created_at: '2026-11-05 19:00:00', page_path: '/blog/moved/?ref=1', marketing_consent: 1 });
  insertLead(sqlite, { created_at: '2026-11-11 10:00:00', page_path: '/cases/moved', marketing_consent: 0 });
  insertLead(sqlite, { created_at: '2026-11-12 18:59:00', page_path: '/cases/moved', marketing_consent: 1 });
  insertLead(sqlite, { created_at: '2026-11-12 19:00:00', page_path: '/cases/moved', marketing_consent: 1 });
  insertLead(sqlite, { created_at: '2026-11-11 14:00:00', page_path: '/cases/moved', marketing_consent: 1, deleted_at: '2026-11-11 15:00:00' });
  const content = await harness('functions/api/admin/content-stats.ts', { sqlite });
  const query = { days: 7, timezone_offset: TASHKENT_OFFSET };
  const result = await content.get(query);
  assert.equal(result.status, 200, JSON.stringify(result.payload));
  assert.deepEqual(result.payload.pages, [
    { slug: 'moved', views: 100, leads: 3, conversion: 2 },
    { slug: 'empty', views: 0, leads: 0, conversion: null },
  ]);

  const legacy = new DatabaseSync(':memory:');
  t.after(() => legacy.close());
  legacy.exec(`CREATE TABLE leads (page_path TEXT, created_at TEXT);
    CREATE TABLE page_stats_daily (day TEXT, page_path TEXT, views INTEGER);
    INSERT INTO page_stats_daily VALUES ('2026-11-11','/blog/moved',25);`);
  const legacyContent = await harness('functions/api/admin/content-stats.ts', { sqlite: legacy });
  const withoutConsent = (await legacyContent.get(query)).payload;
  assert.deepEqual(withoutConsent.coverage, { pageStats: true, leads: true, consent: false });
  assert.deepEqual(withoutConsent.pages, [{ slug: 'moved', views: 25, leads: 0, conversion: null }]);
  legacy.exec('DROP TABLE leads');
  const withoutLeads = (await legacyContent.get(query)).payload;
  assert.deepEqual(withoutLeads.coverage, { pageStats: true, leads: false, consent: false });
  assert.deepEqual(withoutLeads.pages, [{ slug: 'moved', views: 25, leads: null, conversion: null }]);
});

test('attribution and spend use the local window, with a consent-matched page rate over UTC days', async (t) => {
  t.after(installMemoryCache());
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-11T20:30:00Z') });
  const sqlite = freshDatabase();
  insertLead(sqlite, { created_at: '2026-11-05 22:00:00', page_path: '/boundary/', utm_source: 'meta', marketing_consent: 1 });
  insertLead(sqlite, { created_at: '2026-11-06 10:00:00', page_path: '/', utm_source: 'meta', marketing_consent: 1 });
  insertLead(sqlite, { created_at: '2026-11-06 11:00:00', page_path: '/', marketing_consent: 0 });
  sqlite.exec("INSERT INTO page_stats_daily(day,page_path,views) VALUES('2026-11-06','/',100)");
  sqlite.exec("INSERT INTO ad_spend(day,source,amount) VALUES('2026-11-05','meta',5),('2026-11-12','meta',12),('2026-11-13','meta',13)");
  const attribution = await harness('functions/api/admin/attribution.ts', { sqlite });
  const spend = await harness('functions/api/admin/ad-spend.ts', { sqlite });
  const query = { days: 7, timezone_offset: TASHKENT_OFFSET };
  const result = await attribution.get(query);
  assert.equal(result.status, 200, JSON.stringify(result.payload));
  const { payload } = result;
  assert.deepEqual(payload.period, { from: '2026-11-06', to: '2026-11-12' });
  assert.equal(payload.summary.leads, 3);
  assert.equal(payload.previous.leads, 0);
  assert.equal(payload.series[0].leads, 3);
  assert.equal(payload.summary.spend, 12);
  const pages = payload.dimensions.find((item) => item.key === 'page').rows;
  assert.equal(pages.find((page) => page.key === '/').conversion, 1);
  assert.equal(pages.find((page) => page.key === '/').leads, 2);
  assert.equal(pages.find((page) => page.key === '/boundary/').views, null);
  assert.equal(pages.find((page) => page.key === '/boundary/').conversion, null);
  const expenses = await spend.get(query);
  assert.equal(expenses.status, 200);
  assert.deepEqual(expenses.payload.entries.map((entry) => entry.day), ['2026-11-12']);
});

// ─── Стыки волны 02.10: счета, источники, типовые наборы, местный день ────────

test('F-026: дата оплаты есть только у оплаченного счёта — выставленный её не получает, оплаченный без даты берёт день выставления или сегодня', async (t) => {
  t.after(installMemoryCache());
  const finance = await harness('functions/api/admin/finance.ts');
  const paidAt = () => finance.sqlite.prepare('SELECT paid_at, status FROM invoices ORDER BY id DESC LIMIT 1').get();

  let saved = await finance.post({ action: 'save_invoice', amount: 100, status: 'paid', issued_at: '2026-09-01' }, { timezone_offset: 0 });
  assert.equal(saved.status, 200, JSON.stringify(saved.payload));
  assert.deepEqual({ ...paidAt() }, { paid_at: '2026-09-01', status: 'paid' }, 'оплачен без даты оплаты — день выставления');

  saved = await finance.post({ action: 'save_invoice', amount: 100, status: 'paid' }, { timezone_offset: 0 });
  assert.equal(saved.status, 200);
  assert.deepEqual({ ...paidAt() }, { paid_at: sqlDate(new Date()), status: 'paid' }, 'ни даты оплаты, ни выставления — сегодня');

  saved = await finance.post({ action: 'save_invoice', amount: 100, status: 'paid', issued_at: '2026-09-01', paid_at: '2026-09-05' }, { timezone_offset: 0 });
  assert.equal(saved.status, 200);
  assert.equal(paidAt().paid_at, '2026-09-05', 'явная дата владельца главнее');

  saved = await finance.post({ action: 'save_invoice', amount: 100, status: 'issued', paid_at: '2026-09-05' }, { timezone_offset: 0 });
  assert.equal(saved.status, 200);
  assert.deepEqual({ ...paidAt() }, { paid_at: null, status: 'issued' }, 'у выставленного счёта даты оплаты быть не может');
});

test('F-030: по источникам считаются выигранные сделки в другой валюте — их сумма в итог не входит', async (t) => {
  t.after(installMemoryCache());
  const sqlite = freshDatabase();
  const won = (fields) => insertLead(sqlite, { pipeline_stage: 'won', closed_at: sqlDateTime(new Date()), utm_source: 'google', ...fields });
  won({ name: 'A', deal_value: 50, deal_currency: 'USD' });
  won({ name: 'B', deal_value: 1000, deal_currency: 'EUR' });
  won({ name: 'C', deal_value: null, deal_currency: 'EUR' });
  const analytics = await harness('functions/api/admin/crm-analytics.ts', { sqlite });
  const { status, payload } = await analytics.get({ timezone_offset: 0 });
  assert.equal(status, 200, JSON.stringify(payload));
  const google = payload.wonBySource.find((row) => row.source === 'google');
  assert.deepEqual(google, { source: 'google', deals: 3, value: 50, priced: 1, otherCurrencyDeals: 1 },
    'евро не складываются с долларами и не пропадают молча; сделка без суммы — не «другая валюта»');
});

test('F-070: типовые доступы и стандартные шаблоны вставляются одним batch и не удваиваются при повторном нажатии', async (t) => {
  t.after(installMemoryCache());
  const clients = await harness('functions/api/admin/clients.ts');
  const created = await clients.post({ action: 'create', name: 'Клиент' }, { timezone_offset: 0 });
  assert.equal(created.status, 200, JSON.stringify(created.payload));
  const id = created.payload.id;
  const names = ['Рекламный кабинет Meta', 'Google Ads', 'Google Ads', ' CRM клиента '];
  const accessCount = () => clients.sqlite.prepare('SELECT COUNT(*) AS n FROM client_access WHERE client_id = ?').get(id).n;

  let seeded = await clients.post({ action: 'seed_access', id, names }, { timezone_offset: 0 });
  assert.equal(seeded.status, 200, JSON.stringify(seeded.payload));
  assert.equal(seeded.payload.added, 3, 'дубль и пробелы в самом списке схлопываются');
  assert.equal(accessCount(), 3);
  seeded = await clients.post({ action: 'seed_access', id, names }, { timezone_offset: 0 });
  assert.deepEqual({ added: seeded.payload.added, skipped: seeded.payload.skipped }, { added: 0, skipped: 3 });
  assert.equal(accessCount(), 3, 'второе нажатие ничего не добавило');
  assert.equal((await clients.post({ action: 'seed_access', id, names: [] }, { timezone_offset: 0 })).status, 400);

  const templates = await harness('functions/api/admin/crm-templates.ts');
  const templateCount = () => templates.sqlite.prepare('SELECT COUNT(*) AS n FROM crm_templates').get().n;
  const first = await templates.post({ action: 'seed' });
  assert.equal(first.status, 200, JSON.stringify(first.payload));
  assert.ok(first.payload.seeded > 0);
  const after = templateCount();
  assert.equal(after, first.payload.seeded);
  // Один свой шаблон между нажатиями: таблица уже не пуста, но стандартных нет — старая проверка «таблица пуста» их бы не добавила.
  templates.sqlite.prepare("DELETE FROM crm_templates WHERE title = (SELECT title FROM crm_templates ORDER BY id LIMIT 1)").run();
  const second = await templates.post({ action: 'seed' });
  assert.equal(second.payload.seeded, 1, 'вернулся только отсутствующий стандартный шаблон');
  assert.equal(templateCount(), after);
  const third = await templates.post({ action: 'seed' });
  assert.equal(third.payload.seeded, 0);
  assert.equal(templateCount(), after, 'повторное нажатие не удваивает');
});

test('F-068: отчёт отдаёт местный «сегодня», а клиент без даты начала заводится местным днём, не по Гринвичу', async (t) => {
  t.after(installMemoryCache());
  // Пояс, в котором местная дата отличается от UTC прямо сейчас: UTC+14 до
  // десяти утра по Гринвичу, UTC−14 после.
  const utcToday = new Date().toISOString().slice(0, 10);
  const offset = [-840, 840].find((candidate) => new Date(Date.now() - candidate * 60_000).toISOString().slice(0, 10) !== utcToday);
  const localToday = new Date(Date.now() - offset * 60_000).toISOString().slice(0, 10);

  const report = await harness('functions/api/admin/report.ts');
  const { status, payload } = await report.get({ timezone_offset: offset });
  assert.equal(status, 200, JSON.stringify(payload));
  assert.equal(payload.today, localToday);

  const clients = await harness('functions/api/admin/clients.ts');
  const created = await clients.post({ action: 'create', name: 'Новый' }, { timezone_offset: offset });
  assert.equal(created.status, 200, JSON.stringify(created.payload));
  const startedAt = clients.sqlite.prepare('SELECT started_at FROM clients WHERE id = ?').get(created.payload.id).started_at;
  assert.equal(startedAt, localToday);
  assert.notEqual(startedAt, utcToday);
});

test('Search Console requests a read-only token and uses real report rows and period totals', async (t) => {
  t.after(installMemoryCache());
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const credentials = JSON.stringify({
    client_email: 'report@example.test',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  });
  const realFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = realFetch; });
  const requests = [];
  const measure = { clicks: 7, impressions: 50, ctr: 0.14, position: 8.4 };
  const page = 'https://www.whalewzrd.com/meta-apps/';
  globalThis.fetch = async (url, init) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      const [header, body, signature] = init.body.get('assertion').split('.');
      const jwt = JSON.parse(Buffer.from(body, 'base64url').toString());
      assert.equal(jwt.iss, 'report@example.test');
      assert.equal(jwt.scope, 'https://www.googleapis.com/auth/webmasters.readonly');
      assert.equal(jwt.aud, url);
      assert.ok(verify('sha256', Buffer.from(header + '.' + body), publicKey, Buffer.from(signature, 'base64url')));
      return Response.json({ access_token: 'example-access-token' });
    }
    assert.equal(url, 'https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Awhalewzrd.com/searchAnalytics/query');
    assert.equal(init.headers.Authorization, 'Bearer example-access-token');
    const request = JSON.parse(init.body);
    requests.push(request);
    assert.equal(request.dataState, 'final');
    assert.equal(request.type, 'web');
    const rows = {
      '': [{ clicks: 25, impressions: 95, ctr: 25 / 95, position: 7 }],
      date: [{ keys: ['2026-11-05'], ...measure }],
      query: [{ keys: ['реклама приложения'], ...measure }],
      page: [{ keys: [page], ...measure }, { keys: ['javascript:alert(1)'], ...measure }],
      'query,page': [
        { keys: ['реклама приложения', page], ...measure },
        { keys: ['реклама приложения', 'https://www.whalewzrd.com/'], ...measure },
      ],
    };
    return Response.json({ rows: rows[request.dimensions.join(',')] });
  };
  const { getSearchConsoleReport, onRequestGet } = await loadModule('functions/api/admin/search-console.ts');
  const result = await getSearchConsoleReport(credentials, 'sc-domain:whalewzrd.com', 7, new Date('2026-11-09T02:00:00Z'));
  assert.equal(result.endDate, '2026-11-05');
  assert.equal(result.startDate, '2026-10-30');
  assert.deepEqual(requests.filter((request) => !request.dimensions.length).map(({ startDate, endDate }) => [startDate, endDate]), [
    ['2026-10-30', '2026-11-05'], ['2026-10-23', '2026-10-29'],
  ]);
  assert.equal(result.summary.clicks, 25);
  assert.equal(result.daily[0].ctr.toFixed(1), '14.0');
  assert.equal(result.pages.length, 1);
  assert.deepEqual(result.pages[0].topQueries, ['реклама приложения']);
  assert.equal(result.cannibalization[0].pages.length, 2);
  assert.equal(result.opportunities[0].impressions, 50);

  const unconfigured = await onRequestGet({
    request: adminRequest('search-console'),
    env: { ADMIN_PASSWORD },
  });
  assert.equal(unconfigured.status, 200);
  const empty = await unconfigured.json();
  assert.equal(empty.configured, false);
  assert.equal(empty.summary, null);
  assert.deepEqual(empty.queries, []);
  const failed = await onRequestGet({
    request: adminRequest('search-console'),
    env: { ADMIN_PASSWORD, GSC_SERVICE_ACCOUNT_JSON: 'broken-json' },
  });
  assert.equal(failed.status, 503);
  assert.ok(!(await failed.text()).includes('broken-json'));
  const denied = await onRequestGet({
    request: new Request('https://www.whalewzrd.com/api/admin/search-console'),
    env: { ADMIN_PASSWORD, GSC_SERVICE_ACCOUNT_JSON: credentials },
  });
  assert.equal(denied.status, 401);
});

test('атрибуция Google Organic показывает только подтверждённые входы и поддерживает схему до 0045', async (t) => {
  t.after(installMemoryCache());
  const sqlite = freshDatabase();
  const organic = insertLead(sqlite, { name: 'Распознанный вход', quality: 'target' });
  sqlite.prepare('UPDATE leads SET google_organic_landing_path = ? WHERE id = ?').run('/meta-apps/', organic);
  insertLead(sqlite, { name: 'Источник неизвестен' });

  const attribution = await harness('functions/api/admin/attribution.ts', { sqlite });
  const getDimension = async () => (await attribution.get({ days: 28 })).payload.dimensions.find((item) => item.key === 'google_organic');
  const dimension = await getDimension();
  assert.equal(dimension.supported, true);
  assert.deepEqual(dimension.rows.map(({ key, leads, qualified }) => ({ key, leads, qualified })), [
    { key: '/meta-apps/', leads: 1, qualified: 1 },
  ]);
  sqlite.exec('ALTER TABLE leads DROP COLUMN google_organic_landing_path');
  const unavailable = await getDimension();
  assert.equal(unavailable.supported, false);
  assert.match(unavailable.reason, /0045/);
});

test('сквозная аналитика UTM-кампаний (campaign_stats) считает метрики и поддерживает миграцию 0046', async (t) => {
  t.after(installMemoryCache());
  const sqlite = freshDatabase();
  insertLead(sqlite, { name: 'Кампания Meta', utm_source: 'fb', utm_campaign: 'retargeting', quality: 'qualified', pipeline_stage: 'won', deal_value: 1500 });
  insertLead(sqlite, { name: 'Второй лид Meta', utm_source: 'fb', utm_campaign: 'retargeting', quality: 'qualified' });

  const statsHarness = await harness('functions/api/admin/campaign-stats.ts', { sqlite });
  sqlite.exec('DROP TABLE IF EXISTS campaign_stats;');
  const preMigration = await statsHarness.get({ days: 30 });
  assert.equal(preMigration.status, 200);
  assert.equal(preMigration.payload.migrationRequired, '0046_campaign_stats.sql');
  assert.equal(preMigration.payload.campaigns.length, 1);
  assert.equal(preMigration.payload.campaigns[0].leads, 2);
  assert.equal(preMigration.payload.campaigns[0].qualified, 2);
  assert.equal(preMigration.payload.campaigns[0].won, 1);
  assert.equal(preMigration.payload.campaigns[0].revenue, 1500);
  assert.equal(preMigration.payload.campaigns[0].spend, null);

  sqlite.exec(readFileSync('migrations/0046_campaign_stats.sql', 'utf8'));
  const saveRes = await statsHarness.post({
    action: 'save_record',
    utm_source: 'fb',
    utm_campaign: 'retargeting',
    utm_medium: 'cpc',
    channel: 'meta',
    date: sqlDate(daysAgo(2)),
    impressions: 10000,
    clicks: 250,
    spend: 300,
    currency: 'USD',
  });
  assert.equal(saveRes.status, 200);
  assert.equal(saveRes.payload.success, true);

  const postMigration = await statsHarness.get({ days: 30 });
  assert.equal(postMigration.payload.migrationRequired, null);
  const campaign = postMigration.payload.campaigns.find((c) => c.utm_campaign === 'retargeting');
  assert.ok(campaign);
  assert.equal(campaign.impressions, 10000);
  assert.equal(campaign.clicks, 250);
  assert.equal(campaign.spend, 300);
  assert.equal(campaign.cpl, 150);
  assert.equal(campaign.cpq, 150);
  assert.equal(campaign.cac, 300);
  assert.equal(campaign.revenue, 1500);
  assert.equal(campaign.romi, 400);
});

test('UTM-кампании сопоставляют кириллицу и разделители, а денежные итоги требуют сопоставимых валют', async (t) => {
  t.after(installMemoryCache());
  const sqlite = freshDatabase();
  sqlite.exec('DROP TABLE IF EXISTS campaign_stats;');
  sqlite.exec(readFileSync('migrations/0046_campaign_stats.sql', 'utf8'));
  insertLead(sqlite, { utm_source: 'FB', utm_campaign: 'Новая::Группа', pipeline_stage: 'won', deal_value: 1500, deal_currency: 'EUR' });
  const stats = await harness('functions/api/admin/campaign-stats.ts', { sqlite });
  const record = { action: 'save_record', utm_source: 'fb', utm_campaign: 'новая::группа', date: sqlDate(daysAgo(1)), spend: 300, currency: 'USD' };
  assert.equal((await stats.post(record)).status, 200);

  const single = (await stats.get({ days: 30 })).payload.campaigns[0];
  assert.equal(single.utm_campaign, 'новая::группа');
  assert.equal(single.leads, 1);
  assert.equal(single.currency, 'USD');
  assert.equal(single.revenueCurrency, 'EUR');
  assert.equal(single.romi, null);

  assert.equal((await stats.post({ ...record, currency: 'EUR', spend: 50 })).status, 200);
  assert.equal((await stats.post({ ...record, date: '2026-02-30' })).status, 400);
  assert.equal((await stats.post({ ...record, spend: -1 })).status, 400);
  const mixed = (await stats.get({ days: 30 })).payload;
  assert.equal(mixed.campaigns[0].spend, null);
  assert.equal(mixed.summary.spend, null);
  assert.equal(mixed.summary.revenue, 1500);
  assert.equal(mixed.summary.cpl, null);
  assert.equal(mixed.summary.romi, null);
});

// ─── Пакет 3b: клиенты и финансы (DA-04, 48, 49, 50, 51, 59, 61, 99–102) ─────

test('DA-49: правка карточки и заметки месяца не меняет валюту уже записанных сумм', async (t) => {
  t.after(installMemoryCache());
  const clients = await harness('functions/api/admin/clients.ts');
  const { sqlite } = clients;
  t.after(() => sqlite.close());
  const id = Number(sqlite.prepare("INSERT INTO clients (name, retainer_amount, retainer_currency) VALUES ('Евро', 800, 'EUR')").run().lastInsertRowid);
  sqlite.prepare("INSERT INTO client_months (client_id, month, spend, spend_currency, revenue) VALUES (?, '2026-08', 125, 'EUR', 450)").run(id);
  const row = sqlite.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  const saved = await clients.post({ ...row, action: 'update', id, company: 'Новая компания', services: [] });
  assert.equal(saved.status, 200, JSON.stringify(saved.payload));
  assert.equal(sqlite.prepare('SELECT retainer_currency FROM clients WHERE id = ?').get(id).retainer_currency, 'EUR');
  const month = sqlite.prepare("SELECT * FROM client_months WHERE client_id = ? AND month = '2026-08'").get(id);
  const monthSaved = await clients.post({ ...month, action: 'set_month', id, mode: 'update', note: 'Заметка' });
  assert.equal(monthSaved.status, 200, JSON.stringify(monthSaved.payload));
  assert.equal(sqlite.prepare("SELECT spend_currency FROM client_months WHERE client_id = ?").get(id).spend_currency, 'EUR');
});

test('DA-50: старая вкладка не затирает свежие поля карточки, своя повторная правка проходит', async (t) => {
  t.after(installMemoryCache());
  const clients = await harness('functions/api/admin/clients.ts');
  const { sqlite } = clients;
  t.after(() => sqlite.close());
  const id = Number(sqlite.prepare("INSERT INTO clients (name, updated_at) VALUES ('Клиент', '2026-11-01 10:00:00')").run().lastInsertRowid);
  const opened = sqlite.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  const tabA = await clients.post({ ...opened, action: 'update', id, company: 'Компания A', services: [] });
  assert.equal(tabA.status, 200);
  assert.ok(tabA.payload.updated_at, 'ответ отдаёт новую версию');
  const tabB = await clients.post({ ...opened, action: 'update', id, scope_included: 'Описание B', services: [] });
  assert.equal(tabB.status, 409);
  assert.equal(tabB.payload.code, 'CLIENT_CONFLICT');
  assert.equal(sqlite.prepare('SELECT company FROM clients WHERE id = ?').get(id).company, 'Компания A');
  const again = await clients.post({ ...opened, action: 'update', id, company: 'Компания A2', updated_at: tabA.payload.updated_at, services: [] });
  assert.equal(again.status, 200, 'та же форма с новой версией сохраняет дальше');
});

test('DA-59: месяц не перезаписывается из старой вкладки и не воскресает после удаления', async (t) => {
  t.after(installMemoryCache());
  const clients = await harness('functions/api/admin/clients.ts');
  const { sqlite } = clients;
  t.after(() => sqlite.close());
  const id = Number(sqlite.prepare("INSERT INTO clients (name) VALUES ('Клиент')").run().lastInsertRowid);
  assert.equal((await clients.post({ action: 'set_month', id, mode: 'create', month: '2026-09', leads: 10 })).status, 200);
  const duplicate = await clients.post({ action: 'set_month', id, mode: 'create', month: '2026-09', leads: 1 });
  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.payload.code, 'MONTH_EXISTS');
  sqlite.prepare("UPDATE client_months SET updated_at = '2026-10-01 00:00:00'").run();
  const opened = sqlite.prepare("SELECT * FROM client_months WHERE client_id = ?").get(id);
  const tabA = await clients.post({ ...opened, action: 'set_month', id, mode: 'update', leads: 11 });
  assert.equal(tabA.status, 200);
  const tabB = await clients.post({ ...opened, action: 'set_month', id, mode: 'update', note: 'Заметка B' });
  assert.equal(tabB.status, 409);
  assert.equal(tabB.payload.code, 'MONTH_CONFLICT');
  assert.equal(sqlite.prepare('SELECT leads FROM client_months WHERE client_id = ?').get(id).leads, 11);
  await clients.post({ action: 'delete_month', id, month: '2026-09' });
  const afterDelete = await clients.post({ ...opened, action: 'set_month', id, mode: 'update', leads: 12 });
  assert.equal(afterDelete.status, 409);
  assert.equal(afterDelete.payload.code, 'MONTH_DELETED');
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM client_months').get().n, 0);
});

test('DA-61: после удаления клиента старая вкладка не создаёт памятку, доступ или месяц без карточки', async (t) => {
  t.after(installMemoryCache());
  const clients = await harness('functions/api/admin/clients.ts');
  const { sqlite } = clients;
  t.after(() => sqlite.close());
  const id = Number(sqlite.prepare("INSERT INTO clients (name) VALUES ('Удаляемый')").run().lastInsertRowid);
  assert.equal((await clients.post({ action: 'delete', id })).status, 200);
  assert.equal((await clients.post({ action: 'add_note', id, body: 'Памятка' })).status, 404);
  assert.equal((await clients.post({ action: 'set_access', id, name: 'Кабинет' })).status, 404);
  assert.equal((await clients.post({ action: 'set_month', id, mode: 'create', month: '2026-09' })).status, 404);
  for (const table of ['client_notes', 'client_access', 'client_months']) {
    assert.equal(sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n, 0, table);
  }
});

test('DA-04: карточку с часами удалить нельзя; счёт не создаётся клиенту, удалённому до записи', async (t) => {
  t.after(installMemoryCache());
  const clients = await harness('functions/api/admin/clients.ts');
  const { sqlite } = clients;
  t.after(() => sqlite.close());
  const withHours = Number(sqlite.prepare("INSERT INTO clients (name) VALUES ('С часами')").run().lastInsertRowid);
  sqlite.prepare("INSERT INTO time_entries (client_id, day, hours) VALUES (?, '2026-11-01', 2)").run(withHours);
  assert.equal((await clients.post({ action: 'delete', id: withHours })).status, 409);
  assert.ok(sqlite.prepare('SELECT id FROM clients WHERE id = ?').get(withHours));

  const finance = await harness('functions/api/admin/finance.ts', { sqlite });
  const doomed = Number(sqlite.prepare("INSERT INTO clients (name) VALUES ('Уйдёт')").run().lastInsertRowid);
  // Клиента удаляют после проверки обработчика, но до вставки счёта.
  const prepare = finance.env.DB.prepare.bind(finance.env.DB);
  finance.env.DB.prepare = (sql) => {
    if (/INSERT OR IGNORE INTO invoices/.test(sql)) sqlite.prepare('DELETE FROM clients WHERE id = ?').run(doomed);
    return prepare(sql);
  };
  const result = await finance.post({ action: 'save_invoice', id: 0, client_id: doomed, amount: 100, status: 'issued', issued_at: '2026-11-01', request_key: randomUUID() });
  finance.env.DB.prepare = prepare;
  assert.equal(result.status, 404, JSON.stringify(result.payload));
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM invoices WHERE client_id = ?').get(doomed).n, 0);
});

test('DA-48: старая форма не возвращает долг по оплаченному счёту и не перезаписывает номер', async (t) => {
  t.after(installMemoryCache());
  const finance = await harness('functions/api/admin/finance.ts');
  const { sqlite } = finance;
  t.after(() => sqlite.close());
  const clientId = Number(sqlite.prepare("INSERT INTO clients (name) VALUES ('Плательщик')").run().lastInsertRowid);
  const invoiceId = Number(sqlite.prepare(
    "INSERT INTO invoices (client_id, period, amount, currency, issued_at, status, number, updated_at) VALUES (?, '2026-11', 100, 'USD', '2026-11-01', 'issued', 'A-1', '2026-11-01 10:00:00')",
  ).run(clientId).lastInsertRowid);
  const opened = sqlite.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  // Другая вкладка записала полную оплату.
  const paid = await finance.post({ action: 'mark_paid', id: invoiceId, paid_at: '2026-11-02', request_key: randomUUID() });
  assert.equal(paid.status, 200, JSON.stringify(paid.payload));
  const stale = await finance.post({ ...opened, action: 'save_invoice', amount: 120, request_key: randomUUID() });
  assert.ok([400, 409].includes(stale.status), JSON.stringify(stale.payload));
  const row = sqlite.prepare('SELECT amount, status FROM invoices WHERE id = ?').get(invoiceId);
  assert.deepEqual([row.amount, row.status], [100, 'paid']);

  // Гонка: оплата записывается между проверкой обработчика и самой записью.
  const raceId = Number(sqlite.prepare(
    "INSERT INTO invoices (client_id, period, amount, currency, issued_at, status, updated_at) VALUES (?, '2026-11', 100, 'USD', '2026-11-01', 'issued', '2026-11-01 10:00:00')",
  ).run(clientId).lastInsertRowid);
  const raceOpened = sqlite.prepare('SELECT * FROM invoices WHERE id = ?').get(raceId);
  const prepare = finance.env.DB.prepare.bind(finance.env.DB);
  finance.env.DB.prepare = (sql) => {
    if (/^\s*UPDATE invoices SET client_id/.test(sql)) {
      sqlite.prepare("INSERT INTO invoice_payments (invoice_id, amount_cents, paid_on, request_key) VALUES (?, 10000, '2026-11-02', ?)").run(raceId, randomUUID());
    }
    return prepare(sql);
  };
  const raced = await finance.post({ ...raceOpened, action: 'save_invoice', amount: 120, request_key: randomUUID() });
  finance.env.DB.prepare = prepare;
  assert.equal(raced.status, 409, `race: ${JSON.stringify(raced.payload)}`);
  assert.equal(sqlite.prepare('SELECT amount FROM invoices WHERE id = ?').get(raceId).amount, 100, 'сумма не изменилась поверх оплаты');
  // Номер из старой формы тоже не перезаписывает свежую правку.
  sqlite.prepare("UPDATE invoices SET number = 'B-2', updated_at = '2026-11-03 10:00:00' WHERE id = ?").run(invoiceId);
  const staleNumber = await finance.post({ ...opened, action: 'save_invoice', status: 'paid', number: 'A-1', request_key: randomUUID() });
  assert.ok([400, 409].includes(staleNumber.status), JSON.stringify(staleNumber.payload));
  assert.equal(sqlite.prepare('SELECT number FROM invoices WHERE id = ?').get(invoiceId).number, 'B-2');
});

test('DA-51: повтор расхода с тем же ключом не удваивает сумму, тот же ключ с другой суммой — ошибка', async (t) => {
  t.after(installMemoryCache());
  const finance = await harness('functions/api/admin/finance.ts');
  t.after(() => finance.sqlite.close());
  const key = randomUUID();
  const expense = { action: 'save_expense', day: '2026-11-01', amount: 140, category: 'Сервис', request_key: key };
  assert.equal((await finance.post(expense)).status, 200);
  assert.equal((await finance.post(expense)).status, 200, 'точный повтор — успех');
  assert.equal(finance.sqlite.prepare('SELECT COUNT(*) AS n FROM finance_expenses').get().n, 1);
  assert.equal((await finance.post({ ...expense, amount: 150 })).status, 409);
  assert.equal((await finance.post({ ...expense, request_key: randomUUID() })).status, 200, 'другой ключ — отдельный расход');
  assert.equal(finance.sqlite.prepare('SELECT COUNT(*) AS n FROM finance_expenses').get().n, 2);
});

test('DA-99, DA-100, DA-101: массовое выставление учитывает начало работы, статус проекта и прежнюю абонентку', async (t) => {
  t.after(installMemoryCache());
  const finance = await harness('functions/api/admin/finance.ts');
  const { sqlite } = finance;
  t.after(() => sqlite.close());
  const issue = (period) => finance.post({ action: 'issue_month', period, request_key: randomUUID() });

  // DA-99: работа началась 3 ноября — за октябрь счёта нет.
  const late = Number(sqlite.prepare("INSERT INTO clients (name, status, started_at, retainer_amount, retainer_currency, billing_day) VALUES ('Новый', 'active', '2026-11-03', 150, 'USD', 3)").run().lastInsertRowid);
  const october = await issue('2026-10');
  assert.equal(october.payload.created, 0);
  assert.equal(october.payload.before_start, 1);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM invoices WHERE client_id = ?').get(late).n, 0);

  // DA-100: проект в статусе «предложение» не подавляет действующую абонентку.
  const proposal = Number(sqlite.prepare("INSERT INTO clients (name, status, started_at, retainer_amount, retainer_currency, billing_day) VALUES ('С предложением', 'active', '2026-01-01', 150, 'USD', 5)").run().lastInsertRowid);
  sqlite.prepare("INSERT INTO client_work (client_id, kind, title, status, billing, amount, currency) VALUES (?, 'project', 'Будущий проект', 'proposed', 'monthly', 200, 'USD')").run(proposal);
  await issue('2026-11');
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM invoices WHERE client_id = ? AND period = '2026-11' AND work_id IS NULL").get(proposal).n, 1);

  // DA-101: ту же работу оформили проектом — ноябрь второй раз не выставляется.
  sqlite.prepare("UPDATE client_work SET status = 'active', amount = 150 WHERE client_id = ?").run(proposal);
  const again = await issue('2026-11');
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM invoices WHERE client_id = ? AND period = '2026-11' AND status != 'cancelled'").get(proposal).n, 1, `создано: ${again.payload.created}`);
});

test('DA-102: повтор ключа с другими данными счёта не выдаётся за успех', async (t) => {
  t.after(installMemoryCache());
  const finance = await harness('functions/api/admin/finance.ts');
  const { sqlite } = finance;
  t.after(() => sqlite.close());
  const clientId = Number(sqlite.prepare("INSERT INTO clients (name) VALUES ('Клиент')").run().lastInsertRowid);
  const key = randomUUID();
  const invoice = { action: 'save_invoice', id: 0, client_id: clientId, amount: 100, status: 'issued', issued_at: '2026-11-01', kind: 'audit', request_key: key };
  const first = await finance.post(invoice);
  assert.equal(first.status, 200);
  assert.equal((await finance.post(invoice)).payload.id, first.payload.id, 'точный повтор возвращает тот же счёт');
  const changed = await finance.post({ ...invoice, amount: 200 });
  assert.equal(changed.status, 409);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM invoices').get().n, 1);
});

test('DA-01: цепочка C → B → A, удаление B и повторное слияние C не считают обращение дважды', async (t) => {
  t.after(installMemoryCache());
  const crm = await harness('functions/api/admin/lead-crm.ts');
  const { sqlite } = crm;
  t.after(() => sqlite.close());
  const trash = await harness('functions/api/admin/lead-trash.ts', { sqlite });
  const a = insertLead(sqlite, { name: 'A', email: 'chain@example.test', submissions_count: 1 });
  const b = insertLead(sqlite, { name: 'B', email: 'chain@example.test', submissions_count: 1 });
  const c = insertLead(sqlite, { name: 'C', email: 'chain@example.test', submissions_count: 1 });
  const merge = (primary, duplicate) => {
    const lead = sqlite.prepare('SELECT crm_revision FROM leads WHERE id = ?').get(primary);
    const dup = sqlite.prepare('SELECT crm_revision FROM leads WHERE id = ?').get(duplicate);
    return crm.post({ action: 'merge_lead', lead_id: primary, duplicate_id: duplicate, action_id: randomUUID(),
      expected_revision: lead.crm_revision, duplicate_revision: dup.crm_revision });
  };
  assert.equal((await merge(b, c)).status, 200);
  assert.equal((await merge(a, b)).status, 200);
  assert.equal(sqlite.prepare('SELECT submissions_count FROM leads WHERE id = ?').get(a).submissions_count, 3);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS n FROM lead_activity WHERE lead_id = ? AND type = 'lead_merged'").get(a).n, 2, 'у A видны оба слияния');

  const purged = await trash.post({ action: 'purge', ids: [b] });
  assert.equal(purged.status, 200, JSON.stringify(purged.payload));
  assert.equal((await trash.post({ action: 'restore', ids: [c] })).payload.restored, 1);
  const again = await merge(a, c);
  assert.equal(again.status, 409, 'повторный перенос C заблокирован');
  assert.equal(sqlite.prepare('SELECT submissions_count FROM leads WHERE id = ?').get(a).submissions_count, 3, 'итог — три исходных обращения');
});

// ─── Пакет 3d: импорт расходов (DA-64…DA-68) ────────────────────────────────

test('DA-64: строка в другой валюте не превращается в доллары и не складывается с ними', async (t) => {
  t.after(installMemoryCache());
  const spend = await harness('functions/api/admin/ad-spend.ts');
  t.after(() => spend.sqlite.close());
  const csv = 'date,source,campaign,amount,currency\n2026-09-01,facebook,retarget,100,EUR\n2026-09-01,facebook,retarget,75,USD\n2026-09-01,facebook,retarget,5,\n';
  const result = await spend.post({ action: 'import_csv', csv });
  assert.equal(result.status, 200, JSON.stringify(result.payload));
  assert.equal(result.payload.skipped, 1, 'строка в EUR отклонена');
  assert.match(result.payload.errors[0], /EUR/);
  const rows = spend.sqlite.prepare('SELECT amount, currency FROM ad_spend').all().map((row) => ({ ...row }));
  assert.deepEqual(rows, [{ amount: 80, currency: 'USD' }], 'USD и пустая валюта сложились, EUR — нет');
});

test('DA-65: «|» в названии не склеивает разные кампании, настоящий дубль складывается', async (t) => {
  t.after(installMemoryCache());
  const spend = await harness('functions/api/admin/ad-spend.ts');
  t.after(() => spend.sqlite.close());
  const csv = 'date,source,campaign,amount\n2026-09-01,audience|east,reengagement,161\n2026-09-01,audience,east|reengagement,73\n2026-09-01,audience,east|reengagement,7\n';
  const result = await spend.post({ action: 'import_csv', csv });
  assert.equal(result.payload.saved, 2);
  assert.equal(result.payload.merged, 1);
  const rows = spend.sqlite.prepare('SELECT source, campaign, amount FROM ad_spend ORDER BY amount').all().map((row) => ({ ...row }));
  assert.deepEqual(rows, [
    { source: 'audience', campaign: 'east|reengagement', amount: 80 },
    { source: 'audience|east', campaign: 'reengagement', amount: 161 },
  ]);
});

test('DA-66: итог за период считается по всем строкам, а список честно говорит, что он неполный', async (t) => {
  t.after(installMemoryCache());
  const spend = await harness('functions/api/admin/ad-spend.ts');
  t.after(() => spend.sqlite.close());
  const today = sqlDate(new Date());
  const insert = spend.sqlite.prepare("INSERT INTO ad_spend (day, source, campaign, amount, currency) VALUES (?, 'fb', ?, 1, 'USD')");
  for (const count of [1999, 2000, 2001]) {
    spend.sqlite.exec('DELETE FROM ad_spend');
    for (let index = 0; index < count; index += 1) insert.run(today, `c${index}`);
    const result = await spend.get({ days: 30 });
    assert.equal(result.status, 200);
    assert.deepEqual(result.payload.totals, [{ currency: 'USD', amount: count }], `${count}: итог по всем строкам`);
    assert.equal(result.payload.total_rows, count);
    assert.equal(result.payload.truncated, count > 2000, `${count}: признак неполного списка`);
  }
});

test('DA-67: сбой посреди импорта не оставляет в базе половину файла', async (t) => {
  t.after(installMemoryCache());
  const spend = await harness('functions/api/admin/ad-spend.ts');
  t.after(() => spend.sqlite.close());
  spend.sqlite.exec("CREATE TRIGGER audit_fail BEFORE INSERT ON ad_spend WHEN NEW.campaign = 'boom' BEGIN SELECT RAISE(ABORT, 'boom'); END;");
  const lines = ['date,source,campaign,amount'];
  for (let index = 0; index < 50; index += 1) lines.push(`2026-09-01,fb,c${index},10`);
  lines.push('2026-09-01,fb,boom,10');
  const result = await spend.post({ action: 'import_csv', csv: lines.join('\n') });
  assert.equal(result.status, 500);
  assert.equal(spend.sqlite.prepare('SELECT COUNT(*) AS n FROM ad_spend').get().n, 0, 'всё или ничего');
});

test('DA-68: файл в пределах формы принимается, слишком большой получает понятный отказ', async (t) => {
  t.after(installMemoryCache());
  const spend = await harness('functions/api/admin/ad-spend.ts');
  t.after(() => spend.sqlite.close());
  const row = (index) => `2026-09-01,facebook,"Кампания ""№${index}"", ретаргетинг",${index + 1},USD,"${'Заметка о расходе с кириллицей. '.repeat(20)}"`;
  const csv = ['date,source,campaign,amount,currency,note', ...Array.from({ length: 400 }, (_, index) => row(index))].join('\n');
  assert.ok(Buffer.byteLength(csv) > 256 * 1024 && Buffer.byteLength(csv) < 512 * 1024, `размер ${Buffer.byteLength(csv)}`);
  const accepted = await spend.post({ action: 'import_csv', csv });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.payload).slice(0, 200));
  assert.equal(accepted.payload.saved, 400);

  const huge = await spend.post({ action: 'import_csv', csv: csv.repeat(5) });
  assert.equal(huge.status, 413);
  assert.match(huge.payload.error, /слишком большой/);
});

// ─── Пакет 4a: аналитика CRM (DA-07) ────────────────────────────────────────

test('DA-07: явный 0 USD — указанная сумма, пустая — неизвестная; график и источники их различают', async (t) => {
  t.after(installMemoryCache());
  const sqlite = freshDatabase();
  const now = sqlDateTime(new Date());
  insertLead(sqlite, { name: 'Ноль', pipeline_stage: 'won', deal_value: 0, deal_currency: 'USD', closed_at: now, utm_source: 'zero' });
  insertLead(sqlite, { name: 'Пусто', pipeline_stage: 'won', deal_value: null, deal_currency: 'USD', closed_at: now, utm_source: 'unknown' });
  const analytics = await harness('functions/api/admin/crm-analytics.ts', { sqlite });
  const result = (await analytics.get({ timezone_offset: 0 })).payload;
  assert.equal(result.totals.wonPriced, 1, 'явный 0 — сделка с суммой');
  assert.equal(result.totals.wonWithoutValue, 1);
  const month = result.revenueByMonth.find((row) => row.month === CURRENT_MONTH);
  assert.equal(month.value, 0);
  assert.equal(month.withoutValue, 1);
  const bySource = Object.fromEntries(result.wonBySource.map((row) => [row.source, row.value]));
  assert.equal(bySource.zero, 0, 'источник с явным нулём — 0');
  assert.equal(bySource.unknown, null, 'источник без суммы — неизвестно, а не 0');
  sqlite.close();
});

// ─── Пакет 4b: каналы и деньги «Воронки» (CL-01, CL-23, DA-109, DA-110) ─────

test('CL-01: канал определяется по словам метки одинаково на сервере и в браузере', async () => {
  const { classifyChannel } = await loadModule('shared/marketing-channel.ts');
  const cases = [
    [['google_ads'], 'google'], [['facebook_ads'], 'meta'], [['ig_stories'], 'meta'],
    [['seo_blog'], 'organic'], [['органика'], 'organic'], [['telegram', '', 'promo-cpc'], 'telegram'],
    [['instant_offer'], 'other'], [['outgoing_mail'], 'other'], [['newsletter', 'cpc', 'spring'], 'other'],
    [['partner', '', 'fb_retarget'], 'meta'], [['Google', 'cpc', 'brand'], 'google'],
  ];
  for (const [args, expected] of cases) assert.equal(classifyChannel(...args), expected, args.join(' | '));
});

test('CL-23: канал с неизвестной выручкой не показывает ROMI −100 %, неполный расход — не цену заявки', async () => {
  const { aggregateChannels } = await loadModule('src/app/components/admin/AttributionVisualPro.tsx');
  const channels = aggregateChannels([
    { key: 'fb / A', leads: 5, qualified: 1, won: 1, revenue: null, spend: 100 },
    { key: 'facebook / B', leads: 5, qualified: 1, won: 0, revenue: 0, spend: null },
    { key: 'google / brand', leads: 4, qualified: 2, won: 1, revenue: 300, spend: 100 },
  ], 14);
  const meta = channels.find((channel) => channel.id === 'meta');
  const google = channels.find((channel) => channel.id === 'google');
  assert.equal(meta.romi, null, 'выручка неизвестна — ROMI не считается');
  assert.equal(meta.revenueIncomplete, true);
  assert.equal(meta.cpl, null, 'расход введён не по всем меткам — цены заявки нет');
  assert.equal(meta.spendIncomplete, true);
  assert.equal(google.romi, 200);
  assert.equal(google.cpl, 25);
});

test('DA-109, DA-110: «Воронка» не считает неизвестную выручку нулём и не склеивает разные пары кампаний', async (t) => {
  t.after(installMemoryCache());
  const sqlite = freshDatabase();
  const now = sqlDateTime(new Date());
  const today = sqlDate(new Date());
  insertLead(sqlite, { name: 'Без суммы', utm_source: 'fb', utm_campaign: 'spring', pipeline_stage: 'won', deal_value: null, deal_currency: 'USD', closed_at: now });
  insertLead(sqlite, { name: 'Пара 1', utm_source: 'market / east', utm_campaign: 'retargeting' });
  insertLead(sqlite, { name: 'Пара 2', utm_source: 'market', utm_campaign: 'east / retargeting' });
  sqlite.prepare("INSERT INTO ad_spend (day, source, campaign, amount, currency) VALUES (?, 'fb', 'spring', 100, 'USD')").run(today);
  sqlite.prepare("INSERT INTO ad_spend (day, source, campaign, amount, currency) VALUES (?, 'market / east', 'retargeting', 30, 'USD')").run(today);
  sqlite.prepare("INSERT INTO ad_spend (day, source, campaign, amount, currency) VALUES (?, 'market', 'east / retargeting', 150, 'USD')").run(today);
  const attribution = await harness('functions/api/admin/attribution.ts', { sqlite });
  const { payload } = await attribution.get({ days: 30, timezone_offset: 0 });
  const source = payload.dimensions.find((item) => item.key === 'source').rows.find((row) => row.key === 'fb');
  assert.equal(source.revenue, null, 'выигранная сделка без суммы — выручка неизвестна');
  assert.equal(source.romi, null, 'и ROMI не −100 %');
  const campaigns = payload.dimensions.find((item) => item.key === 'campaign').rows.filter((row) => row.key === 'market / east / retargeting');
  assert.equal(campaigns.length, 2, 'две разные пары — две строки');
  assert.deepEqual(campaigns.map((row) => row.spend).sort((a, b) => a - b), [30, 150]);
  assert.ok(campaigns.every((row) => row.leads === 1));
  sqlite.close();
});

// ─── Пакет 4b: «UTM-кампании» (DA-69, DA-70, DA-71) ─────────────────────────

test('DA-69: клики без введённого расхода — «расход не введён», а не бесплатные клики', async (t) => {
  t.after(installMemoryCache());
  const sqlite = freshDatabase();
  const stats = await harness('functions/api/admin/campaign-stats.ts', { sqlite });
  const record = { action: 'save_record', utm_source: 'fb', utm_campaign: 'clicks-only', date: sqlDate(daysAgo(1)), clicks: 10, currency: 'USD' };
  assert.equal((await stats.post({ ...record, spend: null })).status, 200);
  const campaign = (await stats.get({ days: 30 })).payload.campaigns.find((item) => item.utm_campaign === 'clicks-only');
  assert.equal(campaign.spend, null);
  assert.equal(campaign.spendUnknown, true);
  assert.equal(campaign.cpc, null, 'цена клика не 0');
  assert.equal((await stats.post({ ...record, utm_campaign: 'real-zero', spend: 0 })).status, 200, 'настоящий ноль по-прежнему записывается');
  const zero = (await stats.get({ days: 30 })).payload.campaigns.find((item) => item.utm_campaign === 'real-zero');
  assert.equal(zero.spend, 0);
  assert.equal(zero.spendUnknown, false);
  sqlite.close();
});

test('DA-70: известный ноль выручки даёт ROMI, сделка без суммы делает выручку неполной', async (t) => {
  t.after(installMemoryCache());
  const sqlite = freshDatabase();
  insertLead(sqlite, { utm_source: 'fb', utm_campaign: 'zero', pipeline_stage: 'won', deal_value: 0, deal_currency: 'USD' });
  insertLead(sqlite, { utm_source: 'fb', utm_campaign: 'partial', pipeline_stage: 'won', deal_value: 300, deal_currency: 'USD' });
  insertLead(sqlite, { utm_source: 'fb', utm_campaign: 'partial', pipeline_stage: 'won', deal_value: null, deal_currency: 'USD' });
  const stats = await harness('functions/api/admin/campaign-stats.ts', { sqlite });
  for (const campaign of ['zero', 'partial']) {
    await stats.post({ action: 'save_record', utm_source: 'fb', utm_campaign: campaign, date: sqlDate(daysAgo(1)), spend: 100, currency: 'USD' });
  }
  const campaigns = (await stats.get({ days: 30 })).payload.campaigns;
  const zero = campaigns.find((item) => item.utm_campaign === 'zero');
  assert.equal(zero.revenue, 0);
  assert.equal(zero.romi, -100, 'известная нулевая выручка — честный −100 %');
  const partial = campaigns.find((item) => item.utm_campaign === 'partial');
  assert.equal(partial.revenue, null);
  assert.equal(partial.revenueIncomplete, true);
  assert.equal(partial.romi, null, 'не 200 % по неполной выручке');
  sqlite.close();
});

test('DA-71: вернувшийся контакт и ручной расход видны в «UTM-кампаниях» так же, как в «Воронке»', async (t) => {
  t.after(installMemoryCache());
  const sqlite = freshDatabase();
  const today = sqlDate(new Date());
  insertLead(sqlite, { utm_source: 'google', utm_campaign: 'brand', created_at: sqlDateTime(daysAgo(40)), last_submitted_at: sqlDateTime(new Date()) });
  insertLead(sqlite, { utm_source: 'google', utm_campaign: 'brand' });
  sqlite.prepare("INSERT INTO ad_spend (day, source, campaign, amount, currency) VALUES (?, 'google', 'brand', 200, 'USD')").run(today);
  const stats = await harness('functions/api/admin/campaign-stats.ts', { sqlite });
  const brand = (await stats.get({ days: 7 })).payload.campaigns.find((item) => item.utm_campaign === 'brand');
  assert.equal(brand.leads, 2, 'вернувшийся контакт посчитан, как в «Воронке»');
  assert.equal(brand.spend, 200, 'ручной расход подхвачен');
  assert.equal(brand.cpl, 100);
  sqlite.close();
});

test('DA-06: выигрыш только в другой валюте — выручка неизвестна, прибыль и ROMI не −100 %', async (t) => {
  t.after(installMemoryCache());
  const sqlite = freshDatabase();
  const now = sqlDateTime(new Date());
  insertLead(sqlite, { name: 'Евро', pipeline_stage: 'won', deal_value: 1200, deal_currency: 'EUR', closed_at: now });
  sqlite.prepare("INSERT INTO ad_spend (day, amount, currency) VALUES (?, 100, 'USD')").run(sqlDate(new Date()));
  const report = await harness('functions/api/admin/report.ts', { sqlite });
  const { payload } = await report.get({ period: CURRENT_MONTH, timezone_offset: 0, currency: 'USD' });
  assert.equal(payload.current.won, 1);
  assert.equal(payload.current.revenue, null, 'не 0');
  assert.equal(payload.derived.profit, null);
  assert.equal(payload.derived.romi, null, 'не −100 %');
  assert.ok(payload.notes.some((note) => /другой валюте/.test(note)));
  sqlite.close();
});

// ─── Пакет 4b: отчёт, «Сегодня» и «Цели» (DA-13, DA-84, DA-113) ─────────────

test('DA-13: посетители месяца старше срока хранения отпечатков — «нет данных», а не ноль', async (t) => {
  t.after(installMemoryCache());
  const sqlite = freshDatabase();
  t.after(() => sqlite.close());
  const report = await harness('functions/api/admin/report.ts', { sqlite });
  const old = (await report.get({ period: shiftMonth(CURRENT_MONTH, -4), timezone_offset: 0 })).payload;
  assert.equal(old.current.visitors, null, 'отпечатки за этот месяц уже удалены');
  assert.ok(old.notes.some((note) => note.includes('90 дней')), 'отчёт объясняет, почему посетителей нет');
  const fresh = (await report.get({ period: CURRENT_MONTH, timezone_offset: 0 })).payload;
  assert.equal(typeof fresh.current.visitors, 'number', 'текущий месяц считается как раньше');
});

test('DA-84: «Meta» и «meta» на экране «Сегодня» — один источник с общим расходом', async (t) => {
  t.after(installMemoryCache());
  const sqlite = freshDatabase();
  t.after(() => sqlite.close());
  const now = sqlDateTime(new Date());
  insertLead(sqlite, { name: 'Первая', utm_source: 'Meta', created_at: now });
  insertLead(sqlite, { name: 'Вторая', utm_source: 'meta', created_at: now });
  sqlite.prepare("INSERT INTO ad_spend (day, source, amount, currency) VALUES (?, 'Meta', 100, 'USD')").run(sqlDate(new Date()));
  const today = await harness('functions/api/admin/today.ts', { sqlite });
  const { payload } = await today.get();
  const meta = payload.sources.filter((row) => row.source.toLowerCase() === 'meta');
  assert.equal(meta.length, 1, 'одна строка вместо двух');
  assert.equal(meta[0].leads, 2);
  assert.equal(meta[0].spend, 100);
  assert.equal(meta[0].costPerLead, 50);
});

test('DA-113: без полей качества и этапов сделки «Цели» говорят «нет данных», а не 0', async (t) => {
  t.after(installMemoryCache());
  const legacy = new DatabaseSync(':memory:');
  t.after(() => legacy.close());
  legacy.exec('CREATE TABLE leads (id INTEGER PRIMARY KEY, name TEXT, created_at TEXT)');
  legacy.exec(readFileSync('migrations/0024_admin_goals.sql', 'utf8'));
  legacy.prepare('INSERT INTO leads (name, created_at) VALUES (?, ?)').run('Старая схема', sqlDateTime(new Date()));
  const goals = await harness('functions/api/admin/goals.ts', { sqlite: legacy });
  const { status, payload } = await goals.get({ period: CURRENT_MONTH, timezone_offset: 0 });
  assert.equal(status, 200, JSON.stringify(payload));
  assert.equal(payload.fact.leads, 1);
  assert.equal(payload.fact.qualified, null, 'качество заявки не хранится — целевых не ноль, а неизвестно');
  assert.equal(payload.fact.won, null, 'этапов сделки нет — выигрышей не ноль, а неизвестно');
  assert.equal(payload.forecast.qualified, null, 'прогноз по неизвестному не строится');
  assert.ok(payload.history.every((item) => item.fact.qualified === null && item.fact.won === null), 'история тоже');
  assert.ok(payload.notes.some((note) => note.includes('качества заявки')));

  const full = await harness('functions/api/admin/goals.ts');
  const complete = (await full.get({ period: CURRENT_MONTH, timezone_offset: 0 })).payload;
  assert.equal(complete.fact.qualified, 0, 'с полями базы пустой месяц — настоящий ноль');
  assert.equal(complete.fact.won, 0);
  full.sqlite.close();
});

// ─── Пакет 4c: клиенты, расходы и цели (DA-12, DA-60, DA-62, DA-98) ─────────

test('DA-60: месяц клиента не принимает дробные заявки и продажи и отчёт, отправленный в будущем', async (t) => {
  t.after(installMemoryCache());
  const clients = await harness('functions/api/admin/clients.ts');
  const id = (await clients.post({ action: 'create', name: 'Месячный' }, { timezone_offset: 0 })).payload.id;
  const month = (body) => clients.post({ action: 'set_month', id, month: CURRENT_MONTH, mode: 'replace', ...body }, { timezone_offset: 0 });
  assert.equal((await month({ leads: 2.5 })).status, 400, 'дробные заявки');
  assert.equal((await month({ sales: '1,5' })).status, 400, 'дробные продажи');
  const nextWeek = sqlDate(new Date(Date.now() + 7 * 86_400_000));
  assert.equal((await month({ report_sent_at: nextWeek })).status, 400, 'отправка в будущем');
  assert.equal(clients.sqlite.prepare('SELECT count(*) AS n FROM client_months').get().n, 0, 'ничего не записано');
  const ok = await month({ leads: 3, sales: '', report_sent_at: sqlDate(new Date()) });
  assert.equal(ok.status, 200, JSON.stringify(ok.payload));
  const row = clients.sqlite.prepare('SELECT leads, sales FROM client_months').get();
  assert.equal(row.leads, 3);
  assert.equal(row.sales, null, 'пустое поле — не заполнено, а не 0');
  clients.sqlite.close();
});

test('DA-62: правка удалённого доступа — 404, а повтор удаления сообщает, что записи уже нет', async (t) => {
  t.after(installMemoryCache());
  const clients = await harness('functions/api/admin/clients.ts');
  const id = (await clients.post({ action: 'create', name: 'С доступами' }, { timezone_offset: 0 })).payload.id;
  assert.equal((await clients.post({ action: 'set_access', id, name: 'Кабинет Meta', status: 'waiting' })).status, 200);
  const accessId = clients.sqlite.prepare('SELECT id FROM client_access').get().id;
  assert.equal((await clients.post({ action: 'delete_access', id, access_id: accessId })).payload.deleted, 1);
  const stale = await clients.post({ action: 'set_access', id, access_id: accessId, name: 'Кабинет Meta', status: 'granted' });
  assert.equal(stale.status, 404);
  assert.equal(stale.payload.code, 'ACCESS_DELETED');
  assert.equal(clients.sqlite.prepare('SELECT count(*) AS n FROM client_access').get().n, 0, 'запись не воскресла');
  assert.equal((await clients.post({ action: 'delete_access', id, access_id: accessId })).payload.deleted, 0);
  clients.sqlite.close();
});

test('DA-98: удаление строки расхода сообщает фактическое число удалённых строк', async (t) => {
  t.after(installMemoryCache());
  const spend = await harness('functions/api/admin/ad-spend.ts');
  spend.sqlite.prepare("INSERT INTO ad_spend (day, source, amount, currency) VALUES (?, 'meta', 10, 'USD')").run(sqlDate(new Date()));
  const rowId = spend.sqlite.prepare('SELECT id FROM ad_spend').get().id;
  assert.equal((await spend.post({ action: 'delete', id: rowId })).payload.deleted, 1);
  assert.equal((await spend.post({ action: 'delete', id: rowId })).payload.deleted, 0, 'повтор из другой вкладки — уже нечего удалять');
  assert.equal((await spend.post({ action: 'delete', id: 99999 })).payload.deleted, 0, 'неизвестный id');
  spend.sqlite.close();
});

test('DA-12: цель из устаревшей вкладки не перекрывает свежую, а сумма вне диапазона — ошибка, а не ноль', async (t) => {
  t.after(installMemoryCache());
  const goals = await harness('functions/api/admin/goals.ts');
  const save = (body) => goals.post({ period: CURRENT_MONTH, leads_target: 10, revenue_target: 800, ...body }, { timezone_offset: 0 });
  const created = await save({ expected_updated_at: '' });
  assert.equal(created.status, 200, JSON.stringify(created.payload));
  const base = created.payload.updated_at;
  assert.ok(base);
  assert.equal((await save({ expected_updated_at: '' })).status, 409, 'вторая вкладка не создаёт цель поверх существующей');

  const tabA = await save({ revenue_target: 850, expected_updated_at: base });
  assert.equal(tabA.status, 200, JSON.stringify(tabA.payload));
  const tabB = await save({ revenue_target: 800, leads_target: 12, expected_updated_at: base });
  assert.equal(tabB.status, 409, 'вкладка со старым снимком получает конфликт');
  assert.equal(goals.sqlite.prepare('SELECT revenue_target FROM admin_goals').get().revenue_target, 850, 'правка вкладки A сохранилась');

  const tooBig = await save({ spend_cap: 1_000_000_001, expected_updated_at: tabA.payload.updated_at });
  assert.equal(tooBig.status, 400);
  assert.match(tooBig.payload.error, /Потолок расхода/);
  assert.equal(goals.sqlite.prepare('SELECT spend_cap FROM admin_goals').get().spend_cap, 0, 'ничего не записано');
  goals.sqlite.close();
});
