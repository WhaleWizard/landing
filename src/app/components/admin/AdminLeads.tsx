import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  Mail,
  MessageCircle,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  Tag,
  Target,
  Trash2,
  Undo2,
  UserPlus,
  UserRoundCheck,
  Users,
  X,
} from 'lucide-react';
import { AdminSelect } from './AdminUI';
import { suggestLeadScore } from './leadScore';
import CrmBoard from './CrmBoard';
import CrmAnalytics from './CrmAnalytics';
import { confirmAsk, notify } from './AdminFeedback';
import { findDuplicateGroups } from './leadDuplicates';
import CrmQuickActions, { type QuickActionPlan } from './CrmQuickActions';
import { AdminSectionSkeleton } from './AdminFeedback';
import LeadCountryBadge from './LeadCountryBadge';

type PipelineStage = 'new' | 'contacted' | 'discovery' | 'proposal' | 'won' | 'lost' | 'archived';
type Priority = 'low' | 'normal' | 'high' | 'urgent';
type TaskKind = 'call' | 'message' | 'meeting' | 'proposal' | 'follow_up' | 'other';

interface CrmTag {
  id?: number;
  name: string;
  slug?: string;
  color?: string;
}

type QualityDeliveryStatus = 'queued' | 'sent' | 'skipped' | 'failed' | 'unknown';

interface QualityDeliveryItem {
  quality: 'target' | 'nontarget';
  event_name: 'QualifiedLead' | 'UnqualifiedLead';
  event_id: string;
  status: QualityDeliveryStatus;
  queue_status?: 'pending' | 'retry' | 'sending' | 'sent' | 'dead_letter';
  attempts?: number;
  reason?: string | null;
  sent_at?: number | null;
  updated_at?: string | null;
  current: boolean;
}

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
  country?: string;
  created_at: string;
  last_submitted_at?: string | null;
  submissions_count?: number;
  pipeline_stage: PipelineStage;
  priority: Priority;
  lead_score: number;
  next_action_at?: string | null;
  next_action_text?: string;
  deal_value?: number | null;
  deal_currency?: string;
  quality?: string;
  marketing_consent?: number;
  consent_version?: number | null;
  consent_source?: string | null;
  consent_region?: string | null;
  consent_timestamp?: number | null;
  consent_recorded_at?: string | null;
  quality_meta_status?: QualityDeliveryStatus;
  quality_meta_queue_status?: 'pending' | 'retry' | 'sending' | 'sent' | 'dead_letter';
  quality_meta_attempts?: number;
  quality_meta_error?: string | null;
  quality_meta_sent_at?: number | null;
  quality_meta_requires_confirmation?: boolean;
  quality_meta_change_blocked?: boolean;
  quality_meta_processing?: boolean;
  quality_meta_history?: QualityDeliveryItem[];
  quality_revision?: number;
  quality_action_id?: string;
  quality_processing?: number;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  open_tasks_count?: number;
  overdue_tasks_count?: number;
  crm_tags?: CrmTag[];
  crm_revision?: number;
}

interface CrmLeadPatch {
  pipeline_stage: PipelineStage;
  priority: Priority;
  lead_score: number;
  next_action_at: string;
  next_action_text: string;
  deal_value: string;
  deal_currency: string;
  loss_reason: string;
  notes: string;
  crm_revision: number;
}

interface CrmNote {
  id: number;
  body: string;
  pinned: number;
  created_at: string;
  updated_at: string;
  revision: number;
  action_id?: string;
}

interface CrmTask {
  id: number;
  title: string;
  kind: TaskKind;
  status: 'open' | 'completed' | 'cancelled';
  priority: Priority;
  due_at: string | null;
  created_at: string;
  updated_at: string;
  revision: number;
  action_id?: string;
}

interface CrmActivity {
  id: number;
  type: string;
  from: string | null;
  to: string | null;
  note: string;
  created_at: string;
  actor?: string;
}

interface WorkspaceResponse {
  success?: boolean;
  error?: string;
  code?: string;
  migration?: string;
  leads?: LeadRow[];
  pagination?: { total: number; returned: number; limit?: number; offset?: number };
  capabilities?: { correctness?: boolean; requiredMigration?: string | null };
  summary?: {
    stages?: Record<string, number>;
    reminders?: { overdue?: number; today?: number; without_next_action?: number };
    tasks?: { open?: number; overdue?: number; today?: number };
    values_by_currency?: Array<{ deal_currency: string; open_value: number; won_value: number }>;
  };
  facets?: { services?: Array<{ value: string; count: number }>; utm_sources?: Array<{ value: string; count: number }>; tags?: Array<CrmTag & { count: number }> };
}

const PIPELINE_STAGES: Array<{ value: PipelineStage; label: string }> = [
  { value: 'new', label: 'Новая' },
  { value: 'contacted', label: 'Связался' },
  { value: 'discovery', label: 'Обсуждение' },
  { value: 'proposal', label: 'Предложение' },
  { value: 'won', label: 'Выиграна' },
  { value: 'lost', label: 'Проиграна' },
  { value: 'archived', label: 'Архив' },
];

const PRIORITIES: Array<{ value: Priority; label: string }> = [
  { value: 'urgent', label: 'Срочный' },
  { value: 'high', label: 'Высокий' },
  { value: 'normal', label: 'Обычный' },
  { value: 'low', label: 'Низкий' },
];

const TASK_KINDS: Array<{ value: TaskKind; label: string }> = [
  { value: 'call', label: 'Звонок' },
  { value: 'message', label: 'Сообщение' },
  { value: 'meeting', label: 'Встреча' },
  { value: 'proposal', label: 'Предложение' },
  { value: 'follow_up', label: 'Повторный контакт' },
  { value: 'other', label: 'Другое' },
];

const LOSS_REASONS = [
  'Дорого',
  'Выбрали другого подрядчика',
  'Отложили бюджет',
  'Нет ответа',
  'Не тот запрос',
  'Делают своими силами',
  'Не устроили сроки',
] as const;

const CRM_PAGE_SIZE = 50;
const CRM_VIEW_KEY = 'ww-admin-crm-view';

type CrmView = 'board' | 'list' | 'analytics';

const CRM_VIEWS: Array<{ value: CrmView; label: string; hint: string }> = [
  { value: 'board', label: 'Доска', hint: 'Сделки по этапам, этап меняется перетаскиванием' },
  { value: 'list', label: 'Список', hint: 'Поиск, фильтры, сортировка и массовые действия' },
  { value: 'analytics', label: 'Аналитика', hint: 'Деньги, цикл сделки и здоровье пайплайна' },
];

function readStoredView(): CrmView {
  try {
    const stored = localStorage.getItem(CRM_VIEW_KEY);
    if (stored === 'board' || stored === 'list' || stored === 'analytics') return stored;
  } catch {
    // приватный режим браузера — просто открываем доску
  }
  return 'board';
}

const ACTIVITY_LABELS: Record<string, string> = {
  pipeline_stage_changed: 'Этап изменён',
  next_action_updated: 'Срок следующего действия изменён',
  next_action_text_updated: 'Следующее действие уточнено',
  loss_reason_updated: 'Причина проигрыша изменена',
  notes_updated: 'Сводная заметка изменена',
  deal_value_updated: 'Сумма сделки изменена',
  deal_currency_updated: 'Валюта изменена',
  priority_updated: 'Приоритет изменён',
  lead_score_updated: 'Оценка лида изменена',
  note_created: 'Добавлена заметка',
  note_updated: 'Заметка изменена',
  note_deleted: 'Заметка удалена',
  task_created: 'Создана задача',
  task_updated: 'Задача изменена',
  task_completed: 'Задача выполнена',
  task_cancelled: 'Задача отменена',
  task_deleted: 'Задача удалена',
  tags_updated: 'Теги обновлены',
  quality_changed: 'Качество лида изменено',
};

