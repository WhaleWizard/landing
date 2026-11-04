import { useState } from "react";
import type {
  ClientWork,
  WorkClient,
  WorkMonth,
  WorkResource,
  WorkTask,
  WorkspaceData,
} from "../../../../../shared/admin-workspace";
import { AdminButton, AdminDecimalInput, AdminSelect } from "../AdminUI";
import type { WorkspaceStore } from "./useWorkspace";
import { SERVICES, WORK_STATUS, WorkspacePanel } from "./WorkspaceUI";
import { useWorkspaceGuard } from './useWorkspaceGuard';

type FormKind = "work" | "task" | "profile" | "resource" | "month" | "client";
export interface WorkspaceFormState {
  kind: FormKind;
  work?: ClientWork;
  client?: WorkClient;
  resource?: WorkResource;
  month?: WorkMonth;
  task?: WorkTask;
  workKind?: "project" | "service";
}
export default function WorkspaceForms({
  form,
  data,
  store,
  onClose,
  onSaved,
}: {
  form: WorkspaceFormState;
  data: WorkspaceData;
  store: WorkspaceStore;
  onClose: () => void;
  onSaved?: (result: Record<string, unknown>) => void;
}) {
  const { kind, work, client } = form;
  const [v, setV] = useState<Record<string, unknown>>(() =>
    kind === "work"
      ? {
          client_id: work?.client_id || client?.id || data.clients[0]?.id || "",
          kind: work?.kind || form.workKind || "project",
          title: "",
          service: form.workKind === "service" ? "consultation" : "google",
          status: "proposed",
          billing: form.workKind === "service" ? "one_off" : "monthly",
          amount: 0,
          currency: "USD",
          billing_day: 1,
          scope: "",
          ...work,
        }
      : kind === "profile"
        ? { ...client }
        : kind === "resource"
          ? {
              work_id: work?.id,
              kind: "link",
              state: "waiting",
              title: "",
              url: "",
              body: "",
              ...form.resource,
            }
          : kind === "month"
            ? {
                work_id: work?.id,
                month: data.today.slice(0, 7),
                currency: "USD",
                spend: null,
                leads: null,
                sales: null,
                revenue: null,
                ...form.month,
              }
            : kind === "task"
              ? {
                  client_id: client?.id || work?.client_id,
                  work_id: work?.id || null,
                  title: "",
                  due_at: data.today,
                  note: "",
                  ...form.task,
                }
              : {
                  name: "",
                  contact_method: "telegram",
                  contact_value: "",
                  relationship_type: "one_off",
                },
  );
  useWorkspaceGuard(true);
  const set = (k: string, val: unknown) =>
    setV((p) => ({
      ...p,
      [k]: val,
      ...(k === "kind" && val === "service" ? { billing: "one_off", service:"consultation" } : {}),
    }));
  const input = (
    key: string,
    label: string,
    type = "text",
    wide = false,
    required = false,
  ) => (
    <label className={`admin-field ${wide ? "ws-span" : ""}`}>
      <span className="admin-label">{label}</span>
      <input
        className="admin-input"
        type={type}
        value={String(v[key] ?? "")}
        required={required}
        disabled={key === 'month' && Boolean(form.month)}
        min={key === 'billing_day' ? 1 : undefined}
        max={key === 'billing_day' ? 28 : key === 'report_sent_at' ? data.today : undefined}
        maxLength={type === "text" ? 200 : undefined}
        onChange={(e) => set(key, e.target.value)}
      />
    </label>
  );
  const area = (key: string, label: string) => (
    <label className="admin-field ws-span">
      <span className="admin-label">{label}</span>
      <textarea
        className="admin-input"
        rows={3}
        maxLength={4000}
        value={String(v[key] || "")}
        onChange={(e) => set(key, e.target.value)}
      />
    </label>
  );
  const amount = (key: string, label: string) => (
    <label className="admin-field">
      <span className="admin-label">{label}</span>
      <AdminDecimalInput
        className="admin-input"
        value={v[key] === null || v[key] === undefined ? null : Number(v[key])}
        onValueChange={(n) => set(key, n)}
      />
    </label>
  );
  const select = (
    key: string,
    label: string,
    opts: Array<{ value: string; label: string }>,
  ) => (
    <AdminSelect
      label={label}
      value={String(v[key] ?? "")}
      options={opts}
      disabled={key === 'client_id' && Boolean(work)}
      onValueChange={(n) => set(key, n)}
    />
  );
  const titles = {
    work: work ? "Настройки работы" : "Новый проект или услуга",
    task: form.task ? "Изменить задачу" : "Новая задача",
    profile: "Потребности клиента",
    resource: "Материалы и доступы",
    month: "Результаты месяца",
    client: "Новый клиент",
  };
  return (
    <WorkspacePanel title={titles[kind]} className="ws-form-panel">
      <form
        className="ws-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const action = {
            work: "save_work",
            task: "save_task",
            profile: "save_profile",
            resource: "save_resource",
            month: "save_month",
            client: "create_client",
          }[kind];
          const result = await store.mutate({
            ...v,
            action,
            client_id: kind === "profile" ? client?.id : v.client_id,
          });
          if (result) {
            onSaved?.(result);
            onClose();
          }
        }}
      >
        {kind === "work" && (
          <>
            {select(
              "client_id",
              "Клиент",
              data.clients.map((c) => ({ value: String(c.id), label: c.name })),
            )}
            {!work &&
              select("kind", "Формат", [
                { value: "project", label: "Проект" },
                { value: "service", label: "Разовая услуга" },
              ])}
            {input("title", "Название", "text", true, true)}
            {select("service", "Услуга", SERVICES)}
            {select(
              "status",
              "Состояние",
              Object.entries(WORK_STATUS).map(([value, label]) => ({
                value,
                label,
              })),
            )}
            {select(
              "billing",
              "Оплата",
              v.kind === "service"
                ? [{ value: "one_off", label: "Один раз" }]
                : [
                    { value: "monthly", label: "Ежемесячно" },
                    { value: "one_off", label: "Один раз" },
                  ],
            )}
            {amount("amount", "Стоимость, USD")}
            {v.billing === "monthly" &&
              input("billing_day", "День выставления (1–28)", "number")}
            {input("due_at", "Ближайший срок", "date")}
            {area("scope", "Что входит в работу")}
            {input("media_folder", "Папка медиатеки", "text", true)}
          </>
        )}
        {kind === "client" && (
          <>
            {input("name", "Имя / компания", "text", true, true)}
            {select("relationship_type", "Формат сотрудничества", [
              { value: "one_off", label: "Консультация / разовые услуги" },
              { value: "ongoing", label: "Постоянное ведение" },
            ])}
            {input("contact_method", "Способ связи")}
            {input("contact_value", "Контакт", "text", true)}
          </>
        )}
        {kind === "profile" && (
          <>
            {area("needs", "С чем пришёл клиент")}
            {area("interests", "Какие услуги интересуют")}
            {select("relationship_type", "Формат сотрудничества", [
              { value: "one_off", label: "Консультации / разовые услуги" },
              { value: "ongoing", label: "Постоянное ведение" },
            ])}
          </>
        )}
        {kind === "task" && (
          <>
            {input("title", "Что сделать", "text", true, true)}
            {input("due_at", "Срок", "date")}
            {area("note", "Подробности")}
          </>
        )}
        {kind === "resource" && (
          <>
            {select("kind", "Тип", [
              { value: "link", label: "Ссылка" },
              { value: "file", label: "Файл из медиатеки / документ" },
              { value: "access", label: "Доступ без пароля" },
              { value: "note", label: "Заметка" },
            ])}
            {input("title", "Название", "text", false, true)}
            {(v.kind === "file" || v.kind === "link") &&
              input("url", "Ссылка", "url", true)}
            {v.kind === "access" &&
              select("state", "Доступ", [
                { value: "waiting", label: "Ожидается" },
                { value: "granted", label: "Предоставлен" },
                { value: "revoked", label: "Отозван" },
              ])}
            {area(
              "body",
              v.kind === "access"
                ? "Примечание — пароли здесь не хранить"
                : "Описание",
            )}
          </>
        )}
        {kind === "month" && (
          <>
            {input("month", "Месяц", "month", false, true)}
            {amount("spend", "Рекламный расход, USD")}
            {amount("leads", "Заявки")}
            {amount("sales", "Продажи")}
            {amount("revenue", "Выручка клиента, USD")}
            {input("report_sent_at", "Дата отправки отчёта", "date")}
            {input("report_url", "Ссылка на отчёт", "url", true)}
            {area("note", "Примечание")}
            <p className="admin-meta ws-span">
              Пустое поле означает «нет данных». Рекламный бюджет не считается
              оплатой ваших услуг.
            </p>
          </>
        )}
        <div className="ws-form-actions">
          <AdminButton type="submit" tone="primary" disabled={store.busy}>
            {store.busy ? "Сохраняю…" : "Сохранить"}
          </AdminButton>
          <AdminButton onClick={onClose} disabled={store.busy}>
            Отмена
          </AdminButton>
        </div>
      </form>
    </WorkspacePanel>
  );
}
