import { useCallback, useEffect, useState } from 'react';
import {
  BriefcaseBusiness,
  CalendarClock,
  ChevronDown,
  History,
  LoaderCircle,
  RefreshCw,
  Save,
  Send,
} from 'lucide-react';

interface LeadRow {
  id: number;
  name: string;
  email: string;
  phone: string;
  telegram_username: string;
  contact_method: string;
  budget: string;
  message: string;
  service: string;
  page_path: string;
  status: string;
  pipeline_stage?: PipelineStage;
  telegram_delivered: number;
  created_at: string;
  submissions_count?: number;
  last_submitted_at?: string | null;
  quality?: string;
  marketing_consent?: number;
  quality_meta_event_id?: string;
  quality_meta_status?: 'pending' | 'retry' | 'sending' | 'sent' | 'dead_letter';
  quality_meta_attempts?: number;
  quality_meta_error?: string | null;
  quality_meta_sent_at?: number | null;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

type PipelineStage = 'new' | 'contacted' | 'discovery' | 'proposal' | 'won' | 'lost' | 'archived';

interface CrmLead {
  id: number;
  pipeline_stage: PipelineStage;
  next_action_at: string | null;
  loss_reason: string;
  notes: string;
  deal_value: number | null;
  deal_currency: string;
}

interface CrmActivity {
  id: number;
  lead_id: number;
  type: string;
  from: string | null;
  to: string | null;
  note: string;
  created_at: string;
}

interface CrmDraft {
  pipeline_stage: PipelineStage;
  next_action_at: string;
  loss_reason: string;
  notes: string;
  deal_value: string;
  deal_currency: string;
}

interface QualityConfirmation {
  leadId: number;
  nextQuality: string;
}

// Подписи UTM-меток для карточки заявки
const UTM_LABELS: Array<{ key: 'utm_source' | 'utm_medium' | 'utm_campaign' | 'utm_content' | 'utm_term'; label: string }> = [
  { key: 'utm_source', label: 'источник' },
  { key: 'utm_medium', label: 'канал' },
  { key: 'utm_campaign', label: 'кампания' },
  { key: 'utm_content', label: 'объявление' },
  { key: 'utm_term', label: 'ключ' },
];

const PIPELINE_STAGES: Array<{ value: PipelineStage; label: string }> = [
  { value: 'new', label: 'Новая' },
  { value: 'contacted', label: 'Связался' },
  { value: 'discovery', label: 'Обсуждение' },
  { value: 'proposal', label: 'Предложение' },
  { value: 'won', label: 'Выиграна' },
  { value: 'lost', label: 'Проиграна' },
  { value: 'archived', label: 'Архив' },
];

const PIPELINE_STAGE_STYLES: Record<PipelineStage, string> = {
  new: 'bg-[var(--adm-primary)]/15 text-[var(--adm-primary)] border-[var(--adm-primary)]/40',
  contacted: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/40',
  discovery: 'bg-blue-500/10 text-blue-500 border-blue-500/40',
  proposal: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/40',
  won: 'bg-green-500/10 text-green-500 border-green-500/40',
  lost: 'bg-[var(--adm-danger)]/10 text-[var(--adm-danger)] border-[var(--adm-danger)]/40',
  archived: 'bg-[var(--adm-muted)]/45 text-[var(--adm-fg)]/60 border-[var(--adm-border)]',
};

function effectivePipelineStage(lead: LeadRow): PipelineStage {
  if (PIPELINE_STAGES.some((stage) => stage.value === lead.pipeline_stage)) {
    return lead.pipeline_stage as PipelineStage;
  }
  if (lead.status === 'in_progress') return 'contacted';
  if (lead.status === 'closed') return 'archived';
  return 'new';
}

const ACTIVITY_LABELS: Record<string, string> = {
  pipeline_stage_changed: 'Этап сделки',
  next_action_updated: 'Следующее действие',
  loss_reason_updated: 'Причина отказа',
  notes_updated: 'Заметки',
  deal_value_updated: 'Сумма сделки',
  deal_currency_updated: 'Валюта сделки',
  lead_created: 'Заявка создана',
};

const FIELD_CLASS = 'admin-control w-full border px-3 py-2 text-sm text-[var(--adm-fg)] outline-none transition focus:border-[var(--adm-primary)] focus:ring-2 focus:ring-[var(--adm-primary)]/20';

function formatDate(raw: string): string {
  const iso = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function toDateTimeLocal(raw: string | null): string {
  if (!raw) return '';
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  const local = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function crmDraftFromLead(lead: CrmLead): CrmDraft {
  return {
    pipeline_stage: lead.pipeline_stage || 'new',
    next_action_at: toDateTimeLocal(lead.next_action_at),
    loss_reason: lead.loss_reason || '',
    notes: lead.notes || '',
    deal_value: lead.deal_value === null || lead.deal_value === undefined ? '' : String(lead.deal_value),
    deal_currency: (lead.deal_currency || 'USD').toUpperCase(),
  };
}

function formatActivityValue(type: string, value: string | null): string {
  if (!value) return 'не задано';
  if (type === 'pipeline_stage_changed') {
    return PIPELINE_STAGES.find((stage) => stage.value === value)?.label || value;
  }
  if (type === 'next_action_updated') return formatDate(value);
  return value;
}

function contactLink(lead: LeadRow): { href: string; label: string } | null {
  if (lead.telegram_username) {
    const username = lead.telegram_username.replace(/^@/, '');
    return { href: `https://t.me/${username}`, label: `@${username}` };
  }
  if (lead.contact_method === 'whatsapp' && lead.phone) {
    return { href: `https://wa.me/${lead.phone.replace(/\D/g, '')}`, label: 'WhatsApp' };
  }
  return null;
}

function qualityMetaBadge(lead: LeadRow): { label: string; className: string; title: string } | null {
  if (lead.quality !== 'target' && lead.quality !== 'nontarget') return null;
  if (lead.marketing_consent !== 1) {
    return {
      label: 'Meta: нет согласия',
      className: 'border-[var(--adm-border)] bg-[var(--adm-muted)]/35 text-[var(--adm-fg)]/50',
      title: 'Посетитель не дал согласие на маркетинг — событие качества не отправляется',
    };
  }

  const attempts = Number(lead.quality_meta_attempts || 0);
  const error = lead.quality_meta_error ? ` Последняя ошибка: ${lead.quality_meta_error}` : '';
  if (lead.quality_meta_status === 'sent') {
    const sentAt = lead.quality_meta_sent_at ? new Date(lead.quality_meta_sent_at * 1000).toLocaleString('ru-RU') : '';
    return {
      label: 'Meta: доставлено',
      className: 'border-green-500/40 bg-green-500/10 text-green-500',
      title: `Meta подтвердила приём события${sentAt ? ` · ${sentAt}` : ''}`,
    };
  }
  if (lead.quality_meta_status === 'dead_letter') {
    return {
      label: 'Meta: не доставлено',
      className: 'border-[var(--adm-danger)]/50 bg-[var(--adm-danger)]/10 text-[var(--adm-danger)]',
      title: `Автоповторы остановлены после ${attempts} попыток.${error}`,
    };
  }
  if (lead.quality_meta_status === 'retry') {
    return {
      label: `Meta: повторная отправка${attempts ? ` · ${attempts}` : ''}`,
      className: 'border-amber-500/40 bg-amber-500/10 text-amber-500',
      title: `Событие сохранено и будет отправлено повторно.${error}`,
    };
  }
  if (lead.quality_meta_status === 'pending' || lead.quality_meta_status === 'sending') {
    return {
      label: lead.quality_meta_status === 'sending' ? 'Meta: отправляется' : 'Meta: в очереди',
      className: 'border-sky-500/40 bg-sky-500/10 text-sky-500',
      title: 'Событие сохранено в надёжной очереди и ожидает подтверждения Meta',
    };
  }
  return {
    label: 'Meta: нет записи доставки',
    className: 'border-[var(--adm-border)] bg-[var(--adm-muted)]/35 text-[var(--adm-fg)]/50',
    title: 'Для этой метки нет записи в очереди. Проверьте миграцию meta_outbox и настройки CAPI',
  };
}

function LeadCrmPanel({ leadId, password, onSaved }: { leadId: number; password: string; onSaved?: () => void }) {
  const panelId = `lead-crm-${leadId}`;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [lead, setLead] = useState<CrmLead | null>(null);
  const [draft, setDraft] = useState<CrmDraft | null>(null);
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadCrm = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/lead-crm?lead_id=${encodeURIComponent(leadId)}`, {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as {
        success?: boolean;
        code?: string;
        error?: string;
        lead?: CrmLead;
        activities?: CrmActivity[];
      } | null;
      if (!response.ok || !payload?.success || !payload.lead) {
        if (response.status === 503 && payload?.code === 'ADMIN_CRM_MIGRATION_REQUIRED') {
          throw new Error('Мини-CRM станет доступна после применения D1-миграции 0012_admin_control_center.sql. Заявки и Meta CAPI продолжают работать отдельно.');
        }
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      setLead(payload.lead);
      setDraft(crmDraftFromLead(payload.lead));
      setActivities(payload.activities || []);
      setLoaded(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить данные CRM');
    } finally {
      setLoading(false);
    }
  }, [leadId, password]);

  useEffect(() => {
    if (open && !loaded) void loadCrm();
  }, [loadCrm, loaded, open]);

  const saveCrm = async () => {
    if (!draft) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const nextAction = draft.next_action_at ? new Date(draft.next_action_at) : null;
      if (nextAction && Number.isNaN(nextAction.getTime())) throw new Error('Проверьте дату следующего действия');
      const currency = draft.deal_currency.trim().toUpperCase();
      if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Валюта должна состоять из трёх букв, например USD');

      const response = await fetch('/api/admin/lead-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
        credentials: 'same-origin',
        body: JSON.stringify({
          lead_id: leadId,
          pipeline_stage: draft.pipeline_stage,
          next_action_at: nextAction ? nextAction.toISOString() : null,
          loss_reason: draft.loss_reason,
          notes: draft.notes,
          deal_value: draft.deal_value === '' ? null : Number(draft.deal_value),
          deal_currency: currency,
        }),
      });
      const payload = await response.json().catch(() => null) as {
        success?: boolean;
        code?: string;
        error?: string;
        lead?: CrmLead;
      } | null;
      if (!response.ok || !payload?.success) {
        if (response.status === 503 && payload?.code === 'ADMIN_CRM_MIGRATION_REQUIRED') {
          throw new Error('Сначала примените D1-миграцию 0012_admin_control_center.sql.');
        }
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      if (payload.lead) {
        setLead(payload.lead);
        setDraft(crmDraftFromLead(payload.lead));
      }
      await loadCrm();
      onSaved?.();
      setNotice('Изменения сохранены в CRM. Событие качества в Meta не отправлялось.');
      window.setTimeout(() => setNotice(''), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось сохранить данные CRM');
    } finally {
      setSaving(false);
    }
  };

  const isDirty = Boolean(lead && draft && JSON.stringify(draft) !== JSON.stringify(crmDraftFromLead(lead)));

  return (
    <div className="mt-4 border-t border-[var(--adm-border)] pt-3">
      <button
        type="button"
        className="admin-button admin-button--quiet min-h-11 w-full justify-between px-2 text-left sm:w-auto sm:min-w-[210px]"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <BriefcaseBusiness className="h-4 w-4 shrink-0 text-[var(--adm-primary)]" />
          <span>{open ? 'Скрыть карточку сделки' : 'Открыть карточку сделки'}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <section id={panelId} className="mt-3 rounded-xl border border-[var(--adm-border)] bg-[var(--adm-muted)]/20 p-3 sm:p-4" aria-label="Карточка сделки">
          {loading && !loaded ? (
            <div className="flex min-h-24 items-center justify-center gap-2 text-sm text-[var(--adm-fg)]/60" role="status">
              <LoaderCircle className="h-4 w-4 animate-spin" /> Загружаю историю сделки…
            </div>
          ) : error && !draft ? (
            <div className="space-y-3" role="alert">
              <p className="break-words text-sm leading-relaxed text-[var(--adm-danger)]">{error}</p>
              <button type="button" className="admin-button" onClick={() => void loadCrm()} disabled={loading}>
                <RefreshCw className="h-4 w-4" /> Повторить
              </button>
            </div>
          ) : draft ? (
            <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(260px,0.75fr)]">
              <div className="min-w-0 space-y-4">
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <label htmlFor={`crm-stage-${leadId}`} className="mb-1.5 block text-xs font-semibold text-[var(--adm-fg)]/65">Этап сделки</label>
                    <select
                      id={`crm-stage-${leadId}`}
                      value={draft.pipeline_stage}
                      onChange={(event) => setDraft({ ...draft, pipeline_stage: event.target.value as PipelineStage })}
                      className={FIELD_CLASS}
                    >
                      {PIPELINE_STAGES.map((stage) => <option key={stage.value} value={stage.value}>{stage.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`crm-next-${leadId}`} className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--adm-fg)]/65">
                      <CalendarClock className="h-3.5 w-3.5" /> Следующее действие
                    </label>
                    <input
                      id={`crm-next-${leadId}`}
                      type="datetime-local"
                      value={draft.next_action_at}
                      onChange={(event) => setDraft({ ...draft, next_action_at: event.target.value })}
                      className={FIELD_CLASS}
                    />
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_88px] gap-2 sm:col-span-2 lg:col-span-1">
                    <div>
                      <label htmlFor={`crm-value-${leadId}`} className="mb-1.5 block text-xs font-semibold text-[var(--adm-fg)]/65">Сумма сделки</label>
                      <input
                        id={`crm-value-${leadId}`}
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        placeholder="0"
                        value={draft.deal_value}
                        onChange={(event) => setDraft({ ...draft, deal_value: event.target.value })}
                        className={FIELD_CLASS}
                      />
                    </div>
                    <div>
                      <label htmlFor={`crm-currency-${leadId}`} className="mb-1.5 block text-xs font-semibold text-[var(--adm-fg)]/65">Валюта</label>
                      <input
                        id={`crm-currency-${leadId}`}
                        value={draft.deal_currency}
                        maxLength={3}
                        autoCapitalize="characters"
                        spellCheck={false}
                        aria-describedby={`crm-currency-hint-${leadId}`}
                        onChange={(event) => setDraft({ ...draft, deal_currency: event.target.value.toUpperCase().replace(/[^A-Z]/g, '') })}
                        className={`${FIELD_CLASS} text-center uppercase`}
                      />
                      <span id={`crm-currency-hint-${leadId}`} className="sr-only">Трёхбуквенный код валюты, например USD</span>
                    </div>
                  </div>
                </div>

                {draft.pipeline_stage === 'lost' && (
                  <div>
                    <label htmlFor={`crm-loss-${leadId}`} className="mb-1.5 block text-xs font-semibold text-[var(--adm-fg)]/65">Почему сделка проиграна</label>
                    <input
                      id={`crm-loss-${leadId}`}
                      value={draft.loss_reason}
                      maxLength={500}
                      placeholder="Например: не подошёл бюджет или выбрали другого подрядчика"
                      onChange={(event) => setDraft({ ...draft, loss_reason: event.target.value })}
                      className={FIELD_CLASS}
                    />
                  </div>
                )}

                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <label htmlFor={`crm-notes-${leadId}`} className="text-xs font-semibold text-[var(--adm-fg)]/65">Рабочие заметки</label>
                    <span className="text-xs text-[var(--adm-fg)]/40">{draft.notes.length}/5000</span>
                  </div>
                  <textarea
                    id={`crm-notes-${leadId}`}
                    rows={4}
                    maxLength={5000}
                    value={draft.notes}
                    placeholder="Что обсудили, возражения клиента и следующий шаг"
                    onChange={(event) => setDraft({ ...draft, notes: event.target.value })}
                    className={`${FIELD_CLASS} min-h-28 resize-y leading-relaxed`}
                  />
                </div>

                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-h-5 min-w-0 break-words text-xs" aria-live="polite">
                    {error ? <span className="text-[var(--adm-danger)]">{error}</span> : null}
                    {!error && notice ? <span className="text-green-500">{notice}</span> : null}
                  </div>
                  <button
                    type="button"
                    className="admin-button admin-button--primary min-h-11 w-full sm:w-auto"
                    onClick={() => void saveCrm()}
                    disabled={saving || !isDirty}
                  >
                    {saving ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {saving ? 'Сохраняю…' : 'Сохранить'}
                  </button>
                </div>
              </div>

              <aside className="min-w-0 border-t border-[var(--adm-border)] pt-4 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0" aria-label="История сделки">
                <h4 className="flex items-center gap-2 text-sm font-semibold">
                  <History className="h-4 w-4 text-[var(--adm-primary)]" /> История
                </h4>
                {activities.length === 0 ? (
                  <p className="mt-3 text-xs leading-relaxed text-[var(--adm-fg)]/50">История появится после первого изменения карточки.</p>
                ) : (
                  <ol className="mt-3 max-h-80 space-y-3 overflow-y-auto pr-1">
                    {activities.map((activity) => (
                      <li key={activity.id} className="min-w-0 border-l-2 border-[var(--adm-primary)]/25 pl-3">
                        <div className="flex flex-wrap items-start justify-between gap-x-2 gap-y-0.5">
                          <span className="text-xs font-semibold text-[var(--adm-fg)]/80">{ACTIVITY_LABELS[activity.type] || 'Изменение'}</span>
                          <time className="text-xs text-[var(--adm-fg)]/40">{formatDate(activity.created_at)}</time>
                        </div>
                        {activity.type === 'notes_updated' ? (
                          <p className="mt-1 break-words whitespace-pre-line text-xs leading-relaxed text-[var(--adm-fg)]/60">{activity.note || 'Заметки очищены'}</p>
                        ) : (activity.from !== activity.to) ? (
                          <p className="mt-1 break-words text-xs leading-relaxed text-[var(--adm-fg)]/55">
                            <span className="line-through opacity-60">{formatActivityValue(activity.type, activity.from)}</span>
                            <span aria-hidden="true"> → </span>
                            <span className="text-[var(--adm-fg)]/80">{formatActivityValue(activity.type, activity.to)}</span>
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                )}
              </aside>
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}

export default function AdminLeads({ password }: { password: string }) {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [metaNotice, setMetaNotice] = useState('');
  const [qualityConfirmation, setQualityConfirmation] = useState<QualityConfirmation | null>(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const res = await fetch('/api/admin/leads', {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await res.json().catch(() => null) as { success?: boolean; error?: string; leads?: LeadRow[] } | null;
      if (!res.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${res.status}`);
      setLeads(payload.leads || []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось загрузить заявки';
      if (silent) {
        setMetaNotice(`Изменение сохранено, но список не удалось обновить: ${message}`);
      } else {
        setError(message);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [password]);

  useEffect(() => { void load(); }, [load]);

  const updateLead = async (id: number, patch: { quality: string }) => {
    const previous = leads;
    setLeads((current) => current.map((lead) => (lead.id === id ? { ...lead, ...patch } : lead)));
    try {
      const res = await fetch('/api/admin/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
        credentials: 'same-origin',
        body: JSON.stringify({ id, ...patch }),
      });
      const payload = await res.json().catch(() => null) as { success?: boolean; error?: string; meta?: { status: string; reason?: string; event_id?: string; events_received?: number; fbtrace_id?: string } } | null;
      if (!res.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${res.status}`);
      // Обратная связь по событию качества для Meta
      if (patch.quality === 'target' || patch.quality === 'nontarget') {
        const eventName = patch.quality === 'target' ? 'QualifiedLead' : 'UnqualifiedLead';
        const meta = payload.meta;
        if (meta?.status === 'sent') setMetaNotice(`✓ Meta подтвердила событие ${eventName}${meta.events_received ? ` (${meta.events_received})` : ''}`);
        else if (meta?.status === 'queued') setMetaNotice(`Метка сохранена. ${eventName}: ${meta.reason || 'ожидает повторной отправки'}`);
        else if (meta?.status === 'failed') setMetaNotice(`Метка сохранена. ${eventName}: ${meta.reason || 'ошибка отправки'}`);
        else if (meta) setMetaNotice(`Метка сохранена, событие в Meta не отправлено: ${meta.reason || 'пропущено'}`);
        window.setTimeout(() => setMetaNotice(''), 6000);
      }
      // Обновляем delivery badge без размонтирования раскрытых CRM-карточек
      // и потери ещё не сохранённых рабочих заметок.
      await load(true);
    } catch (err) {
      setLeads(previous);
      alert('Не удалось обновить заявку: ' + (err instanceof Error ? err.message : 'ошибка'));
    }
  };

  const requestQualityChange = (lead: LeadRow, desiredQuality: 'target' | 'nontarget') => {
    const nextQuality = lead.quality === desiredQuality ? '' : desiredQuality;
    const hasCommittedQuality = (lead.quality === 'target' || lead.quality === 'nontarget')
      && ['pending', 'retry', 'sending', 'sent'].includes(lead.quality_meta_status || '');
    const changesCommittedQuality = hasCommittedQuality && nextQuality !== lead.quality;
    if (changesCommittedQuality) {
      setQualityConfirmation({ leadId: lead.id, nextQuality });
      return;
    }
    setQualityConfirmation(null);
    void updateLead(lead.id, { quality: nextQuality });
  };

  const visible = filter === 'all'
    ? leads
    : filter === 'target' || filter === 'nontarget'
      ? leads.filter((lead) => (lead.quality || '') === filter)
      : leads.filter((lead) => effectivePipelineStage(lead) === filter);

  if (loading) return <div className="p-6 text-sm text-[var(--adm-fg)]/60" role="status" aria-live="polite">Загрузка заявок…</div>;

  if (error) {
    return (
      <div className="rounded-2xl border border-[var(--adm-border)] bg-[var(--adm-card)] p-6 space-y-3" role="alert">
        <p className="text-sm text-[var(--adm-fg)]/75">{error}</p>
        <p className="text-xs text-[var(--adm-fg)]/55">Основная таблица заявок требует миграцию 0008, а этапы, заметки и история мини-CRM — миграцию 0012. Telegram-уведомления продолжают работать независимо от экрана админки.</p>
        <button type="button" onClick={() => void load()} className="admin-button">
          <RefreshCw className="h-3.5 w-3.5" /> Повторить
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Фильтр заявок">
          {[
            { value: 'all', label: `Все (${leads.length})` },
            ...PIPELINE_STAGES.map((stage) => ({
              value: stage.value,
              label: `${stage.label} (${leads.filter((lead) => effectivePipelineStage(lead) === stage.value).length})`,
            })),
            { value: 'target', label: `целевые (${leads.filter((l) => l.quality === 'target').length})` },
            { value: 'nontarget', label: `нецелевые (${leads.filter((l) => l.quality === 'nontarget').length})` },
          ].map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
              className={`min-h-10 rounded-lg border px-3 text-xs font-semibold transition-colors ${filter === option.value ? 'border-[var(--adm-primary)] bg-[var(--adm-primary)]/15 text-[var(--adm-primary)]' : 'border-[var(--adm-border)] text-[var(--adm-fg)]/70 hover:bg-[var(--adm-muted)]/50'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => void load()} className="admin-button w-full sm:w-auto">
          <RefreshCw className="h-4 w-4" /> Обновить
        </button>
      </div>

      <div aria-live="polite" aria-atomic="true">
        {metaNotice && (
          <div className="rounded-xl border border-[var(--adm-primary)]/30 bg-[var(--adm-primary)]/10 px-4 py-3 text-sm leading-relaxed text-[var(--adm-fg)]/85">
            {metaNotice}
          </div>
        )}
      </div>

      {visible.length === 0 && (
        <div className="admin-empty">
          <div><strong>Заявок нет</strong><p>Для выбранного фильтра пока ничего не найдено.</p></div>
        </div>
      )}

      <div className="space-y-3">
        {visible.map((lead) => {
          const link = contactLink(lead);
          const repeatCount = Number(lead.submissions_count || 1);
          const metaBadge = qualityMetaBadge(lead);
          const pipelineStage = effectivePipelineStage(lead);
          const confirmation = qualityConfirmation?.leadId === lead.id ? qualityConfirmation : null;
          const deliveredEvent = lead.quality === 'target' ? 'QualifiedLead' : 'UnqualifiedLead';
          const qualityAlreadySent = lead.quality_meta_status === 'sent';
          const nextEvent = confirmation?.nextQuality === 'target' ? 'QualifiedLead' : confirmation?.nextQuality === 'nontarget' ? 'UnqualifiedLead' : '';
          return (
            <article key={lead.id} className="admin-panel admin-panel--interactive min-w-0 overflow-hidden p-4 sm:p-5">
              <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(240px,280px)]">
                <div className="min-w-0 break-words">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <h3 className="min-w-0 break-words text-base font-semibold">{lead.name || 'Без имени'}</h3>
                    <time className="text-xs text-[var(--adm-fg)]/50">{formatDate(lead.last_submitted_at || lead.created_at)}</time>
                    {repeatCount > 1 && (
                      <span className="max-w-full break-words rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-500" title={`Первая заявка: ${formatDate(lead.created_at)}`}>
                        Повторная заявка ×{repeatCount} · первая {formatDate(lead.created_at)}
                      </span>
                    )}
                    {lead.telegram_delivered !== 1 && (
                      <span className="max-w-full break-words rounded-full bg-[var(--adm-danger)]/10 px-2.5 py-1 text-xs text-[var(--adm-danger)]" title="Уведомление в Telegram не подтверждено">
                        Нет Telegram-уведомления
                      </span>
                    )}
                  </div>

                  <div className="mt-2 flex min-w-0 flex-wrap gap-x-4 gap-y-1.5 text-xs leading-relaxed text-[var(--adm-fg)]/65">
                    {lead.email && <a className="max-w-full break-all hover:text-[var(--adm-primary)] hover:underline" href={`mailto:${lead.email}`}>{lead.email}</a>}
                    {lead.phone && <a className="max-w-full break-all hover:text-[var(--adm-primary)] hover:underline" href={`tel:${lead.phone}`}>{lead.phone}</a>}
                    {link && (
                      <a href={link.href} target="_blank" rel="noopener noreferrer" className="inline-flex max-w-full items-center gap-1 break-all text-[var(--adm-primary)] hover:underline">
                        <Send className="h-3.5 w-3.5 shrink-0" /> {link.label}
                      </a>
                    )}
                    {lead.budget && <span className="max-w-full break-words">Бюджет: {lead.budget}</span>}
                    {lead.service && <span className="max-w-full break-words">Услуга: {lead.service}</span>}
                    {lead.page_path && <span className="max-w-full break-all">Со страницы: {lead.page_path}</span>}
                  </div>

                  {UTM_LABELS.some(({ key }) => lead[key]) && (
                    <div className="mt-3 flex min-w-0 flex-wrap gap-1.5" aria-label="Метки источника заявки">
                      {UTM_LABELS.map(({ key, label }) => lead[key] ? (
                        <span key={key} className="inline-flex max-w-full min-w-0 flex-wrap items-center gap-1 rounded-full border border-[var(--adm-primary)]/25 bg-[var(--adm-primary)]/8 px-2.5 py-1 text-xs">
                          <span className="shrink-0 text-[var(--adm-fg)]/45">{label}:</span>
                          <span className="min-w-0 break-all font-medium text-[var(--adm-primary)]">{lead[key]}</span>
                        </span>
                      ) : null)}
                    </div>
                  )}
                  {lead.message && <p className="mt-3 break-words whitespace-pre-line text-sm leading-relaxed text-[var(--adm-fg)]/85">{lead.message}</p>}
                </div>

                <div className="grid min-w-0 grid-cols-2 content-start gap-2 lg:w-full">
                  <span
                    className={`col-span-2 inline-flex min-h-11 w-full items-center justify-center rounded-lg border px-3 text-sm font-semibold ${PIPELINE_STAGE_STYLES[pipelineStage]}`}
                    title="Этап меняется внутри карточки CRM ниже"
                  >
                    {PIPELINE_STAGES.find((stage) => stage.value === pipelineStage)?.label || pipelineStage}
                  </span>

                  <button
                    type="button"
                    aria-pressed={lead.quality === 'target'}
                    onClick={() => requestQualityChange(lead, 'target')}
                    className={`min-h-11 min-w-0 rounded-lg border px-2 text-xs font-semibold transition-colors ${lead.quality === 'target' ? 'border-green-500/60 bg-green-500/15 text-green-500' : 'border-[var(--adm-border)] text-[var(--adm-fg)]/60 hover:bg-[var(--adm-muted)]/50'}`}
                    title="Отправить QualifiedLead в Meta при наличии маркетингового согласия"
                  >
                    Целевой
                  </button>
                  <button
                    type="button"
                    aria-pressed={lead.quality === 'nontarget'}
                    onClick={() => requestQualityChange(lead, 'nontarget')}
                    className={`min-h-11 min-w-0 rounded-lg border px-2 text-xs font-semibold transition-colors ${lead.quality === 'nontarget' ? 'border-[var(--adm-danger)]/60 bg-[var(--adm-danger)]/15 text-[var(--adm-danger)]' : 'border-[var(--adm-border)] text-[var(--adm-fg)]/60 hover:bg-[var(--adm-muted)]/50'}`}
                    title="Отправить UnqualifiedLead в Meta при наличии маркетингового согласия"
                  >
                    Нецелевой
                  </button>

                  {metaBadge && (
                    <span className={`col-span-2 inline-flex min-h-8 w-full items-center justify-center break-words rounded-full border px-3 py-1.5 text-center text-xs font-semibold leading-tight ${metaBadge.className}`} title={metaBadge.title}>
                      {metaBadge.label}
                    </span>
                  )}

                  {confirmation && (
                    <div className="col-span-2 min-w-0 rounded-xl border border-amber-500/35 bg-amber-500/10 p-3" role="alert" aria-live="assertive">
                      <p className="break-words text-xs leading-relaxed text-[var(--adm-fg)]/80">
                        {qualityAlreadySent
                          ? <>Meta уже приняла <strong>{deliveredEvent}</strong>. </>
                          : <><strong>{deliveredEvent}</strong> уже находится в очереди и ещё может быть доставлено. </>}
                        {nextEvent ? <>После подтверждения будет отправлено <strong>{nextEvent}</strong>.</> : <>Метка исчезнет только из админки.</>} Прежнее событие автоматически не отменяется.
                      </p>
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <button
                          type="button"
                          className="min-h-10 rounded-lg border border-amber-500/45 px-2 text-xs font-semibold text-amber-500 hover:bg-amber-500/10"
                          onClick={() => {
                            setQualityConfirmation(null);
                            void updateLead(lead.id, { quality: confirmation.nextQuality });
                          }}
                        >
                          Подтвердить
                        </button>
                        <button type="button" className="min-h-10 rounded-lg border border-[var(--adm-border)] px-2 text-xs font-semibold hover:bg-[var(--adm-muted)]/50" onClick={() => setQualityConfirmation(null)}>
                          Отмена
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <LeadCrmPanel leadId={lead.id} password={password} onSaved={() => void load(true)} />
            </article>
          );
        })}
      </div>
    </div>
  );
}
