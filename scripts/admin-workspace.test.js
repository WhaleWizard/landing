import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

globalThis.caches = { default: { async match(){return undefined;}, async put(){} } };

class Statement {
  constructor(db, sql, values = []) {
    this.db = db;
    this.sql = sql;
    this.values = values;
  }
  bind(...v) {
    return new Statement(this.db, this.sql, v);
  }
  async all() {
    return {
      results: this.db.prepare(this.sql).all(...this.values),
      success: true,
    };
  }
  async first() {
    return this.db.prepare(this.sql).get(...this.values) || null;
  }
  async run() {
    const r = this.db.prepare(this.sql).run(...this.values);
    return {
      success: true,
      meta: { changes: r.changes, last_row_id: Number(r.lastInsertRowid) },
    };
  }
}
class Database {
  constructor(db) {
    this.db = db;
  }
  prepare(sql) {
    return new Statement(this.db, sql);
  }
  async batch(statements) {
    this.db.exec("BEGIN");
    try {
      const results = [];
      for (const s of statements) results.push(await s.run());
      this.db.exec("COMMIT");
      return results;
    } catch (e) {
      this.db.exec("ROLLBACK");
      throw e;
    }
  }
}
async function load(path) {
  const b = await build({
    entryPoints: [path],
    bundle: true,
    platform: "node",
    format: "esm",
    target: "es2022",
    write: false,
  });
  return import(
    "data:text/javascript;base64," +
      Buffer.from(b.outputFiles[0].text + "\n//" + randomUUID()).toString(
        "base64",
      )
  );
}
function create(before = false) {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys=ON");
  for (const file of readdirSync("migrations")
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    if (before && file.startsWith("0044")) continue;
    sqlite.exec(readFileSync("migrations/" + file, "utf8"));
  }
  return { sqlite, db: new Database(sqlite) };
}
const logic = await load("functions/_lib/admin-workspace.ts");
const shared = await load("shared/admin-workspace.ts");
const planner = await load("functions/api/admin/planner.ts");
const today = "2026-10-31";

test('planner rejects stale creation, update and clear against the current week', async () => {
  const { sqlite, db } = create();
  try {
    const week = '2026-11-09';
    const env = { DB: db, ADMIN_PASSWORD: 'fixture-only' };
    const url = `https://www.whalewzrd.com/api/admin/planner?week=${week}`;
    const headers = { 'X-Admin-Password': env.ADMIN_PASSWORD, 'Content-Type': 'application/json' };
    const read = async () => (await planner.onRequestGet({ request: new Request(url, { headers }), env })).json();
    const write = (expectedUpdatedAt, data) => planner.onRequestPost({
      request: new Request(url, { method: 'POST', headers, body: JSON.stringify({ week, expectedUpdatedAt, data }) }), env,
    });
    const goals = (text) => ({ goals: [{ id: 'goal', text, done: false }] });
    assert.equal((await read()).updatedAt, null);
    const first = await (await write(null, goals('first'))).json();
    assert.equal(first.success, true);
    assert.equal((await write(undefined, goals('previous application build'))).status, 428);
    assert.equal((await write(null, goals('other tab'))).status, 409);
    const latest = await (await write(first.updatedAt, goals('latest'))).json();
    assert.notEqual(latest.updatedAt, first.updatedAt);
    assert.equal((await write(first.updatedAt, goals('stale'))).status, 409);
    const staleClear = await write(first.updatedAt, {});
    assert.equal(staleClear.status, 409);
    assert.equal((await staleClear.json()).code, 'PLANNER_CONFLICT');
    assert.equal((await read()).data.goals[0].text, 'latest');
    const cleared = await (await write(latest.updatedAt, {})).json();
    assert.equal(cleared.cleared, true);
    assert.equal((await read()).updatedAt, null);
  } finally {
    sqlite.close();
  }
});

