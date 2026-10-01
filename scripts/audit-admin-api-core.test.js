import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
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
