import type {
  ClientWork,
  WorkInvoice,
  WorkPayment,
} from "../../shared/admin-workspace";
import { invoiceOutstanding } from "../../shared/admin-workspace";
import { parseMoney, ACCOUNTING_CURRENCY } from "./money";
import { MIGRATION_BY_TABLE } from './migration-tables';

export const WORKSPACE_MIGRATION = MIGRATION_BY_TABLE.client_work;
export class WorkspaceError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export const textValue = (v: unknown, limit = 2000) =>
  String(v ?? "")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .trim()
    .slice(0, limit);
export function positiveId(v: unknown, optional = false): number | null {
  if (optional && (v === undefined || v === null || v === "" || v === 0))
    return null;
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n <= 0)
    throw new WorkspaceError("Некорректная ссылка на запись");
  return n;
}
export function strictDate(v: unknown, optional = true): string | null {
  if (optional && (v === null || v === undefined || v === "")) return null;
  const day = String(v);
  const parsed = new Date(`${day}T12:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== day
  )
    throw new WorkspaceError("Укажите существующую дату");
  return day;
}
function amountValue(v: unknown, nullable = false): number | null {
  if (nullable && (v === null || v === undefined || v === "")) return null;
  const n = parseMoney(v);
  if (n === null) throw new WorkspaceError("Укажите корректную сумму");
  return n;
}
function monthValue(v: unknown): string {
  const m = String(v || "");
  strictDate(`${m}-01`, false);
  return m;
}
function choice(v: unknown, values: string[], fallback?: string): string {
  const s = String(v ?? fallback ?? "");
  if (!values.includes(s))
    throw new WorkspaceError("Недопустимое значение поля");
  return s;
}
function required(v: unknown, label: string, limit = 200): string {
  const s = textValue(v, limit);
  if (!s) throw new WorkspaceError(label);
  return s;
}
function requestKey(v: unknown): string {
  const key = String(v || "");
  if (!/^[a-zA-Z0-9:_-]{16,150}$/.test(key))
    throw new WorkspaceError(
      "Нужен идентификатор операции. Обновите страницу.",
    );
  return key;
}
function safeUrl(v: unknown): string {
  const s = textValue(v, 1000);
  if (!s) return "";
  try {
    const u = new URL(s, "https://www.whalewzrd.com");
    if (!["http:", "https:"].includes(u.protocol) || u.username || u.password)
      throw 0;
    return u.href;
  } catch {
    throw new WorkspaceError(
      "Нужна обычная ссылка https:// без логина и пароля",
    );
  }
}
export async function hasWorkspace(db: D1Database): Promise<boolean> {
  const row = await db
    .prepare(
      "SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name IN ('client_work','invoice_payments','client_tasks','client_work_resources','client_work_months','client_work_activity')",
    )
    .first<{ count: number }>();
  if (Number(row?.count) !== 6) return false;
  const columns = await db
    .prepare(
      "SELECT count(*) AS n FROM pragma_table_info('clients') WHERE name IN ('needs','interests','relationship_type','workspace_key')",
    )
    .first<{ n: number }>();
  const triggers = await db
    .prepare(
      "SELECT count(*) AS n FROM sqlite_master WHERE type='trigger' AND name IN ('payment_amount_guard','payment_sync_invoice','payment_void_sync','invoice_ledger_guard','invoice_paid_insert','invoice_paid_update','invoice_work_guard_insert','invoice_work_guard_update','work_created_history','work_changed_history','task_created_history','task_changed_history','invoice_reminder_links','time_work_guard_insert','time_work_guard_update')",
    )
    .first<{ n: number }>();
  const links = await db.prepare("SELECT (SELECT count(*) FROM pragma_table_info('invoices') WHERE name IN ('work_id','request_key')) + (SELECT count(*) FROM pragma_table_info('time_entries') WHERE name IN ('work_id','request_key')) AS n").first<{n:number}>();
  return columns?.n === 4 && triggers?.n === 15 && links?.n === 4;
}
export async function readLedgerInvoices(
  db: D1Database,
): Promise<WorkInvoice[]> {
  const [rows, receipts] = await Promise.all([
    db
      .prepare(
        "SELECT * FROM invoices ORDER BY COALESCE(issued_at,created_at) DESC,id DESC",
      )
      .all<WorkInvoice>(),
    db
      .prepare("SELECT * FROM invoice_payments ORDER BY paid_on,id")
      .all<WorkPayment>(),
  ]);
  const byId = new Map<number, WorkPayment[]>();
  for (const p of receipts.results || [])
    byId.set(p.invoice_id, [...(byId.get(p.invoice_id) || []), p]);
  return (rows.results || []).map((i) => ({
    ...i,
    payments: byId.get(i.id) || [],
  }));
}
async function clientExists(db: D1Database, id: number | null) {
  if (
    id &&
    !(await db.prepare("SELECT id FROM clients WHERE id=?").bind(id).first())
  )
    throw new WorkspaceError("Клиент не найден", 404);
}
async function workExists(
  db: D1Database,
  id: number | null,
  clientId?: number | null,
): Promise<ClientWork | null> {
  if (!id) return null;
  const w = await db
    .prepare("SELECT * FROM client_work WHERE id=?")
    .bind(id)
    .first<ClientWork>();
  if (!w) throw new WorkspaceError("Проект или услуга не найдены", 404);
  if (clientId !== undefined && w.client_id !== clientId)
    throw new WorkspaceError("Проект относится к другому клиенту");
  return w;
}
function revisionValue(v: unknown): number {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 1)
    throw new WorkspaceError("Обновите запись перед сохранением", 409);
  return n;
}
async function revisionCheck(
  db: D1Database,
  table: "client_work" | "client_tasks" | "client_work_resources",
  id: number,
  revision: unknown,
) {
  const row = await db
    .prepare(`SELECT revision FROM ${table} WHERE id=?`)
    .bind(id)
    .first<{ revision: number }>();
  if (!row) throw new WorkspaceError("Запись не найдена", 404);
  if (row.revision !== revisionValue(revision))
    throw new WorkspaceError(
      "Запись уже изменена. Обновите данные и повторите правку.",
      409,
    );
}
function checkChanges(result: D1Result) {
  if (!result.meta?.changes)
    throw new WorkspaceError("Запись уже изменена. Обновите данные.", 409);
}

export async function workspaceMutation(
  db: D1Database,
  body: Record<string, unknown>,
  today: string,
): Promise<Record<string, unknown>> {
  const action = String(body.action || "");
  if (action === "save_profile") {
    const id = positiveId(body.client_id);
    await clientExists(db, id);
    await db
      .prepare(
        "UPDATE clients SET needs=?,interests=?,relationship_type=?,updated_at=datetime('now') WHERE id=?",
      )
      .bind(
        textValue(body.needs),
        textValue(body.interests),
        choice(body.relationship_type, ["ongoing", "one_off"]),
        id,
      )
      .run();
    return { success: true };
  }
  if (action === "create_client") {
    const key = requestKey(body.request_key);
    const name = required(body.name, "Нужно имя клиента", 160);
    await db
      .prepare(
        "INSERT OR IGNORE INTO clients(name,contact_method,contact_value,relationship_type,started_at,workspace_key) VALUES(?,?,?,?,?,?)",
      )
      .bind(
        name,
        textValue(body.contact_method, 40),
        textValue(body.contact_value, 200),
        choice(body.relationship_type, ["ongoing", "one_off"], "one_off"),
        today,
        key,
      )
      .run();
    const row = await db
      .prepare("SELECT id,name FROM clients WHERE workspace_key=?")
      .bind(key)
      .first<{ id: number; name: string }>();
    if (row?.name !== name)
      throw new WorkspaceError("Повтор операции содержит другие данные", 409);
    return { success: true, id: row?.id, clientId: row?.id };
  }
  if (action === "save_work") {
    const id = positiveId(body.id, true),
      clientId = positiveId(body.client_id);
    await clientExists(db, clientId);
    const previous = await workExists(db, id, clientId);
    if (id) await revisionCheck(db, "client_work", id, body.revision);
    const kind = choice(body.kind, ["project", "service"]);
    const billing = choice(body.billing, ["one_off", "monthly"]);
    if (kind === "service" && billing === "monthly")
      throw new WorkspaceError("Для ежемесячной работы создайте проект");
    const values = [
      required(body.title, "Нужно название"),
      textValue(body.service, 60) || "other",
      choice(body.status, [
        "proposed",
        "active",
        "paused",
        "completed",
        "cancelled",
      ]),
      billing,
      amountValue(body.amount),
      previous?.currency || ACCOUNTING_CURRENCY,
      Math.max(1, Math.min(28, Math.trunc(Number(body.billing_day) || 1))),
      strictDate(body.due_at),
      textValue(body.scope, 4000),
      textValue(body.media_folder, 300),
    ];
    if (previous && previous.kind !== kind)
      throw new WorkspaceError("Тип существующей работы менять нельзя");
    if (id) {
      checkChanges(
        await db
          .prepare(
            "UPDATE client_work SET title=?,service=?,status=?,billing=?,amount=?,currency=?,billing_day=?,due_at=?,scope=?,media_folder=?,revision=revision+1,updated_at=datetime('now') WHERE id=? AND revision=?",
          )
          .bind(...values, id, body.revision)
          .run(),
      );
    } else {
      const key = requestKey(body.request_key);
      await db
        .prepare(
          "INSERT OR IGNORE INTO client_work(title,service,status,billing,amount,currency,billing_day,due_at,scope,media_folder,client_id,kind,request_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(...values, clientId, kind, key)
        .run();
      const row = await db
        .prepare(
          "SELECT id,client_id,title FROM client_work WHERE request_key=?",
        )
        .bind(key)
        .first<{ id: number; client_id: number; title: string }>();
      if (row?.client_id !== clientId || row.title !== values[0])
        throw new WorkspaceError("Повтор операции содержит другие данные", 409);
      return { success: true, id: row.id };
    }
    return { success: true, id };
  }
  if (action === "save_task") {
    const id = positiveId(body.id, true),
      clientId = positiveId(body.client_id),
      workId = positiveId(body.work_id, true);
    await clientExists(db, clientId);
    await workExists(db, workId, clientId);
    const title = required(body.title, "Нужно название задачи"),
      due = strictDate(body.due_at),
      done = body.done === true || body.done === 1 ? 1 : 0;
    if (id) {
      await revisionCheck(db, "client_tasks", id, body.revision);
      checkChanges(
        await db
          .prepare(
            `UPDATE client_tasks SET title=?,due_at=?,done=?,note=?,revision=revision+1,updated_at=datetime('now')
             WHERE id=? AND revision=? AND client_id=? AND work_id IS ?
               AND (invoice_id IS NULL OR ?=1 OR EXISTS (SELECT 1 FROM invoices WHERE id=client_tasks.invoice_id AND status='issued'))`,
          )
          .bind(
            title,
            due,
            done,
            textValue(body.note),
            id,
            body.revision,
            clientId,
            workId,
            done,
          )
          .run(),
      );
    } else
      await db
        .prepare(
          "INSERT OR IGNORE INTO client_tasks(client_id,work_id,title,due_at,note,done,request_key) VALUES(?,?,?,?,?,?,?)",
        )
        .bind(
          clientId,
          workId,
          title,
          due,
          textValue(body.note),
          done,
          requestKey(body.request_key),
        )
        .run();
    return { success: true };
  }
  if (action === "remind_invoice") {
    const id = positiveId(body.invoice_id);
    const day = strictDate(body.due_at, false);
    if (day! < today)
      throw new WorkspaceError("Выберите сегодня или будущую дату");
    const result = await db
      .prepare(
        `INSERT INTO client_tasks(client_id,work_id,invoice_id,title,due_at)
        SELECT client_id,work_id,id,'Уточнить оплату счёта ' || COALESCE(NULLIF(number,''),'#' || id),?
        FROM invoices WHERE id=? AND client_id IS NOT NULL AND status='issued'
          AND CAST(round(amount * 100) AS INTEGER) > COALESCE(
            (SELECT sum(amount_cents) FROM invoice_payments WHERE invoice_id=invoices.id AND voided_at IS NULL),0)
      ON CONFLICT(invoice_id) WHERE invoice_id IS NOT NULL DO UPDATE SET title=excluded.title,due_at=excluded.due_at,done=0,revision=client_tasks.revision+1,updated_at=datetime('now')`,
      )
      .bind(day, id)
      .run();
    if (!result.meta?.changes) {
      const row = await db.prepare("SELECT client_id FROM invoices WHERE id=?").bind(id).first<{ client_id: number | null }>();
      if (!row?.client_id) throw new WorkspaceError("Сначала привяжите счёт к клиенту");
      throw new WorkspaceError("У этого счёта нет задолженности");
    }
    return { success: true };
  }
  if (action === "record_payment" || action === "mark_paid") {
    const id = positiveId(body.invoice_id || body.id);
    const inv = (await readLedgerInvoices(db)).find((i) => i.id === id);
    if (!inv) throw new WorkspaceError("Счёт не найден", 404);
    const key = requestKey(body.request_key);
    const readPayment = () => db.prepare("SELECT * FROM invoice_payments WHERE request_key=?").bind(key).first<WorkPayment>();
    const existing = await readPayment();
    const amount =
      action === "mark_paid"
        ? existing
          ? existing.amount_cents / 100
          : invoiceOutstanding(inv)
        : amountValue(body.amount)!;
    const day = strictDate(body.paid_on || body.paid_at || today, false);
    if (day! > today)
      throw new WorkspaceError(
        "Будущее поступление нельзя записать как полученное",
      );
    const note = textValue(body.note, 500);
    const replay = (payment: WorkPayment) => {
      if (
        payment.invoice_id !== id ||
        (action !== "mark_paid" && payment.amount_cents !== Math.round(amount * 100)) ||
        payment.paid_on !== day ||
        payment.note !== note
      )
        throw new WorkspaceError("Повтор операции содержит другие данные", 409);
      return { success: true, paymentId: payment.id };
    };
    if (existing) return replay(existing);
    if (amount <= 0 || amount > invoiceOutstanding(inv))
      throw new WorkspaceError(
        "Сумма должна быть больше нуля и не превышать остаток",
      );
    const result = await db
      .prepare(
        "INSERT OR IGNORE INTO invoice_payments(invoice_id,amount_cents,paid_on,note,request_key) VALUES(?,?,?,?,?)",
      )
      .bind(id, Math.round(amount * 100), day, note, key)
      .run();
    if (result.meta?.changes === 0) {
      const competing = await readPayment();
      if (competing) return replay(competing);
      throw new WorkspaceError("Оплата не записана. Обновите счёт и повторите.", 409);
    }
    return { success: true, paymentId: result.meta?.last_row_id };
  }
  if (action === "void_payment") {
    const id = positiveId(body.id),
      reason = required(body.reason, "Укажите причину отмены отметки", 500);
    const row = await db
      .prepare("SELECT id FROM invoice_payments WHERE id=?")
      .bind(id)
      .first();
    if (!row) throw new WorkspaceError("Поступление не найдено", 404);
    await db
      .prepare(
        "UPDATE invoice_payments SET voided_at=datetime('now'),void_reason=? WHERE id=? AND voided_at IS NULL",
      )
      .bind(reason, id)
      .run();
    return { success: true };
  }
  if (action === "save_resource") {
    const id = positiveId(body.id, true),
      workId = positiveId(body.work_id);
    await workExists(db, workId);
    const values = [
      choice(body.kind, ["file", "link", "access", "note"]),
      required(body.title, "Нужно название"),
      safeUrl(body.url),
      textValue(body.body, 4000),
      choice(body.state, ["waiting", "granted", "revoked"], "waiting"),
    ];
    if (id) {
      await revisionCheck(db, "client_work_resources", id, body.revision);
      checkChanges(
        await db
          .prepare(
            "UPDATE client_work_resources SET kind=?,title=?,url=?,body=?,state=?,revision=revision+1 WHERE id=? AND work_id=? AND revision=?",
          )
          .bind(...values, id, workId, body.revision)
          .run(),
      );
    } else
      await db
        .prepare(
          "INSERT OR IGNORE INTO client_work_resources(kind,title,url,body,state,work_id,request_key) VALUES(?,?,?,?,?,?,?)",
        )
        .bind(...values, workId, requestKey(body.request_key))
        .run();
    return { success: true };
  }
  if (action === "save_month") {
    const workId = positiveId(body.work_id);
    await workExists(db, workId);
    const month = monthValue(body.month);
    if (body.report_sent_at && strictDate(body.report_sent_at)! > today) throw new WorkspaceError('Отправленный отчёт не может быть датирован будущим');
    const old = await db
      .prepare(
        "SELECT revision,currency FROM client_work_months WHERE work_id=? AND month=?",
      )
      .bind(workId, month)
      .first<{ revision: number; currency: string }>();
    if (old ? old.revision !== Number(body.revision) : Number(body.revision ?? 0) !== 0)
      throw new WorkspaceError("Результаты этого месяца уже изменены", 409);
    const countValue = (value: unknown): number | null =>
      value === null || value === undefined || value === "" ? null : Number(value);
    const leads = countValue(body.leads), sales = countValue(body.sales);
    if (
      (leads !== null && (!Number.isSafeInteger(leads) || leads < 0 || leads > 1_000_000_000)) ||
      (sales !== null && (!Number.isSafeInteger(sales) || sales < 0 || sales > 1_000_000_000))
    )
      throw new WorkspaceError("Количество заявок и продаж должно быть целым");
    const values = [
      amountValue(body.spend, true),
      old?.currency || ACCOUNTING_CURRENCY,
      leads,
      sales,
      amountValue(body.revenue, true),
      safeUrl(body.report_url),
      strictDate(body.report_sent_at),
      textValue(body.note),
    ];
    if (old)
      checkChanges(
        await db
          .prepare(
            "UPDATE client_work_months SET spend=?,currency=?,leads=?,sales=?,revenue=?,report_url=?,report_sent_at=?,note=?,revision=revision+1 WHERE work_id=? AND month=? AND revision=?",
          )
          .bind(...values, workId, month, old.revision)
          .run(),
      );
    else {
      const result = await db
        .prepare(
          "INSERT INTO client_work_months(spend,currency,leads,sales,revenue,report_url,report_sent_at,note,work_id,month) VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(work_id,month) DO NOTHING",
        )
        .bind(...values, workId, month)
        .run();
      checkChanges(result);
    }
    return { success: true };
  }
  if (action === "save_invoice") {
    const id = positiveId(body.id, true),
      clientId = positiveId(body.client_id, true);
    const existing = id
      ? await db
          .prepare("SELECT * FROM invoices WHERE id=?")
          .bind(id)
          .first<WorkInvoice>()
      : null;
    if (id && !existing) throw new WorkspaceError("Счёт не найден", 404);
    const workId = positiveId(
      body.work_id === undefined ? existing?.work_id : body.work_id,
      true,
    );
    await clientExists(db, clientId);
    await workExists(db, workId, clientId);
    if (id && !clientId && await db.prepare('SELECT id FROM client_tasks WHERE invoice_id=?').bind(id).first()) throw new WorkspaceError('У счёта есть напоминание. Сначала выберите нового клиента.');
    const status = choice(
        body.status,
        ["draft", "issued", "paid", "cancelled"],
        "issued",
      ),
      amount = amountValue(body.amount)!,
      currency = existing?.currency || ACCOUNTING_CURRENCY;
    if (existing) {
      const receipts = await db
        .prepare(
          "SELECT count(*) AS n FROM invoice_payments WHERE invoice_id=?",
        )
        .bind(id)
        .first<{ n: number }>();
      if (
        Number(receipts?.n) > 0 &&
        (status !== existing.status ||
          amount !== existing.amount ||
          currency !== existing.currency ||
          String(body.paid_at || "") !== String(existing.paid_at || ""))
      )
        throw new WorkspaceError(
          "У счёта есть история оплат. Записывайте поступление или отменяйте ошибочную отметку в «Контроле оплат».",
        );
    }
    const paidAt = status === "paid" ? existing?.status === 'paid' ? existing.paid_at : strictDate(body.paid_at || body.issued_at || today, false) : null;
    if (paidAt && paidAt > today)
      throw new WorkspaceError(
        "Дата полученной оплаты не может быть в будущем",
      );
    const values = [
      clientId,
      workId,
      textValue(body.number, 60),
      body.period ? monthValue(body.period) : "",
      amount,
      currency,
      strictDate(body.issued_at),
      strictDate(body.due_at),
      paidAt,
      status,
      textValue(body.note, 500),
      choice(
        body.kind,
        ["retainer", "consultation", "audit", "setup", "other"],
        "retainer",
      ),
      textValue(body.payer, 120),
    ];
    if (id)
      await db
        .prepare(
          "UPDATE invoices SET client_id=?,work_id=?,number=?,period=?,amount=?,currency=?,issued_at=?,due_at=?,paid_at=?,status=?,note=?,kind=?,payer=?,updated_at=datetime('now') WHERE id=?",
        )
        .bind(...values, id)
        .run();
    else {
      const key = requestKey(body.request_key);
      await db
        .prepare(
          "INSERT OR IGNORE INTO invoices(client_id,work_id,number,period,amount,currency,issued_at,due_at,paid_at,status,note,kind,payer,request_key) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(...values, key)
        .run();
      const row = await db
        .prepare("SELECT id FROM invoices WHERE request_key=?")
        .bind(key)
        .first<{ id: number }>();
      if (!row)
        throw new WorkspaceError(
          "Счёт за этот проект и месяц уже существует",
          409,
        );
      return { success: true, id: row.id };
    }
    return { success: true, id };
  }
  if (action === "delete_invoice") {
    const id = positiveId(body.id);
    const payments = await db
      .prepare("SELECT count(*) AS n FROM invoice_payments WHERE invoice_id=?")
      .bind(id)
      .first<{ n: number }>();
    if (Number(payments?.n) > 0)
      throw new WorkspaceError(
        "Счёт с историей поступлений сохраняется. Ошибочную оплату можно отменить с указанием причины.",
      );
    await db.batch([
      db.prepare("DELETE FROM client_tasks WHERE invoice_id=?").bind(id),
      db.prepare("DELETE FROM invoices WHERE id=?").bind(id),
    ]);
    return { success: true };
  }
  if (action === 'save_time') {
    const id = positiveId(body.id, true), clientId = positiveId(body.client_id, true);
    const previous = id ? await db.prepare('SELECT work_id FROM time_entries WHERE id=?').bind(id).first<{work_id:number|null}>() : null;
    if (id && !previous) throw new WorkspaceError('Запись времени не найдена',404);
    const workId = positiveId(body.work_id === undefined ? previous?.work_id : body.work_id,true);
    await clientExists(db,clientId);await workExists(db,workId,clientId);
    const hours = Number(String(body.hours ?? '').replace(',', '.'));
    const roundedHours = Math.round(hours * 100) / 100;
    if (!Number.isFinite(hours) || roundedHours <= 0 || hours > 24) throw new WorkspaceError('Укажите от 0,01 до 24 часов');
    const values = [clientId, workId, strictDate(body.day || today, false), roundedHours, textValue(body.note, 300)] as const;
    if (id) {
      const result = await db.prepare('UPDATE time_entries SET client_id=?,work_id=?,day=?,hours=?,note=? WHERE id=?').bind(...values, id).run();
      if (result.meta?.changes === 0) throw new WorkspaceError('Запись времени не найдена', 404);
    } else {
      const key = requestKey(body.request_key);
      const inserted = await db.prepare('INSERT INTO time_entries(client_id,work_id,day,hours,note,request_key) VALUES(?,?,?,?,?,?) ON CONFLICT(request_key) WHERE request_key IS NOT NULL DO NOTHING')
        .bind(...values, key).run();
      if (inserted.meta?.changes === 0) {
        const previous = await db.prepare('SELECT client_id,work_id,day,hours,note FROM time_entries WHERE request_key=?').bind(key)
          .first<{client_id: number | null; work_id: number | null; day: string; hours: number; note: string}>();
        if (!previous || values.some((value, index) => value !== [
          previous.client_id, previous.work_id, previous.day, previous.hours, previous.note,
        ][index])) throw new WorkspaceError('Эта операция уже записана с другими данными', 409);
      }
    }
    return {success:true};
  }
  if (action === "issue_work") {
    const w = await workExists(db, positiveId(body.work_id));
    if (!w || !["active", "completed"].includes(w.status) || w.amount <= 0)
      throw new WorkspaceError("Сначала согласуйте услугу и укажите стоимость");
    const period = w.billing === "monthly" ? monthValue(body.period) : "";
    const key = requestKey(body.request_key);
    const due = strictDate(body.due_at) || w.due_at;
    const kind =
      w.billing === "monthly"
        ? "retainer"
        : ["consultation", "audit", "setup"].includes(w.service)
          ? w.service
          : "other";
    await db
      .prepare(
        `INSERT OR IGNORE INTO invoices(client_id,work_id,period,amount,currency,issued_at,due_at,status,note,kind,request_key)
      VALUES(?,?,?,?,?,?,?,'draft',?,?,?)`,
      )
      .bind(
        w.client_id,
        w.id,
        period,
        w.amount,
        w.currency,
        today,
        due,
        w.title,
        kind,
        key,
      )
      .run();
    const row = await db
      .prepare(
        "SELECT id FROM invoices WHERE request_key=? OR (work_id=? AND period=? AND kind='retainer' AND status!='cancelled') ORDER BY id DESC LIMIT 1",
      )
      .bind(key, w.id, period)
      .first<{ id: number }>();
    return { success: true, id: row?.id };
  }
  if (action === "issue_month") {
    const period = monthValue(body.period);
    const [work, clients, active] = await Promise.all([
      db
        .prepare(
          "SELECT w.* FROM client_work w JOIN clients c ON c.id=w.client_id WHERE w.billing='monthly' AND w.status='active' AND c.status='active'",
        )
        .all<ClientWork>(),
      db
        .prepare(
          "SELECT id,retainer_amount,retainer_currency,billing_day FROM clients c WHERE status='active' AND NOT EXISTS(SELECT 1 FROM client_work w WHERE w.client_id=c.id AND w.billing='monthly')",
        )
        .all<{
          id: number;
          retainer_amount: number;
          retainer_currency: string;
          billing_day: number;
        }>(),
      db.prepare("SELECT count(*) AS count FROM clients WHERE status='active'").first<{ count: number }>(),
    ]);
    const entries = [
      ...(work.results || []).map((w) => ({
        client: w.client_id,
        work: w.id,
        amount: w.amount,
        currency: w.currency,
        day: w.billing_day,
        title: w.title,
      })),
      ...(clients.results || []).map((c) => ({
        client: c.id,
        work: null,
        amount: c.retainer_amount,
        currency: c.retainer_currency,
        day: c.billing_day || 1,
        title: "",
      })),
    ];
    const statements = entries
      .filter((e) => e.amount > 0)
      .map((e) => {
        const issued = `${period}-${String(e.day).padStart(2, "0")}`;
        const due = new Date(
          new Date(`${issued}T12:00:00Z`).getTime() + 7 * 86400000,
        )
          .toISOString()
          .slice(0, 10);
        return db
          .prepare(
            `INSERT OR IGNORE INTO invoices(client_id,work_id,period,amount,currency,issued_at,due_at,status,note,kind,request_key)
        SELECT ?,?,?,?,?,?,?,'issued',?,'retainer',? WHERE NOT EXISTS(SELECT 1 FROM invoices WHERE client_id=? AND work_id IS ? AND period=? AND kind='retainer' AND status!='cancelled')`,
          )
          .bind(
            e.client,
            e.work,
            period,
            e.amount,
            e.currency,
            issued,
            due,
            e.title,
            `month:${e.work ? "work:" + e.work : "client:" + e.client}:${period}:${body.request_key || crypto.randomUUID()}`,
            e.client,
            e.work,
            period,
          );
      });
    const results = statements.length ? await db.batch(statements) : [];
    const created = results.reduce(
      (n, r) => n + Number(r.meta?.changes || 0),
      0,
    );
    return {
      success: true,
      created,
      skipped: statements.length - created,
      without_retainer: entries.filter((e) => e.amount <= 0).length,
      active_clients: Number(active?.count || 0),
    };
  }
  throw new WorkspaceError("Неизвестное действие");
}
