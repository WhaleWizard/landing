import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft, CalendarClock, CircleDollarSign, ExternalLink, FileText, KeyRound,
  NotebookPen, Plus, RefreshCw, Save, Trash2, Upload, UserPlus, Users, X,
} from 'lucide-react';
import { AdminDecimalInput, AdminSelect } from './AdminUI';
import { AdminBlank, AdminSectionSkeleton, confirmAsk, notify } from './AdminFeedback';
import { CountUpValue } from './AttributionCharts';

/**
 * Клиенты — то, что начинается после выигранной сделки.
 *
 * CRM доводит человека до «Выиграно» и заканчивается, а работа с абонентом
 * только начинается: договор, отчёт каждый месяц, доступы, продление. Здесь
 * всё это в одном месте, и раздел сам говорит, за кого пора взяться.
 */

type ClientStatus = 'active' | 'paused' | 'finished';
type AccessStatus = 'waiting' | 'granted' | 'revoked';
type Health = 'ok' | 'attention' | 'critical';

interface Service {
  name: string;
  status: 'active' | 'paused';
  since: string;
}

interface Client {
  id: number;
  lead_id: number | null;
  name: string;
  company: string;
  status: ClientStatus;
  started_at: string;
  paused_until: string | null;
  finished_at: string | null;
  finish_reason: string;
  contact_method: string;
  contact_value: string;
  timezone_offset: number | null;
  services: Service[];
  retainer_amount: number;
  retainer_currency: string;
  billing_day: number | null;
  contract_number: string;
  contract_signed_at: string | null;
  contract_ends_at: string | null;
  contract_auto_renew: number;
  contract_file_url: string;
  scope_included: string;
  scope_excluded: string;
  next_touch_at: string | null;
  next_touch_text: string;
  media_folder: string;
  lastReportMonth?: string | null;
  health?: Health;
  healthReasons?: string[];
}

interface ClientMonth {
  client_id: number;
  month: string;
  report_sent_at: string | null;
  report_url: string;
  spend: number | null;
  spend_currency: string;
  leads: number | null;
  sales: number | null;
  revenue: number | null;
  note: string;
}

interface AccessItem {
  id: number;
  client_id: number;
  name: string;
  status: AccessStatus;
  note: string;
  changed_at: string;
}

interface ClientNote {
  id: number;
  client_id: number;
  body: string;
  pinned: number;
  created_at: string;
}

interface Summary {
  recurring: Array<{ currency: string; amount: number }>;
  activeCount: number;
  withoutRetainer?: number;
  totalCount: number;
  needAttention: number;
  averageLifetimeDays: number;
}

const STATUS_OPTIONS = [
  { value: 'active', label: 'Активен' },
  { value: 'paused', label: 'На паузе' },
  { value: 'finished', label: 'Завершён' },
];

const ACCESS_OPTIONS = [
  { value: 'waiting', label: 'Ждём' },
  { value: 'granted', label: 'Выдан' },
  { value: 'revoked', label: 'Отозван' },
];

// Типовой набор доступов таргетолога: чтобы не набирать руками каждый раз.
const ACCESS_PRESET = [
  'Рекламный кабинет Meta',
  'Business Manager',
  'Google Ads',
  'Google Analytics 4',
  'Пиксель / CAPI',
  'Домен и DNS',
  'CRM клиента',
];

const HEALTH_LABEL: Record<Health, string> = {
  ok: 'всё ровно',
  attention: 'стоит посмотреть',
  critical: 'требует действий',
};

function formatMoney(amount: number, currency: string): string {
  return `${Math.round(amount).toLocaleString('ru-RU')} ${currency}`;
}

