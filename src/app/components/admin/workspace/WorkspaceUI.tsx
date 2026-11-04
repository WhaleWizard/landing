import type { ReactNode } from "react";
import { CircleDollarSign, ArrowDownLeft, Clock3 } from "lucide-react";
import {
  invoiceOutstanding,
  invoiceReceived,
  moneyGroups,
  type WorkInvoice,
} from "../../../../../shared/admin-workspace";

export const money = (n: number, c = "USD") =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: c,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
export const date = (day: string | null | undefined) =>
  day
    ? new Date(day.slice(0, 10) + "T12:00:00Z").toLocaleDateString("ru-RU", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : "Без срока";
export const WORK_STATUS: Record<string, string> = {
  proposed: "Обсуждаем",
  active: "В работе",
  paused: "На паузе",
  completed: "Завершено",
  cancelled: "Отменено",
};
export const SERVICES = [
  { value: "google", label: "Google Ads" },
  { value: "meta", label: "Meta Ads" },
  { value: "consultation", label: "Консультация" },
  { value: "audit", label: "Аудит" },
  { value: "setup", label: "Настройка" },
  { value: "other", label: "Другая услуга" },
];
export function InvoiceStatus({
  invoice,
  today,
}: {
  invoice: WorkInvoice;
  today: string;
}) {
  const left = invoiceOutstanding(invoice);
  const overdue =
    left > 0 && Boolean(invoice.due_at) && invoice.due_at! < today;
  return (
    <span
      className={`ws-badge ${overdue ? "is-overdue" : invoice.status === "paid" ? "is-paid" : ""}`}
    >
      {overdue
        ? "Просрочен"
        : invoice.status === "draft"
          ? "Черновик"
          : invoice.status === "cancelled"
            ? "Отменён"
            : left > 0 && invoiceReceived(invoice) > 0
              ? "Частично оплачен"
              : invoice.status === "paid"
                ? "Оплачен"
                : "Ждём оплату"}
    </span>
  );
}
export function MoneyTotal({
  items,
}: {
  items: Array<{ currency: string; amount: number }>;
}) {
  const groups = moneyGroups(items);
  return (
    <>
      {groups.length ? (
        groups.map((g) => (
          <span className="ws-money" key={g.currency}>
            {money(g.amount, g.currency)}
          </span>
        ))
      ) : (
        <span className="ws-money">—</span>
      )}
    </>
  );
}
export function WorkspaceStats({
  invoices,
  today,
  client = false,
}: {
  invoices: WorkInvoice[];
  today: string;
  client?: boolean;
}) {
  const groups = [
    {
      title: "Получено",
      icon: ArrowDownLeft,
      items: invoices.map((i) => ({
        currency: i.currency,
        amount: invoiceReceived(i),
      })),
      note: "Фактические поступления",
    },
    {
      title: client ? "Из них разовые" : "Осталось получить",
      icon: CircleDollarSign,
      items: invoices
        .filter((i) => !client || i.kind !== "retainer")
        .map((i) => ({
          currency: i.currency,
          amount: client ? invoiceReceived(i) : invoiceOutstanding(i),
        })),
      note: client ? "Входят в общую сумму" : "По выставленным счетам",
    },
    {
      title: client ? "Осталось получить" : "Из них просрочено",
      icon: Clock3,
      items: invoices
        .filter((i) => client || (Boolean(i.due_at) && i.due_at! < today))
        .map((i) => ({ currency: i.currency, amount: invoiceOutstanding(i) })),
      note: client ? "По выставленным счетам" : "Срок оплаты уже прошёл",
    },
  ];
  return (
    <div className="ws-stat-grid">
      {groups.map((g) => (
        <div className="admin-panel ws-stat" key={g.title}>
          <div className="ws-stat__label">
            <g.icon aria-hidden="true" />
            {g.title}
          </div>
          <div className="ws-stat__value">
            <MoneyTotal items={g.items} />
          </div>
          <span className="admin-meta">{g.note}</span>
        </div>
      ))}
    </div>
  );
}
export function WorkspacePanel({
  title,
  action,
  children,
  className = "",
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`admin-panel ws-panel ${className}`}>
      <header className="ws-panel__head">
        <h3 className="admin-card-title">{title}</h3>
        {action}
      </header>
      <div className="ws-panel__body">{children}</div>
    </section>
  );
}
