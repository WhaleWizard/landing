import { ArrowUpRight, Check } from "lucide-react";
import type {
  WorkInvoice,
  WorkTask,
  WorkspaceData,
  WorkspaceTarget,
} from "../../../../../shared/admin-workspace";
import {
  invoiceOutstanding,
  invoiceReceived,
} from "../../../../../shared/admin-workspace";
import { AdminButton } from "../AdminUI";
import type { WorkspaceStore } from "./useWorkspace";
import { date, money, InvoiceStatus } from "./WorkspaceUI";
import { useState } from 'react';
import WorkspaceForms from './WorkspaceForms';
import { useWorkspaceNavigation } from './useWorkspaceGuard';

export function InvoiceTable({
  invoices,
  data,
  onOpen,
  onNavigate,
}: {
  invoices: WorkInvoice[];
  data: WorkspaceData;
  onOpen: (id: number) => void;
  onNavigate?: (t: WorkspaceTarget) => void;
}) {
  return (
    <div
      className="adm-table-scroll ws-table"
      role="region"
      aria-label="Счета и оплаты"
      tabIndex={0}
    >
      <table className="adm-data-table">
        <thead>
          <tr>
            <th>Счёт / услуга</th>
            <th>Клиент / проект</th>
            <th>Срок</th>
            <th className="is-numeric">Получено</th>
            <th className="is-numeric">Осталось</th>
            <th>Состояние</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {invoices.map((i) => {
            const c = data.clients.find((c) => c.id === i.client_id),
              w = data.work.find((w) => w.id === i.work_id);
            return (
              <tr key={i.id}>
                <td>
                  <button
                    className="ws-text-button"
                    onClick={() => onOpen(i.id)}
                  >
                    {i.number || `№ ${i.id}`}
                  </button>
                  <span className="admin-meta ws-cell-note">
                    {i.note || w?.title || i.kind}
                    {i.period ? ` · ${i.period}` : ""}
                  </span>
                </td>
                <td>
                  <button
                    className="ws-text-button"
                    onClick={() =>
                      c
                        ? onNavigate?.({ section: "clients", clientId: c.id })
                        : onOpen(i.id)
                    }
                  >
                    {c?.name || i.payer || "Без клиента"}
                  </button>
                  {w && (
                    <button
                      className="ws-text-button ws-cell-note"
                      onClick={() =>
                        onNavigate?.({ section: "projects", workId: w.id })
                      }
                    >
                      {w.title}
                    </button>
                  )}
                </td>
                <td className="ws-nowrap">{date(i.due_at)}</td>
                <td className="is-numeric">
                  {money(invoiceReceived(i), i.currency)}
                  <span className="admin-meta ws-cell-note">
                    из {money(i.amount, i.currency)}
                  </span>
                </td>
                <td className="is-numeric">
                  {i.status === "draft"
                    ? "—"
                    : money(invoiceOutstanding(i), i.currency)}
                </td>
                <td>
                  <InvoiceStatus invoice={i} today={data.today} />
                </td>
                <td>
                  <AdminButton
                    compact
                    tone="quiet"
                    aria-label={`Открыть счёт ${i.id}`}
                    onClick={() => onOpen(i.id)}
                  >
                    <ArrowUpRight />
                  </AdminButton>
                </td>
              </tr>
            );
          })}
          {!invoices.length && (
            <tr>
              <td colSpan={7}>
                <p className="admin-meta">Счетов по этим условиям пока нет.</p>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
export function TaskList({
  tasks,
  data,
  store,
  onNavigate,
}: {
  tasks: WorkTask[];
  data: WorkspaceData;
  store: WorkspaceStore;
  onNavigate?: (t: WorkspaceTarget) => void;
}) {
  const [editing, setEditing] = useState<WorkTask | null>(null);
  const beforeNavigate = useWorkspaceNavigation();
  return (
    <div className="ws-rows">
      {editing && <WorkspaceForms key={editing.id} form={{kind:'task',task:editing}} data={data} store={store} onClose={()=>setEditing(null)} />}
      {tasks.map((t) => (
        <div className={`ws-row ${t.done ? "ws-task-done" : ""}`} key={t.id}>
          <label className="ws-task-check">
            <input
              type="checkbox"
              checked={Boolean(t.done)}
              disabled={store.busy}
              aria-label={`Выполнено: ${t.title}`}
              onChange={(e) =>
                void store.mutate(
                  { ...t, action: "save_task", done: e.target.checked },
                  e.target.checked
                    ? "Задача выполнена"
                    : "Задача возвращена в работу",
                )
              }
            />
            <Check aria-hidden="true" />
          </label>
          <div className="ws-grow">
            <button type="button" className="ws-text-button" onClick={()=>beforeNavigate(()=>setEditing(t))}><strong>{t.title}</strong></button>
            <span className="admin-meta">
              {data.clients.find((c) => c.id === t.client_id)?.name}
              {t.work_id
                ? ` · ${data.work.find((w) => w.id === t.work_id)?.title || ""}`
                : ""}
            </span>
            {t.note && <p className="admin-meta">{t.note}</p>}
          </div>
          <span
            className={`ws-badge ${!t.done && t.due_at && t.due_at < data.today ? "is-overdue" : ""}`}
          >
            {t.due_at === data.today ? "Сегодня" : date(t.due_at)}
          </span>
          {t.invoice_id ? (
            <AdminButton
              compact
              tone="quiet"
              onClick={() =>
                onNavigate?.({ section: "finance", invoiceId: t.invoice_id! })
              }
            >
              К счёту
            </AdminButton>
          ) : t.work_id ? (
            <AdminButton
              compact
              tone="quiet"
              aria-label={`Открыть проект задачи: ${t.title}`}
              onClick={() =>
                onNavigate?.({ section: "projects", workId: t.work_id! })
              }
            >
              <ArrowUpRight />
            </AdminButton>
          ) : null}
        </div>
      ))}
      {!tasks.length && (
        <p className="admin-meta">Задач по этим условиям нет.</p>
      )}
    </div>
  );
}