function formatMonth(month: string): string {
  const [year, monthPart] = month.split('-').map(Number);
  if (!year || !monthPart) return month;
  return new Date(Date.UTC(year, monthPart - 1, 1))
    .toLocaleDateString('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Который час у клиента: одна строка, которая спасает от звонка в 7 утра. */
function clientLocalTime(offsetMinutes: number | null): string {
  if (offsetMinutes === null || offsetMinutes === undefined) return '';
  const local = new Date(Date.now() + offsetMinutes * 60_000);
  const hours = String(local.getUTCHours()).padStart(2, '0');
  const minutes = String(local.getUTCMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function emptyClient(): Client {
  return {
    id: 0, lead_id: null, name: '', company: '', status: 'active',
    started_at: new Date().toISOString().slice(0, 10),
    paused_until: null, finished_at: null, finish_reason: '',
    contact_method: 'telegram', contact_value: '', timezone_offset: null,
    services: [], retainer_amount: 0, retainer_currency: 'USD', billing_day: null,
    contract_number: '', contract_signed_at: null, contract_ends_at: null,
    contract_auto_renew: 0, contract_file_url: '', scope_included: '', scope_excluded: '',
    next_touch_at: null, next_touch_text: '', media_folder: '',
  };
}

export default function AdminClients({ password, onOpenLead }: { password: string; onOpenLead?: (leadId: number) => void }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [migration, setMigration] = useState('');
  const [filter, setFilter] = useState<'all' | ClientStatus | 'attention'>('all');

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Client | null>(null);
  const [months, setMonths] = useState<ClientMonth[]>([]);
  const [access, setAccess] = useState<AccessItem[]>([]);
  const [notes, setNotes] = useState<ClientNote[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [accessDraft, setAccessDraft] = useState('');
  const [monthDraft, setMonthDraft] = useState<ClientMonth | null>(null);
  const [uploading, setUploading] = useState(false);

  /**
   * Договор кладётся в ту же медиатеку, что и остальные файлы: отдельного
   * хранилища ради одного PDF заводить незачем, а белый список типов и лимит
   * размера там уже настроены.
   */
  const uploadContract = useCallback(async (file: File): Promise<string | null> => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const response = await fetch('/api/admin/upload', {
        method: 'POST',
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        body: form,
      });
      const payload = await response.json().catch(() => null) as { url?: string; error?: string } | null;
      if (!response.ok || !payload?.url) throw new Error(payload?.error || `HTTP ${response.status}`);
      notify.success('Договор загружен', 'Не забудьте сохранить карточку.');
      return payload.url;
    } catch (uploadError) {
      notify.error('Файл не загрузился', uploadError instanceof Error ? uploadError.message : undefined);
      return null;
    } finally {
      setUploading(false);
    }
  }, [password]);

  const request = useCallback(async (payload: Record<string, unknown>): Promise<Record<string, unknown> | null> => {
    const response = await fetch('/api/admin/clients', {
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
    return result;
  }, [password]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/clients', {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as {
        success?: boolean; error?: string; migration?: string; clients?: Client[]; summary?: Summary;
      } | null;
      if (!response.ok || !payload?.success) {
        setMigration(payload?.migration || '');
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      setMigration('');
      setClients(payload.clients || []);
      setSummary(payload.summary || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить клиентов');
    } finally {
      setLoading(false);
    }
  }, [password]);

  useEffect(() => { void load(); }, [load]);

  const openClient = useCallback(async (id: number) => {
    setSelectedId(id);
    setDetailLoading(true);
    try {
      const response = await fetch(`/api/admin/clients?id=${id}`, {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as {
        success?: boolean; error?: string; client?: Client; months?: ClientMonth[]; access?: AccessItem[]; notes?: ClientNote[];
      } | null;
      if (!response.ok || !payload?.success || !payload.client) throw new Error(payload?.error || `HTTP ${response.status}`);
      setDraft(payload.client);
      setMonths(payload.months || []);
      setAccess(payload.access || []);
      setNotes(payload.notes || []);
    } catch (openError) {
      notify.error('Не удалось открыть карточку', openError instanceof Error ? openError.message : undefined);
      setSelectedId(null);
    } finally {
      setDetailLoading(false);
    }
  }, [password]);

  const saveClient = async () => {
    if (!draft) return;
    if (!draft.name.trim()) {
      notify.error('Нужно имя клиента', 'Без него карточку не найти в списке.');
      return;
    }
    setSaving(true);
    try {
      if (draft.id) {
        await request({ ...draft, action: 'update' });
        notify.success('Сохранено');
      } else {
        const created = await request({ ...draft, action: 'create' });
        const newId = Number(created?.id || 0);
        notify.success('Клиент заведён');
        if (newId) await openClient(newId);
      }
      await load();
    } catch (saveError) {
      notify.error('Не удалось сохранить', saveError instanceof Error ? saveError.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const removeClient = async () => {
    if (!draft?.id) return;
    const confirmed = await confirmAsk({
      title: `Удалить карточку «${draft.name}»?`,
      description: 'Вместе с ней исчезнут отчёты по месяцам, доступы и памятки. Заявка в CRM останется.',
      confirmLabel: 'Удалить',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      await request({ action: 'delete', id: draft.id });
      notify.success('Карточка удалена');
      setSelectedId(null);
      setDraft(null);
      await load();
    } catch (deleteError) {
      notify.error('Не удалось удалить', deleteError instanceof Error ? deleteError.message : undefined);
    }
  };

  const saveMonth = async (month: ClientMonth) => {
    if (!draft?.id) return;
    try {
      await request({ ...month, action: 'set_month', id: draft.id });
      setMonthDraft(null);
      await openClient(draft.id);
      await load();
      notify.success(`Месяц ${formatMonth(month.month)} сохранён`);
    } catch (monthError) {
      notify.error('Не удалось сохранить месяц', monthError instanceof Error ? monthError.message : undefined);
    }
  };

  const visible = useMemo(() => clients.filter((client) => {
    if (filter === 'all') return true;
    if (filter === 'attention') return client.health && client.health !== 'ok';
    return client.status === filter;
  }), [clients, filter]);

  if (loading && !clients.length && !migration && !error) return <AdminSectionSkeleton tiles={4} rows={5} />;

  if (migration) {
    return (
      <div className="admin-stack admin-stack--lg">
        <div className="admin-notice admin-notice--warning" role="status">
          Примените миграцию <code>{migration}</code> — до неё раздел «Клиенты» негде хранить.
        </div>
      </div>
    );
  }

  // ---------- Карточка клиента ----------
  if (selectedId !== null && draft) {
    const localTime = clientLocalTime(draft.timezone_offset);
    return (
      <div className="admin-stack admin-stack--lg clients">
        <div className="clients__detail-head">
          <button type="button" className="admin-button admin-button--quiet" onClick={() => { setSelectedId(null); setDraft(null); }}>
            <ArrowLeft aria-hidden="true" /> К списку
          </button>
          <div className="clients__detail-actions">
            {draft.lead_id && onOpenLead && (
              <button type="button" className="admin-button admin-button--quiet" onClick={() => onOpenLead(draft.lead_id as number)}>
                Открыть сделку
              </button>
            )}
            {draft.id > 0 && (
              <button type="button" className="admin-button admin-button--quiet" onClick={() => void removeClient()}>
                <Trash2 aria-hidden="true" /> Удалить
              </button>
            )}
            <button type="button" className="admin-button admin-button--primary" disabled={saving} onClick={() => void saveClient()}>
              <Save aria-hidden="true" /> {saving ? 'Сохраняю…' : 'Сохранить'}
            </button>
          </div>
        </div>

        {detailLoading && <div className="admin-hint">Загружаю карточку…</div>}

        {draft.healthReasons && draft.healthReasons.length > 0 && (
          <section className={`clients__health is-${draft.health}`} role="status">
            <strong>{HEALTH_LABEL[draft.health || 'ok']}</strong>
            <ul>{draft.healthReasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>
          </section>
        )}

        <section className="admin-panel adm-card">
          <header className="adm-card__head">
            <h3 className="admin-card-title"><Users aria-hidden="true" /> Основное</h3>
            {localTime && <p className="admin-hint">Сейчас у клиента {localTime}</p>}
          </header>
          <div className="admin-crm-form-grid">
            <label className="admin-field"><span className="admin-label">Имя</span>
              <input className="admin-input" maxLength={160} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label className="admin-field"><span className="admin-label">Компания</span>
              <input className="admin-input" maxLength={200} value={draft.company} onChange={(e) => setDraft({ ...draft, company: e.target.value })} />
            </label>
            <AdminSelect label="Статус" value={draft.status} options={STATUS_OPTIONS} onValueChange={(value) => setDraft({ ...draft, status: value as ClientStatus })} />
            <label className="admin-field"><span className="admin-label">Работаем с</span>
              <input className="admin-input" type="date" value={draft.started_at} onChange={(e) => setDraft({ ...draft, started_at: e.target.value })} />
            </label>
            {draft.status === 'paused' && (
              <label className="admin-field"><span className="admin-label">Пауза до</span>
                <input className="admin-input" type="date" value={draft.paused_until || ''} onChange={(e) => setDraft({ ...draft, paused_until: e.target.value || null })} />
              </label>
            )}
            <label className="admin-field"><span className="admin-label">Где общаетесь</span>
              <input className="admin-input" maxLength={40} placeholder="telegram" value={draft.contact_method} onChange={(e) => setDraft({ ...draft, contact_method: e.target.value })} />
            </label>
            <label className="admin-field"><span className="admin-label">Контакт</span>
              <input className="admin-input" maxLength={200} placeholder="@username" value={draft.contact_value} onChange={(e) => setDraft({ ...draft, contact_value: e.target.value })} />
            </label>
            <label className="admin-field"><span className="admin-label">Часовой пояс, часы от UTC</span>
              <input className="admin-input" type="number" min={-14} max={14} value={draft.timezone_offset === null ? '' : draft.timezone_offset / 60}
                onChange={(e) => setDraft({ ...draft, timezone_offset: e.target.value === '' ? null : Math.round(Number(e.target.value) * 60) })} />
            </label>
            {draft.status === 'finished' && (
              <label className="admin-field admin-field--wide"><span className="admin-label">Почему закончили</span>
                <textarea className="admin-input" rows={2} maxLength={2000} value={draft.finish_reason} onChange={(e) => setDraft({ ...draft, finish_reason: e.target.value })} />
              </label>
            )}
          </div>
        </section>

        <section className="admin-panel adm-card">
          <header className="adm-card__head">
            <h3 className="admin-card-title"><CircleDollarSign aria-hidden="true" /> Деньги и договор</h3>
          </header>
          <div className="admin-crm-form-grid">
            <label className="admin-field"><span className="admin-label">Чек в месяц</span>
              <AdminDecimalInput className="admin-input" value={draft.retainer_amount} onValueChange={(amount) => setDraft({ ...draft, retainer_amount: amount ?? 0 })} />
            </label>
            <label className="admin-field"><span className="admin-label">Валюта</span>
              <input className="admin-input" maxLength={3} value={draft.retainer_currency} onChange={(e) => setDraft({ ...draft, retainer_currency: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })} />
            </label>
            <label className="admin-field"><span className="admin-label">День выставления счёта</span>
              <input className="admin-input" type="number" min={1} max={28} value={draft.billing_day || ''} onChange={(e) => setDraft({ ...draft, billing_day: e.target.value ? Number(e.target.value) : null })} />
            </label>
            <label className="admin-field"><span className="admin-label">Номер договора</span>
              <input className="admin-input" maxLength={80} value={draft.contract_number} onChange={(e) => setDraft({ ...draft, contract_number: e.target.value })} />
            </label>
            <label className="admin-field"><span className="admin-label">Подписан</span>
              <input className="admin-input" type="date" value={draft.contract_signed_at || ''} onChange={(e) => setDraft({ ...draft, contract_signed_at: e.target.value || null })} />
            </label>
            <label className="admin-field"><span className="admin-label">Действует до</span>
              <input className="admin-input" type="date" value={draft.contract_ends_at || ''} onChange={(e) => setDraft({ ...draft, contract_ends_at: e.target.value || null })} />
            </label>
            <label className="admin-field clients__check">
              <input type="checkbox" checked={Boolean(draft.contract_auto_renew)} onChange={(e) => setDraft({ ...draft, contract_auto_renew: e.target.checked ? 1 : 0 })} />
              <span>Продлевается автоматически</span>
            </label>
            <div className="admin-field admin-field--wide">
              <span className="admin-label">Договор файлом</span>
              <div className="clients__file">
                <input
                  className="admin-input"
                  maxLength={600}
                  placeholder="Загрузите PDF или DOCX — или вставьте ссылку"
                  value={draft.contract_file_url}
                  onChange={(e) => setDraft({ ...draft, contract_file_url: e.target.value })}
                />
                <label className={`admin-button admin-button--quiet${uploading ? ' is-busy' : ''}`}>
                  <Upload aria-hidden="true" /> {uploading ? 'Загружаю…' : 'Загрузить'}
                  <input
                    type="file"
                    className="sr-only"
                    accept=".pdf,.doc,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*"
                    disabled={uploading}
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      event.target.value = '';
                      if (!file) return;
                      const url = await uploadContract(file);
                      if (url) setDraft((current) => (current ? { ...current, contract_file_url: url } : current));
                    }}
                  />
                </label>
                {draft.contract_file_url && (
                  <a className="admin-button admin-button--quiet" href={draft.contract_file_url} target="_blank" rel="noreferrer">
                    <ExternalLink aria-hidden="true" /> Открыть
                  </a>
                )}
              </div>
              <span className="admin-hint">Файл уходит в медиатеку. Ссылку не забудьте сохранить кнопкой сверху.</span>
            </div>
          </div>
        </section>

        <section className="admin-panel adm-card">
          <header className="adm-card__head">
            <h3 className="admin-card-title">Что входит в чек</h3>
            <p className="admin-hint">Границы, записанные один раз, экономят десяток разговоров «а можно ещё вот это по-быстрому».</p>
          </header>
          <div className="admin-crm-form-grid">
            <label className="admin-field admin-field--wide"><span className="admin-label">Входит</span>
              <textarea className="admin-input" rows={3} maxLength={2000} value={draft.scope_included} onChange={(e) => setDraft({ ...draft, scope_included: e.target.value })} />
            </label>
            <label className="admin-field admin-field--wide"><span className="admin-label">Не входит</span>
              <textarea className="admin-input" rows={3} maxLength={2000} value={draft.scope_excluded} onChange={(e) => setDraft({ ...draft, scope_excluded: e.target.value })} />
            </label>
            <label className="admin-field"><span className="admin-label">Следующее касание · дата</span>
              <input className="admin-input" type="date" value={draft.next_touch_at || ''} onChange={(e) => setDraft({ ...draft, next_touch_at: e.target.value || null })} />
            </label>
            <label className="admin-field"><span className="admin-label">Что сделать</span>
              <input className="admin-input" maxLength={240} value={draft.next_touch_text} onChange={(e) => setDraft({ ...draft, next_touch_text: e.target.value })} />
            </label>
          </div>
        </section>

        {draft.id > 0 && (
          <>
            <section className="admin-panel adm-card">
              <header className="adm-card__head adm-card__head--row">
                <div>
                  <h3 className="admin-card-title"><CalendarClock aria-hidden="true" /> Отчёты и результаты по месяцам</h3>
                  <p className="admin-hint">Цифры, которые вы и так собираете для отчёта. Отсюда же соберётся кейс.</p>
                </div>
                <button type="button" className="admin-button admin-button--compact" onClick={() => setMonthDraft({
                  client_id: draft.id, month: currentMonth(), report_sent_at: null, report_url: '',
                  spend: null, spend_currency: draft.retainer_currency, leads: null, sales: null, revenue: null, note: '',
                })}>
                  <Plus aria-hidden="true" /> Добавить месяц
                </button>
              </header>

              {monthDraft && (
                <div className="clients__month-form">
                  <div className="admin-crm-form-grid">
                    <label className="admin-field"><span className="admin-label">Месяц</span>
                      <input className="admin-input" type="month" value={monthDraft.month} onChange={(e) => setMonthDraft({ ...monthDraft, month: e.target.value })} />
                    </label>
                    <label className="admin-field"><span className="admin-label">Отчёт отправлен</span>
                      <input className="admin-input" type="date" value={monthDraft.report_sent_at || ''} onChange={(e) => setMonthDraft({ ...monthDraft, report_sent_at: e.target.value || null })} />
                    </label>
                    <label className="admin-field"><span className="admin-label">Ссылка на отчёт</span>
                      <input className="admin-input" maxLength={600} value={monthDraft.report_url} onChange={(e) => setMonthDraft({ ...monthDraft, report_url: e.target.value })} />
                    </label>
                    <label className="admin-field"><span className="admin-label">Расход</span>
                      <AdminDecimalInput className="admin-input" value={monthDraft.spend} onValueChange={(spend) => setMonthDraft({ ...monthDraft, spend })} />
                    </label>
                    <label className="admin-field"><span className="admin-label">Валюта расхода</span>
                      <input className="admin-input" maxLength={3} value={monthDraft.spend_currency} onChange={(e) => setMonthDraft({ ...monthDraft, spend_currency: e.target.value.toUpperCase().replace(/[^A-Z]/g, '') })} />
                    </label>
                    <label className="admin-field"><span className="admin-label">Заявок</span>
                      <input className="admin-input" type="number" min={0} value={monthDraft.leads ?? ''} onChange={(e) => setMonthDraft({ ...monthDraft, leads: e.target.value === '' ? null : Number(e.target.value) })} />
                    </label>
                    <label className="admin-field"><span className="admin-label">Продаж</span>
                      <input className="admin-input" type="number" min={0} value={monthDraft.sales ?? ''} onChange={(e) => setMonthDraft({ ...monthDraft, sales: e.target.value === '' ? null : Number(e.target.value) })} />
                    </label>
                    <label className="admin-field"><span className="admin-label">Выручка клиента</span>
                      <AdminDecimalInput className="admin-input" value={monthDraft.revenue} onValueChange={(revenue) => setMonthDraft({ ...monthDraft, revenue })} />
                    </label>
                  </div>
                  <div className="clients__month-actions">
                    <button type="button" className="admin-button admin-button--primary" onClick={() => void saveMonth(monthDraft)}>Сохранить месяц</button>
                    <button type="button" className="admin-button admin-button--quiet" onClick={() => setMonthDraft(null)}>Отмена</button>
                  </div>
                </div>
              )}

              {months.length === 0 && !monthDraft ? (
                <AdminBlank inline title="Месяцев пока нет" text="Добавьте первый — и появится история результатов, а из неё черновик кейса." />
              ) : (
                <div className="adm-table-scroll" role="region" aria-label="Месяцы работы с клиентом" tabIndex={0}>
                  <table className="adm-data-table">
                    <thead>
                      <tr>
                        <th>Месяц</th><th>Отчёт</th><th className="is-numeric">Расход</th>
                        <th className="is-numeric">Заявок</th><th className="is-numeric">Цена заявки</th>
                        <th className="is-numeric">Продаж</th><th className="is-numeric">Выручка</th><th />
                      </tr>
                    </thead>
                    <tbody>
                      {months.map((month) => {
                        const cpl = month.spend !== null && month.leads ? month.spend / month.leads : null;
                        return (
                          <tr key={month.month}>
                            <td>{formatMonth(month.month)}</td>
                            <td>
                              {month.report_sent_at
                                ? (month.report_url
                                  ? <a href={month.report_url} target="_blank" rel="noreferrer">отправлен <ExternalLink className="inline h-3 w-3" aria-hidden="true" /></a>
                                  : 'отправлен')
                                : <span className="is-bad">не отправлен</span>}
                            </td>
                            <td className="is-numeric">{month.spend !== null ? formatMoney(month.spend, month.spend_currency || '') : '—'}</td>
                            <td className="is-numeric">{month.leads ?? '—'}</td>
                            <td className="is-numeric">{cpl !== null ? formatMoney(cpl, month.spend_currency || '') : '—'}</td>
                            <td className="is-numeric">{month.sales ?? '—'}</td>
                            <td className="is-numeric">{month.revenue !== null ? formatMoney(month.revenue, month.spend_currency || '') : '—'}</td>
                            <td>
                              <button type="button" className="admin-icon-button" aria-label={`Изменить ${month.month}`} onClick={() => setMonthDraft(month)}>
                                <RefreshCw aria-hidden="true" />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="admin-panel adm-card">
              <header className="adm-card__head">
                <h3 className="admin-card-title"><KeyRound aria-hidden="true" /> Доступы</h3>
                <p className="admin-hint">Только факт доступа. Пароли храните в менеджере паролей — в вебе им не место.</p>
              </header>

              {access.length === 0 && (
                <div className="clients__access-preset">
                  <span className="admin-hint">Добавить типовой набор:</span>
                  <button type="button" className="admin-button admin-button--compact" onClick={async () => {
                    try {
                      for (const name of ACCESS_PRESET) await request({ action: 'set_access', id: draft.id, name, status: 'waiting' });
                      await openClient(draft.id);
                    } catch (presetError) {
                      notify.error('Не удалось добавить', presetError instanceof Error ? presetError.message : undefined);
                    }
                  }}>Создать чек-лист</button>
                </div>
              )}

              <ul className="clients__access">
                {access.map((item) => (
                  <li key={item.id}>
                    <span className="clients__access-name">{item.name}</span>
                    <AdminSelect
                      ariaLabel={`Статус доступа: ${item.name}`}
                      compact
                      value={item.status}
                      options={ACCESS_OPTIONS}
                      onValueChange={(value) => {
                        void request({ action: 'set_access', id: draft.id, access_id: item.id, name: item.name, status: value, note: item.note })
                          .then(() => openClient(draft.id))
                          .catch((accessError) => notify.error('Не сохранилось', accessError instanceof Error ? accessError.message : undefined));
                      }}
                    />
                    <button type="button" className="admin-icon-button" aria-label={`Убрать ${item.name}`} onClick={() => {
                      void request({ action: 'delete_access', id: draft.id, access_id: item.id })
                        .then(() => openClient(draft.id))
                        .catch(() => notify.error('Не удалось убрать'));
                    }}>
                      <X aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>

              <form className="clients__add-row" onSubmit={(event) => {
                event.preventDefault();
                const name = accessDraft.trim();
                if (!name) return;
                setAccessDraft('');
                void request({ action: 'set_access', id: draft.id, name, status: 'waiting' })
                  .then(() => openClient(draft.id))
                  .catch((addError) => notify.error('Не добавилось', addError instanceof Error ? addError.message : undefined));
              }}>
                <input className="admin-input" maxLength={120} placeholder="Какой ещё доступ нужен" value={accessDraft} onChange={(e) => setAccessDraft(e.target.value)} />
                <button type="submit" className="admin-button admin-button--compact" disabled={!accessDraft.trim()}>Добавить</button>
              </form>
            </section>

            <section className="admin-panel adm-card">
              <header className="adm-card__head">
                <h3 className="admin-card-title"><NotebookPen aria-hidden="true" /> Памятки</h3>
                <p className="admin-hint">Кто принимает решения, что не любит, как думает. То, что сейчас живёт только в голове.</p>
              </header>

              <ul className="clients__notes">
                {notes.map((note) => (
                  <li key={note.id}>
                    <span>{note.body}</span>
                    <button type="button" className="admin-icon-button" aria-label="Убрать памятку" onClick={() => {
                      void request({ action: 'delete_note', id: draft.id, note_id: note.id })
                        .then(() => openClient(draft.id))
                        .catch(() => notify.error('Не удалось убрать'));
                    }}>
                      <X aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>

              <form className="clients__add-row" onSubmit={(event) => {
                event.preventDefault();
                const value = noteDraft.trim();
                if (!value) return;
                setNoteDraft('');
                void request({ action: 'add_note', id: draft.id, body: value })
                  .then(() => openClient(draft.id))
                  .catch((noteError) => notify.error('Не сохранилось', noteError instanceof Error ? noteError.message : undefined));
              }}>
                <input className="admin-input" maxLength={4000} placeholder="Записать памятку" value={noteDraft} onChange={(e) => setNoteDraft(e.target.value)} />
                <button type="submit" className="admin-button admin-button--compact" disabled={!noteDraft.trim()}>Записать</button>
              </form>
            </section>
          </>
        )}
      </div>
    );
  }

  // ---------- Список ----------
  return (
    <div className="admin-stack admin-stack--lg clients">
      <div className="admin-section-header">
        <div>
          <p className="admin-eyebrow">Абонентка</p>
          <h2 className="admin-title">Клиенты</h2>
          <p className="admin-subtitle">
            Договор, отчёты, доступы и продления. Раздел сам показывает, за кого пора взяться,
            пока клиент не ушёл молча.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="admin-button admin-button--secondary" disabled={loading} onClick={() => void load()}>
            <RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Обновить
          </button>
          <button type="button" className="admin-button admin-button--primary" onClick={() => { setSelectedId(0); setDraft(emptyClient()); setMonths([]); setAccess([]); setNotes([]); }}>
            <UserPlus aria-hidden="true" /> Добавить клиента
          </button>
        </div>
      </div>

      {error && <div className="admin-notice admin-notice--danger" role="alert">{error}</div>}

      {summary && (
        <div className="adm-tiles">
          <div className="adm-tile">
            <span className="adm-tile__title">Регулярный доход в месяц</span>
            <strong className="adm-tile__value">
              {summary.recurring.length
                ? summary.recurring.map((item) => formatMoney(item.amount, item.currency)).join(' · ')
                : '—'}
            </strong>
            <span className="admin-hint">
              {summary.withoutRetainer
                ? `Без заполненного чека: ${summary.withoutRetainer} — эти клиенты в сумму не попадают.`
                : 'Считается по активным клиентам с заполненным чеком.'}
            </span>
          </div>
          <div className="adm-tile">
            <span className="adm-tile__title">Активных</span>
            <strong className="adm-tile__value"><CountUpValue value={summary.activeCount} /></strong>
            <span className="admin-hint">Всего карточек: {summary.totalCount}.</span>
          </div>
          <div className="adm-tile">
            <span className="adm-tile__title">Требуют внимания</span>
            <strong className="adm-tile__value"><CountUpValue value={summary.needAttention} /></strong>
            <span className="admin-hint">Просроченный отчёт, касание или договор.</span>
          </div>
          <div className="adm-tile">
            <span className="adm-tile__title">Средний срок жизни</span>
            <strong className="adm-tile__value">{summary.averageLifetimeDays ? `${Math.round(summary.averageLifetimeDays / 30)} мес.` : '—'}</strong>
            <span className="admin-hint">Сколько в среднем клиент остаётся с вами.</span>
          </div>
        </div>
      )}

      <div className="crm-view-switch" role="group" aria-label="Фильтр клиентов">
        {([['all', 'Все'], ['active', 'Активные'], ['paused', 'На паузе'], ['finished', 'Завершённые'], ['attention', 'Требуют внимания']] as const).map(([value, label]) => (
          <button key={value} type="button" aria-pressed={filter === value} className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>
            {label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <AdminBlank
          title={clients.length ? 'В этом фильтре пусто' : 'Клиентов пока нет'}
          text={clients.length
            ? 'Смените фильтр — карточки никуда не делись.'
            : 'Заведите первого вручную или переведите выигранную сделку в CRM — оттуда клиент попадёт сюда одной кнопкой.'}
        />
      ) : (
        <ul className="clients__list">
          {visible.map((client) => (
            <li key={client.id}>
              <button type="button" onClick={() => void openClient(client.id)}>
                <span className={`clients__dot is-${client.health || 'ok'}`} title={HEALTH_LABEL[client.health || 'ok']} aria-hidden="true" />
                <span className="clients__name">
                  <strong>{client.name}</strong>
                  {client.company && <em>{client.company}</em>}
                </span>
                <span className="clients__services">
                  {client.services.length ? client.services.map((service) => service.name).join(', ') : 'услуги не заданы'}
                </span>
                <span className="clients__money">
                  {client.retainer_amount > 0 ? formatMoney(client.retainer_amount, client.retainer_currency) : '—'}
                </span>
                <span className="clients__meta">
                  {client.status === 'paused' ? 'на паузе'
                    : client.status === 'finished' ? 'завершён'
                    : client.lastReportMonth ? `отчёт за ${client.lastReportMonth}` : 'отчётов не было'}
                </span>
              </button>
              {client.healthReasons && client.healthReasons.length > 0 && (
                <p className={`clients__reasons is-${client.health}`}>{client.healthReasons.join(' · ')}</p>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="admin-hint">
        <FileText aria-hidden="true" /> Разные валюты не складываются: курсов в системе нет, а придумывать их нельзя.
      </p>
    </div>
  );
}
