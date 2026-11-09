import { useEffect, useState } from "react";
import { ArrowLeft, Bell, ChevronRight, Plus, Receipt, RotateCcw } from "lucide-react";
import {
  invoiceOutstanding,
  invoiceReceived,
  type WorkInvoice,
  type WorkspaceTarget,
} from "../../../../../shared/admin-workspace";
import { AdminButton, AdminDecimalInput, AdminSelect } from "../AdminUI";
import { confirmAsk } from "../AdminFeedback";
import type { WorkspaceStore } from "./useWorkspace";
import { date, money, InvoiceStatus, WorkspacePanel } from "./WorkspaceUI";
import { useWorkspaceNavigation } from './useWorkspaceGuard';

export default function WorkspaceInvoice({
  invoice,
  store,
  onClose,
  onNavigate,
  onDirtyChange,
}: {
  onDirtyChange?: (dirty: boolean) => void;
  invoice: WorkInvoice;
  store: WorkspaceStore;
  onClose: () => void;
  onNavigate?: (t: WorkspaceTarget) => void;
}) {
  const { data, busy, mutate } = store;
  const beforeNavigate=useWorkspaceNavigation();
  const [mode, setMode] = useState<"view" | "payment" | "reminder" | "link">(
    "view",
  );
  const [amount, setAmount] = useState<number | null>(
      invoiceOutstanding(invoice),
    ),
    [day, setDay] = useState(data?.today || ""),
    [note, setNote] = useState(""),
    [clientId, setClientId] = useState(String(invoice.client_id || "")),
    [workId, setWorkId] = useState(String(invoice.work_id || ""));
  useEffect(() => {
    onDirtyChange?.(mode !== "view");
    return () => onDirtyChange?.(false);
  }, [mode, onDirtyChange]);
  if (!data) return null;
  const client = data.clients.find((c) => c.id === invoice.client_id),
    work = data.work.find((w) => w.id === invoice.work_id),
    reminder = data.tasks.find((t) => t.invoice_id === invoice.id && !t.done);
  return (
    <div className="ws-invoice-detail">
      <div className="ws-heading">
        <div>
          <AdminButton tone="quiet" compact onClick={()=>beforeNavigate(onClose)}>
            <ArrowLeft />К списку
          </AdminButton>
          <h2>Счёт {invoice.number || `№ ${invoice.id}`}</h2>
          <p className="admin-meta">
            {invoice.note || work?.title || invoice.kind} ·{" "}
            {invoice.period || date(invoice.issued_at)}
          </p>
        </div>
        <InvoiceStatus invoice={invoice} today={data.today} />
      </div>
      <div className="ws-breadcrumb">
        {client ? (
          <button
            onClick={() =>
              onNavigate?.({ section: "clients", clientId: client.id })
            }
          >
            {client.name}
          </button>
        ) : (
          <span>{invoice.payer || "Не привязан к клиенту"}</span>
        )}
        {work && (
          <>
            <button
              onClick={() =>
                onNavigate?.({ section: "projects", workId: work.id })
              }
            >
              <ChevronRight aria-hidden="true" /> <span>{work.title}</span>
            </button>
          </>
        )}
      </div>
      <div className="ws-stat-grid">
        {[
          ["Сумма счёта", invoice.amount],
          ["Получено", invoiceReceived(invoice)],
          ["Осталось", invoiceOutstanding(invoice)],
        ].map(([title, value]) => (
          <div className="admin-panel ws-stat" key={title}>
            <span className="admin-meta">{title}</span>
            <strong className="ws-stat__value">
              {money(Number(value), invoice.currency)}
            </strong>
          </div>
        ))}
      </div>
      <WorkspacePanel
        title="Поступления"
        action={
          invoice.status === "issued" ? (
            <AdminButton
              tone="primary"
              onClick={() => {
                setAmount(invoiceOutstanding(invoice));
                setDay(data.today);
                setMode("payment");
              }}
            >
              <Plus />
              Записать оплату
            </AdminButton>
          ) : undefined
        }
      >
        {mode === "payment" && (
          <form
            className="ws-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await mutate(
                  {
                    action: "record_payment",
                    invoice_id: invoice.id,
                    amount,
                    paid_on: day,
                    note,
                  },
                  "Оплата записана",
                )
              ) {
                setMode("view");
                setNote("");
              }
            }}
          >
            <label className="admin-field">
              <span className="admin-label">Получено, {invoice.currency}</span>
              <AdminDecimalInput
                className="admin-input"
                value={amount}
                onValueChange={setAmount}
              />
            </label>
            <label className="admin-field">
              <span className="admin-label">Дата получения</span>
              <input
                className="admin-input"
                type="date"
                value={day}
                max={data.today}
                required
                onChange={(e) => setDay(e.target.value)}
              />
            </label>
            <label className="admin-field ws-span">
              <span className="admin-label">Примечание</span>
              <input
                className="admin-input"
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
              />
            </label>
            <div className="ws-form-actions">
              <AdminButton
                type="submit"
                tone="primary"
                disabled={
                  busy || !amount || amount > invoiceOutstanding(invoice)
                }
              >
                Записать полученную оплату
              </AdminButton>
              <AdminButton onClick={() => setMode("view")}>Отмена</AdminButton>
            </div>
          </form>
        )}
        <div className="ws-rows">
          {invoice.payments?.length ? (
            invoice.payments.map((p) => (
              <div
                className={`ws-row ws-payment-row ${p.voided_at ? "ws-voided" : ""}`}
                key={p.id}
              >
                <Receipt aria-hidden="true" />
                <div className="ws-grow">
                  <strong>
                    {money(p.amount_cents / 100, invoice.currency)}
                  </strong>
                  <span className="admin-meta">
                    {p.paid_on
                      ? date(p.paid_on)
                      : "Дата не указана в старой записи"}
                    {p.note ? ` · ${p.note}` : ""}
                    {p.voided_at ? ` · отменено: ${p.void_reason}` : ""}
                  </span>
                </div>
                {!p.voided_at && (
                  <AdminButton
                    compact
                    tone="quiet"
                    disabled={busy}
                    onClick={async () => {
                      const ok = await confirmAsk({
                        title: "Отменить ошибочную отметку?",
                        description:
                          "Деньги перестанут учитываться как полученные. История записи сохранится; возврат клиенту эта кнопка не выполняет.",
                        confirmLabel: "Отменить отметку",
                        tone: "danger",
                      });
                      if (ok)
                        await mutate(
                          {
                            action: "void_payment",
                            id: p.id,
                            reason: "Исправление ошибочной отметки владельцем",
                          },
                          "Отметка отменена",
                        );
                    }}
                  >
                    <RotateCcw />
                    Исправить
                  </AdminButton>
                )}
              </div>
            ))
          ) : (
            <p className="admin-meta">Поступлений пока нет.</p>
          )}
        </div>
      </WorkspacePanel>
      <div className="ws-toolbar">
        {invoiceOutstanding(invoice) > 0 && (
          <AdminButton
            onClick={() => {
              setDay(reminder?.due_at || data.today);
              setMode("reminder");
            }}
          >
            <Bell />
            {reminder ? `Напомнить ${date(reminder.due_at)}` : "Напомнить себе"}
          </AdminButton>
        )}
        <AdminButton tone="quiet" onClick={() => setMode("link")}>
          Связать с клиентом / проектом
        </AdminButton>
        {invoice.status === "draft" && (
          <AdminButton
            tone="primary"
            disabled={busy}
            onClick={() =>
              void mutate(
                {
                  ...invoice,
                  action: "save_invoice",
                  status: "issued",
                  issued_at: invoice.issued_at || data.today,
                },
                "Счёт выставлен",
              )
            }
          >
            Отметить выставленным
          </AdminButton>
        )}
      </div>
      {mode === "reminder" && (
        <WorkspacePanel title="Напоминание владельцу">
          <form
            className="ws-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await mutate(
                  {
                    action: "remind_invoice",
                    invoice_id: invoice.id,
                    due_at: day,
                  },
                  "Напоминание добавлено",
                )
              )
                setMode("view");
            }}
          >
            <label className="admin-field">
              <span className="admin-label">Когда</span>
              <input
                className="admin-input"
                type="date"
                required
                value={day}
                min={data.today}
                onChange={(e) => setDay(e.target.value)}
              />
            </label>
            <p className="admin-meta">
              Одна задача появится в проекте, «Сегодня» и планере. Сообщение
              клиенту не отправляется.
            </p>
            <div className="ws-form-actions">
              <AdminButton
                type="submit"
                tone="primary"
                disabled={busy || !invoice.client_id}
              >
                Сохранить
              </AdminButton>
              <AdminButton onClick={() => setMode("view")}>Отмена</AdminButton>
            </div>
            {!invoice.client_id && (
              <p className="admin-meta">
                Сначала выберите клиента для этого счёта.
              </p>
            )}
          </form>
        </WorkspacePanel>
      )}
      {mode === "link" && (
        <WorkspacePanel title="Связи счёта">
          <form
            className="ws-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                await mutate(
                  {
                    ...invoice,
                    action: "save_invoice",
                    client_id: Number(clientId) || null,
                    work_id: Number(workId) || null,
                  },
                  "Связи сохранены",
                )
              )
                setMode("view");
            }}
          >
            <AdminSelect
              label="Клиент"
              value={clientId || "none"}
              options={[
                { value: "none", label: "Выберите клиента" },
                ...data.clients.map((c) => ({
                  value: String(c.id),
                  label: c.name,
                })),
              ]}
              onValueChange={(v) => {
                setClientId(v === "none" ? "" : v);
                setWorkId("");
              }}
            />
            <AdminSelect
              label="Проект или услуга"
              value={workId || "none"}
              options={[
                { value: "none", label: "Общее по клиенту" },
                ...data.work
                  .filter((w) => w.client_id === Number(clientId))
                  .map((w) => ({ value: String(w.id), label: w.title })),
              ]}
              onValueChange={(v) => setWorkId(v === "none" ? "" : v)}
            />
            <div className="ws-form-actions">
              <AdminButton
                type="submit"
                tone="primary"
                disabled={busy || !clientId}
              >
                Сохранить связь
              </AdminButton>
              <AdminButton onClick={() => setMode("view")}>Отмена</AdminButton>
            </div>
          </form>
        </WorkspacePanel>
      )}
    </div>
  );
}
