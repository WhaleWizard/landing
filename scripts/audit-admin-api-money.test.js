import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
    const info = this.db.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: info.changes, last_row_id: Number(info.lastInsertRowid) } };
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

/** Колонка из будущей миграции; если файл уже есть — берётся он. */
function addDismissedAtColumn(sqlite) {
  const file = 'migrations/0043_admin_alerts_dismissed.sql';
  if (existsSync(file)) sqlite.exec(readFileSync(file, 'utf8'));
  else sqlite.exec('ALTER TABLE admin_alerts ADD COLUMN dismissed_at TEXT;');
}

test('F-036: с колонкой dismissed_at скрытый повод молчит, пока ситуация не исчезнет и не вернётся', async (t) => {
  t.after(installMemoryCache());
  const spy = installFetchSpy();
  t.after(spy.restore);
  const sqlite = freshDatabase();
  addDismissedAtColumn(sqlite);
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
  const sqlite = freshDatabase();
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