test('DA-127: повтор той же недели после потерянного ответа — не конфликт, другое содержимое — конфликт', async () => {
  const { sqlite, db } = create();
  try {
    const week = '2026-11-16';
    const env = { DB: db, ADMIN_PASSWORD: 'fixture-only' };
    const url = `https://www.whalewzrd.com/api/admin/planner?week=${week}`;
    const headers = { 'X-Admin-Password': env.ADMIN_PASSWORD, 'Content-Type': 'application/json' };
    const write = async (expectedUpdatedAt, data) => (await planner.onRequestPost({
      request: new Request(url, { method: 'POST', headers, body: JSON.stringify({ week, expectedUpdatedAt, data }) }), env,
    }));
    const goals = (text) => ({ goals: [{ id: 'goal', text, done: false }] });
    const first = await (await write(null, goals('первая'))).json();
    // Ответ на вторую запись потерян: браузер повторяет её с версией первой.
    const second = await (await write(first.updatedAt, goals('вторая'))).json();
    const replayResponse = await write(first.updatedAt, goals('вторая'));
    assert.equal(replayResponse.status, 200, 'точный повтор — успех');
    const replay = await replayResponse.json();
    assert.equal(replay.updatedAt, second.updatedAt, 'возвращается записанная версия');
    // Повтор самой первой записи тоже распознаётся.
    assert.equal((await write(null, goals('вторая'))).status, 200);
    // Другое содержимое со старой версией — по-прежнему конфликт.
    assert.equal((await write(first.updatedAt, goals('третья из другой вкладки'))).status, 409);
  } finally {
    sqlite.close();
  }
});

test('planner draft storage keeps independent edits and only removes the selected snapshot', async () => {
  const { findPlannerDraft, plannerDraftKey, removePlannerDraft, storePlannerDraft } =
    await load('src/app/components/admin/plannerDrafts.ts');
  const { emptyWeek } = await load('src/app/components/admin/plannerModel.ts');
  const { window } = new JSDOM('', { url: 'https://example.test' });
  const previousStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: window.localStorage });
  try {
    const week = '2026-11-09';
    const first = plannerDraftKey(week, 'first');
    const second = plannerDraftKey(week, 'second');
    const data = { ...emptyWeek(), goals: [{ id: 'goal', text: 'Черновик', done: false }] };
    const revision = '2026-11-13T00:00:00.000Z';
    assert.equal(storePlannerDraft(first, data, revision), true);
    assert.equal(storePlannerDraft(second, { ...data, goals: [{ id: 'other', text: 'Другая вкладка', done: false }] }, null), true);
    const draft = findPlannerDraft(week, emptyWeek(), second);
    assert.deepEqual(draft.data, data);
    assert.equal(draft.version, revision);
    removePlannerDraft(first, draft.savedAt - 1);
    assert.ok(window.localStorage.getItem(first));
    assert.equal(findPlannerDraft(week, data, second), null);
    assert.equal(window.localStorage.getItem(first), null);
    assert.ok(window.localStorage.getItem(second));
    const expired = JSON.parse(window.localStorage.getItem(second));
    window.localStorage.setItem(second, JSON.stringify({ ...expired, savedAt: 1 }));
    assert.equal(findPlannerDraft(week, emptyWeek(), first), null);
    assert.equal(window.localStorage.getItem(second), null);
  } finally {
    if (previousStorage) Object.defineProperty(globalThis, 'localStorage', previousStorage);
    else delete globalThis.localStorage;
    window.close();
  }
});

function client(s, name = "Антон") {
  return Number(
    s.prepare("INSERT INTO clients(name) VALUES(?)").run(name).lastInsertRowid,
  );
}
async function invoice(db, client_id, extra = {}) {
  return logic.workspaceMutation(
    db,
    {
      action: "save_invoice",
      client_id,
      status: "issued",
      amount: 1200,
      currency: "USD",
      kind: "consultation",
      issued_at: today,
      due_at: today,
      request_key: randomUUID(),
      ...extra,
    },
    today,
  );
}

