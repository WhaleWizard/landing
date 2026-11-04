import { json, readRequestText } from "../../_lib/http";
import { CACHE_CONTROL } from "../../_lib/cache";
import { verifyAdminPassword } from "../../_lib/auth";
import { enforceRateLimit } from "../../_lib/rate-limit";
import { localTodayIso } from "../../_lib/local-day";
import {
  hasWorkspace,
  readLedgerInvoices,
  workspaceMutation,
  WorkspaceError,
  WORKSPACE_MIGRATION,
} from "../../_lib/admin-workspace";
import type { Env } from "../../_lib/types";
const headers = { "Cache-Control": CACHE_CONTROL.noStore };
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const limited = await enforceRateLimit(request, "admin");
  if (limited) return limited;
  if (!verifyAdminPassword(request.headers.get("X-Admin-Password") || "", env))
    return json(
      { success: false, error: "Unauthorized" },
      { status: 401, headers },
    );
  try {
    if (!env.DB || !(await hasWorkspace(env.DB)))
      return json(
        {
          success: false,
          migrationRequired: true,
          code: 'MIGRATION_REQUIRED', table: 'client_work',
          migration: WORKSPACE_MIGRATION,
          error:
            "Для связанных проектов и оплат нужна миграция " +
            WORKSPACE_MIGRATION,
        },
        { status: 503, headers },
      );
    const db = env.DB;
    const [
      clients,
      work,
      invoices,
      tasks,
      resources,
      months,
      activity,
      access,
      notes,
      commonMonths,
      crmTasks,
      times,
    ] = await Promise.all([
      db
        .prepare(
          "SELECT id,lead_id,name,company,status,needs,interests,relationship_type,contact_method,contact_value,media_folder,contract_file_url,next_touch_at,next_touch_text,scope_included FROM clients ORDER BY name",
        )
        .all(),
      db
        .prepare("SELECT * FROM client_work ORDER BY updated_at DESC,id DESC")
        .all(),
      readLedgerInvoices(db),
      db
        .prepare(
          "SELECT * FROM client_tasks ORDER BY done,COALESCE(due_at,'9999'),id",
        )
        .all(),
      db.prepare("SELECT * FROM client_work_resources ORDER BY id DESC").all(),
      db.prepare("SELECT * FROM client_work_months ORDER BY month DESC").all(),
      db
        .prepare(
          "SELECT * FROM client_work_activity ORDER BY id DESC LIMIT 300",
        )
        .all(),
      db.prepare("SELECT * FROM client_access ORDER BY id").all(),
      db
        .prepare("SELECT * FROM client_notes ORDER BY pinned DESC,id DESC")
        .all(),
      db.prepare("SELECT * FROM client_months ORDER BY month DESC").all(),
      db
        .prepare(
          "SELECT t.id,t.lead_id,t.title,t.status,t.due_at FROM crm_tasks t JOIN clients c ON c.lead_id=t.lead_id ORDER BY t.id DESC",
        )
        .all(),
      db.prepare('SELECT * FROM time_entries ORDER BY day DESC,id DESC').all(),
    ]);
    return json(
      {
        success: true,
        today: localTodayIso(request),
        clients: clients.results,
        work: work.results,
        invoices,
        tasks: tasks.results,
        resources: resources.results,
        months: months.results,
        activity: activity.results,
        times: times.results,
        common: {
          access: access.results,
          notes: notes.results,
          months: commonMonths.results,
          crmTasks: crmTasks.results,
        },
      },
      { headers },
    );
  } catch (e) {
    return json(
      {
        success: false,
        error: e instanceof Error ? e.message : "Не удалось загрузить проекты",
      },
      { status: 500, headers },
    );
  }
};
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const limited = await enforceRateLimit(request, "admin");
  if (limited) return limited;
  if (!verifyAdminPassword(request.headers.get("X-Admin-Password") || "", env))
    return json(
      { success: false, error: "Unauthorized" },
      { status: 401, headers },
    );
  const raw = await readRequestText(request, 64 * 1024);
  if (!raw.ok)
    return json(
      { success: false, error: "Слишком большой запрос" },
      { status: 413, headers },
    );
  try {
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw.text);
      if (!body || typeof body !== "object" || Array.isArray(body)) throw 0;
    } catch {
      return json(
        { success: false, error: "Некорректный JSON" },
        { status: 400, headers },
      );
    }
    if (!env.DB || !(await hasWorkspace(env.DB)))
      return json(
        {
          success: false,
          migrationRequired: true,
          code: 'MIGRATION_REQUIRED', table: 'client_work',
          migration: WORKSPACE_MIGRATION,
          error: "Примените миграцию " + WORKSPACE_MIGRATION,
        },
        { status: 503, headers },
      );
    return json(await workspaceMutation(env.DB, body, localTodayIso(request)), {
      headers,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const known =
      /PAYMENT_|INVOICE_HAS_PAYMENTS|WORK_CLIENT_MISMATCH|PAID_INVOICE_CLIENT_LOCKED|UNIQUE constraint/.test(
        message,
      );
    return json(
      {
        success: false,
        error: known
          ? "Запись конфликтует с текущими оплатами или связями. Обновите данные."
          : message,
      },
      {
        status: e instanceof WorkspaceError ? e.status : known ? 409 : 500,
        headers,
      },
    );
  }
};
