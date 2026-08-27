import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Clock3, CircleDollarSign, Plus, Receipt, RefreshCw, Save, Trash2, Wallet,
} from 'lucide-react';
import { AdminDecimalInput, AdminSelect } from './AdminUI';
import { AdminBlank, AdminSectionSkeleton, confirmAsk, notify } from './AdminFeedback';

/**
 * Финансы: счета, свои расходы и часы по клиентам в одном разделе.
 *
 * Три темы связаны одной логикой — деньги клиента от выставленного счёта до
 * прибыли в кармане и цена этих денег в часах. «Цели и деньги» — это про план,
 * а здесь только факт.
 *
 * Разные валюты не складываются: курсов в системе нет, а придуманный курс
 * превратил бы прибыль в фантазию.
 */

type Tab = 'invoices' | 'totals' | 'time';
type InvoiceStatus = 'draft' | 'issued' | 'paid' | 'cancelled';

interface Invoice {
  id: number;
  client_id: number | null;
  number: string;
  period: string;
  amount: number;
  currency: string;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  status: InvoiceStatus;
  note: string;
}

interface Expense {
  id: number;
  day: string;
  category: string;
  amount: number;
  currency: string;
  note: string;
}

interface TimeEntry {
  id: number;
  client_id: number | null;
  day: string;
  hours: number;
  note: string;
}

interface FinanceClient {
  id: number;
  name: string;
  status: string;
  retainer_amount: number;
  retainer_currency: string;
  billing_day: number | null;
}

interface Settings {
  tax_rate: number;
  target_hourly_rate: number;
  main_currency: string;
  requisites: string;
}

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'черновик',
  issued: 'выставлен',
  paid: 'оплачен',
  cancelled: 'отменён',
};

const STATUS_OPTIONS = (Object.keys(STATUS_LABEL) as InvoiceStatus[]).map((value) => ({ value, label: STATUS_LABEL[value] }));

type Money = Map<string, number>;

function addMoney(target: Money, currency: string, amount: number): void {
  if (!amount) return;
  const key = currency || '—';
  target.set(key, (target.get(key) || 0) + amount);
}

function formatMoney(money: Money): string {
  if (!money.size) return '—';
  return [...money.entries()]
    .map(([currency, amount]) => `${Math.round(amount).toLocaleString('ru-RU')} ${currency}`)
    .join(' · ');
}

function formatOne(amount: number, currency: string): string {
  return `${Math.round(amount).toLocaleString('ru-RU')} ${currency}`;
}