test("old paid history migrates once, missing payment date stays unknown", () => {
  const { sqlite, db } = create(true);
  assert.equal(
    sqlite
      .prepare(
        "SELECT count(*) AS n FROM sqlite_master WHERE name='invoice_payments'",
      )
      .get().n,
    0,
  );
  sqlite.exec(
    "INSERT INTO invoices(amount,status,paid_at) VALUES(300,'paid',NULL)",
  );
  sqlite.exec(readFileSync("migrations/0044_connected_workspace.sql", "utf8"));
  const p = sqlite.prepare("SELECT * FROM invoice_payments").get();
  assert.equal(p.amount_cents, 30000);
  assert.equal(p.paid_on, null);
  sqlite.close();
});
test("partial receipts, replay, overpayment, closing reminder, and correction share one balance", async () => {
  const { sqlite, db } = create();
  const cid = client(sqlite);
  const { id } = await invoice(db, cid);
  const key = randomUUID();
  await logic.workspaceMutation(
    db,
    { action: "remind_invoice", invoice_id: id, due_at: today },
    today,
  );
  const payment = {
    action: "record_payment",
    invoice_id: id,
    amount: 600,
    paid_on: today,
    request_key: key,
  };
  await logic.workspaceMutation(db, payment, today);
  await logic.workspaceMutation(db, payment, today);
  let [i] = await logic.readLedgerInvoices(db);
  assert.equal(shared.invoiceOutstanding(i), 600);
  assert.equal(i.payments.length, 1);
  await assert.rejects(
    logic.workspaceMutation(
      db,
      { ...payment, amount: 700, request_key: randomUUID() },
      today,
    ),
  );
  await assert.rejects(
    logic.workspaceMutation(db, { ...payment, amount: 1 }, today),
    /другие данные/,
  );
  await logic.workspaceMutation(
    db,
    { ...payment, request_key: randomUUID() },
    today,
  );
  [i] = await logic.readLedgerInvoices(db);
  assert.equal(i.status, "paid");
  assert.equal(shared.invoiceReceived(i), 1200);
  assert.equal(sqlite.prepare("SELECT done FROM client_tasks").get().done, 1);
  const reminder = sqlite.prepare("SELECT * FROM client_tasks").get();
  await assert.rejects(
    logic.workspaceMutation(db, { action: "remind_invoice", invoice_id: id, due_at: today }, today),
    /нет задолженности/,
  );
  await assert.rejects(
    logic.workspaceMutation(db, { ...reminder, action: "save_task", done: false }, today),
    /Обновите данные/,
  );
  assert.equal(sqlite.prepare("SELECT done FROM client_tasks").get().done, 1);
  await logic.workspaceMutation(
    db,
    {
      action: "void_payment",
      id: i.payments[1].id,
      reason: "Повторная запись",
    },
    today,
  );
  [i] = await logic.readLedgerInvoices(db);
  assert.equal(i.status, "issued");
  assert.equal(shared.invoiceOutstanding(i), 600);
  assert.equal(i.payments.length, 2);
  sqlite.close();
});

test("concurrent payment retries return the recorded payment and reject changed details", async () => {
  const { sqlite, db } = create();
  const { id } = await invoice(db, client(sqlite));
  const payload = { action: "record_payment", invoice_id: id, amount: 600, paid_on: today, note: "Первый платёж", request_key: randomUUID() };
  const [first, retry] = await Promise.all([
    logic.workspaceMutation(db, payload, today),
    logic.workspaceMutation(db, payload, today),
  ]);
  assert.equal(first.paymentId, retry.paymentId);
  const secondKey = randomUUID();
  const pair = await Promise.allSettled([
    logic.workspaceMutation(db, { ...payload, request_key: secondKey }, today),
    logic.workspaceMutation(db, { ...payload, request_key: secondKey, note: "Изменённое примечание" }, today),
  ]);
  assert.equal(pair.filter((result) => result.status === 'fulfilled').length, 1);
  assert.match(pair.find((result) => result.status === 'rejected').reason.message, /другие данные/);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM invoice_payments").get().n, 2);
  sqlite.close();
});

