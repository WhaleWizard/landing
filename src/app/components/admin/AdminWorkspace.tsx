import {
  useWorkspaceGuard,
  useWorkspaceNavigation,
  type RegisterLeaveGuard,
} from "./workspace/useWorkspaceGuard";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarDays,
  ChevronRight,
  FolderOpen,
  LayoutGrid,
  List,
  Plus,
  Search,
  Settings2,
  Users,
  Wallet,
} from "lucide-react";
import type {
  ClientWork,
  WorkspaceTarget,
} from "../../../../shared/admin-workspace";
import {
  invoiceOutstanding,
  invoiceReceived,
} from "../../../../shared/admin-workspace";
import { AdminButton, AdminSelect } from "./AdminUI";
import { AdminBlank, AdminSectionSkeleton } from "./AdminFeedback";
import { useWorkspace, type WorkspaceStore } from "./workspace/useWorkspace";
import {
  date,
  money,
  MoneyTotal,
  WorkspacePanel,
  WorkspaceStats,
  WORK_STATUS,
  SERVICES,
} from "./workspace/WorkspaceUI";
import { InvoiceTable, TaskList } from "./workspace/WorkspaceTables";
import WorkspaceInvoice from "./workspace/WorkspaceInvoice";
import WorkspaceForms, {
  type WorkspaceFormState,
} from "./workspace/WorkspaceForms";

