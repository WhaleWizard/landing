/** Shared accounting contract. All amounts are grouped by currency. */
export interface WorkPayment {
  id: number;
  invoice_id: number;
  amount_cents: number;
  paid_on: string | null;
  note: string;
  voided_at: string | null;
  void_reason: string;
}
export interface WorkInvoice {
  id: number;
  client_id: number | null;
  work_id?: number | null;
  number: string;
  period: string;
  amount: number;
  currency: string;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  status: "draft" | "issued" | "paid" | "cancelled";
  kind?: string;
  payer?: string;
  note: string;
  payments?: WorkPayment[];
}
export interface ClientWork {
  id: number;
  client_id: number;
  kind: "project" | "service";
  title: string;
  service: string;
  status: "proposed" | "active" | "paused" | "completed" | "cancelled";
  billing: "one_off" | "monthly";
  amount: number;
  currency: string;
  billing_day: number;
  due_at: string | null;
  scope: string;
  media_folder: string;
  revision: number;
  created_at: string;
  updated_at: string;
}
export interface WorkClient {
  id: number;
  lead_id: number | null;
  name: string;
  company: string;
  status: string;
  needs: string;
  interests: string;
  relationship_type: string;
  contact_method: string;
  contact_value: string;
  media_folder: string;
  contract_file_url: string;
  next_touch_at: string | null;
  next_touch_text: string;
  scope_included: string;
}
export interface WorkTask {
  id: number;
  client_id: number;
  work_id: number | null;
  invoice_id: number | null;
  title: string;
  due_at: string | null;
  done: number;
  note: string;
  revision: number;
}
export interface WorkResource {
  id: number;
  work_id: number;
  kind: "file" | "link" | "access" | "note";
  title: string;
  url: string;
  body: string;
  state: string;
  revision: number;
}
export interface WorkMonth {
  work_id: number;
  month: string;
  spend: number | null;
  currency: string;
  leads: number | null;
  sales: number | null;
  revenue: number | null;
  report_url: string;
  report_sent_at: string | null;
  note: string;
  revision: number;
}
export interface WorkspaceData {
  success: boolean;
  today: string;
  clients: WorkClient[];
  work: ClientWork[];
  invoices: WorkInvoice[];
  tasks: WorkTask[];
  resources: WorkResource[];
  months: WorkMonth[];
  times?: Array<{id:number;client_id:number|null;work_id:number|null;day:string;hours:number;note:string}>;
  activity: Array<{
    id: number;
    client_id: number;
    work_id: number | null;
    kind: string;
    text: string;
    created_at: string;
  }>;
  common?: {
    access: Array<{
      id: number;
      client_id: number;
      name: string;
      status: string;
      note: string;
    }>;
    notes: Array<{ id: number; client_id: number; body: string }>;
    months: Array<Record<string, unknown>>;
    crmTasks: Array<{
      id: number;
      lead_id: number;
      title: string;
      status: string;
      due_at: string | null;
    }>;
  };
}
export type WorkspaceTarget = {
  section: "projects" | "clients" | "finance" | "planner" | "leads" | "media";
  clientId?: number;
  workId?: number;
  invoiceId?: number;
  leadId?: number;
  folder?: string;
  tab?: string;
  nonce?: number;
  returnTo?: Omit<WorkspaceTarget, 'returnTo'>;
};
export function invoiceReceipts(
  invoice: WorkInvoice,
): Array<{ amount: number; day: string | null; id: number }> {
  if (invoice.payments)
    return invoice.payments
      .filter((p) => !p.voided_at)
      .map((p) => ({ amount: p.amount_cents / 100, day: p.paid_on, id: p.id }));
  return invoice.status === "paid"
    ? [{ amount: invoice.amount, day: invoice.paid_at, id: 0 }]
    : [];
}
export function invoiceReceived(invoice: WorkInvoice): number {
  return (
    Math.round(
      invoiceReceipts(invoice).reduce((sum, p) => sum + p.amount, 0) * 100,
    ) / 100
  );
}
export function invoiceOutstanding(invoice: WorkInvoice): number {
  return invoice.status === "issued"
    ? Math.max(
        0,
        Math.round((invoice.amount - invoiceReceived(invoice)) * 100) / 100,
      )
    : 0;
}
export function invoiceIsOverdue(invoice: WorkInvoice, today: string): boolean {
  return Boolean(invoice.due_at && invoice.due_at < today && invoiceOutstanding(invoice) > 0);
}
export function moneyGroups(
  items: Array<{ currency: string; amount: number }>,
): Array<{ currency: string; amount: number }> {
  const sums = new Map<string, number>();
  for (const i of items)
    sums.set(
      i.currency,
      (sums.get(i.currency) || 0) + Math.round(i.amount * 100),
    );
  return [...sums].map(([currency, cents]) => ({
    currency,
    amount: cents / 100,
  }));
}