function formatDate(raw?: string | null): string {
  if (!raw) return '—';
  const normalized = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function toDateTimeLocal(raw?: string | null): string {
  if (!raw) return '';
  const date = new Date(raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toUtcIso(raw?: string | null): string | null {
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function stageLabel(value: string): string {
  return PIPELINE_STAGES.find((item) => item.value === value)?.label || value;
}

function priorityLabel(value: string): string {
  return PRIORITIES.find((item) => item.value === value)?.label || value;
}

function isOverdue(raw?: string | null): boolean {
  return Boolean(raw && new Date(raw).getTime() < Date.now());
}

const LEAD_QUALITY_CONSENT_MAX_AGE_MS = 180 * 24 * 60 * 60 * 1000;

// Сырые коды из серверной диагностики → понятное объяснение для администратора.
const QUALITY_REASON_LABELS: Record<string, string> = {
  marketing_consent_not_granted: 'Посетитель не дал согласие на маркетинг — событие качества отправлять запрещено.',
  consent_receipt_missing: 'У заявки нет сохранённой квитанции согласия: она оставлена до обновления от 23.07.2026, которое начало их записывать.',
  consent_receipt_invalid: 'Сохранённая квитанция согласия некорректна — событие не отправлено.',
  consent_receipt_expired: 'Решению о согласии больше 180 дней — событие не отправлено.',
  no_match_keys: 'У заявки нет данных для сопоставления с Meta (email, телефон, fbp/fbc).',
  missing_token_or_pixel_id: 'Meta CAPI не настроен на сервере (нет токена или Pixel ID).',
  cancelled_before_delivery_by_admin: 'Отправка отменена администратором до доставки.',
};

function qualityReasonLabel(reason?: string | null): string | undefined {
  if (!reason) return undefined;
  return QUALITY_REASON_LABELS[reason.trim()] || reason;
}

function qualityConsentIssue(lead: LeadRow): 'missing' | 'invalid' | 'expired' | null {
  if (!lead.consent_version || !lead.consent_source || !lead.consent_region || !lead.consent_timestamp || !lead.consent_recorded_at) return 'missing';
  const rawTimestamp = Number(lead.consent_timestamp);
  const timestampMs = rawTimestamp >= 1_000_000_000_000 ? rawTimestamp : rawTimestamp >= 1_000_000_000 ? rawTimestamp * 1000 : Number.NaN;
  const version = Number(lead.consent_version);
  const source = String(lead.consent_source).trim().toLowerCase();
  const recordedAtRaw = String(lead.consent_recorded_at);
  const recordedAtMs = Date.parse(recordedAtRaw.includes('T') ? recordedAtRaw : `${recordedAtRaw.replace(' ', 'T')}Z`);
  if (
    !Number.isFinite(timestampMs)
    || !Number.isInteger(version)
    || version <= 0
    || !['user', 'region_auto'].includes(source)
    || !Number.isFinite(recordedAtMs)
    || timestampMs > Date.now() + 5 * 60 * 1000
    || recordedAtMs > Date.now() + 5 * 60 * 1000
  ) return 'invalid';
  return Date.now() - timestampMs > LEAD_QUALITY_CONSENT_MAX_AGE_MS ? 'expired' : null;
}

function qualityMetaState(lead: LeadRow): { label: string; tone: string; title: string } | null {
  if (lead.quality !== 'target' && lead.quality !== 'nontarget') return null;
  if (lead.quality_meta_status === 'sent') return { label: 'Meta: доставлено', tone: 'success', title: `Meta подтвердила событие${lead.quality_meta_sent_at ? ` · ${new Date(lead.quality_meta_sent_at * 1000).toLocaleString('ru-RU')}` : ''}` };
  if (lead.quality_meta_status === 'queued') {
    const label = lead.quality_meta_queue_status === 'retry'
      ? 'Meta: повтор'
      : lead.quality_meta_queue_status === 'sending' ? 'Meta: отправляется' : 'Meta: в очереди';
    return { label, tone: lead.quality_meta_queue_status === 'retry' ? 'warning' : 'info', title: qualityReasonLabel(lead.quality_meta_error) || 'Событие ожидает подтверждения Meta' };
  }
  if (lead.quality_meta_status === 'failed') return { label: 'Meta: ошибка', tone: 'danger', title: qualityReasonLabel(lead.quality_meta_error) || 'Событие не доставлено' };
  if (lead.quality_meta_status === 'skipped') return { label: 'Meta: пропущено', tone: 'warning', title: qualityReasonLabel(lead.quality_meta_error) || 'Событие не отправлялось' };
  if (lead.quality_meta_status === 'unknown') return { label: 'Meta: статус неизвестен', tone: 'warning', title: qualityReasonLabel(lead.quality_meta_error) || 'В журнале нет записи о доставке' };
  if (lead.marketing_consent !== 1) return { label: 'Meta: нет согласия', tone: 'warning', title: 'Событие качества не отправляется без согласия на маркетинг.' };
  const consentIssue = qualityConsentIssue(lead);
  if (consentIssue === 'expired') return { label: 'Meta: согласие истекло', tone: 'warning', title: 'Событие качества не отправлено: решению о согласии больше 180 дней.' };
  if (consentIssue === 'missing') return { label: 'Meta: нет квитанции', tone: 'warning', title: 'Событие качества не отправлено: у заявки нет полной сохранённой квитанции согласия.' };
  if (consentIssue === 'invalid') return { label: 'Meta: проверь согласие', tone: 'danger', title: 'Событие качества не отправлено: сохранённая квитанция согласия некорректна.' };
  return { label: 'Meta: нет записи', tone: 'warning', title: 'Метка сохранена, но запись о доставке не найдена.' };
}

function qualityHistoryState(item: QualityDeliveryItem): { label: string; tone: string } {
  if (item.status === 'sent') return { label: 'доставлено', tone: 'success' };
  if (item.status === 'queued') return { label: item.queue_status === 'retry' ? 'повтор' : item.queue_status === 'sending' ? 'отправляется' : 'в очереди', tone: item.queue_status === 'retry' ? 'warning' : 'info' };
  if (item.status === 'failed') return { label: 'ошибка', tone: 'danger' };
  if (item.status === 'skipped') return { label: 'пропущено', tone: 'warning' };
  return { label: 'неизвестно', tone: 'warning' };
}

function contactHref(lead: LeadRow): string | null {
  if (lead.contact_method === 'telegram' && lead.telegram_username) return `https://t.me/${lead.telegram_username.replace(/^@/, '')}`;
  if (lead.phone) return `https://wa.me/${lead.phone.replace(/\D/g, '')}`;
  if (lead.email) return `mailto:${lead.email}`;
  return null;
}

interface TrashResult {
  moved?: number;
  restored?: number;
  purged?: number;
  cancelled_events?: number;
  /** Сколько заявок ещё осталось в корзине — по нему цикл очистки решает, делать ли следующий заход. */
  remaining?: number;
}

async function callTrashApi(password: string, body: Record<string, unknown>): Promise<TrashResult> {
  const response = await fetch('/api/admin/lead-trash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
    credentials: 'same-origin',
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as (TrashResult & { success?: boolean; error?: string; migration?: string }) | null;
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.migration
      ? `Примените миграцию ${payload.migration} — до неё корзина недоступна`
      : payload?.error || `HTTP ${response.status}`);
  }
  return payload;
}

function leadLabel(lead: { name?: string; email?: string; phone?: string; telegram_username?: string }): string {
  const name = String(lead.name || '').trim() || 'Без имени';
  const contact = String(lead.email || lead.phone || lead.telegram_username || '').trim();
  return contact ? `${name} · ${contact}` : name;
}

function LeadDetail({ lead, password, onChanged, editingReady, onOpenClients }: {
  lead: LeadRow;
  password: string;
  onChanged: () => void;
  editingReady: boolean;
  onOpenClients?: () => void;
}) {
  // Автооценка пересчитывается из самой заявки и ничего не перезаписывает:
  // ручной ползунок остаётся главным, кнопка «Применить» — предложением.
  const autoScore = useMemo(() => suggestLeadScore(lead), [lead]);
  const [clientLink, setClientLink] = useState<{ id: number; name: string } | null>(null);
  const [clientBusy, setClientBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draft, setDraft] = useState<CrmLeadPatch | null>(null);
  const [notes, setNotes] = useState<CrmNote[]>([]);
  const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [tags, setTags] = useState<CrmTag[]>([]);
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [newNote, setNewNote] = useState('');
  const [tagDraft, setTagDraft] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [taskKind, setTaskKind] = useState<TaskKind>('follow_up');
  const [taskPriority, setTaskPriority] = useState<Priority>('normal');
  const [taskDue, setTaskDue] = useState('');
  const [pendingQuality, setPendingQuality] = useState<'target' | 'nontarget' | '' | null>(null);
  const [leadActionId, setLeadActionId] = useState('');
  const [noteActionId, setNoteActionId] = useState('');
  const [taskActionId, setTaskActionId] = useState('');
  const [tagActionId, setTagActionId] = useState('');
  const [qualityActionId, setQualityActionId] = useState('');

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/lead-crm?lead_id=${encodeURIComponent(lead.id)}`, {
        headers: { 'X-Admin-Password': password }, credentials: 'same-origin', cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; error?: string; lead?: Record<string, unknown>; notes?: CrmNote[]; tasks?: CrmTask[]; tags?: CrmTag[]; activities?: CrmActivity[] } | null;
      if (!response.ok || !payload?.success || !payload.lead) throw new Error(payload?.error || `HTTP ${response.status}`);
      const row = payload.lead;
      setDraft({
        pipeline_stage: String(row.pipeline_stage || 'new') as PipelineStage,
        priority: String(row.priority || 'normal') as Priority,
        lead_score: Number(row.lead_score || 0),
        next_action_at: toDateTimeLocal(String(row.next_action_at || '')),
        next_action_text: String(row.next_action_text || ''),
        deal_value: row.deal_value === null || row.deal_value === undefined ? '' : String(row.deal_value),
        deal_currency: String(row.deal_currency || 'USD'),
        loss_reason: String(row.loss_reason || ''),
        notes: String(row.notes || ''),
        crm_revision: Number(row.crm_revision || 0),
      });
      setNotes(payload.notes || []);
      setTasks(payload.tasks || []);
      setTags(payload.tags || []);
      setTagDraft((payload.tags || []).map((item) => item.name).join(', '));
      setActivities(payload.activities || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось открыть сделку');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [lead.id, password]);

  useEffect(() => { void load(); }, [load]);

  const post = async (body: Record<string, unknown>, successMessage: string): Promise<boolean> => {
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/admin/lead-crm', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password }, credentials: 'same-origin',
        body: JSON.stringify({ lead_id: lead.id, ...body }),
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; error?: string; code?: string } | null;
      if (!response.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${response.status}`);
      setNotice(successMessage);
      await load(true);
      onChanged();
      return true;
    } catch (postError) {
      setError(postError instanceof Error ? postError.message : 'Не удалось сохранить');
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Заведён ли уже клиент из этой сделки — чтобы вместо кнопки показать ссылку
  // на готовую карточку и не плодить дубли.
  useEffect(() => {
    let cancelled = false;
    setClientLink(null);
    void (async () => {
      try {
        const response = await fetch(`/api/admin/clients?lead_id=${lead.id}`, {
          headers: { 'X-Admin-Password': password },
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => null) as { success?: boolean; client?: { id: number; name: string } | null } | null;
        if (!cancelled && response.ok && payload?.success) setClientLink(payload.client || null);
      } catch {
        // Раздел «Клиенты» может быть без миграции — карточке сделки это не мешает.
      }
    })();
    return () => { cancelled = true; };
  }, [lead.id, password]);

  /**
   * «Стал клиентом»: из сделки вырастает карточка в разделе «Клиенты».
   * Имя и контакт переносятся, чек не угадывается — сумма сделки это разовые
   * деньги, а не ежемесячный платёж. Сделка при этом переходит в «Выиграны»:
   * клиент, который платит, по определению выигранная сделка.
   */
  const convertToClient = async () => {
    const confirmed = await confirmAsk({
      title: `Завести клиента из сделки «${lead.name || 'без имени'}»?`,
      description: 'Создам карточку в разделе «Клиенты», перенесу имя и контакт. Сделка перейдёт в «Выиграны». Чек и договор заполните в карточке — их из заявки не угадать.',
      confirmLabel: 'Завести клиента',
    });
    if (!confirmed) return;

    setClientBusy(true);
    try {
      const response = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
        credentials: 'same-origin',
        body: JSON.stringify({
          action: 'create',
          lead_id: lead.id,
          name: lead.name || 'Без имени',
          contact_method: lead.telegram_username ? 'telegram' : lead.phone ? 'телефон' : 'почта',
          contact_value: lead.telegram_username || lead.phone || lead.email || '',
          retainer_currency: lead.deal_currency || 'USD',
          started_at: new Date().toISOString().slice(0, 10),
        }),
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; id?: number; clientId?: number; error?: string } | null;

      if (response.status === 409 && payload?.clientId) {
        setClientLink({ id: payload.clientId, name: lead.name });
        notify.info('Клиент из этой сделки уже заведён');
        return;
      }
      if (!response.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${response.status}`);

      setClientLink({ id: Number(payload.id || 0), name: lead.name });

      if (draft && draft.pipeline_stage !== 'won') {
        await post({
          action: 'update_lead', action_id: crypto.randomUUID(), expected_revision: draft.crm_revision,
          pipeline_stage: 'won', priority: draft.priority, lead_score: draft.lead_score,
          next_action_at: toUtcIso(draft.next_action_at), next_action_text: draft.next_action_text,
          deal_value: draft.deal_value === '' ? null : Number(draft.deal_value), deal_currency: draft.deal_currency,
          loss_reason: draft.loss_reason, notes: draft.notes,
        }, 'Сделка переведена в «Выиграны».');
      }

      notify.success('Клиент заведён', 'Карточка ждёт в разделе «Клиенты» — заполните чек и договор.');
    } catch (convertError) {
      notify.error('Не удалось завести клиента', convertError instanceof Error ? convertError.message : undefined);
    } finally {
      setClientBusy(false);
    }
  };

  const saveLead = async () => {
    if (!draft) return;
    const actionId = leadActionId || crypto.randomUUID();
    setLeadActionId(actionId);
    const ok = await post({
      action: 'update_lead', action_id: actionId, expected_revision: draft.crm_revision,
      pipeline_stage: draft.pipeline_stage, priority: draft.priority, lead_score: draft.lead_score,
      next_action_at: toUtcIso(draft.next_action_at), next_action_text: draft.next_action_text,
      deal_value: draft.deal_value === '' ? null : Number(draft.deal_value), deal_currency: draft.deal_currency,
      loss_reason: draft.loss_reason, notes: draft.notes,
    }, 'Карточка сделки сохранена.');
    if (ok) setLeadActionId('');
  };

  const prepareQuickAction = (kind: 'start' | 'today' | 'proposal') => {
    if (!draft) return;
    const date = new Date();
    const localToday = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}T${kind === 'today' ? '18:00' : '12:00'}`;
    const preset = kind === 'start'
      ? { pipeline_stage: draft.pipeline_stage === 'new' ? 'contacted' as PipelineStage : draft.pipeline_stage, next_action_text: draft.next_action_text || 'Связаться с клиентом и уточнить задачу' }
      : kind === 'today'
        ? { next_action_at: draft.next_action_at || localToday, next_action_text: draft.next_action_text || 'Связаться с клиентом сегодня' }
        : { pipeline_stage: 'proposal' as PipelineStage, next_action_at: draft.next_action_at || localToday, next_action_text: draft.next_action_text || 'Подготовить и отправить предложение' };
    setDraft({ ...draft, ...preset });
    setNotice('Быстрое действие подготовлено. Проверьте карточку и сохраните сделку.');
  };

  const setQuality = async (
    quality: 'target' | 'nontarget' | '',
    confirmPrevious = false,
    forcedActionId?: string,
  ): Promise<boolean> => {
    setSaving(true);
    setError('');
    const actionId = forcedActionId || qualityActionId || crypto.randomUUID();
    setQualityActionId(actionId);
    try {
      const response = await fetch('/api/admin/leads', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password }, credentials: 'same-origin',
        body: JSON.stringify({
          id: lead.id,
          quality,
          action_id: actionId,
          expected_quality_revision: Number(lead.quality_revision || 0),
          confirm_previous_delivery: confirmPrevious,
        }),
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; error?: string; code?: string; meta?: { status?: string; reason?: string; events_received?: number } } | null;
      if (!response.ok || !payload?.success) {
        if (payload?.code === 'QUALITY_CONFIRMATION_REQUIRED') setPendingQuality(quality);
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      const eventName = quality === 'target' ? 'QualifiedLead' : quality === 'nontarget' ? 'UnqualifiedLead' : '';
      if (!eventName) setNotice('Классификация снята.');
      else if (payload.meta?.status === 'sent') setNotice(`Meta подтвердила ${eventName}${payload.meta.events_received ? ` · принято ${payload.meta.events_received}` : ''}.`);
      else if (payload.meta?.status === 'queued') setNotice(`${eventName} сохранено в очереди: ${payload.meta.reason || 'ожидает повтора'}.`);
      else setNotice(`${eventName}: ${payload.meta?.reason || 'статус будет обновлён после проверки очереди'}.`);
      setPendingQuality(null);
      setQualityActionId('');
      await load(true);
      onChanged();
      return true;
    } catch (qualityError) {
      setError(qualityError instanceof Error ? qualityError.message : 'Не удалось обновить качество лида');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const requestQuality = (quality: 'target' | 'nontarget') => {
    const next = lead.quality === quality ? '' : quality;
    const needsConfirmation = lead.quality_meta_requires_confirmation === true
      && (lead.quality === 'target' || lead.quality === 'nontarget');
    if (needsConfirmation && next !== lead.quality) {
      setQualityActionId(crypto.randomUUID());
      setPendingQuality(next);
    }
    else void setQuality(next);
  };

  const createTask = async () => {
    if (!taskTitle.trim()) return;
    const actionId = taskActionId || crypto.randomUUID();
    setTaskActionId(actionId);
    const ok = await post({
      action: 'create_task',
      action_id: actionId,
      title: taskTitle.trim(),
      kind: taskKind,
      priority: taskPriority,
      due_at: toUtcIso(taskDue),
    }, 'Задача создана.');
    if (ok) {
      setTaskTitle('');
      setTaskDue('');
      setTaskActionId('');
    }
  };

  /**
   * Быстрое действие: пишет заметку, при необходимости двигает этап и сразу
   * ставит дату следующего шага. Порядок важен — сначала заметка, потом
   * карточка: обновление карточки меняет ревизию, и повторно её слать нельзя.
   */
  const runQuickAction = async (plan: QuickActionPlan) => {
    if (!draft) return;
    const noteOk = await post(
      { action: 'add_note', action_id: crypto.randomUUID(), body: plan.note },
      plan.success,
    );
    if (!noteOk) return;

    const next = new Date();
    next.setDate(next.getDate() + plan.nextInDays);
    next.setHours(12, 0, 0, 0);

    await post({
      action: 'update_lead',
      action_id: crypto.randomUUID(),
      expected_revision: draft.crm_revision,
      pipeline_stage: plan.stage && draft.pipeline_stage === 'new' ? plan.stage : draft.pipeline_stage,
      next_action_at: next.toISOString(),
      next_action_text: plan.nextText,
    }, plan.success);
  };

  const addNote = async () => {
    if (!newNote.trim()) return;
    const actionId = noteActionId || crypto.randomUUID();
    setNoteActionId(actionId);
    const ok = await post({ action: 'add_note', action_id: actionId, body: newNote.trim() }, 'Заметка добавлена.');
    if (ok) {
      setNewNote('');
      setNoteActionId('');
    }
  };

  const saveTags = async () => {
    if (!draft) return;
    const actionId = tagActionId || crypto.randomUUID();
    setTagActionId(actionId);
    const ok = await post({
      action: 'set_tags',
      action_id: actionId,
      expected_revision: draft.crm_revision,
      tags: tagDraft.split(',').map((item) => item.trim()).filter(Boolean),
    }, 'Теги сохранены.');
    if (ok) setTagActionId('');
  };

  if (loading) return <div className="admin-crm-detail admin-panel" role="status">Загружаю карточку сделки…</div>;
  if (error && !draft) return <div className="admin-crm-detail admin-panel"><div className="admin-notice admin-state--danger">{error}</div><button className="admin-button" type="button" onClick={() => void load()}><RefreshCw aria-hidden="true" /> Повторить</button></div>;
  if (!draft) return null;

  const metaState = qualityMetaState(lead);
  const directContact = contactHref(lead);
  const qualityHistory = lead.quality_meta_history || [];
  const qualityBlocked = lead.quality_meta_change_blocked === true;
  return (
    <section className="admin-crm-detail admin-panel" aria-label={`Сделка: ${lead.name || 'Без имени'}`}>
      <div className="admin-crm-detail__header">
        <div className="min-w-0"><p className="admin-eyebrow">Сделка #{lead.id}</p><h2>{lead.name || 'Без имени'}</h2><p>{lead.service || 'Услуга не указана'} · заявка {formatDate(lead.last_submitted_at || lead.created_at)}</p></div>
        <div className="admin-crm-contact-actions">
          {lead.email ? <a className="admin-icon-button" href={`mailto:${lead.email}`} title={lead.email} aria-label="Написать на email"><Mail aria-hidden="true" /></a> : null}
          {directContact ? <a className="admin-button admin-button--primary" href={directContact} target="_blank" rel="noreferrer"><Send aria-hidden="true" /> Связаться</a> : null}
        </div>
      </div>

      <CrmQuickActions
        password={password}
        lead={{ id: lead.id, name: lead.name, service: lead.service, budget: lead.budget }}
        disabled={saving || !editingReady}
        onRun={runQuickAction}
      />

      {notice ? <div className="admin-notice admin-notice--success" role="status">{notice}</div> : null}
      {error ? <div className="admin-notice admin-notice--danger" role="alert">{error}</div> : null}

      <div className="admin-crm-detail__meta">
        {lead.email ? <a href={`mailto:${lead.email}`}>{lead.email}</a> : null}
        {lead.phone ? <a href={`tel:${lead.phone}`}>{lead.phone}</a> : null}
        {lead.telegram_username ? <a href={`https://t.me/${lead.telegram_username.replace(/^@/, '')}`} target="_blank" rel="noreferrer">@{lead.telegram_username.replace(/^@/, '')}</a> : null}
        <LeadCountryBadge country={lead.country} showCode />
        {lead.budget ? <span>Бюджет: {lead.budget}</span> : null}
        {lead.utm_source ? <span>{lead.utm_source}{lead.utm_medium ? ` / ${lead.utm_medium}` : ''}{lead.utm_campaign ? ` · ${lead.utm_campaign}` : ''}</span> : null}
      </div>
      {lead.message ? <blockquote className="admin-crm-message">{lead.message}</blockquote> : null}

      <div className="adm-inset flex flex-wrap items-center gap-2 p-3">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-[var(--adm-fg)]/45">Быстрый шаг</span>
        <button className="admin-button admin-button--quiet" type="button" disabled={saving || !editingReady} onClick={() => prepareQuickAction('start')}>Начать работу</button>
        <button className="admin-button admin-button--quiet" type="button" disabled={saving || !editingReady} onClick={() => prepareQuickAction('today')}>Связаться сегодня</button>
        <button className="admin-button admin-button--quiet" type="button" disabled={saving || !editingReady} onClick={() => prepareQuickAction('proposal')}>Подготовить предложение</button>
      </div>

      <div className="admin-crm-quality">
        <div><strong>Качество лида и Meta CAPI</strong><span>Кнопка сохраняет классификацию и отправляет разрешённое событие качества в Meta.</span></div>
        <div className="admin-crm-quality__actions">
          <button type="button" aria-pressed={lead.quality === 'target'} onClick={() => requestQuality('target')} disabled={saving || qualityBlocked || !editingReady} className={`admin-quality-button is-target ${lead.quality === 'target' ? 'is-active' : ''}`}><UserRoundCheck aria-hidden="true" /> Целевой</button>
          <button type="button" aria-pressed={lead.quality === 'nontarget'} onClick={() => requestQuality('nontarget')} disabled={saving || qualityBlocked || !editingReady} className={`admin-quality-button is-nontarget ${lead.quality === 'nontarget' ? 'is-active' : ''}`}><Target aria-hidden="true" /> Нецелевой</button>
          {metaState ? <span className={`admin-state admin-state--${metaState.tone}`} title={metaState.title}>{metaState.label}</span> : <span className="admin-state">Не классифицирован</span>}
        </div>
        {lead.quality_meta_processing && (lead.quality === 'target' || lead.quality === 'nontarget') ? <div className="admin-confirm-inline admin-crm-quality__confirm" role="status"><span>Операция была прервана до фиксации результата. Безопасно повторите ту же отправку.</span><button className="admin-button admin-button--primary" type="button" onClick={() => void setQuality(lead.quality as 'target' | 'nontarget', false, lead.quality_action_id)} disabled={saving || !editingReady}>Повторить отправку</button></div> : null}
        {pendingQuality !== null ? <div className="admin-confirm-inline admin-crm-quality__confirm" role="alert"><span>{lead.quality_meta_status === 'sent' ? 'Предыдущее событие уже доставлено в Meta и не может быть отозвано.' : lead.quality_meta_status === 'unknown' ? 'У предыдущего события нет надёжно зафиксированного статуса.' : 'Предыдущее событие уже находится в очереди и ещё может быть доставлено в Meta.'} {pendingQuality ? 'Отправить новую классификацию?' : 'Снять метку только в CRM?'}</span><button className="admin-button admin-button--primary" type="button" onClick={() => void setQuality(pendingQuality, true)} disabled={saving || !editingReady}>{pendingQuality ? 'Да, изменить' : 'Да, снять'}</button><button type="button" className="admin-button admin-button--quiet" onClick={() => { setPendingQuality(null); setQualityActionId(''); }}>Отмена</button></div> : null}
        {qualityHistory.length ? <details className="admin-disclosure admin-quality-history"><summary><span>История сигналов Meta · {qualityHistory.length}</span><ChevronRight aria-hidden="true" /></summary><div className="admin-quality-history__list">{qualityHistory.map((item) => { const state = qualityHistoryState(item); return <div key={item.event_id}><span>{item.event_name}{item.current ? ' · текущая' : ''}</span><span className={`admin-state admin-state--${state.tone}`}>{state.label}</span><small>{qualityReasonLabel(item.reason) || (item.sent_at ? formatDate(new Date(item.sent_at * 1000).toISOString()) : item.updated_at ? formatDate(item.updated_at) : 'Без дополнительной информации')}</small></div>; })}</div></details> : null}
      </div>

      <div className="admin-crm-client">
        <div>
          <strong>{clientLink ? 'Клиент заведён' : 'Стал клиентом?'}</strong>
          <span>
            {clientLink
              ? 'Договор, отчёты по месяцам и доступы живут в карточке клиента.'
              : 'Заведу карточку в разделе «Клиенты» и переведу сделку в «Выиграны».'}
          </span>
        </div>
        {clientLink ? (
          <button type="button" className="admin-button admin-button--quiet" onClick={() => onOpenClients?.()} disabled={!onOpenClients}>
            <Users aria-hidden="true" /> Открыть карточку клиента
          </button>
        ) : (
          <button type="button" className="admin-button admin-button--primary" disabled={clientBusy || !editingReady} onClick={() => void convertToClient()}>
            <UserPlus aria-hidden="true" /> {clientBusy ? 'Завожу…' : 'Стал клиентом'}
          </button>
        )}
      </div>

      <div className="admin-crm-form-grid">
        <AdminSelect label="Этап сделки" value={draft.pipeline_stage} options={PIPELINE_STAGES} onValueChange={(value) => setDraft({ ...draft, pipeline_stage: value as PipelineStage })} />
        <AdminSelect label="Приоритет" value={draft.priority} options={PRIORITIES} onValueChange={(value) => setDraft({ ...draft, priority: value as Priority })} />
        <label className="admin-field"><span className="admin-label-row"><span className="admin-label">Оценка лида</span><span className="admin-score-value">{draft.lead_score}/100</span></span><input type="range" min="0" max="100" step="5" value={draft.lead_score} onChange={(event) => setDraft({ ...draft, lead_score: Number(event.target.value) })} />
          <span className="lead-autoscore">
            <span className="lead-autoscore__row">
              <span>Автооценка по данным заявки: <strong>{autoScore.score}</strong></span>
              {draft.lead_score !== autoScore.score && (
                <button
                  type="button"
                  className="admin-button admin-button--quiet admin-button--compact"
                  onClick={() => setDraft({ ...draft, lead_score: autoScore.score })}
                >
                  Применить
                </button>
              )}
            </span>
            <span className="lead-autoscore__why">
              {autoScore.reasons.length ? autoScore.reasons.join(' · ') : 'Сигналов в заявке нет — оценка нулевая.'}
            </span>
          </span>
        </label>
        <label className="admin-field"><span className="admin-label">Следующее действие · дата</span><input className="admin-input" type="datetime-local" value={draft.next_action_at} onChange={(event) => setDraft({ ...draft, next_action_at: event.target.value })} /></label>
        <label className="admin-field admin-field--wide"><span className="admin-label">Что сделать следующим</span><input className="admin-input" maxLength={240} value={draft.next_action_text} onChange={(event) => setDraft({ ...draft, next_action_text: event.target.value })} placeholder="Например: отправить медиаплан и согласовать созвон" /></label>
        <label className="admin-field"><span className="admin-label">Сумма сделки</span><input className="admin-input" inputMode="decimal" value={draft.deal_value} onChange={(event) => setDraft({ ...draft, deal_value: event.target.value.replace(/[^\d.,]/g, '').replace(',', '.') })} placeholder="0" /></label>
        <label className="admin-field"><span className="admin-label">Валюта</span><input className="admin-input" maxLength={3} value={draft.deal_currency} onChange={(event) => setDraft({ ...draft, deal_currency: event.target.value.toUpperCase().replace(/[^A-Z]/g, '') })} /></label>
        {(draft.pipeline_stage === 'lost' || draft.loss_reason) ? (
          <div className="admin-field admin-field--wide">
            <span className="admin-label">Причина проигрыша</span>
            <div className="crm-loss-reasons" role="group" aria-label="Частые причины проигрыша">
              {LOSS_REASONS.map((reason) => (
                <button
                  key={reason}
                  type="button"
                  aria-pressed={draft.loss_reason.trim() === reason}
                  className={draft.loss_reason.trim() === reason ? 'is-active' : ''}
                  onClick={() => setDraft({ ...draft, loss_reason: draft.loss_reason.trim() === reason ? '' : reason })}
                >
                  {reason}
                </button>
              ))}
            </div>
            <textarea
              className="admin-input"
              rows={2}
              maxLength={500}
              value={draft.loss_reason}
              placeholder="Или впишите свою причину"
              onChange={(event) => setDraft({ ...draft, loss_reason: event.target.value })}
            />
          </div>
        ) : null}
        <label className="admin-field admin-field--wide"><span className="admin-label">Краткая сводка по сделке</span><textarea className="admin-input" rows={4} maxLength={5000} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Контекст, договорённости и важные ограничения" /></label>
      </div>
      <div className="admin-crm-save-row"><button className="admin-button admin-button--primary" type="button" onClick={() => void saveLead()} disabled={saving || !editingReady}><Save aria-hidden="true" /> {saving ? 'Сохраняю…' : 'Сохранить сделку'}</button></div>

      <div className="admin-crm-modules">
        <section className="admin-crm-module">
          <div className="admin-section-heading"><div><h3>Задачи</h3><p className="admin-meta">{tasks.filter((task) => task.status === 'open').length} открытых</p></div></div>
          <div className="admin-task-create">
            <input className="admin-input" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} maxLength={240} placeholder="Новая задача" aria-label="Название новой задачи" />
            <AdminSelect ariaLabel="Тип задачи" value={taskKind} options={TASK_KINDS} compact onValueChange={(value) => setTaskKind(value as TaskKind)} />
            <AdminSelect ariaLabel="Приоритет задачи" value={taskPriority} options={PRIORITIES} compact onValueChange={(value) => setTaskPriority(value as Priority)} />
            <input className="admin-input" type="datetime-local" value={taskDue} onChange={(event) => setTaskDue(event.target.value)} aria-label="Срок задачи" />
            <button className="admin-button admin-button--primary" type="button" disabled={saving || !editingReady || !taskTitle.trim()} onClick={() => void createTask()}><Plus aria-hidden="true" /> Добавить</button>
          </div>
          <div className="admin-task-list">{tasks.length ? tasks.map((task) => <div className={`admin-task-row ${task.status !== 'open' ? 'is-done' : ''}`} key={task.id}><button type="button" disabled={saving || !editingReady} className="admin-task-check" aria-label={task.status === 'open' ? 'Отметить выполненной' : 'Вернуть в работу'} onClick={() => void post({ action: 'update_task', action_id: crypto.randomUUID(), task_id: task.id, expected_revision: task.revision, status: task.status === 'open' ? 'completed' : 'open' }, task.status === 'open' ? 'Задача выполнена.' : 'Задача возвращена в работу.')}><Check aria-hidden="true" /></button><div><strong>{task.title}</strong><span>{TASK_KINDS.find((item) => item.value === task.kind)?.label || task.kind} · {priorityLabel(task.priority)}{task.due_at ? ` · ${formatDate(task.due_at)}` : ''}</span></div><button type="button" disabled={saving || !editingReady} className="admin-icon-button admin-icon-button--danger" aria-label="Удалить задачу" onClick={() => void post({ action: 'delete_task', action_id: crypto.randomUUID(), task_id: task.id, expected_revision: task.revision }, 'Задача удалена.')}><Trash2 aria-hidden="true" /></button></div>) : <p className="admin-muted">Задач пока нет.</p>}</div>
        </section>

        <section className="admin-crm-module">
          <div className="admin-section-heading"><div><h3>Заметки</h3><p className="admin-meta">Отдельные записи с датой и историей</p></div></div>
          <div className="admin-note-create"><textarea className="admin-input" rows={3} maxLength={10000} value={newNote} onChange={(event) => setNewNote(event.target.value)} placeholder="Итог звонка, возражение или договорённость" /><button className="admin-button admin-button--primary" type="button" disabled={saving || !editingReady || !newNote.trim()} onClick={() => void addNote()}><MessageCircle aria-hidden="true" /> Добавить заметку</button></div>
          <div className="admin-note-list">{notes.length ? notes.map((note) => <article key={note.id} className="admin-note"><div><span>{note.pinned ? 'Закреплено · ' : ''}{formatDate(note.updated_at || note.created_at)}</span><button type="button" disabled={saving || !editingReady} className="admin-button admin-button--quiet" onClick={() => void post({ action: 'update_note', action_id: crypto.randomUUID(), note_id: note.id, expected_revision: note.revision, pinned: !note.pinned }, note.pinned ? 'Заметка откреплена.' : 'Заметка закреплена.')}>{note.pinned ? 'Открепить' : 'Закрепить'}</button></div><p>{note.body}</p></article>) : <p className="admin-muted">Заметок пока нет.</p>}</div>
        </section>
      </div>

      <section className="admin-crm-module">
        <div className="admin-section-heading"><div><h3>Теги</h3><p className="admin-meta">Через запятую; новые теги создаются автоматически</p></div></div>
        <div className="admin-tags-editor"><input className="admin-input" value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} placeholder="VIP, срочно, e-commerce" /><button className="admin-button" type="button" disabled={saving || !editingReady} onClick={() => void saveTags()}><Tag aria-hidden="true" /> Сохранить теги</button></div>
        {tags.length ? <div className="admin-tag-list">{tags.map((item) => <span key={item.slug || item.name} style={{ '--tag-color': item.color || '#8b5cf6' } as CSSProperties}>{item.name}</span>)}</div> : null}
      </section>

      <details className="admin-disclosure admin-crm-history"><summary><span>История изменений · {activities.length}</span><ChevronRight aria-hidden="true" /></summary><div className="admin-crm-timeline">{activities.length ? activities.map((activity) => <div key={activity.id}><span /><div><strong>{ACTIVITY_LABELS[activity.type] || activity.type}</strong><p>{activity.note || [activity.from, activity.to].filter(Boolean).join(' → ') || 'Изменение сохранено'}</p><time>{formatDate(activity.created_at)}{activity.actor ? ` · ${activity.actor}` : ''}</time></div></div>) : <p className="admin-muted">История появится после первого изменения.</p>}</div></details>

      <div className="admin-crm-danger">
        <div><strong>Убрать заявку</strong><span>Заявка уедет в корзину: исчезнет из списков и отчётов, но её можно вернуть. Уже отправленные в Meta события не отзываются.</span></div>
        <button
          className="admin-button admin-button--danger"
          type="button"
          disabled={saving}
          onClick={async () => {
            const confirmed = await confirmAsk({
              title: `Убрать «${leadLabel(lead)}» в корзину?`,
              description: 'Заявка пропадёт из списка и статистики. Восстановить можно в разделе «Корзина».',
              confirmLabel: 'В корзину',
              tone: 'danger',
            });
            if (!confirmed) return;
            setSaving(true);
            setError('');
            callTrashApi(password, { action: 'delete', ids: [lead.id] })
              .then(() => onChanged())
              .catch((trashError) => setError(trashError instanceof Error ? trashError.message : 'Не удалось убрать заявку'))
              .finally(() => setSaving(false));
          }}
        >
          <Trash2 aria-hidden="true" /> В корзину
        </button>
      </div>
    </section>
  );
}

interface TrashedLead {
  id: number;
  name?: string;
  email?: string;
  phone?: string;
  telegram_username?: string;
  service?: string;
  created_at?: string;
  deleted_at?: string;
  deleted_reason?: string;
}

interface TrashListResponse {
  success?: boolean;
  error?: string;
  migration?: string;
  leads?: TrashedLead[];
  total?: number;
  matched?: number;
}

const TRASH_PAGE_SIZE = 25;
// Сервер принимает не больше 200 id за раз, а сам режет их на части для D1.
// Держим запас: массовое действие уходит пачками по 100.
const TRASH_IDS_PER_REQUEST = 100;

type TrashConfirm = { kind: 'purge_selected'; count: number } | { kind: 'purge_all'; count: number };

function TrashPanel({ password, onChanged, refreshToken }: { password: string; onChanged: () => void; refreshToken: number }) {
  const [open, setOpen] = useState(false);
  const [leads, setLeads] = useState<TrashedLead[]>([]);
  const [total, setTotal] = useState(0);
  const [matched, setMatched] = useState(0);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState('');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [checkedIds, setCheckedIds] = useState<number[]>([]);
  const [confirming, setConfirming] = useState<TrashConfirm | null>(null);

  const fetchPage = useCallback(async (offset: number): Promise<TrashListResponse> => {
    const params = new URLSearchParams({ limit: String(TRASH_PAGE_SIZE), offset: String(offset) });
    if (query.trim()) params.set('q', query.trim());
    const response = await fetch(`/api/admin/lead-trash?${params.toString()}`, {
      headers: { 'X-Admin-Password': password }, credentials: 'same-origin', cache: 'no-store',
    });
    const payload = await response.json().catch(() => null) as TrashListResponse | null;
    if (!response.ok || !payload?.success) {
      throw new Error(payload?.migration
        ? `Примените миграцию ${payload.migration} — до неё корзина недоступна`
        : payload?.error || `HTTP ${response.status}`);
    }
    return payload;
  }, [password, query]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await fetchPage(0);
      const nextLeads = payload.leads || [];
      setLeads(nextLeads);
      setTotal(Number(payload.total || 0));
      setMatched(Number(payload.matched ?? payload.total ?? 0));
      // Отметки живут только для видимых строк: иначе после поиска или
      // перезагрузки действие задело бы заявки, которых на экране уже нет.
      setCheckedIds((current) => current.filter((id) => nextLeads.some((item) => item.id === id)));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось открыть корзину');
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

  // refreshToken меняется, когда заявку убрали из списка или из карточки:
  // открытая корзина подхватывает её сама, не закрываясь. Поиск с задержкой,
  // чтобы не слать запрос на каждую букву.
  useEffect(() => {
    if (!open) return undefined;
    const timer = window.setTimeout(() => void load(), 240);
    return () => window.clearTimeout(timer);
  }, [load, open, refreshToken]);

  // Счётчик рядом с заголовком нужен и у закрытой корзины: администратор
  // должен видеть, что там что-то лежит, не открывая раздел.
  useEffect(() => {
    if (open) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch('/api/admin/lead-trash?limit=1', {
          headers: { 'X-Admin-Password': password }, credentials: 'same-origin', cache: 'no-store',
        });
        const payload = await response.json().catch(() => null) as TrashListResponse | null;
        if (!cancelled && payload?.success) setTotal(Number(payload.total || 0));
      } catch {
        // Счётчик не критичен: ошибку показываем только при открытой корзине.
      }
    })();
    return () => { cancelled = true; };
  }, [open, password, refreshToken]);

  const loadMore = async () => {
    setLoadingMore(true);
    setError('');
    try {
      const payload = await fetchPage(leads.length);
      const more = payload.leads || [];
      setLeads((current) => {
        const seen = new Set(current.map((item) => item.id));
        return [...current, ...more.filter((item) => !seen.has(item.id))];
      });
      setTotal(Number(payload.total || 0));
      setMatched(Number(payload.matched ?? payload.total ?? 0));
    } catch (moreError) {
      setError(moreError instanceof Error ? moreError.message : 'Не удалось загрузить ещё');
    } finally {
      setLoadingMore(false);
    }
  };

  const finish = async (message: string) => {
    setCheckedIds([]);
    setNotice(message);
    setConfirming(null);
    await load();
    onChanged();
  };

  const runBulk = async (action: 'restore' | 'purge', ids: number[]) => {
    if (!ids.length) return;
    setBusy(action);
    setError('');
    setNotice('');
    try {
      let done = 0;
      for (let index = 0; index < ids.length; index += TRASH_IDS_PER_REQUEST) {
        const part = ids.slice(index, index + TRASH_IDS_PER_REQUEST);
        const payload = await callTrashApi(password, { action, ids: part });
        done += Number((action === 'restore' ? payload.restored : payload.purged) || 0);
        if (ids.length > TRASH_IDS_PER_REQUEST) {
          setProgress(`Обработано ${Math.min(index + part.length, ids.length)} из ${ids.length}…`);
        }
      }
      await finish(action === 'restore'
        ? `Восстановлено заявок: ${done}`
        : `Удалено навсегда: ${done}`);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Действие не выполнено');
    } finally {
      setBusy('');
      setProgress('');
    }
  };

  // Полная очистка идёт порциями на сервере: повторяем запрос, пока корзина
  // не опустеет, и показываем остаток, чтобы не выглядело зависанием.
  const purgeAll = async () => {
    setBusy('purge_all');
    setError('');
    setNotice('');
    try {
      let removed = 0;
      for (let round = 0; round < 100; round += 1) {
        const payload = await callTrashApi(password, { action: 'purge_all' });
        const purged = Number(payload.purged || 0);
        const remaining = Number(payload.remaining || 0);
        removed += purged;
        if (remaining <= 0 || purged === 0) break;
        setProgress(`Удалено ${removed}, осталось ${remaining}…`);
      }
      await finish(`Корзина очищена · удалено заявок: ${removed}`);
    } catch (purgeError) {
      setError(purgeError instanceof Error ? purgeError.message : 'Не удалось очистить корзину');
    } finally {
      setBusy('');
      setProgress('');
    }
  };

  const working = Boolean(busy);
  const allChecked = leads.length > 0 && checkedIds.length === leads.length;
  const someChecked = checkedIds.length > 0 && !allChecked;
  const searching = Boolean(query.trim());

  return (
    <section className="admin-panel admin-trash" aria-label="Корзина заявок">
      <div className="admin-trash__header">
        <div className="admin-trash__title">
          <h3>Корзина<span className={`admin-trash__count ${total ? 'is-filled' : ''}`}>{total}</span></h3>
          <p className="admin-meta">Убранные заявки не видны в списке, счётчиках и отчётах по источникам. Пока они здесь — их можно вернуть.</p>
        </div>
        <button className="admin-button" type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
          <Trash2 aria-hidden="true" /> {open ? 'Свернуть' : 'Открыть корзину'}
        </button>
      </div>

      {open ? (
        <div className="admin-trash__body">
          {/* Поиск не нужен, пока корзина пуста и ничего не искали. */}
          {total > 0 || searching ? (
          <div className="admin-trash__toolbar">
            <label className="admin-trash__search">
              <Search aria-hidden="true" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Имя, контакт, услуга или причина"
                aria-label="Поиск по корзине"
              />
              {searching ? (
                <button type="button" className="admin-trash__search-clear" aria-label="Очистить поиск" onClick={() => setQuery('')}><X aria-hidden="true" /></button>
              ) : null}
            </label>
            <button className="admin-button admin-button--quiet" type="button" onClick={() => void load()} disabled={loading || working}>
              <RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Обновить
            </button>
          </div>
          ) : null}

          {error ? <div className="admin-notice admin-notice--danger" role="alert">{error}</div> : null}
          {notice ? <div className="admin-notice admin-notice--success" role="status">{notice}</div> : null}
          {progress ? <div className="admin-notice" role="status">{progress}</div> : null}

          {confirming ? (
            <div className="admin-trash__confirm" role="alertdialog" aria-label="Подтверждение удаления">
              <AlertTriangle aria-hidden="true" />
              <div className="admin-trash__confirm-text">
                <strong>
                  {confirming.kind === 'purge_all'
                    ? `Очистить корзину полностью — ${confirming.count} заявок?`
                    : `Удалить навсегда выбранные заявки — ${confirming.count}?`}
                </strong>
                <span>Заявки и вся их история исчезнут без возможности восстановления. Уже отправленные в Meta события не отзываются.</span>
              </div>
              <div className="admin-trash__confirm-actions">
                <button className="admin-button admin-button--quiet" type="button" onClick={() => setConfirming(null)} disabled={working}>Отмена</button>
                <button
                  className="admin-button admin-button--danger-solid"
                  type="button"
                  disabled={working}
                  onClick={() => {
                    if (confirming.kind === 'purge_all') void purgeAll();
                    else void runBulk('purge', checkedIds);
                  }}
                >
                  <Trash2 aria-hidden="true" /> Да, удалить
                </button>
              </div>
            </div>
          ) : null}

          {loading && !leads.length ? <p className="admin-muted" role="status">Загружаю корзину…</p> : null}

          {!loading && !leads.length && !error ? (
            <div className="admin-empty">
              <div>
                <strong>{searching ? 'Ничего не найдено' : 'Корзина пуста'}</strong>
                <p>{searching ? 'Измените поисковый запрос.' : 'Убранные заявки появятся здесь и будут ждать восстановления или окончательного удаления.'}</p>
              </div>
            </div>
          ) : null}

          {leads.length ? (
            <>
              <div className="admin-trash__bulk">
                <label className="admin-trash__selectall">
                  <input
                    type="checkbox"
                    checked={allChecked}
                    ref={(node) => { if (node) node.indeterminate = someChecked; }}
                    aria-label="Выбрать все заявки на экране"
                    disabled={working}
                    onChange={(event) => setCheckedIds(event.target.checked ? leads.map((item) => item.id) : [])}
                  />
                  <span>{checkedIds.length ? `Выбрано: ${checkedIds.length}` : `Выбрать все на экране (${leads.length})`}</span>
                </label>
                <div className="admin-trash__bulk-actions">
                  <button
                    className="admin-button"
                    type="button"
                    disabled={working || !checkedIds.length}
                    onClick={() => void runBulk('restore', checkedIds)}
                  >
                    <Undo2 aria-hidden="true" /> {busy === 'restore' ? 'Восстанавливаю…' : 'Восстановить'}
                  </button>
                  <button
                    className="admin-button admin-button--danger"
                    type="button"
                    disabled={working || !checkedIds.length}
                    onClick={() => setConfirming({ kind: 'purge_selected', count: checkedIds.length })}
                  >
                    <Trash2 aria-hidden="true" /> {busy === 'purge' ? 'Удаляю…' : 'Удалить навсегда'}
                  </button>
                  {checkedIds.length ? (
                    <button className="admin-button admin-button--quiet" type="button" disabled={working} onClick={() => setCheckedIds([])}>Снять</button>
                  ) : null}
                </div>
              </div>

              <div className="admin-trash__list">
                {leads.map((lead) => {
                  const checked = checkedIds.includes(lead.id);
                  const contacts = [lead.email, lead.phone, lead.telegram_username ? `@${lead.telegram_username.replace(/^@/, '')}` : ''].filter(Boolean);
                  return (
                    <article className={`admin-trash__row ${checked ? 'is-checked' : ''}`} key={lead.id}>
                      <label className="admin-trash__row-check">
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={working}
                          aria-label={`Выбрать заявку ${leadLabel(lead)}`}
                          onChange={(event) => setCheckedIds((current) => event.target.checked
                            ? [...current, lead.id]
                            : current.filter((id) => id !== lead.id))}
                        />
                      </label>
                      <div className="admin-trash__row-body">
                        <div className="admin-trash__row-head">
                          <strong>{lead.name?.trim() || 'Без имени'}</strong>
                          {lead.service ? <span className="admin-trash__chip">{lead.service}</span> : null}
                        </div>
                        {contacts.length ? <p className="admin-trash__row-contacts">{contacts.join(' · ')}</p> : null}
                        <p className="admin-trash__row-meta">
                          <span>Убрана {lead.deleted_at ? formatDate(lead.deleted_at) : 'недавно'}</span>
                          {lead.created_at ? <span>Заявка от {formatDate(lead.created_at)}</span> : null}
                          {lead.deleted_reason ? <span>Причина: {lead.deleted_reason}</span> : null}
                        </p>
                      </div>
                      <div className="admin-trash__row-actions">
                        <button className="admin-button admin-button--quiet" type="button" disabled={working} onClick={() => void runBulk('restore', [lead.id])}>
                          <Undo2 aria-hidden="true" /> Восстановить
                        </button>
                        <button
                          className="admin-icon-button admin-icon-button--danger"
                          type="button"
                          disabled={working}
                          aria-label={`Удалить навсегда заявку ${leadLabel(lead)}`}
                          title="Удалить навсегда"
                          onClick={() => { setCheckedIds([lead.id]); setConfirming({ kind: 'purge_selected', count: 1 }); }}
                        >
                          <Trash2 aria-hidden="true" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="admin-trash__footer">
                <span className="admin-meta">
                  Показано {leads.length} из {matched}
                  {searching && matched !== total ? ` (всего в корзине ${total})` : ''}
                </span>
                <div className="admin-trash__footer-actions">
                  {leads.length < matched ? (
                    <button className="admin-button" type="button" disabled={loadingMore || working} onClick={() => void loadMore()}>
                      {loadingMore ? 'Загружаю…' : `Показать ещё ${Math.min(TRASH_PAGE_SIZE, matched - leads.length)}`}
                    </button>
                  ) : null}
                  <button
                    className="admin-button admin-button--danger"
                    type="button"
                    disabled={working || !total}
                    onClick={() => setConfirming({ kind: 'purge_all', count: total })}
                  >
                    <Trash2 aria-hidden="true" /> {busy === 'purge_all' ? 'Очищаю…' : 'Очистить корзину'}
                  </button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export default function AdminLeads({ password, onOpenClients }: { password: string; onOpenClients?: () => void }) {
  const [query, setQuery] = useState('');
  const [stage, setStage] = useState('all');
  const [priority, setPriority] = useState('all');
  const [due, setDue] = useState('all');
  const [sort, setSort] = useState('recent');
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [summary, setSummary] = useState<WorkspaceResponse['summary']>();
  const [facets, setFacets] = useState<WorkspaceResponse['facets']>();
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [migration, setMigration] = useState('');
  const [offset, setOffset] = useState(0);
  const [editingReady, setEditingReady] = useState(false);
  const [correctnessMigration, setCorrectnessMigration] = useState('');
  const [checkedIds, setCheckedIds] = useState<number[]>([]);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [trashVersion, setTrashVersion] = useState(0);
  const [view, setView] = useState<CrmView>(readStoredView);
  // На доске показывается больше сделок, чем на странице списка, поэтому
  // открытая с доски карточка хранится отдельно от постраничной выборки.
  const [boardLead, setBoardLead] = useState<LeadRow | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(CRM_VIEW_KEY, view);
    } catch {
      // не критично: выбор просто не переживёт перезагрузку
    }
  }, [view]);

  // Дубли ищутся среди загруженных заявок: это ровно то, что человек сейчас
  // видит, и никаких скрытых действий над невидимыми записями.
  const duplicateGroups = useMemo(() => findDuplicateGroups(leads), [leads]);
  const [merging, setMerging] = useState(0);

  const params = useMemo(() => {
    const value = new URLSearchParams({
      limit: String(CRM_PAGE_SIZE),
      offset: String(offset),
      sort,
      timezone_offset: String(new Date().getTimezoneOffset()),
    });
    if (query.trim()) value.set('q', query.trim());
    if (stage !== 'all') value.set('pipeline_stage', stage);
    if (priority !== 'all') value.set('priority', priority);
    if (due !== 'all') value.set('due', due);
    return value.toString();
  }, [due, offset, priority, query, sort, stage]);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/crm-leads?${params}`, { headers: { 'X-Admin-Password': password }, credentials: 'same-origin', cache: 'no-store' });
      const payload = await response.json().catch(() => null) as WorkspaceResponse | null;
      if (!response.ok || !payload?.success) {
        setMigration(payload?.migration || '');
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      const nextLeads = payload.leads || [];
      const nextTotal = Number(payload.pagination?.total || 0);
      if (offset > 0 && nextLeads.length === 0 && nextTotal > 0) {
        setOffset(Math.floor((nextTotal - 1) / CRM_PAGE_SIZE) * CRM_PAGE_SIZE);
        return;
      }
      setLeads(nextLeads);
      // Отметки живут только для видимых строк: иначе после смены фильтра
      // «удалить выделенные» задело бы заявки, которых на экране уже нет.
      setCheckedIds((current) => current.filter((id) => nextLeads.some((item) => item.id === id)));
      setSummary(payload.summary);
      setFacets(payload.facets);
      setTotal(nextTotal || nextLeads.length);
      setEditingReady(payload.capabilities?.correctness === true);
      setCorrectnessMigration(payload.capabilities?.requiredMigration || '');
      setMigration('');
      setSelectedId((current) => current && nextLeads.some((item) => item.id === current) ? current : nextLeads[0]?.id || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить CRM');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [offset, params, password]);

  useEffect(() => {
    setOffset(0);
  }, [due, priority, query, sort, stage]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 260);
    return () => window.clearTimeout(timer);
  }, [load]);

  /**
   * Слияние группы: все дубли по очереди складываются в первую заявку.
   * Ничего не удаляется — дубли уходят в корзину, и любой можно вернуть.
   */
  const mergeGroup = useCallback(async (primaryId: number, duplicateIds: number[], who: string) => {
    const confirmed = await confirmAsk({
      title: `Объединить заявки от «${who}»?`,
      description: `Заметки и задачи переедут в заявку #${primaryId}, пустые поля дозаполнятся из ${duplicateIds.length === 1 ? 'дубля' : 'дублей'}. ${duplicateIds.length === 1 ? 'Дубль отправится' : 'Дубли отправятся'} в корзину заявок — оттуда их можно вернуть.`,
      confirmLabel: 'Объединить',
    });
    if (!confirmed) return;

    setMerging(primaryId);
    try {
      for (const duplicateId of duplicateIds) {
        const response = await fetch('/api/admin/lead-crm', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
          credentials: 'same-origin',
          body: JSON.stringify({ action: 'merge_lead', lead_id: primaryId, duplicate_id: duplicateId }),
        });
        const payload = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
        if (!response.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      notify.success(
        duplicateIds.length === 1 ? 'Заявки объединены' : `Объединено заявок: ${duplicateIds.length + 1}`,
        `Всё собрано в заявке #${primaryId}.`,
      );
      await load(true);
    } catch (mergeError) {
      notify.error('Не удалось объединить', mergeError instanceof Error ? mergeError.message : undefined);
    } finally {
      setMerging(0);
    }
  }, [load, password]);

  const selected = leads.find((item) => item.id === selectedId) || null;
  const reminders = summary?.reminders || {};
  const taskSummary = summary?.tasks || {};
  const openValues = (summary?.values_by_currency || []).filter((item) => Number(item.open_value) > 0);
  const pageStart = total === 0 ? 0 : offset + 1;
  const pageEnd = Math.min(offset + leads.length, total);
  const hasPreviousPage = offset > 0;
  const hasNextPage = offset + leads.length < total;
  const allOnPageChecked = leads.length > 0 && checkedIds.length === leads.length;
  const someOnPageChecked = checkedIds.length > 0 && !allOnPageChecked;

  if (loading && leads.length === 0) return <AdminSectionSkeleton tiles={5} rows={5} />;
  if (error && leads.length === 0) return <div className="admin-panel admin-stack p-6" role="alert"><div className="admin-notice admin-notice--danger"><strong>CRM пока недоступна</strong><br />{error}</div>{migration ? <p className="admin-muted">Нужно применить миграцию <code>{migration}</code> к production D1. Старые заявки и Meta CAPI при этом не затрагиваются.</p> : null}<button className="admin-button" type="button" onClick={() => void load()}><RefreshCw aria-hidden="true" /> Повторить</button></div>;

  return (
    <div className="admin-stack admin-stack--lg">
      <div className="admin-section-header"><div><p className="admin-eyebrow">CRM</p><h2 className="admin-title">Заявки и сделки</h2><p className="admin-subtitle">Единое рабочее место: приоритеты, задачи, заметки, деньги, качество лида и фактическая доставка событий в Meta.</p></div><button className="admin-button" type="button" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Обновить</button></div>

      {error ? <div className="admin-notice admin-notice--danger" role="alert">{error}</div> : null}
      {!editingReady ? <div className="admin-notice admin-notice--warning" role="status"><strong>Редактирование временно заблокировано.</strong> Просмотр CRM доступен, но для безопасного сохранения без дублей и потери изменений нужно применить миграцию <code>{correctnessMigration || '0017_crm_correctness.sql'}</code>.</div> : null}

      <div className="admin-crm-summary">
        <button type="button" onClick={() => setDue('overdue')} className={Number(reminders.overdue || 0) ? 'is-warning' : ''}><AlertTriangle aria-hidden="true" /><span>Просрочено</span><strong>{reminders.overdue || 0}</strong></button>
        <button type="button" onClick={() => setDue('today')}><CalendarClock aria-hidden="true" /><span>На сегодня</span><strong>{reminders.today || 0}</strong></button>
        <button type="button" onClick={() => setDue('none')}><Clock3 aria-hidden="true" /><span>Без следующего шага</span><strong>{reminders.without_next_action || 0}</strong></button>
        <div><CheckCircle2 aria-hidden="true" /><span>Открытые задачи</span><strong>{taskSummary.open || 0}</strong></div>
        <div><CircleDollarSign aria-hidden="true" /><span>В работе</span><strong>{openValues.length ? openValues.map((item) => `${Number(item.open_value).toLocaleString('ru-RU')} ${item.deal_currency}`).join(' · ') : '—'}</strong></div>
      </div>

      {duplicateGroups.length > 0 && (
        <section className="crm-dupes" aria-label="Похожие заявки">
          <header>
            <strong><Users aria-hidden="true" /> Похоже на дубли: {duplicateGroups.length}</strong>
            <span className="admin-hint">
              Совпал телефон, почта или телеграм. При объединении заметки и задачи переезжают в первую заявку,
              пустые поля дозаполняются, а дубль уходит в корзину — оттуда его можно вернуть.
            </span>
          </header>
          <ul>
            {duplicateGroups.map((group) => {
              const [primary, ...rest] = group;
              return (
                <li key={primary.id}>
                  <span className="crm-dupes__who">
                    <strong>{primary.name || 'Без имени'}</strong>
                    <em>{primary.email || primary.phone || primary.telegram_username || 'без контакта'}</em>
                  </span>
                  <span className="crm-dupes__ids">
                    #{primary.id} + {rest.map((item) => `#${item.id}`).join(', ')}
                  </span>
                  <button
                    type="button"
                    className="admin-button admin-button--compact"
                    disabled={merging === primary.id}
                    onClick={() => void mergeGroup(primary.id, rest.map((item) => item.id), primary.name || 'Без имени')}
                  >
                    {merging === primary.id ? 'Объединяю…' : 'Объединить'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="crm-view-switch" role="group" aria-label="Вид CRM">
        {CRM_VIEWS.map((item) => (
          <button
            key={item.value}
            type="button"
            title={item.hint}
            aria-pressed={view === item.value}
            className={view === item.value ? 'is-active' : ''}
            onClick={() => setView(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {view === 'analytics' ? <CrmAnalytics password={password} refreshToken={trashVersion} /> : null}

      {view === 'board' ? (
        <>
          <CrmBoard<LeadRow>
            password={password}
            editingReady={editingReady}
            selectedId={boardLead?.id ?? null}
            refreshToken={trashVersion}
            onOpenLead={(lead) => setBoardLead(lead)}
            onChanged={() => { setTrashVersion((value) => value + 1); void load(true); }}
          />
          {boardLead ? (
            <div className="crm-board-detail">
              <div className="crm-board-detail__head">
                <strong>Карточка сделки</strong>
                <button type="button" className="admin-button admin-button--quiet" onClick={() => setBoardLead(null)}>
                  <X aria-hidden="true" /> Закрыть
                </button>
              </div>
              <LeadDetail
                key={boardLead.id}
                lead={boardLead}
                password={password}
                editingReady={editingReady}
                onOpenClients={onOpenClients}
                onChanged={() => { setTrashVersion((value) => value + 1); void load(true); }}
              />
            </div>
          ) : null}
        </>
      ) : null}

      {view === 'list' ? (
      <>
      <div className="admin-crm-toolbar admin-panel">
        <label className="admin-crm-search"><Search aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Имя, контакт, услуга, заметка или тег" aria-label="Поиск по CRM" /></label>
        <AdminSelect ariaLabel="Этап сделки" value={stage} options={[{ value: 'all', label: 'Все этапы' }, ...PIPELINE_STAGES]} onValueChange={setStage} />
        <AdminSelect ariaLabel="Приоритет" value={priority} options={[{ value: 'all', label: 'Все приоритеты' }, ...PRIORITIES]} onValueChange={setPriority} />
        <AdminSelect ariaLabel="Следующее действие" value={due} options={[{ value: 'all', label: 'Любой срок' }, { value: 'overdue', label: 'Просрочено' }, { value: 'today', label: 'Сегодня' }, { value: 'upcoming', label: 'Запланировано' }, { value: 'none', label: 'Без следующего шага' }]} onValueChange={setDue} />
        <AdminSelect ariaLabel="Сортировка" value={sort} options={[{ value: 'recent', label: 'Сначала новые' }, { value: 'next_action', label: 'По следующему действию' }, { value: 'priority', label: 'По приоритету' }, { value: 'score', label: 'По оценке лида' }, { value: 'value', label: 'По сумме сделки' }, { value: 'oldest', label: 'Сначала старые' }]} onValueChange={setSort} />
      </div>

      <div className="admin-crm-layout">
        <aside className="admin-crm-list admin-panel" aria-label="Список сделок">
          <div className="admin-crm-list__header">
            {leads.length ? (
              <label className="admin-crm-list__selectall" title="Выбрать все заявки на странице">
                <input
                  type="checkbox"
                  checked={allOnPageChecked}
                  ref={(node) => { if (node) node.indeterminate = someOnPageChecked; }}
                  aria-label="Выбрать все заявки на странице"
                  disabled={bulkBusy}
                  onChange={(event) => setCheckedIds(event.target.checked ? leads.map((item) => item.id) : [])}
                />
              </label>
            ) : null}
            <strong>{total} сделок</strong>
            <span>{pageStart}–{pageEnd}</span>
          </div>
          {checkedIds.length ? (
            <div className="admin-crm-list__bulk" role="status">
              <span>Выбрано: {checkedIds.length}</span>
              <button className="admin-button admin-button--quiet" type="button" onClick={() => setCheckedIds([])} disabled={bulkBusy}>Снять</button>
              <button
                className="admin-button admin-button--danger"
                type="button"
                disabled={bulkBusy}
                onClick={async () => {
                  const confirmed = await confirmAsk({
                    title: `Убрать в корзину ${checkedIds.length} заявок?`,
                    description: 'Они пропадут из списка и статистики. Восстановить можно в разделе «Корзина».',
                    confirmLabel: 'В корзину',
                    tone: 'danger',
                  });
                  if (!confirmed) return;
                  setBulkBusy(true);
                  setError('');
                  callTrashApi(password, { action: 'delete', ids: checkedIds })
                    .then(() => {
                      setCheckedIds([]);
                      setTrashVersion((value) => value + 1);
                      return load(true);
                    })
                    .catch((bulkError) => setError(bulkError instanceof Error ? bulkError.message : 'Не удалось убрать заявки'))
                    .finally(() => setBulkBusy(false));
                }}
              >
                <Trash2 aria-hidden="true" /> В корзину
              </button>
            </div>
          ) : null}
          <div className="admin-crm-list__items">
            {leads.length ? leads.map((lead) => {
              const overdue = isOverdue(lead.next_action_at);
              const checked = checkedIds.includes(lead.id);
              return <div className="admin-crm-lead-row" key={lead.id}>
                <label className="admin-crm-lead__check" title="Выбрать для удаления">
                  <input
                    type="checkbox"
                    checked={checked}
                    aria-label={`Выбрать заявку ${leadLabel(lead)}`}
                    onChange={(event) => setCheckedIds((current) => event.target.checked
                      ? [...current, lead.id]
                      : current.filter((id) => id !== lead.id))}
                  />
                </label>
                <button type="button" className="admin-crm-lead" aria-current={selectedId === lead.id ? 'true' : undefined} onClick={() => setSelectedId(lead.id)}><div className="admin-crm-lead__top"><span className={`admin-priority-dot is-${lead.priority}`} title={`Приоритет: ${priorityLabel(lead.priority)}`} /><strong>{lead.name || 'Без имени'}</strong><span className="admin-score">{lead.lead_score || 0}</span><ChevronRight aria-hidden="true" /></div><p>{lead.service || lead.email || lead.phone || 'Без контакта'}</p><div className="admin-crm-lead__states"><span>{stageLabel(lead.pipeline_stage)}</span><LeadCountryBadge country={lead.country} />{overdue ? <span className="is-overdue">Просрочено</span> : lead.next_action_at ? <span>{formatDate(lead.next_action_at)}</span> : <span>Нет следующего шага</span>}{Number(lead.open_tasks_count || 0) ? <span>{lead.open_tasks_count} задач</span> : null}</div>{lead.crm_tags?.length ? <div className="admin-tag-list">{lead.crm_tags.slice(0, 3).map((item) => <span key={item.slug || item.name} style={{ '--tag-color': item.color || '#8b5cf6' } as CSSProperties}>{item.name}</span>)}</div> : null}</button>
              </div>;
            }) : <div className="admin-empty"><div><strong>Ничего не найдено</strong><p>Измените поиск или фильтры.</p></div></div>}
          </div>
          {total > CRM_PAGE_SIZE ? <nav className="admin-crm-pagination" aria-label="Страницы списка сделок"><button className="admin-button admin-button--quiet" type="button" disabled={loading || !hasPreviousPage} onClick={() => setOffset((value) => Math.max(0, value - CRM_PAGE_SIZE))}>Назад</button><span>{pageStart}–{pageEnd} из {total}</span><button className="admin-button admin-button--quiet" type="button" disabled={loading || !hasNextPage} onClick={() => setOffset((value) => value + CRM_PAGE_SIZE)}>Далее</button></nav> : null}
        </aside>
        <div className="admin-crm-detail-slot">{selected ? <LeadDetail key={selected.id} lead={selected} password={password} onChanged={() => { setTrashVersion((value) => value + 1); void load(true); }} editingReady={editingReady} onOpenClients={onOpenClients} /> : <div className="admin-empty"><div><strong>Выберите сделку</strong><p>Карточка откроется здесь.</p></div></div>}</div>
      </div>
      <TrashPanel password={password} onChanged={() => void load(true)} refreshToken={trashVersion} />
      {facets?.services?.length ? <p className="admin-meta">Источники в текущей базе: {facets.services.slice(0, 5).map((item) => `${item.value} · ${item.count}`).join(', ')}</p> : null}
      </>
      ) : null}
    </div>
  );
}