type Props = {
  password: string;
  target?: WorkspaceTarget | null;
  onNavigate?: (t: WorkspaceTarget) => void;
  onRegisterLeaveGuard?: RegisterLeaveGuard;
};
type Preferences = {
  view: "table" | "cards";
  sort: "attention" | "name" | "due" | "updated";
  status: string;
  query: string;
  compact: boolean;
  columns: string[];
};
const defaults: Preferences = {
  view: "table",
  sort: "attention",
  status: "all",
  query: "",
  compact: false,
  columns: ["service", "due", "money", "status"],
};
function readPrefs(): Preferences {
  try {
    return {
      ...defaults,
      ...JSON.parse(localStorage.getItem("ww_workspace_view") || "{}"),
    };
  } catch {
    return defaults;
  }
}
function EmptyState({ store }: { store: WorkspaceStore }) {
  return (
    <AdminBlank
      title={
        store.migration
          ? "Связанные проекты готовы к подключению"
          : "Не удалось загрузить"
      }
      text={store.error}
      actions={
        <AdminButton onClick={() => void store.load()}>Повторить</AdminButton>
      }
    />
  );
}
export default function AdminWorkspace({
  password,
  target,
  onNavigate: navigateExternal,
  onRegisterLeaveGuard,
}: Props) {
  const [invoiceDirty, setInvoiceDirty] = useState(false);
  const beforeNavigate=useWorkspaceNavigation(onRegisterLeaveGuard);
  const openForm=(next:WorkspaceFormState)=>beforeNavigate(()=>setForm(next));
  const store = useWorkspace(password),
    { data } = store;
  const [selected, setSelected] = useState<number | null>(
      target?.workId || null,
    ),
    [tab, setTab] = useState("overview"),
    [form, setForm] = useState<WorkspaceFormState | null>(null),
    [invoiceId, setInvoiceId] = useState<number | null>(
      target?.invoiceId || null,
    ),
    [prefs, setPrefs] = useState<Preferences>(readPrefs),
    [settings, setSettings] = useState(false),
    [invoiceMonth, setInvoiceMonth] = useState(
      new Date().toLocaleDateString("sv-SE").slice(0, 7),
    );
  const changePrefs = (p: Partial<Preferences>) =>
    setPrefs((v) => ({ ...v, ...p }));
  useEffect(() => {
    try {
      localStorage.setItem("ww_workspace_view", JSON.stringify(prefs));
    } catch {}
  }, [prefs]);
  useEffect(() => {
    setForm(null);
    setSelected(target?.workId || null);
    setInvoiceId(target?.invoiceId || null);
    setTab(target?.tab || "overview");
  }, [target?.nonce, target?.workId, target?.invoiceId, target?.tab]);
  useWorkspaceGuard(Boolean(form) || invoiceDirty, onRegisterLeaveGuard);

  const visible = useMemo(() => {
    if (!data) return [];
    const query = prefs.query.toLocaleLowerCase("ru");
    const list = data.work.filter(
      (w) =>
        w.kind === "project" &&
        (prefs.status === "all" || w.status === prefs.status) &&
        (!target?.clientId || w.client_id === target.clientId) &&
        `${w.title} ${data.clients.find((c) => c.id === w.client_id)?.name}`
          .toLocaleLowerCase("ru")
          .includes(query),
    );
    const overdue = (w: ClientWork) =>
      data.invoices.some(
        (i) =>
          i.work_id === w.id &&
          invoiceOutstanding(i) > 0 &&
          i.due_at &&
          i.due_at < data.today,
      ) ||
      data.tasks.some(
        (t) =>
          t.work_id === w.id && !t.done && t.due_at && t.due_at < data.today,
      );
    return list.sort((a, b) =>
      prefs.sort === "name"
        ? a.title.localeCompare(b.title, "ru")
        : prefs.sort === "due"
          ? (a.due_at || "9999").localeCompare(b.due_at || "9999")
          : prefs.sort === "updated"
            ? b.updated_at.localeCompare(a.updated_at)
            : Number(overdue(b)) - Number(overdue(a)) ||
              (a.due_at || "9999").localeCompare(b.due_at || "9999"),
    );
  }, [data, prefs, target?.clientId]);
  if (!data)
    return store.loading ? (
      <AdminSectionSkeleton tiles={3} rows={5} />
    ) : (
      <EmptyState store={store} />
    );
  const work = data.work.find((w) => w.id === selected),
    client = data.clients.find((c) => c.id === work?.client_id),
    invoices = work
      ? data.invoices.filter((i) => i.work_id === work.id)
      : data.invoices.filter((i) => visible.some((w) => w.id === i.work_id)),
    tasks = work ? data.tasks.filter((t) => t.work_id === work.id) : [];
  const onNavigate=(t:WorkspaceTarget)=>navigateExternal?.({...t,returnTo:{section:'projects',workId:work?.id,clientId:target?.clientId,tab,invoiceId:invoiceId||undefined}});
  const open = (id: number) => {
    setForm(null);
    setSelected(id);
    setTab("overview");
    setInvoiceId(null);
  };
  const navigate = (t: WorkspaceTarget) => {
    const workId = t.workId;
    if (t.section === "projects" && workId) beforeNavigate(() => {
      open(workId);
      setTab(t.tab || "overview");
      setInvoiceId(t.invoiceId || null);
    });
    else onNavigate?.(t);
  };
  const invoice = data.invoices.find((i) => i.id === invoiceId);
  return (
    <div
      className="ws-root admin-stack admin-stack--lg"
      data-compact={prefs.compact}
    >
      <div className="ws-heading">
        <div>
          {work && (
            <div className="ws-breadcrumb">
              <button
                onClick={() => beforeNavigate(() => {
                  setSelected(null);
                  setInvoiceId(null);
                  setForm(null);
                })}
              >
                <ArrowLeft />
                Все проекты
              </button>
              <button
                onClick={() =>
                  onNavigate?.({ section: "clients", clientId: work.client_id })
                }
              >
                <ChevronRight aria-hidden="true" /> <span>{client?.name}</span>
              </button>
            </div>
          )}
          <h2>{work?.title || "Проекты"}</h2>
          <p className="admin-meta">
            {work
              ? `${work.kind === "service" ? "Разовая услуга" : "Проект"} · ${WORK_STATUS[work.status]}`
              : "Вся работа с клиентом: задачи, результаты, материалы и деньги"}
          </p>
        </div>
        <div className="ws-toolbar">
          {work ? (
            <AdminButton
              tone="quiet"
              onClick={() => openForm({ kind: "work", work })}
            >
              <Settings2 />
              Настройки
            </AdminButton>
          ) : (
            <>
              <AdminButton onClick={() => openForm({ kind: "client" })}>
                <Users />
                Новый клиент
              </AdminButton>
              <AdminButton
                tone="primary"
                disabled={!data.clients.length}
                onClick={() => openForm({ kind: "work", client: data.clients.find((entry) => entry.id === target?.clientId) })}
              >
                <Plus />
                Создать проект
              </AdminButton>
            </>
          )}
        </div>
      </div>
      {store.error && (
        <p className="admin-hint" role="alert">
          {store.error}
        </p>
      )}
      {form && (
        <WorkspaceForms
          key={JSON.stringify(form)}
          form={form}
          data={data}
          store={store}
          onClose={() => setForm(null)}
          onSaved={(r) => {
            if (form.kind === "work" && r.id) open(Number(r.id));
          }}
        />
      )}
      {work && (
        <div className="ws-tabs">
          {[
            ["overview", "Обзор"],
            ["tasks", "Задачи"],
            ["money", "Счета и оплаты"],
            ["resources", "Материалы"],
            ["results", "Результаты"],
            ["history", "История"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={tab === id ? "is-active" : ""}
              aria-pressed={tab === id}
              onClick={() => beforeNavigate(() => {
                setForm(null);
                setTab(id);
                setInvoiceId(null);
              })}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {invoice ? (
        <WorkspaceInvoice
          key={invoice.id}
          invoice={invoice}
          store={store}
          onDirtyChange={setInvoiceDirty}
          onClose={() => setInvoiceId(null)}
          onNavigate={navigate}
        />
      ) : !work ? (
        <>
          <WorkspaceStats invoices={invoices} today={data.today} />
          <div className="admin-panel ws-filter-panel">
            <div className="ws-toolbar">
              <label className="ws-search">
                <Search />
                <input
                  aria-label="Поиск проекта или клиента"
                  placeholder="Проект или клиент"
                  value={prefs.query}
                  onChange={(e) => changePrefs({ query: e.target.value })}
                />
              </label>
              <AdminSelect
                ariaLabel="Состояние проектов"
                value={prefs.status}
                options={[
                  { value: "all", label: "Все состояния" },
                  ...Object.entries(WORK_STATUS).map(([value, label]) => ({
                    value,
                    label,
                  })),
                ]}
                onValueChange={(status) => changePrefs({ status })}
              />
              <AdminSelect
                ariaLabel="Сортировка проектов"
                value={prefs.sort}
                options={[
                  { value: "attention", label: "Сначала требуют внимания" },
                  { value: "due", label: "По ближайшему сроку" },
                  { value: "name", label: "По названию" },
                  { value: "updated", label: "Недавно изменённые" },
                ]}
                onValueChange={(sort) =>
                  changePrefs({ sort: sort as Preferences["sort"] })
                }
              />
              <div className="ws-view-switch">
                <AdminButton
                  aria-label="Таблица проектов"
                  aria-pressed={prefs.view === "table"}
                  onClick={() => changePrefs({ view: "table" })}
                >
                  <List />
                </AdminButton>
                <AdminButton
                  aria-label="Карточки проектов"
                  aria-pressed={prefs.view === "cards"}
                  onClick={() => changePrefs({ view: "cards" })}
                >
                  <LayoutGrid />
                </AdminButton>
                <AdminButton
                  aria-label="Настроить отображение"
                  aria-expanded={settings}
                  onClick={() => setSettings(!settings)}
                >
                  <Settings2 />
                </AdminButton>
              </div>
            </div>
            {settings && (
              <div className="ws-display-options">
                <label>
                  <input
                    type="checkbox"
                    checked={prefs.compact}
                    onChange={(e) => changePrefs({ compact: e.target.checked })}
                  />
                  Компактные строки
                </label>
                {[
                  ["service", "Услуга"],
                  ["due", "Срок"],
                  ["money", "Оплаты"],
                  ["status", "Состояние"],
                ].map(([key, label]) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      checked={prefs.columns.includes(key)}
                      onChange={(e) =>
                        changePrefs({
                          columns: e.target.checked
                            ? [...prefs.columns, key]
                            : prefs.columns.filter((c) => c !== key),
                        })
                      }
                    />
                    {label}
                  </label>
                ))}
              </div>
            )}
          </div>
          {!visible.length ? (
            <AdminBlank
              title="Проектов по этим условиям нет"
              text="Создайте проект или&nbsp;измените фильтр. Разовые консультации находятся в&nbsp;карточках&nbsp;клиентов."
            />
          ) : prefs.view === "cards" ? (
            <div className="ws-project-grid">
              {visible.map((w) => {
                const inv = data.invoices.filter((i) => i.work_id === w.id),
                  ts = data.tasks.filter((t) => t.work_id === w.id);
                return (
                  <button
                    className="admin-panel ws-project-card"
                    key={w.id}
                    onClick={() => beforeNavigate(()=>open(w.id))}
                  >
                    <div className="ws-project-card__top">
                      <span className="ws-project-icon">
                        <FolderOpen />
                      </span>
                      <span className="ws-badge">{WORK_STATUS[w.status]}</span>
                      <ArrowUpRight />
                    </div>
                    <span className="admin-meta">
                      {data.clients.find((c) => c.id === w.client_id)?.name}
                    </span>
                    <h3>{w.title}</h3>
                    <div className="ws-project-card__stats">
                      <div>
                        <span className="admin-meta">К оплате</span>
                        <MoneyTotal
                          items={inv.map((i) => ({
                            currency: i.currency,
                            amount: invoiceOutstanding(i),
                          }))}
                        />
                      </div>
                      <div>
                        <span className="admin-meta">Задачи</span>
                        <strong>
                          {ts.filter((t) => t.done).length} / {ts.length}
                        </strong>
                      </div>
                    </div>
                    <div className="ws-progress">
                      <span
                        style={{
                          width: `${ts.length ? (ts.filter((t) => t.done).length / ts.length) * 100 : 0}%`,
                        }}
                      />
                    </div>
                    <span className="admin-meta">
                      <CalendarDays />
                      {date(w.due_at)}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <div
              className="admin-panel adm-table-scroll ws-table"
              role="region"
              aria-label="Проекты"
              tabIndex={0}
            >
              <table className="adm-data-table">
                <thead>
                  <tr>
                    <th>Клиент / проект</th>
                    {prefs.columns.includes("service") && <th>Услуга</th>}
                    {prefs.columns.includes("due") && <th>Ближайший срок</th>}
                    {prefs.columns.includes("money") && (
                      <th className="is-numeric">К оплате</th>
                    )}
                    {prefs.columns.includes("status") && <th>Состояние</th>}
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((w) => (
                    <tr key={w.id}>
                      <td>
                        <button
                          className="ws-text-button"
                          onClick={() => beforeNavigate(()=>open(w.id))}
                        >
                          {w.title}
                        </button>
                        <span className="admin-meta ws-cell-note">
                          {data.clients.find((c) => c.id === w.client_id)?.name}
                        </span>
                      </td>
                      {prefs.columns.includes("service") && (
                        <td>{SERVICES.find(s=>s.value===w.service)?.label || w.service}</td>
                      )}
                      {prefs.columns.includes("due") && (
                        <td className="ws-nowrap">{date(w.due_at)}</td>
                      )}
                      {prefs.columns.includes("money") && (
                        <td className="is-numeric">
                          <MoneyTotal
                            items={data.invoices
                              .filter((i) => i.work_id === w.id)
                              .map((i) => ({
                                currency: i.currency,
                                amount: invoiceOutstanding(i),
                              }))}
                          />
                        </td>
                      )}
                      {prefs.columns.includes("status") && (
                        <td>
                          <span className="ws-badge">
                            {WORK_STATUS[w.status]}
                          </span>
                        </td>
                      )}
                      <td>
                        <AdminButton
                          tone="quiet"
                          compact
                          aria-label={`Открыть ${w.title}`}
                          onClick={() => beforeNavigate(()=>open(w.id))}
                        >
                          <ArrowUpRight />
                        </AdminButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : (
        <>
          {tab === "overview" && (
            <>
              <WorkspaceStats invoices={invoices} today={data.today} />
              <div className="ws-two-col">
                <div className="ws-stack">
                  <WorkspacePanel
                    title="Ближайшие дела"
                    action={
                      <AdminButton
                        compact
                        onClick={() => openForm({ kind: "task", work })}
                      >
                        <Plus />
                        Задача
                      </AdminButton>
                    }
                  >
                    <TaskList
                      tasks={tasks.filter((t) => !t.done).slice(0, 5)}
                      data={data}
                      store={store}
                      onNavigate={navigate}
                    />
                  </WorkspacePanel>
                  <WorkspacePanel title="Что входит в работу">
                    <p className="ws-long-text">
                      {work.scope || "Границы работы пока не описаны."}
                    </p>
                    <div className="ws-detail-line">
                      <span className="admin-meta">Стоимость услуг</span>
                      <strong>
                        {money(work.amount, work.currency)}
                        {work.billing === "monthly" ? " / месяц" : " · разово"}
                      </strong>
                    </div>
                  </WorkspacePanel>
                </div>
                <div className="ws-stack">
                  <WorkspacePanel
                    title="Клиент"
                    action={
                      <AdminButton
                        compact
                        tone="quiet"
                        aria-label="Открыть карточку клиента"
                        onClick={() =>
                          onNavigate?.({
                            section: "clients",
                            clientId: work.client_id,
                          })
                        }
                      >
                        <ArrowUpRight />
                      </AdminButton>
                    }
                  >
                    <h3>{client?.name}</h3>
                    <p className="admin-meta">
                      {client?.contact_method} {client?.contact_value}
                    </p>
                    <p className="ws-long-text">{client?.needs}</p>
                    {data.work
                      .filter(
                        (w) =>
                          w.client_id === work.client_id && w.id !== work.id,
                      )
                      .map((w) => (
                        <button
                          key={w.id}
                          className="ws-linked-row"
                          onClick={() => beforeNavigate(()=>open(w.id))}
                        >
                          {w.title}
                          <ArrowUpRight />
                        </button>
                      ))}
                  </WorkspacePanel>
                  <WorkspacePanel
                    title="Оплаты"
                    action={
                      <AdminButton
                        compact
                        tone="quiet"
                        onClick={() => beforeNavigate(()=>{setForm(null);setTab("money");})}
                      >
                        Все счета
                      </AdminButton>
                    }
                  >
                    {invoices
                      .filter((i) => invoiceOutstanding(i) > 0)
                      .map((i) => (
                        <button
                          className="ws-linked-row"
                          key={i.id}
                          onClick={() => setInvoiceId(i.id)}
                        >
                          <span>
                            Счёт {i.number || `№ ${i.id}`}
                            <small>{date(i.due_at)}</small>
                          </span>
                          <strong>
                            {money(invoiceOutstanding(i), i.currency)}
                          </strong>
                        </button>
                      ))}
                    {!invoices.some((i) => invoiceOutstanding(i) > 0) && (
                      <p className="admin-meta">
                        Открытых долгов по проекту нет.
                      </p>
                    )}
                  </WorkspacePanel>
                </div>
              </div>
            </>
          )}
          {tab === "tasks" && (
            <WorkspacePanel
              title="Задачи проекта"
              action={
                <AdminButton onClick={() => openForm({ kind: "task", work })}>
                  <Plus />
                  Добавить
                </AdminButton>
              }
            >
              <TaskList
                tasks={tasks}
                data={data}
                store={store}
                onNavigate={navigate}
              />
            </WorkspacePanel>
          )}
          {tab === "money" && (
            <>
              <WorkspaceStats invoices={invoices} today={data.today} />
              <div className="ws-toolbar">
                {work.billing === "monthly" && (
                  <input
                    className="admin-input"
                    type="month"
                    aria-label="Месяц счёта"
                    value={invoiceMonth}
                    onChange={(e) => setInvoiceMonth(e.target.value)}
                  />
                )}
                <AdminButton
                  tone="primary"
                  disabled={store.busy}
                  onClick={async () => {
                    const result = await store.mutate(
                      {
                        action: "issue_work",
                        work_id: work.id,
                        period: invoiceMonth,
                      },
                      "Черновик счёта готов",
                    );
                    if (result?.id) setInvoiceId(Number(result.id));
                  }}
                >
                  <Plus />
                  Подготовить счёт
                  {work.billing === "monthly" ? ` за ${invoiceMonth}` : ""}
                </AdminButton>
                <AdminButton
                  tone="quiet"
                  onClick={() =>
                    onNavigate?.({
                      section: "finance",
                      workId: work.id,
                      clientId: work.client_id,
                    })
                  }
                >
                  <Wallet />В общих финансах
                </AdminButton>
              </div>
              <InvoiceTable
                invoices={invoices}
                data={data}
                onOpen={setInvoiceId}
                onNavigate={navigate}
              />
            </>
          )}
          {tab === "money" && <WorkspacePanel title="Время по проекту" action={<AdminButton onClick={()=>onNavigate({section:'finance',tab:'time',workId:work.id,clientId:work.client_id})}>Записать часы</AdminButton>}><div className="ws-rows">{data.times?.filter(t=>t.work_id===work.id).map(t=><div className="ws-row" key={t.id}><span className="ws-grow"><strong>{t.note||'Работа над проектом'}</strong><span className="admin-meta">{date(t.day)}</span></span><strong className="ws-nowrap">{t.hours} ч</strong></div>)}</div><p className="admin-meta">Общее время без проекта остаётся в Финансах. Записи здесь и там — одни и те же.</p></WorkspacePanel>}
          {tab === "resources" && (
            <>
              <WorkspacePanel
                title="Материалы, доступы и заметки"
                action={
                  <AdminButton
                    onClick={() => openForm({ kind: "resource", work })}
                  >
                    <Plus />
                    Добавить
                  </AdminButton>
                }
              >
                <div className="ws-rows">
                  {data.resources
                    .filter((r) => r.work_id === work.id)
                    .map((r) => (
                      <div className="ws-row" key={r.id}>
                        <div className="ws-grow">
                          <strong>{r.title}</strong>
                          {r.kind === "access" && (
                            <span className="ws-badge">
                              {r.state === "granted"
                                ? "Доступ предоставлен"
                                : r.state === "revoked"
                                  ? "Отозван"
                                  : "Ожидается"}
                            </span>
                          )}
                          <p className="admin-meta ws-long-text">{r.body}</p>
                          {r.url && (
                            <a
                              href={r.url}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Открыть документ <ArrowUpRight />
                            </a>
                          )}
                        </div>
                        <AdminButton
                          compact
                          tone="quiet"
                          onClick={() =>
                            openForm({ kind: "resource", work, resource: r })
                          }
                        >
                          Изменить
                        </AdminButton>
                      </div>
                    ))}
                  {!data.resources.some((r) => r.work_id === work.id) && (
                    <p className="admin-meta">
                      Прикрепите ссылку на документ, доступ или заметку. Пароли
                      здесь не хранятся.
                    </p>
                  )}
                </div>
              </WorkspacePanel>
              <WorkspacePanel title="Общее по клиенту">
                <p className="admin-meta">
                  Договоры и общие доступы остаются в карточке клиента и не
                  копируются в каждый проект.
                </p>
                <div className="ws-toolbar">
                  <AdminButton
                    onClick={() =>
                      onNavigate?.({
                        section: "clients",
                        clientId: work.client_id,
                      })
                    }
                  >
                    Открыть клиента
                  </AdminButton>
                  <AdminButton
                    onClick={() =>
                      onNavigate?.({
                        section: "media",
                        folder: work.media_folder || client?.media_folder || "",
                      })
                    }
                  >
                    Медиатека проекта
                  </AdminButton>
                </div>
              </WorkspacePanel>
            </>
          )}
          {tab === "results" && (
            <WorkspacePanel
              title="Результаты по месяцам"
              action={
                <AdminButton onClick={() => openForm({ kind: "month", work })}>
                  <Plus />
                  Добавить месяц
                </AdminButton>
              }
            >
              <div
                className="adm-table-scroll ws-table"
                role="region"
                aria-label="Результаты проекта"
                tabIndex={0}
              >
                <table className="adm-data-table">
                  <thead>
                    <tr>
                      <th>Месяц</th>
                      <th>Расход</th>
                      <th>Заявки</th>
                      <th>Цена заявки</th>
                      <th>Продажи</th>
                      <th>Выручка</th>
                      <th>Отчёт</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {data.months
                      .filter((m) => m.work_id === work.id)
                      .map((m) => (
                        <tr key={m.month}>
                          <td>{m.month}</td>
                          <td>
                            {m.spend === null
                              ? "—"
                              : money(m.spend, m.currency)}
                          </td>
                          <td>{m.leads ?? "—"}</td>
                          <td>
                            {m.spend !== null && m.leads
                              ? money(m.spend / m.leads, m.currency)
                              : "—"}
                          </td>
                          <td>{m.sales ?? "—"}</td>
                          <td>
                            {m.revenue === null
                              ? "—"
                              : money(m.revenue, m.currency)}
                          </td>
                          <td>
                            {m.report_sent_at
                              ? date(m.report_sent_at)
                              : "Не отправлен"}
                            {m.report_url && <a className="ws-cell-note ws-text-button" href={m.report_url} target="_blank" rel="noopener noreferrer">Открыть отчёт</a>}
                          </td>
                          <td>
                            <AdminButton
                              compact
                              tone="quiet"
                              onClick={() =>
                                openForm({ kind: "month", work, month: m })
                              }
                            >
                              Изменить
                            </AdminButton>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              <p className="admin-meta">
                Исторические месяцы из карточки клиента остаются общими и не
                дублируются в проекты.
              </p>
            </WorkspacePanel>
          )}
          {tab === "history" && (
            <WorkspacePanel title="История работы">
              <div className="ws-timeline">
                {data.activity
                  .filter((a) => a.work_id === work.id)
                  .map((a) => (
                    <div key={a.id}>
                      <span className="admin-meta">{date(a.created_at)}</span>
                      <p>{a.text}</p>
                    </div>
                  ))}
                {invoices.flatMap((i) =>
                  (i.payments || []).map((p) => (
                    <div key={`p${p.id}`}>
                      <span className="admin-meta">
                        {p.paid_on ? date(p.paid_on) : "Дата неизвестна"}
                      </span>
                      <p>
                        {p.voided_at ? "Отменена отметка" : "Получено"}{" "}
                        {money(p.amount_cents / 100, i.currency)} · счёт{" "}
                        {i.number || i.id}
                      </p>
                    </div>
                  )),
                )}
              </div>
            </WorkspacePanel>
          )}
        </>
      )}
    </div>
  );
}

export function WorkspaceClient({
  password,
  clientId,
  initialInvoiceId,
  onNavigate: navigateExternal,
  onEdit,
  onRegisterLeaveGuard,
}: {
  password: string;
  clientId: number;
  initialInvoiceId?: number;
  onRegisterLeaveGuard?: RegisterLeaveGuard;
  onNavigate?: (t: WorkspaceTarget) => void;
  onEdit?: () => void;
}) {
  const [invoiceDirty, setInvoiceDirty] = useState(false);
  const beforeNavigate=useWorkspaceNavigation(onRegisterLeaveGuard);
  const openForm=(next:WorkspaceFormState)=>beforeNavigate(()=>setForm(next));
  const store = useWorkspace(password),
    { data } = store;
  const [form, setForm] = useState<WorkspaceFormState | null>(null),
    [invoiceId, setInvoiceId] = useState<number | null>(initialInvoiceId ?? null);
  useWorkspaceGuard(Boolean(form) || invoiceDirty, onRegisterLeaveGuard);
  const onNavigate=(t:WorkspaceTarget)=>navigateExternal?.({...t,returnTo:{section:'clients',clientId,invoiceId:invoiceId ?? undefined}});
  if (!data)
    return store.loading ? (
      <AdminSectionSkeleton tiles={3} rows={3} />
    ) : (
      <EmptyState store={store} />
    );
  const client = data.clients.find((c) => c.id === clientId);
  if (!client) return <AdminBlank title="Клиент не найден" />;
  const work = data.work.filter((w) => w.client_id === clientId),
    invoices = data.invoices.filter((i) => i.client_id === clientId),
    invoice = invoices.find((i) => i.id === invoiceId);
  return (
    <div className="ws-root ws-stack">
      {store.error && <div className="admin-notice" role="alert">{store.error} <AdminButton onClick={()=>void store.load()}>Обновить данные</AdminButton></div>}
      <div className="ws-heading">
        <div>
          <h2>{client.name}</h2>
          <p className="admin-meta">
            {client.contact_method} {client.contact_value}
          </p>
        </div>
        <AdminButton onClick={()=>beforeNavigate(()=>onEdit?.())}>Карточка и договор</AdminButton>
      </div>
      {form && (
        <WorkspaceForms
          form={form}
          key={JSON.stringify(form)}
          data={data}
          store={store}
          onClose={() => setForm(null)}
        />
      )}
      {invoice ? (
        <WorkspaceInvoice
          key={invoice.id}
          invoice={invoice}
          store={store}
          onDirtyChange={setInvoiceDirty}
          onClose={() => setInvoiceId(null)}
          onNavigate={onNavigate}
        />
      ) : (
        <>
          <WorkspaceStats invoices={invoices} today={data.today} client />
          <div className="ws-two-col">
            <div className="ws-stack">
              <WorkspacePanel
                title="Что нужно клиенту"
                action={
                  <AdminButton
                    compact
                    tone="quiet"
                    onClick={() => openForm({ kind: "profile", client })}
                  >
                    Изменить
                  </AdminButton>
                }
              >
                <p className="ws-long-text">
                  {client.needs || "Запишите задачу, с которой пришёл клиент."}
                </p>
                {client.interests && (
                  <p className="admin-meta ws-long-text">
                    Интересуют: {client.interests}
                  </p>
                )}
              </WorkspacePanel>
              <WorkspacePanel
                title="Проекты и услуги"
                action={
                  <AdminButton
                    compact
                    onClick={() =>
                      openForm({ kind: "work", client, workKind: "service" })
                    }
                  >
                    <Plus />
                    Услуга
                  </AdminButton>
                }
              >
                {work.map((w) => (
                  <button
                    className="ws-linked-row"
                    key={w.id}
                    onClick={() =>
                      onNavigate?.({ section: "projects", workId: w.id })
                    }
                  >
                    <span>
                      <strong>{w.title}</strong>
                      <small>
                        {WORK_STATUS[w.status]} · {money(w.amount, w.currency)}
                        {w.billing === "monthly" ? " / месяц" : " · разово"}
                      </small>
                    </span>
                    <ArrowUpRight />
                  </button>
                ))}
                {invoices
                  .filter((i) => !i.work_id && i.kind !== "retainer")
                  .map((i) => (
                    <button
                      className="ws-linked-row"
                      key={`i${i.id}`}
                      onClick={() => setInvoiceId(i.id)}
                    >
                      <span>
                        {i.kind === "consultation"
                          ? "Консультация"
                          : i.kind === "audit"
                            ? "Аудит"
                            : i.kind === "setup"
                              ? "Настройка"
                              : i.note || "Разовая услуга"}
                        <small>
                          {i.note} · получено{" "}
                          {money(invoiceReceived(i), i.currency)}
                        </small>
                      </span>
                      <ArrowUpRight />
                    </button>
                  ))}
                <AdminButton
                  tone="quiet"
                  onClick={() =>
                    openForm({ kind: "work", client, workKind: "project" })
                  }
                >
                  Добавить проект
                </AdminButton>
              </WorkspacePanel>
              <WorkspacePanel
                title="Следующие шаги"
                action={
                  <AdminButton
                    compact
                    onClick={() => openForm({ kind: "task", client })}
                  >
                    <Plus />
                    Задача
                  </AdminButton>
                }
              >
                <TaskList
                  tasks={data.tasks.filter((t) => t.client_id === clientId)}
                  data={data}
                  store={store}
                  onNavigate={onNavigate}
                />
                {client.next_touch_text && (
                  <p className="admin-meta">
                    Следующее касание: {client.next_touch_text} ·{" "}
                    {date(client.next_touch_at)}
                  </p>
                )}
                {data.common?.crmTasks
                  .filter(
                    (t) => t.lead_id === client.lead_id && t.status === "open",
                  )
                  .map((t) => (
                    <button
                      className="ws-linked-row"
                      key={`crm${t.id}`}
                      onClick={() =>
                        onNavigate?.({
                          section: "leads",
                          leadId: client.lead_id!,
                        })
                      }
                    >
                      <span>
                        {t.title}
                        <small>Задача CRM · {date(t.due_at)}</small>
                      </span>
                      <ArrowUpRight />
                    </button>
                  ))}
              </WorkspacePanel>
            </div>
            <div className="ws-stack">
              <WorkspacePanel
                title="Счета и оплаты"
                action={
                  <AdminButton
                    compact
                    tone="quiet"
                    onClick={() =>
                      onNavigate?.({ section: "finance", clientId })
                    }
                  >
                    В финансах
                  </AdminButton>
                }
              >
                {invoices.map((i) => (
                  <button
                    className="ws-linked-row"
                    key={i.id}
                    onClick={() => setInvoiceId(i.id)}
                  >
                    <span>
                      Счёт {i.number || `№ ${i.id}`}
                      <small>
                        Получено {money(invoiceReceived(i), i.currency)} из{" "}
                        {money(i.amount, i.currency)}
                      </small>
                    </span>
                    <ArrowUpRight />
                  </button>
                ))}
                {!invoices.length && (
                  <p className="admin-meta">Счетов пока нет.</p>
                )}
              </WorkspacePanel>
              <WorkspacePanel title="Материалы и доступы">
                {client.contract_file_url && (
                  <a
                    href={client.contract_file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Открыть договор
                  </a>
                )}
                {data.common?.access
                  .filter((a) => a.client_id === clientId)
                  .map((a) => (
                    <div className="ws-row" key={a.id}>
                      <span>{a.name}</span>
                      <span className="ws-badge">
                        {a.status === "granted"
                          ? "Получен"
                          : a.status === "revoked"
                            ? "Отозван"
                            : "Ожидается"}
                      </span>
                    </div>
                  ))}
                <AdminButton
                  tone="quiet"
                  onClick={() =>
                    onNavigate?.({
                      section: "media",
                      folder: client.media_folder,
                    })
                  }
                >
                  Медиатека клиента
                </AdminButton>
                {data.common?.notes
                  .filter((n) => n.client_id === clientId)
                  .map((n) => (
                    <p className="ws-note" key={n.id}>
                      {n.body}
                    </p>
                  ))}
              </WorkspacePanel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