function monthOf(day: string | null): string {
  return day ? day.slice(0, 7) : '';
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(month: string): string {
  const [year, monthPart] = month.split('-').map(Number);
  if (!year || !monthPart) return month;
  return new Date(Date.UTC(year, monthPart - 1, 1))
    .toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

/** Просрочен — это выставленный счёт со сроком в прошлом, а не хранимый статус. */
function isOverdue(invoice: Invoice, today: string): boolean {
  return invoice.status === 'issued' && Boolean(invoice.due_at) && (invoice.due_at as string) < today;
}

export default function AdminFinance({ password }: { password: string }) {
  const [tab, setTab] = useState<Tab>('invoices');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([]);
  const [clients, setClients] = useState<FinanceClient[]>([]);
  const [settings, setSettings] = useState<Settings>({ tax_rate: 0, target_hourly_rate: 0, main_currency: 'USD', requisites: '' });
  const [today, setToday] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [migration, setMigration] = useState('');
  const [busy, setBusy] = useState(false);

  const [invoiceDraft, setInvoiceDraft] = useState<Invoice | null>(null);
  const [expenseDraft, setExpenseDraft] = useState<Expense | null>(null);
  const [timeDraft, setTimeDraft] = useState<TimeEntry | null>(null);
  const [issueMonth, setIssueMonth] = useState(currentMonth());

  const clientName = useCallback((id: number | null) => (
    clients.find((client) => client.id === id)?.name || (id ? `#${id}` : 'без клиента')
  ), [clients]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/finance', {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as {
        success?: boolean; error?: string; migration?: string;
        invoices?: Invoice[]; expenses?: Expense[]; timeEntries?: TimeEntry[];
        clients?: FinanceClient[]; settings?: Settings; today?: string;
      } | null;
      if (!response.ok || !payload?.success) {
        setMigration(payload?.migration || '');
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      setMigration('');
      setInvoices(payload.invoices || []);
      setExpenses(payload.expenses || []);
      setTimeEntries(payload.timeEntries || []);
      setClients(payload.clients || []);
      if (payload.settings) setSettings(payload.settings);
      if (payload.today) setToday(payload.today);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить финансы');
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => { void load(); }, [load]);

  const request = useCallback(async (payload: Record<string, unknown>, success?: string) => {
    setBusy(true);
    try {
      const response = await fetch('/api/admin/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
        credentials: 'same-origin',
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null) as Record<string, unknown> | null;
      if (!response.ok || !result?.success) {
        if (result?.migration) setMigration(String(result.migration));
        throw new Error(String(result?.error || `HTTP ${response.status}`));
      }
      if (success) notify.success(success);
      await load();
      return result;
    } catch (requestError) {
      notify.error('Не получилось', requestError instanceof Error ? requestError.message : undefined);
      return null;
    } finally {
      setBusy(false);
    }
  }, [load, password]);

  // ---------- Сводки ----------

  const summary = useMemo(() => {
    const outstanding: Money = new Map();
    const overdue: Money = new Map();
    const receivedThisMonth: Money = new Map();
    const spentThisMonth: Money = new Map();
    const month = currentMonth();

    invoices.forEach((invoice) => {
      if (invoice.status === 'issued') {
        addMoney(outstanding, invoice.currency, invoice.amount);
        if (isOverdue(invoice, today)) addMoney(overdue, invoice.currency, invoice.amount);
      }
      if (invoice.status === 'paid' && monthOf(invoice.paid_at) === month) {
        addMoney(receivedThisMonth, invoice.currency, invoice.amount);
      }
    });
    expenses.forEach((expense) => {
      if (monthOf(expense.day) === month) addMoney(spentThisMonth, expense.currency, expense.amount);
    });

    // Прибыль считается по каждой валюте отдельно: вычитать рублёвые расходы
    // из долларов нельзя, курсов в системе нет.
    //
    // Валюта попадает в расчёт, если в ней было хоть что-то — приход или
    // расход. Раньше перебирались только приходы, и месяц, где в валюте были
    // одни траты, показывал по ней пустоту вместо минуса: расход существовал,
    // но в итогах не появлялся нигде.
    const profit: Money = new Map();
    const currencies = new Set<string>([...receivedThisMonth.keys(), ...spentThisMonth.keys()]);
    currencies.forEach((currency) => {
      const received = receivedThisMonth.get(currency) || 0;
      const tax = received * (Number(settings.tax_rate) || 0) / 100;
      profit.set(currency, received - tax - (spentThisMonth.get(currency) || 0));
    });

    const tax: Money = new Map();
    receivedThisMonth.forEach((amount, currency) => {
      tax.set(currency, amount * (Number(settings.tax_rate) || 0) / 100);
    });

    return { outstanding, overdue, receivedThisMonth, spentThisMonth, profit, tax };
  }, [expenses, invoices, settings.tax_rate, today]);

  const byMonth = useMemo(() => {
    const map = new Map<string, { received: Money; spent: Money }>();
    const ensure = (month: string) => {
      const found = map.get(month);
      if (found) return found;
      const created = { received: new Map() as Money, spent: new Map() as Money };
      map.set(month, created);
      return created;
    };
    invoices.forEach((invoice) => {
      if (invoice.status !== 'paid' || !invoice.paid_at) return;
      addMoney(ensure(monthOf(invoice.paid_at)).received, invoice.currency, invoice.amount);
    });
    expenses.forEach((expense) => addMoney(ensure(monthOf(expense.day)).spent, expense.currency, expense.amount));
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
  }, [expenses, invoices]);

  const byClient = useMemo(() => {
    const map = new Map<number, Money>();
    invoices.forEach((invoice) => {
      if (invoice.status !== 'paid' || invoice.client_id === null) return;
      const money = map.get(invoice.client_id) || new Map();
      addMoney(money, invoice.currency, invoice.amount);
      map.set(invoice.client_id, money);
    });
    // Порядок в списке «кто сколько принёс» — по основной валюте, а не по
    // сумме всех валют разом. Складывать рубли с долларами нельзя нигде, в том
    // числе для сортировки: 100 000 ₽ обгоняли 5000 $, и список показывал
    // неверную картину того, кто на самом деле приносит больше.
    //
    // Кто в основной валюте не платил, идёт следом по алфавиту: придумывать им
    // курс, чтобы поставить в общий ряд, нельзя.
    const primary = settings.main_currency || 'USD';
    return [...map.entries()]
      .map(([id, money]) => ({ id, name: clientName(id), money, primaryTotal: money.get(primary) || 0 }))
      .sort((a, b) => b.primaryTotal - a.primaryTotal || a.name.localeCompare(b.name, 'ru'));
  }, [clientName, invoices, settings.main_currency]);

  const hoursByClient = useMemo(() => {
    const month = currentMonth();
    const map = new Map<number | null, number>();
    timeEntries.forEach((entry) => {
      if (monthOf(entry.day) !== month) return;
      map.set(entry.client_id, (map.get(entry.client_id) || 0) + entry.hours);
    });
    return [...map.entries()].map(([id, hours]) => {
      const client = clients.find((item) => item.id === id);
      const rate = client && client.retainer_amount > 0 && hours > 0 ? client.retainer_amount / hours : null;
      return {
        id,
        name: clientName(id),
        hours,
        retainer: client?.retainer_amount || 0,
        currency: client?.retainer_currency || '',
        rate,
        low: rate !== null && settings.target_hourly_rate > 0 && rate < settings.target_hourly_rate,
      };
    }).sort((a, b) => b.hours - a.hours);
  }, [clientName, clients, settings.target_hourly_rate, timeEntries]);

  const clientOptions = useMemo(() => (
    [{ value: '0', label: 'Без клиента' }, ...clients.map((client) => ({ value: String(client.id), label: client.name }))]
  ), [clients]);

  if (loading && !invoices.length && !migration && !error) return <AdminSectionSkeleton tiles={3} rows={5} />;

  if (migration) {
    return (
      <div className="admin-notice admin-notice--warning" role="status">
        Примените миграцию <code>{migration}</code> — до неё раздел «Финансы» негде хранить.
      </div>
    );
  }

  return (
    <div className="admin-stack admin-stack--lg finance">
      <div className="admin-section-header">
        <div>
          <p className="admin-eyebrow">Факт</p>
          <h2 className="admin-title">Финансы</h2>
          <p className="admin-subtitle">
            Счета, свои расходы и часы по клиентам. «Цели и деньги» — про план, здесь только то, что случилось на самом деле.
          </p>
        </div>
        <button type="button" className="admin-button admin-button--secondary" disabled={loading} onClick={() => void load()}>
          <RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Обновить
        </button>
      </div>

      {error && <div className="admin-notice admin-notice--danger" role="alert">{error}</div>}

      <div className="adm-tiles">
        <div className="adm-tile">
          <span className="adm-tile__title">Ждём оплаты</span>
          <strong className="adm-tile__value">{formatMoney(summary.outstanding)}</strong>
          <span className="admin-hint">
            {summary.overdue.size ? `Просрочено: ${formatMoney(summary.overdue)}` : 'Просроченных счетов нет.'}
          </span>
        </div>
        <div className="adm-tile">
          <span className="adm-tile__title">Получено в этом месяце</span>
          <strong className="adm-tile__value">{formatMoney(summary.receivedThisMonth)}</strong>
          <span className="admin-hint">
            {settings.tax_rate > 0 ? `Отложить на налог: ${formatMoney(summary.tax)}` : 'Ставка налога не задана — налог не считается.'}
          </span>
        </div>
        <div className="adm-tile">
          <span className="adm-tile__title">Прибыль в этом месяце</span>
          <strong className="adm-tile__value">{formatMoney(summary.profit)}</strong>
          <span className="admin-hint">Получено минус налог и расходы, по каждой валюте отдельно.</span>
        </div>
      </div>

      <div className="crm-view-switch" role="group" aria-label="Разделы финансов">
        {([['invoices', 'Счета'], ['totals', 'Итоги'], ['time', 'Время']] as const).map(([value, label]) => (
          <button key={value} type="button" aria-pressed={tab === value} className={tab === value ? 'is-active' : ''} onClick={() => setTab(value)}>
            {label}
          </button>
        ))}
      </div>

      {/* ---------- Счета ---------- */}
      {tab === 'invoices' && (
        <section className="admin-panel adm-card">
          <header className="adm-card__head adm-card__head--row">
            <div>
              <h3 className="admin-card-title"><Receipt aria-hidden="true" /> Счета</h3>
              <p className="admin-hint">У абонентки счета из месяца в месяц одинаковые — выставляйте их разом.</p>
            </div>
            <div className="finance__head-actions">
              <input className="admin-input" type="month" value={issueMonth} onChange={(event) => setIssueMonth(event.target.value)} aria-label="Месяц выставления" />
              <button type="button" className="admin-button admin-button--compact" disabled={busy} onClick={async () => {
                const result = await request({ action: 'issue_month', period: issueMonth });
                if (result) {
                  const created = Number(result.created || 0);
                  notify.success(created ? `Выставлено счетов: ${created}` : 'Новых счетов не появилось', created ? undefined : 'У всех активных клиентов счёт за этот месяц уже есть.');
                }
              }}>
                Выставить за месяц
              </button>
              <button type="button" className="admin-button admin-button--primary admin-button--compact" onClick={() => setInvoiceDraft({
                id: 0, client_id: null, number: '', period: currentMonth(), amount: 0,
                currency: settings.main_currency, issued_at: today, due_at: null, paid_at: null, status: 'issued', note: '',
              })}>
                <Plus aria-hidden="true" /> Счёт
              </button>
            </div>
          </header>

          {invoiceDraft && (
            <div className="finance__form">
              <div className="admin-crm-form-grid">
                <AdminSelect label="Клиент" value={String(invoiceDraft.client_id || 0)} options={clientOptions}
                  onValueChange={(value) => setInvoiceDraft({ ...invoiceDraft, client_id: Number(value) || null })} />
                <label className="admin-field"><span className="admin-label">За месяц</span>
                  <input className="admin-input" type="month" value={invoiceDraft.period} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, period: e.target.value })} />
                </label>
                <label className="admin-field"><span className="admin-label">Сумма</span>
                  <AdminDecimalInput className="admin-input" value={invoiceDraft.amount} onValueChange={(amount) => setInvoiceDraft({ ...invoiceDraft, amount: amount ?? 0 })} />
                </label>
                <label className="admin-field"><span className="admin-label">Валюта</span>
                  <input className="admin-input" maxLength={3} value={invoiceDraft.currency} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, currency: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })} />
                </label>
                <label className="admin-field"><span className="admin-label">Выставлен</span>
                  <input className="admin-input" type="date" value={invoiceDraft.issued_at || ''} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, issued_at: e.target.value || null })} />
                </label>
                <label className="admin-field"><span className="admin-label">Оплатить до</span>
                  <input className="admin-input" type="date" value={invoiceDraft.due_at || ''} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, due_at: e.target.value || null })} />
                </label>
                <AdminSelect label="Статус" value={invoiceDraft.status} options={STATUS_OPTIONS}
                  onValueChange={(value) => setInvoiceDraft({ ...invoiceDraft, status: value as InvoiceStatus })} />
                <label className="admin-field"><span className="admin-label">Номер</span>
                  <input className="admin-input" maxLength={60} value={invoiceDraft.number} onChange={(e) => setInvoiceDraft({ ...invoiceDraft, number: e.target.value })} />
                </label>
              </div>
              <div className="finance__form-actions">
                <button type="button" className="admin-button admin-button--primary" disabled={busy} onClick={async () => {
                  const saved = await request({ ...invoiceDraft, action: 'save_invoice' }, 'Счёт сохранён');
                  if (saved) setInvoiceDraft(null);
                }}>
                  <Save aria-hidden="true" /> Сохранить
                </button>
                <button type="button" className="admin-button admin-button--quiet" onClick={() => setInvoiceDraft(null)}>Отмена</button>
              </div>
            </div>
          )}

          {invoices.length === 0 && !invoiceDraft ? (
            <AdminBlank inline title="Счетов пока нет" text="Выставьте счета за месяц одной кнопкой — по всем активным клиентам с заполненным чеком." />
          ) : (
            <div className="adm-table-scroll" role="region" aria-label="Счета" tabIndex={0}>
              <table className="adm-data-table">
                <thead>
                  <tr>
                    <th>Клиент</th><th>За месяц</th><th className="is-numeric">Сумма</th>
                    <th>Срок</th><th>Статус</th><th />
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => {
                    const overdue = isOverdue(invoice, today);
                    return (
                      <tr key={invoice.id}>
                        <td>{clientName(invoice.client_id)}</td>
                        <td>{invoice.period ? formatMonthLabel(invoice.period) : '—'}</td>
                        <td className="is-numeric">{formatOne(invoice.amount, invoice.currency)}</td>
                        <td className={overdue ? 'is-bad' : ''}>{invoice.due_at || '—'}</td>
                        <td className={overdue ? 'is-bad' : invoice.status === 'paid' ? 'is-good' : ''}>
                          {overdue ? 'просрочен' : STATUS_LABEL[invoice.status]}
                        </td>
                        <td>
                          <div className="finance__row-actions">
                            {invoice.status !== 'paid' && invoice.status !== 'cancelled' && (
                              <button type="button" className="admin-button admin-button--compact" disabled={busy}
                                onClick={() => void request({ action: 'mark_paid', id: invoice.id }, 'Оплата отмечена')}>
                                Оплачен
                              </button>
                            )}
                            <button type="button" className="admin-icon-button" aria-label="Изменить счёт" onClick={() => setInvoiceDraft(invoice)}>
                              <RefreshCw aria-hidden="true" />
                            </button>
                            <button type="button" className="admin-icon-button" aria-label="Удалить счёт" onClick={async () => {
                              const confirmed = await confirmAsk({ title: 'Удалить счёт?', description: 'Восстановить его будет нельзя.', confirmLabel: 'Удалить', tone: 'danger' });
                              if (confirmed) void request({ action: 'delete_invoice', id: invoice.id }, 'Счёт удалён');
                            }}>
                              <Trash2 aria-hidden="true" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ---------- Итоги ---------- */}
      {tab === 'totals' && (
        <>
          <section className="admin-panel adm-card">
            <header className="adm-card__head">
              <h3 className="admin-card-title"><Wallet aria-hidden="true" /> Настройки расчёта</h3>
              <p className="admin-hint">Ставку налога не угадываю: у режимов она разная, а ошибка в проценте — это ошибка в отложенных деньгах.</p>
            </header>
            <div className="admin-crm-form-grid">
              <label className="admin-field"><span className="admin-label">Ставка налога, %</span>
                <AdminDecimalInput className="admin-input" value={settings.tax_rate} onValueChange={(rate) => setSettings({ ...settings, tax_rate: rate ?? 0 })} />
              </label>
              <label className="admin-field"><span className="admin-label">Целевая ставка в час</span>
                <AdminDecimalInput className="admin-input" value={settings.target_hourly_rate} onValueChange={(rate) => setSettings({ ...settings, target_hourly_rate: rate ?? 0 })} />
              </label>
              <label className="admin-field"><span className="admin-label">Основная валюта</span>
                <input className="admin-input" maxLength={3} value={settings.main_currency} onChange={(e) => setSettings({ ...settings, main_currency: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })} />
              </label>
            </div>
            <button type="button" className="admin-button admin-button--primary" disabled={busy}
              onClick={() => void request({ action: 'save_settings', ...settings }, 'Настройки сохранены')}>
              <Save aria-hidden="true" /> Сохранить настройки
            </button>
          </section>

          <section className="admin-panel adm-card">
            <header className="adm-card__head adm-card__head--row">
              <div>
                <h3 className="admin-card-title"><CircleDollarSign aria-hidden="true" /> Расходы</h3>
                <p className="admin-hint">Сервисы, подписки, реклама на себя — всё, что вычитается из дохода.</p>
              </div>
              <button type="button" className="admin-button admin-button--compact" onClick={() => setExpenseDraft({
                id: 0, day: today, category: '', amount: 0, currency: settings.main_currency, note: '',
              })}>
                <Plus aria-hidden="true" /> Расход
              </button>
            </header>

            {expenseDraft && (
              <div className="finance__form">
                <div className="admin-crm-form-grid">
                  <label className="admin-field"><span className="admin-label">Дата</span>
                    <input className="admin-input" type="date" value={expenseDraft.day} onChange={(e) => setExpenseDraft({ ...expenseDraft, day: e.target.value })} />
                  </label>
                  <label className="admin-field"><span className="admin-label">Категория</span>
                    <input className="admin-input" maxLength={80} placeholder="сервисы, реклама, налоги" value={expenseDraft.category} onChange={(e) => setExpenseDraft({ ...expenseDraft, category: e.target.value })} />
                  </label>
                  <label className="admin-field"><span className="admin-label">Сумма</span>
                    <AdminDecimalInput className="admin-input" value={expenseDraft.amount} onValueChange={(amount) => setExpenseDraft({ ...expenseDraft, amount: amount ?? 0 })} />
                  </label>
                  <label className="admin-field"><span className="admin-label">Валюта</span>
                    <input className="admin-input" maxLength={3} value={expenseDraft.currency} onChange={(e) => setExpenseDraft({ ...expenseDraft, currency: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })} />
                  </label>
                  <label className="admin-field admin-field--wide"><span className="admin-label">Комментарий</span>
                    <input className="admin-input" maxLength={300} value={expenseDraft.note} onChange={(e) => setExpenseDraft({ ...expenseDraft, note: e.target.value })} />
                  </label>
                </div>
                <div className="finance__form-actions">
                  <button type="button" className="admin-button admin-button--primary" disabled={busy} onClick={async () => {
                    const saved = await request({ ...expenseDraft, action: 'save_expense' }, 'Расход записан');
                    if (saved) setExpenseDraft(null);
                  }}>Сохранить</button>
                  <button type="button" className="admin-button admin-button--quiet" onClick={() => setExpenseDraft(null)}>Отмена</button>
                </div>
              </div>
            )}

            {expenses.length > 0 && (
              <ul className="finance__list">
                {expenses.slice(0, 15).map((expense) => (
                  <li key={expense.id}>
                    <span className="finance__list-day">{expense.day}</span>
                    <span className="finance__list-main">{expense.category || 'без категории'}{expense.note ? ` · ${expense.note}` : ''}</span>
                    <strong>{formatOne(expense.amount, expense.currency)}</strong>
                    <button type="button" className="admin-icon-button" aria-label="Удалить расход"
                      onClick={() => void request({ action: 'delete_expense', id: expense.id })}>
                      <Trash2 aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="admin-panel adm-card">
            <header className="adm-card__head">
              <h3 className="admin-card-title">По месяцам</h3>
            </header>
            {byMonth.length === 0 ? (
              <AdminBlank inline title="Пока нечего считать" text="Итоги появятся, когда будет первый оплаченный счёт или записанный расход." />
            ) : (
              <div className="adm-table-scroll" role="region" aria-label="Итоги по месяцам" tabIndex={0}>
                <table className="adm-data-table">
                  <thead><tr><th>Месяц</th><th>Получено</th><th>Расходы</th><th>Налог</th><th>Прибыль</th></tr></thead>
                  <tbody>
                    {byMonth.map(([month, data]) => {
                      const tax: Money = new Map();
                      const profit: Money = new Map();
                      data.received.forEach((amount, currency) => {
                        const taxAmount = amount * (Number(settings.tax_rate) || 0) / 100;
                        tax.set(currency, taxAmount);
                        profit.set(currency, amount - taxAmount - (data.spent.get(currency) || 0));
                      });
                      return (
                        <tr key={month}>
                          <td>{formatMonthLabel(month)}</td>
                          <td>{formatMoney(data.received)}</td>
                          <td>{formatMoney(data.spent)}</td>
                          <td>{formatMoney(tax)}</td>
                          <td className="is-key">{formatMoney(profit)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {byClient.length > 0 && (
            <section className="admin-panel adm-card">
              <header className="adm-card__head">
                <h3 className="admin-card-title">Кто сколько принёс</h3>
                <p className="admin-hint">Только оплаченные счета за последний год.</p>
              </header>
              <ul className="finance__list">
                {byClient.map((row) => (
                  <li key={row.id}>
                    <span className="finance__list-main">{row.name}</span>
                    <strong>{formatMoney(row.money)}</strong>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}

      {/* ---------- Время ---------- */}
      {tab === 'time' && (
        <>
          <section className="admin-panel adm-card">
            <header className="adm-card__head adm-card__head--row">
              <div>
                <h3 className="admin-card-title"><Clock3 aria-hidden="true" /> Часы по клиентам</h3>
                <p className="admin-hint">Ставка в час — единственный способ увидеть, кто платит мало за много вашего времени.</p>
              </div>
              <button type="button" className="admin-button admin-button--primary admin-button--compact" onClick={() => setTimeDraft({
                id: 0, client_id: clients[0]?.id || null, day: today, hours: 1, note: '',
              })}>
                <Plus aria-hidden="true" /> Записать часы
              </button>
            </header>

            {timeDraft && (
              <div className="finance__form">
                <div className="admin-crm-form-grid">
                  <AdminSelect label="Клиент" value={String(timeDraft.client_id || 0)} options={clientOptions}
                    onValueChange={(value) => setTimeDraft({ ...timeDraft, client_id: Number(value) || null })} />
                  <label className="admin-field"><span className="admin-label">Дата</span>
                    <input className="admin-input" type="date" value={timeDraft.day} onChange={(e) => setTimeDraft({ ...timeDraft, day: e.target.value })} />
                  </label>
                  <label className="admin-field"><span className="admin-label">Часов</span>
                    <AdminDecimalInput className="admin-input" value={timeDraft.hours} onValueChange={(hours) => setTimeDraft({ ...timeDraft, hours: hours ?? 0 })} />
                  </label>
                  <label className="admin-field admin-field--wide"><span className="admin-label">Что делали</span>
                    <input className="admin-input" maxLength={300} value={timeDraft.note} onChange={(e) => setTimeDraft({ ...timeDraft, note: e.target.value })} />
                  </label>
                </div>
                <div className="finance__form-actions">
                  <button type="button" className="admin-button admin-button--primary" disabled={busy} onClick={async () => {
                    const saved = await request({ ...timeDraft, action: 'save_time' }, 'Часы записаны');
                    if (saved) setTimeDraft(null);
                  }}>Сохранить</button>
                  <button type="button" className="admin-button admin-button--quiet" onClick={() => setTimeDraft(null)}>Отмена</button>
                </div>
              </div>
            )}

            {hoursByClient.length === 0 ? (
              <AdminBlank inline title="За этот месяц часов не записано" text="Запишите хотя бы приблизительно — даже грубая оценка показывает перекос между клиентами." />
            ) : (
              <div className="adm-table-scroll" role="region" aria-label="Ставка в час по клиентам" tabIndex={0}>
                <table className="adm-data-table">
                  <thead><tr><th>Клиент</th><th className="is-numeric">Часов за месяц</th><th className="is-numeric">Чек</th><th className="is-numeric">Ставка в час</th></tr></thead>
                  <tbody>
                    {hoursByClient.map((row) => (
                      <tr key={String(row.id)}>
                        <td>{row.name}</td>
                        <td className="is-numeric">{row.hours.toLocaleString('ru-RU')}</td>
                        <td className="is-numeric">{row.retainer > 0 ? formatOne(row.retainer, row.currency) : '—'}</td>
                        <td className={`is-numeric ${row.low ? 'is-bad' : row.rate !== null ? 'is-good' : ''}`}>
                          {row.rate !== null ? formatOne(row.rate, row.currency) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {timeEntries.length > 0 && (
            <section className="admin-panel adm-card">
              <header className="adm-card__head"><h3 className="admin-card-title">Последние записи</h3></header>
              <ul className="finance__list">
                {timeEntries.slice(0, 20).map((entry) => (
                  <li key={entry.id}>
                    <span className="finance__list-day">{entry.day}</span>
                    <span className="finance__list-main">{clientName(entry.client_id)}{entry.note ? ` · ${entry.note}` : ''}</span>
                    <strong>{entry.hours.toLocaleString('ru-RU')} ч</strong>
                    <button type="button" className="admin-icon-button" aria-label="Удалить запись"
                      onClick={() => void request({ action: 'delete_time', id: entry.id })}>
                      <Trash2 aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