test("concurrent conversion of one lead resolves to the same client", async () => {
  const { sqlite, db } = create();
  const api = await load("functions/api/admin/clients.ts");
  const leadId = Number(sqlite.prepare("INSERT INTO leads (event_id, name, email, phone, status) VALUES ('lead-conversion', 'Проверка', '', '', 'new')").run().lastInsertRowid);
  const call = () => api.onRequestPost({
    env: { DB: db, ADMIN_PASSWORD: 'audit-test' },
    request: new Request("https://example.test/api/admin/clients", {
      method: "POST", headers: { "X-Admin-Password": "audit-test", "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", lead_id: leadId, name: "Связанный клиент" }),
    }),
  });
  const responses = await Promise.all([call(), call()]);
  const saved = await responses.find((response) => response.status === 200)?.json();
  const repeated = await responses.find((response) => response.status === 409)?.json();
  assert.ok(saved?.id);
  assert.equal(repeated?.clientId, saved.id);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM clients WHERE lead_id=?").get(leadId).n, 1);
  sqlite.close();
});
test("database rejects race overpayment and mismatched client/work", async () => {
  const { sqlite, db } = create();
  const c1 = client(sqlite),
    c2 = client(sqlite, "Другой");
  const w = await logic.workspaceMutation(
    db,
    {
      action: "save_work",
      client_id: c1,
      title: "Google",
      kind: "project",
      status: "active",
      billing: "monthly",
      amount: 1200,
      request_key: randomUUID(),
    },
    today,
  );
  await assert.rejects(invoice(db, c2, { work_id: w.id }), /другому клиенту/);
  const { id } = await invoice(db, c1, { work_id: w.id });
  await db
    .prepare(
      "INSERT INTO invoice_payments(invoice_id,amount_cents,paid_on,request_key) VALUES(?,?,?,?)",
    )
    .bind(id, 100000, today, randomUUID())
    .run();
  await assert.rejects(
    db
      .prepare(
        "INSERT INTO invoice_payments(invoice_id,amount_cents,paid_on,request_key) VALUES(?,?,?,?)",
      )
      .bind(id, 30000, today, randomUUID())
      .run(),
    /EXCEEDS_BALANCE/,
  );
  await assert.rejects(
    db.prepare("UPDATE invoices SET client_id=? WHERE id=?").bind(c2, id).run(),
  );
  sqlite.close();
});
test("drafts, proposals, invalid dates, cancelled invoices cannot create paid income", async () => {
  const { sqlite, db } = create();
  const c = client(sqlite);
  const { id } = await invoice(db, c, { status: "draft" });
  await assert.rejects(
    logic.workspaceMutation(
      db,
      {
        action: "record_payment",
        invoice_id: id,
        amount: 50,
        paid_on: today,
        request_key: randomUUID(),
      },
      today,
    ),
  );
  await assert.rejects(invoice(db, c, { issued_at: "2026-02-31" }), /дату/);
  await assert.rejects(
    invoice(db, c, { status: "paid", paid_at: "2026-11-01" }),
    /будущем/,
  );
  const w = await logic.workspaceMutation(
    db,
    {
      action: "save_work",
      client_id: c,
      title: "Возможный аудит",
      kind: "service",
      status: "proposed",
      billing: "one_off",
      amount: 500,
      request_key: randomUUID(),
    },
    today,
  );
  await assert.rejects(
    logic.workspaceMutation(
      db,
      { action: "issue_work", work_id: w.id, request_key: randomUUID() },
      today,
    ),
    /согласуйте/,
  );
  assert.equal(
    sqlite.prepare("SELECT count(*) AS n FROM invoice_payments").get().n,
    0,
  );
  sqlite.close();
});
test("monthly generation bills each project once and does not double legacy retainer", async () => {
  const { sqlite, db } = create();
  const c = client(sqlite);
  sqlite.prepare("UPDATE clients SET retainer_amount=3000 WHERE id=?").run(c);
  for (const [title, amount] of [
    ["Google", 1200],
    ["Meta", 900],
  ])
    await logic.workspaceMutation(
      db,
      {
        action: "save_work",
        client_id: c,
        title,
        kind: "project",
        status: "active",
        billing: "monthly",
        amount,
        request_key: randomUUID(),
      },
      today,
    );
  const first = await logic.workspaceMutation(
    db,
    { action: "issue_month", period: "2026-11" },
    today,
  );
  const again = await logic.workspaceMutation(
    db,
    { action: "issue_month", period: "2026-11" },
    today,
  );
  assert.equal(first.created, 2);
  assert.equal(first.active_clients, 1);
  assert.equal(again.created, 0);
  assert.equal(
    sqlite.prepare("SELECT sum(amount) AS amount FROM invoices").get().amount,
    2100,
  );
  sqlite.close();
});
test("old mark-paid write is reflected in ledger once; dated monthly receipts split correctly", async () => {
  const { sqlite, db } = create();
  const c = client(sqlite);
  const { id } = await invoice(db, c);
  await logic.workspaceMutation(
    db,
    {
      action: "record_payment",
      invoice_id: id,
      amount: 500,
      paid_on: "2026-09-30",
      request_key: randomUUID(),
    },
    today,
  );
  sqlite
    .prepare("UPDATE invoices SET status='paid',paid_at=? WHERE id=?")
    .run(today, id);
  sqlite
    .prepare("UPDATE invoices SET status='paid',paid_at=? WHERE id=?")
    .run(today, id);
  const [i] = await logic.readLedgerInvoices(db);
  assert.deepEqual(
    shared.invoiceReceipts(i).map((p) => [p.amount, p.day]),
    [
      [500, "2026-09-30"],
      [700, today],
    ],
  );
  await assert.rejects(
    logic.workspaceMutation(db, { action: "delete_invoice", id }, today),
    /историей/,
  );
  sqlite.close();
});
test("optimistic revisions reject stale changes and task links stay immutable", async () => {
  const { sqlite, db } = create();
  const c = client(sqlite);
  const input = {
    action: "save_work",
    client_id: c,
    title: "Проект",
    kind: "project",
    status: "active",
    billing: "one_off",
    amount: 100,
    request_key: randomUUID(),
  };
  const w = await logic.workspaceMutation(db, input, today);
  await logic.workspaceMutation(
    db,
    { ...input, id: w.id, revision: 1, title: "Новое имя" },
    today,
  );
  await assert.rejects(
    logic.workspaceMutation(db, { ...input, id: w.id, revision: 1 }, today),
    /уже изменена/,
  );
  assert.equal(await logic.hasWorkspace(db), true);
  sqlite.close();
  const old = create(true);
  assert.equal(await logic.hasWorkspace(old.db), false);
  old.sqlite.close();
});

