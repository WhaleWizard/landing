import {
  useWorkspaceGuard,
  type RegisterLeaveGuard,
} from "./useWorkspaceGuard";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { WorkspaceTarget } from "../../../../../shared/admin-workspace";
import {
  invoiceIsOverdue,
  invoiceOutstanding,
  invoiceReceived,
} from "../../../../../shared/admin-workspace";
import { AdminButton, AdminSelect } from "../AdminUI";
import { AdminBlank, AdminSectionSkeleton } from "../AdminFeedback";
import { useWorkspace } from "./useWorkspace";
import { money, WorkspacePanel, WorkspaceStats } from "./WorkspaceUI";
import { InvoiceTable, TaskList } from "./WorkspaceTables";
import WorkspaceInvoice from "./WorkspaceInvoice";

export function WorkspacePayments({
  password,
  target,
  onNavigate: navigateExternal,
  onRegisterLeaveGuard,
}: {
  onRegisterLeaveGuard?: RegisterLeaveGuard;
  password: string;
  target?: WorkspaceTarget | null;
  onNavigate?: (t: WorkspaceTarget) => void;
}) {
  const store = useWorkspace(password),
    { data } = store;
  const [invoiceId, setInvoiceId] = useState<number | null>(
      target?.invoiceId || null,
    ),
    [clientId, setClientId] = useState(String(target?.clientId || "all")),
    [workId, setWorkId] = useState(String(target?.workId || "all")),
    [filter, setFilter] = useState(target?.tab || "unpaid"),
    [query, setQuery] = useState(""),
    [sort, setSort] = useState("due");
  useEffect(() => {
    setInvoiceId(target?.invoiceId || null);
    setClientId(String(target?.clientId || "all"));
    setWorkId(String(target?.workId || "all"));
    if (target?.tab) setFilter(target.tab); else if (target?.invoiceId) setFilter("all");
  }, [target?.nonce, target?.invoiceId, target?.clientId, target?.workId, target?.tab]);
  const [dirty, setDirty] = useState(false);
  useWorkspaceGuard(dirty, onRegisterLeaveGuard);
  const onNavigate=(t:WorkspaceTarget)=>navigateExternal?.({...t,returnTo:{section:'finance',clientId:Number(clientId)||undefined,workId:Number(workId)||undefined,invoiceId:invoiceId||undefined,tab:filter}});
  const scoped = useMemo(
    () =>
      data?.invoices.filter(
        (i) =>
          (clientId === "all" || i.client_id === Number(clientId)) &&
          (workId === "all" || i.work_id === Number(workId)),
      ) || [],
    [data, clientId, workId],
  );
  if (!data)
    return store.loading ? (
      <AdminSectionSkeleton tiles={3} rows={4} />
    ) : (
      <AdminBlank
        title="Контроль оплат пока недоступен"
        text={store.error}
        actions={
          <AdminButton onClick={() => void store.load()}>Повторить</AdminButton>
        }
      />
    );
  const invoice = data.invoices.find((i) => i.id === invoiceId),
    week = new Date(
      new Date(data.today + "T12:00:00Z").getTime() + 6 * 86400000,
    )
      .toISOString()
      .slice(0, 10);
  const filtered = scoped
    .filter((i) => {
      const left = invoiceOutstanding(i);
      return (
        (filter === "all" ||
          (filter === "unpaid" && left > 0) ||
          (filter === "overdue" && invoiceIsOverdue(i, data.today)) ||
          (filter === "week" &&
            left > 0 &&
            i.due_at &&
            i.due_at >= data.today &&
            i.due_at <= week) ||
          (filter === "paid" && i.status === "paid") ||
          (filter === "unlinked" && !i.client_id) ||
          (filter === "partial" && left > 0 && invoiceReceived(i) > 0)) &&
        `${i.number} ${i.id} ${i.note} ${i.payer || ""} ${data.clients.find((c) => c.id === i.client_id)?.name || ""}`
          .toLowerCase()
          .includes(query.toLowerCase())
      );
    })
    .sort((a, b) =>
      sort === "due"
        ? (a.due_at || "9999").localeCompare(b.due_at || "9999") || a.id - b.id
        : sort === "new"
          ? b.id - a.id
          : a.currency.localeCompare(b.currency) ||
            invoiceOutstanding(b) - invoiceOutstanding(a),
    );
  return (
    <div className="ws-root ws-stack">
      {store.error && <div className="admin-notice" role="alert">{store.error} <AdminButton onClick={()=>void store.load()}>Обновить данные</AdminButton></div>}
      {invoice ? (
        <WorkspaceInvoice
          key={invoice.id}
          invoice={invoice}
          store={store}
          onDirtyChange={setDirty}
          onClose={() => setInvoiceId(null)}
          onNavigate={onNavigate}
        />
      ) : (
        <>
          <WorkspaceStats invoices={scoped} today={data.today} />
          <div className="admin-panel ws-filter-panel">
            <div className="ws-toolbar">
              <label className="ws-search">
                <Search />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Клиент, счёт или услуга"
                  aria-label="Поиск оплаты"
                />
              </label>
              <AdminSelect
                ariaLabel="Клиент"
                value={clientId}
                options={[
                  { value: "all", label: "Все клиенты" },
                  ...data.clients.map((c) => ({
                    value: String(c.id),
                    label: c.name,
                  })),
                ]}
                onValueChange={(v) => {
                  setClientId(v);
                  setWorkId("all");
                }}
              />
              <AdminSelect
                ariaLabel="Проект или услуга"
                value={workId}
                options={[
                  { value: "all", label: "Все проекты и услуги" },
                  ...data.work
                    .filter(
                      (w) =>
                        clientId === "all" || w.client_id === Number(clientId),
                    )
                    .map((w) => ({ value: String(w.id), label: w.title })),
                ]}
                onValueChange={setWorkId}
              />
              <AdminSelect
                ariaLabel="Порядок счетов"
                value={sort}
                options={[
                  { value: "due", label: "Сначала ближайший срок" },
                  { value: "new", label: "Новые счета" },
                  { value: "amount", label: "По остатку внутри валюты" },
                ]}
                onValueChange={setSort}
              />
            </div>
            <div className="ws-chips">
              {[
                ["unpaid", "Ждём оплату"],
                ["overdue", "Просрочены"],
                ["partial", "Частично"],
                ["week", "На неделе"],
                ["paid", "Оплачены"],
                ["unlinked", "Без клиента"],
                ["all", "Все счета"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={filter === id}
                  className={filter === id ? "is-active" : ""}
                  onClick={() => setFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <InvoiceTable
            invoices={filtered}
            data={data}
            onOpen={setInvoiceId}
            onNavigate={onNavigate}
          />
          <p className="admin-meta">
            Черновики не входят в долг. Валюты показаны отдельно. Старые продажи
            без клиента можно привязать внутри счёта.
          </p>
        </>
      )}
    </div>
  );
}

export function WorkspaceFocus({
  password,
  onNavigate,
  all = false,
}: {
  password: string;
  onNavigate?: (t: WorkspaceTarget) => void;
  all?: boolean;
}) {
  const store = useWorkspace(password),
    { data } = store;
  const [expanded, setExpanded] = useState(true);
  if (!data) return null;
  const tasks = data.tasks.filter(
    (t) => !t.done && (all || (t.due_at && t.due_at <= data.today)),
  );
  const due = data.invoices.filter(
    (i) => invoiceIsOverdue(i, data.today) || (i.due_at === data.today && invoiceOutstanding(i) > 0),
  );
  if (!tasks.length && !due.length) return null;
  return (
    <div className="ws-root">
      <WorkspacePanel
        title={`Клиенты и проекты · ${tasks.length + due.filter(i=>!tasks.some(t=>t.invoice_id===i.id)).length}`}
        action={
          <AdminButton
            tone="quiet"
            compact
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Свернуть" : "Показать"}
          </AdminButton>
        }
      >
        {expanded && (
          <>
            <TaskList
              tasks={tasks}
              data={data}
              store={store}
              onNavigate={onNavigate}
            />
            {due
              .filter((i) => !tasks.some((t) => t.invoice_id === i.id))
              .map((i) => (
                <button
                  className="ws-linked-row"
                  key={i.id}
                  onClick={() =>
                    onNavigate?.({ section: "finance", invoiceId: i.id })
                  }
                >
                  <span>
                    Проверить оплату ·{" "}
                    {data.clients.find((c) => c.id === i.client_id)?.name ||
                      i.payer ||
                      "Без клиента"}
                    <small>
                      Счёт {i.number || `№ ${i.id}`} · срок {i.due_at} · остаток {money(invoiceOutstanding(i), i.currency)}
                    </small>
                  </span>
                  <span className={`ws-badge${invoiceIsOverdue(i, data.today) ? " is-overdue" : ""}`}>
                    {i.due_at === data.today ? "Сегодня" : "Просрочен"}
                  </span>
                </button>
              ))}
          </>
        )}
      </WorkspacePanel>
    </div>
  );
}