test('workspace API authenticates, explains missing schema, and returns persisted relations', async()=>{
  const api=await load('functions/api/admin/workspace.ts');
  const current=create(),old=create(true);
  const call=(db,body,password='test-only')=>api[body===undefined?'onRequestGet':'onRequestPost']({env:{DB:db,ADMIN_PASSWORD:'test-only'},request:new Request('https://example.test/api/admin/workspace',{method:body===undefined?'GET':'POST',headers:{'X-Admin-Password':password,'Content-Type':'application/json'},...(body===undefined?{}:{body:typeof body==='string'?body:JSON.stringify(body)})})});
  assert.equal((await call(current.db,undefined,'wrong')).status,401);
  assert.equal((await call(current.db,{action:'create_client',name:'Не создавать'},'wrong')).status,401);
  const missing=await call(old.db);assert.equal(missing.status,503);assert.equal((await missing.json()).code,'MIGRATION_REQUIRED');
  assert.equal((await call(current.db,'{bad')).status,400);
  const input={action:'create_client',name:'Покупатель консультации',request_key:randomUUID()};
  const a=await (await call(current.db,input)).json(),b=await (await call(current.db,input)).json();assert.equal(a.id,b.id);
  const output=await (await call(current.db)).json();assert.equal(output.clients.length,1);assert.equal(output.clients[0].relationship_type,'one_off');assert.deepEqual(output.times,[]);
  current.sqlite.exec('DROP TRIGGER payment_amount_guard');assert.equal((await call(current.db)).status,503);
  current.sqlite.close();old.sqlite.close();
});

test('DA-09: задача сделки из корзины не видна в рабочем месте клиента', async () => {
  const api = await load('functions/api/admin/workspace.ts');
  const { sqlite, db } = create();
  try {
    const leadId = Number(sqlite.prepare("INSERT INTO leads (event_id, name) VALUES ('ws-trash', 'Сделка')").run().lastInsertRowid);
    sqlite.prepare("INSERT INTO clients (name, lead_id) VALUES ('Клиент', ?)").run(leadId);
    sqlite.prepare("INSERT INTO crm_tasks (lead_id, title) VALUES (?, 'Позвонить')").run(leadId);
    const read = async () => (await api.onRequestGet({
      env: { DB: db, ADMIN_PASSWORD: 'test-only' },
      request: new Request('https://example.test/api/admin/workspace', { headers: { 'X-Admin-Password': 'test-only' } }),
    })).json();
    const before = await read();
    assert.equal(before.common.crmTasks.filter((item) => item.title === 'Позвонить').length, 1, 'задача видна, пока сделка активна');
    sqlite.prepare("UPDATE leads SET deleted_at = datetime('now') WHERE id = ?").run(leadId);
    const after = await read();
    assert.equal(after.common.crmTasks.filter((item) => item.title === 'Позвонить').length, 0, 'после корзины задачи нет');
  } finally {
    sqlite.close();
  }
});

test('old undated paid invoice can be linked without inventing a receipt date',async()=>{
  const {sqlite,db}=create(true);sqlite.exec("INSERT INTO invoices(amount,status,paid_at,kind,payer) VALUES(300,'paid',NULL,'consultation','Старый покупатель')");sqlite.exec(readFileSync('migrations/0044_connected_workspace.sql','utf8'));
  const cid=client(sqlite),[old]=await logic.readLedgerInvoices(db);await logic.workspaceMutation(db,{...old,action:'save_invoice',client_id:cid},today);
  const [linked]=await logic.readLedgerInvoices(db);assert.equal(linked.client_id,cid);assert.equal(linked.paid_at,null);assert.equal(linked.payments[0].paid_on,null);assert.equal(shared.invoiceReceived(linked),300);sqlite.close();
});

test('task edits, reports, time and recurring invoices retain project/client links',async()=>{
  const {sqlite,db}=create(),cid=client(sqlite),other=client(sqlite,'Другой');
  const {id:work}=await logic.workspaceMutation(db,{action:'save_work',client_id:cid,kind:'project',title:'Проект',service:'google',status:'active',billing:'monthly',amount:1200,request_key:randomUUID()},today);
  const record={action:'save_time',client_id:cid,work_id:work,hours:2.5,day:today,note:'Аналитика',request_key:randomUUID()};await logic.workspaceMutation(db,record,today);await logic.workspaceMutation(db,record,today);assert.equal(sqlite.prepare('SELECT sum(hours) AS h FROM time_entries').get().h,2.5);
  await assert.rejects(logic.workspaceMutation(db,{...record,client_id:other,request_key:randomUUID()},today),/другому клиенту/);
  await logic.workspaceMutation(db,{action:'save_task',client_id:cid,work_id:work,title:'Первый шаг',request_key:randomUUID()},today);
  const task=sqlite.prepare('SELECT * FROM client_tasks').get();await logic.workspaceMutation(db,{...task,action:'save_task',title:'Обновлённый шаг',due_at:today},today);assert.equal(sqlite.prepare('SELECT title FROM client_tasks').get().title,'Обновлённый шаг');
  await logic.workspaceMutation(db,{action:'save_month',work_id:work,month:'2026-10',spend:null,leads:0,sales:null,revenue:null,currency:'RUB'},today);assert.equal(sqlite.prepare('SELECT spend FROM client_work_months').get().spend,null);assert.equal(sqlite.prepare('SELECT currency FROM client_work_months').get().currency,'USD');
  const first=await logic.workspaceMutation(db,{action:'issue_work',work_id:work,period:'2026-10',request_key:randomUUID()},today),again=await logic.workspaceMutation(db,{action:'issue_work',work_id:work,period:'2026-10',request_key:randomUUID()},today);assert.equal(first.id,again.id);
  sqlite.prepare("UPDATE invoices SET status='cancelled' WHERE id=?").run(first.id);
  const replacement=await logic.workspaceMutation(db,{action:'issue_work',work_id:work,period:'2026-10',request_key:randomUUID()},today);assert.notEqual(first.id,replacement.id);assert.equal(sqlite.prepare("SELECT count(*) AS n FROM invoices WHERE status!='cancelled'").get().n,1);sqlite.close();
});

test('workspace creates completed tasks and checks exact counts and revisions for monthly reports', async () => {
  const { sqlite, db } = create();
  try {
    const clientId = client(sqlite);
    const { id: workId } = await logic.workspaceMutation(db, {
      action: 'save_work', client_id: clientId, kind: 'project', title: 'Проект',
      status: 'active', billing: 'monthly', amount: 100, request_key: randomUUID(),
    }, today);
    await logic.workspaceMutation(db, {
      action: 'save_task', client_id: clientId, work_id: workId, title: 'Готово',
      done: true, request_key: randomUUID(),
    }, today);
    assert.equal(sqlite.prepare('SELECT done FROM client_tasks').get().done, 1);
    const report = { action: 'save_month', work_id: workId, month: '2026-10', leads: 10 };
    await assert.rejects(logic.workspaceMutation(db, { ...report, leads: 0.001 }, today), /целым/);
    await assert.rejects(logic.workspaceMutation(db, { ...report, revision: 1 }, today), /изменены/);
    const results = await Promise.allSettled([
      logic.workspaceMutation(db, report, today),
      logic.workspaceMutation(db, report, today),
    ]);
    assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
    assert.equal(results.find((result) => result.status === 'rejected').reason.status, 409);
    assert.equal(sqlite.prepare('SELECT leads FROM client_work_months').get().leads, 10);
  } finally {
    sqlite.close();
  }
});

test('client summary uses projects, excludes one-off retainers and explains linked deletion',async()=>{
  const {sqlite,db}=create(),api=await load('functions/api/admin/clients.ts');const cid=client(sqlite),oneoff=client(sqlite,'Консультация');
  sqlite.prepare("UPDATE clients SET relationship_type='one_off',retainer_amount=600 WHERE id=?").run(oneoff);sqlite.prepare('UPDATE clients SET retainer_amount=3000 WHERE id=?').run(cid);
  for(const amount of [1200,900])await logic.workspaceMutation(db,{action:'save_work',client_id:cid,kind:'project',title:'Проект '+amount,status:'active',billing:'monthly',amount,request_key:randomUUID()},today);
  const env={DB:db,ADMIN_PASSWORD:'test-only'},headers={'X-Admin-Password':'test-only','Content-Type':'application/json'};
  const list=await api.onRequestGet({env,request:new Request('https://example.test/api/admin/clients',{headers})});const p=await list.json();assert.deepEqual(p.summary.recurring,[{currency:'USD',amount:2100}]);assert.equal(p.summary.withoutRetainer,0);
  const removed=await api.onRequestPost({env,request:new Request('https://example.test/api/admin/clients',{method:'POST',headers,body:JSON.stringify({action:'delete',id:cid})})});assert.equal(removed.status,409);assert.equal(sqlite.prepare('SELECT count(*) AS n FROM clients').get().n,2);sqlite.close();
});

// ─── Пакет 4c: повторы, удаления и счета рабочего места ─────────────────────

test('DA-10, FX-04: повтор создания работы, задачи и ресурса с другими данными — конфликт, точный повтор — та же запись', async () => {
  const { sqlite, db } = create();
  const cid = client(sqlite);
  const work = { action: 'save_work', client_id: cid, kind: 'project', billing: 'monthly', status: 'active', title: 'Ведение', service: 'meta', amount: 100, request_key: randomUUID() };
  const first = await logic.workspaceMutation(db, work, today);
  assert.equal((await logic.workspaceMutation(db, work, today)).id, first.id, 'точный повтор возвращает ту же работу');
  await assert.rejects(logic.workspaceMutation(db, { ...work, amount: 200 }, today), /другие данные/);
  assert.equal(sqlite.prepare('SELECT amount FROM client_work WHERE id=?').get(first.id).amount, 100);

  const task = { action: 'save_task', client_id: cid, work_id: first.id, title: 'Отчёт', due_at: today, request_key: randomUUID() };
  const taskId = (await logic.workspaceMutation(db, task, today)).id;
  assert.ok(taskId);
  assert.equal((await logic.workspaceMutation(db, task, today)).id, taskId);
  await assert.rejects(logic.workspaceMutation(db, { ...task, title: 'Другая задача' }, today), /другие данные/);
  assert.equal(sqlite.prepare('SELECT count(*) AS n FROM client_tasks').get().n, 1);

  const resource = { action: 'save_resource', work_id: first.id, kind: 'link', title: 'Кабинет', url: 'https://example.com/ads', request_key: randomUUID() };
  const resourceId = (await logic.workspaceMutation(db, resource, today)).id;
  assert.equal((await logic.workspaceMutation(db, resource, today)).id, resourceId);
  await assert.rejects(logic.workspaceMutation(db, { ...resource, title: 'Другой' }, today), /другие данные/);
  sqlite.close();
});

test('DA-11: профиль удалённого клиента не сохраняется молча, повтор удаления счёта различим', async () => {
  const { sqlite, db } = create();
  const cid = client(sqlite);
  // Клиента удаляют между проверкой существования и записью профиля.
  const racing = {
    prepare(sql) {
      if (sql.startsWith('UPDATE clients SET needs')) sqlite.prepare('DELETE FROM clients WHERE id=?').run(cid);
      return db.prepare(sql);
    },
    batch: (statements) => db.batch(statements),
  };
  await assert.rejects(
    logic.workspaceMutation(racing, { action: 'save_profile', client_id: cid, relationship_type: 'ongoing' }, today),
    /Клиент не найден/,
  );
  const other = client(sqlite, 'Борис');
  const { id } = await invoice(db, other);
  assert.equal((await logic.workspaceMutation(db, { action: 'delete_invoice', id }, today)).deleted, 1);
  assert.equal((await logic.workspaceMutation(db, { action: 'delete_invoice', id }, today)).deleted, 0, 'второй раз — счёта уже нет');
  sqlite.close();
});

test('DA-52: массовое выставление называет неготовый черновик отдельно от выставленного счёта', async () => {
  const { sqlite, db } = create();
  const withDraft = client(sqlite, 'С черновиком');
  const withIssued = client(sqlite, 'С выставленным');
  // Оба работают с начала года: счёт за месяц до начала работы не выставляется (DA-99).
  sqlite.prepare("UPDATE clients SET started_at='2026-01-01'").run();
  const period = '2026-10';
  const project = async (cid) => (await logic.workspaceMutation(db, {
    action: 'save_work', client_id: cid, kind: 'project', billing: 'monthly', status: 'active', title: 'Ведение', service: 'meta', amount: 500, request_key: randomUUID(),
  }, today)).id;
  const draftWork = await project(withDraft);
  await project(withIssued);
  await logic.workspaceMutation(db, { action: 'issue_work', work_id: draftWork, period, request_key: randomUUID() }, today);
  assert.equal(sqlite.prepare("SELECT status FROM invoices WHERE work_id=?").get(draftWork).status, 'draft');
  const first = await logic.workspaceMutation(db, { action: 'issue_month', period, request_key: randomUUID() }, today);
  assert.equal(first.created, 1, 'выставлен счёт клиенту без черновика');
  assert.equal(first.skipped_drafts, 1, 'черновик назван отдельно');
  assert.equal(first.skipped, 0, 'черновик не выдаётся за выставленный счёт');
  const again = await logic.workspaceMutation(db, { action: 'issue_month', period, request_key: randomUUID() }, today);
  assert.equal(again.created, 0);
  assert.equal(again.skipped, 1, 'выставленный счёт — «уже есть»');
  assert.equal(again.skipped_drafts, 1);
  sqlite.close();
});

test('DA-53: отмена оплаты возвращает напоминание, которое закрыла оплата, и не трогает закрытое владельцем', async () => {
  const { sqlite, db } = create();
  const cid = client(sqlite);
  const pay = async (invoiceId) => logic.workspaceMutation(db, { action: 'record_payment', invoice_id: invoiceId, amount: 1200, paid_on: today, request_key: randomUUID() }, today);
  const paymentOf = (invoiceId) => sqlite.prepare('SELECT id FROM invoice_payments WHERE invoice_id=?').get(invoiceId).id;
  const taskOf = (invoiceId) => sqlite.prepare('SELECT * FROM client_tasks WHERE invoice_id=?').get(invoiceId);

  const auto = (await invoice(db, cid)).id;
  await logic.workspaceMutation(db, { action: 'remind_invoice', invoice_id: auto, due_at: today }, today);
  await pay(auto);
  assert.equal(taskOf(auto).done, 1, 'оплата закрыла напоминание');
  const voided = await logic.workspaceMutation(db, { action: 'void_payment', id: paymentOf(auto), reason: 'Ошибка' }, today);
  assert.equal(voided.reopened, 1);
  assert.equal(taskOf(auto).done, 0, 'долг вернулся — напоминание снова открыто');

  const manual = (await invoice(db, cid)).id;
  await logic.workspaceMutation(db, { action: 'remind_invoice', invoice_id: manual, due_at: today }, today);
  const reminder = taskOf(manual);
  await logic.workspaceMutation(db, { ...reminder, action: 'save_task', done: true }, today);
  // Владелец закрыл напоминание раньше, чем пришла оплата.
  sqlite.prepare("UPDATE client_tasks SET updated_at='2026-10-01 09:00:00' WHERE invoice_id=?").run(manual);
  await pay(manual);
  const kept = await logic.workspaceMutation(db, { action: 'void_payment', id: paymentOf(manual), reason: 'Ошибка' }, today);
  assert.equal(kept.reopened, 0);
  assert.equal(taskOf(manual).done, 1, 'закрытое владельцем остаётся закрытым');
  sqlite.close();
});

test('CL-40: выставленный счёт на 0 не сохраняется, черновик — можно', async () => {
  const { sqlite, db } = create();
  const cid = client(sqlite);
  await assert.rejects(invoice(db, cid, { amount: 0 }), /больше нуля/);
  await assert.rejects(invoice(db, cid, { amount: 0, status: 'paid', paid_at: today }), /больше нуля/);
  const draft = await invoice(db, cid, { amount: 0, status: 'draft' });
  assert.ok(draft.id);
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM invoices WHERE status!='draft'").get().n, 0);
  sqlite.close();
});
