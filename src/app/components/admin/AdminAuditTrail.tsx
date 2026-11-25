import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Clock,
  Download,
  Filter,
  History,
  Info,
  Phone,
  RefreshCw,
  Search,
  Shield,
  User,
} from 'lucide-react';
import { notify } from './AdminFeedback';
import { AdminSelect } from './AdminUI';
import { escapeAdminCsvCell } from '../../utils/adminCsv';

export interface AuditRecord {
  id: number;
  lead_id: number;
  type: string;
  from_val: string;
  to_val: string;
  note: string;
  actor: string;
  entity_type: string;
  entity_id: number | null;
  action_id: string;
  metadata_json: string;
  created_at: string;
  lead_name: string | null;
  lead_phone: string | null;
  current_status: string | null;
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  status_change: { label: 'Смена статуса', color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  lead_intake: { label: 'Новая заявка', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  task_created: { label: 'Задача', color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  task_completed: { label: 'Задача решена', color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  note_added: { label: 'Заметка CRM', color: 'text-slate-300 bg-slate-500/10 border-slate-500/20' },
  trashed: { label: 'В корзину', color: 'text-red-400 bg-red-500/10 border-red-500/20' },
  restored: { label: 'Восстановлен', color: 'text-teal-400 bg-teal-500/10 border-teal-500/20' },
  pipeline_stage_changed: { label: 'Смена этапа', color: '' },
  lead_trashed: { label: 'В корзину', color: '' },
  lead_restored: { label: 'Восстановлен', color: '' },
  lead_submitted: { label: 'Новая заявка', color: '' },
  lead_resubmitted: { label: 'Повторная заявка', color: '' },
  lead_merged: { label: 'Заявки объединены', color: '' },
  quality_changed: { label: 'Качество заявки', color: '' },
  note_created: { label: 'Заметка добавлена', color: '' },
  note_updated: { label: 'Заметка изменена', color: '' },
  note_deleted: { label: 'Заметка удалена', color: '' },
  task_updated: { label: 'Задача изменена', color: '' },
  task_deleted: { label: 'Задача удалена', color: '' },
  tags_updated: { label: 'Теги изменены', color: '' },
};

/**
 * Фильтр по типу: одна строка на одно действие (DA-116). У части действий
 * есть старый и новый код («trashed» и «lead_trashed»), и два одинаковых
 * пункта «В корзину» показывали разные записи. Значение — коды через запятую.
 */
export const TYPE_FILTER_OPTIONS = (() => {
  const byLabel = new Map<string, string[]>();
  for (const [code, item] of Object.entries(TYPE_LABELS)) {
    byLabel.set(item.label, [...(byLabel.get(item.label) || []), code]);
  }
  return [...byLabel].map(([label, codes]) => ({ value: codes.join(','), label }));
})();

/** Сколько записей журнала приходит за один раз. */
const AUDIT_PAGE_SIZE = 100;

const STATUS_NAMES: Record<string, string> = {
  new: 'Новый',
  contacted: 'Контакт',
  discovery: 'Обсуждение',
  proposal: 'Предложение',
  archived: 'Архив',
  qualified: 'Квалифицирован',
  in_progress: 'В работе',
  won: 'Выигран',
  lost: 'Отказ',
  trash: 'Корзина',
};

function formatTimeAgo(isoString: string): string {
  try {
    const normalized = isoString.includes('T') ? isoString : `${isoString.replace(' ', 'T')}Z`;
    const time = new Date(normalized).getTime();
    if (Number.isNaN(time)) return isoString;
    const diffSec = Math.max(0, Math.round((Date.now() - time) / 1000));
    if (diffSec < 60) return `${diffSec} сек назад`;
    const diffMin = Math.round(diffSec / 60);
    if (diffMin < 60) return `${diffMin} мин назад`;
    const diffHrs = Math.round(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs} ч назад`;
    const diffDays = Math.round(diffHrs / 24);
    return `${diffDays} дн назад`;
  } catch {
    return isoString;
  }
}

export default function AdminAuditTrail({
  password,
  onOpenLead,
}: {
  password: string;
  onOpenLead?: (leadId: number) => void;
}) {
  const [activities, setActivities] = useState<AuditRecord[]>([]);
  // Всего записей под текущими фильтрами и есть ли ещё (DA-114).
  const [total, setTotal] = useState<number>(0);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [isDemo, setIsDemo] = useState<boolean>(false);
  const activeRequest = useRef(null as AbortController | null);

  // Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [actorFilter, setActorFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  // Поиск уходит на сервер с небольшой паузой после ввода, а не на каждую букву.
  const [appliedQuery, setAppliedQuery] = useState<string>('');
  useEffect(() => {
    const timer = window.setTimeout(() => setAppliedQuery(searchQuery.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  /**
   * Поиск и фильтры применяет сервер ко всему журналу (DA-114): раньше
   * браузер получал последние 200 записей и искал только в них, и действие
   * двухсотпервым по счёту не находилось. `append` — «Показать ещё».
   */
  const fetchAudit = useCallback(async (append = false, offset = 0) => {
    activeRequest.current?.abort();
    const request = new AbortController();
    activeRequest.current = request;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: String(AUDIT_PAGE_SIZE), offset: String(append ? offset : 0) });
      if (appliedQuery) params.set('q', appliedQuery);
      if (actorFilter !== 'all') params.set('actor', actorFilter);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      const res = await fetch(`/api/admin/audit?${params}`, {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
        signal: request.signal,
      });
      const data = await res.json().catch(() => null) as {
        success?: boolean;
        error?: string;
        activities?: AuditRecord[];
        isDemo?: boolean;
        total?: number;
        hasMore?: boolean;
      } | null;

      // Без миграции сервер отвечает 503 с её именем в тексте ошибки
      // (DA-117) — экран показывает это, а не пустой журнал.
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || `HTTP ${res.status}`);
      }

      if (request.signal.aborted) return;
      const page = data.activities || [];
      setActivities((current) => (append ? [...current, ...page.filter((item) => !current.some((known) => known.id === item.id))] : page));
      setTotal(Number(data.total ?? page.length));
      setHasMore(Boolean(data.hasMore));
      setIsDemo(Boolean(data.isDemo));
    } catch (err) {
      if (!request.signal.aborted) setError(err instanceof Error ? err.message : 'Не удалось загрузить аудит-лог');
    } finally {
      if (activeRequest.current === request) {
        activeRequest.current = null;
        setLoading(false);
      }
    }
  }, [actorFilter, appliedQuery, password, typeFilter]);

  useEffect(() => {
    void fetchAudit();
    return () => {
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, [fetchAudit]);

  // Отбор уже сделал сервер; в локальном демо-режиме фильтры не применяются.
  const filteredActivities = activities;

  // Export to CSV
  const handleExportCsv = () => {
    if (filteredActivities.length === 0) return;

    const headers = ['ID', 'Дата', 'Автор', 'Действие', 'Лид ID', 'Имя лида', 'Телефон', 'Было', 'Стало', 'Примечание'];
    const rows = filteredActivities.map((a) => [
      a.id,
      a.created_at,
      a.actor,
      a.type,
      a.lead_id,
      a.lead_name,
      a.lead_phone,
      a.from_val,
      a.to_val,
      a.note,
    ].map(escapeAdminCsvCell));

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit_log_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    // В файл попадают загруженные записи — их число названо (DA-114).
    notify.success('Журнал аудита выгружен в CSV', total > filteredActivities.length
      ? `Выгружено ${filteredActivities.length} из ${total} найденных. Нажмите «Показать ещё», чтобы выгрузить больше.`
      : `Записей: ${filteredActivities.length}`);
  };

  return (
    <div className="admin-audit-container">
      {/* Header */}
      <div className="admin-audit-header">
        <div className="admin-audit-title-group">
          <div className="admin-audit-icon-wrap">
            <History className="h-6 w-6 text-indigo-400" />
          </div>
          <div>
            <div className="admin-audit-badge-row">
              <span className="admin-audit-badge-sub">Журнал всех действий и изменений</span>
            </div>
            <h2 className="admin-audit-heading">Журнал действий</h2>
          </div>
        </div>

        <div className="admin-audit-actions">
          <button
            type="button"
            className="admin-button"
            onClick={handleExportCsv}
            disabled={loading || filteredActivities.length === 0}
            title={total > filteredActivities.length
              ? `Выгрузить загруженные записи: ${filteredActivities.length} из ${total}`
              : 'Выгрузить записи с текущими фильтрами'}
          >
            <Download className="h-4 w-4 mr-1.5" />
            Выгрузить CSV
          </button>
          <button
            type="button"
            className="admin-button"
            onClick={() => void fetchAudit()}
            disabled={loading}
            title="Обновить журнал"
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Обновить
          </button>
        </div>
      </div>

      {/* Demo Mode Notice */}
      {isDemo && (
        <div className="admin-audit-notice-box">
          <Info className="h-4 w-4 text-blue-400 flex-shrink-0" />
          <span>
            Локальный режим: отображаются примеры записей аудита. В продакшене данные пишутся в базу D1 из реальных действий CRM.
          </span>
        </div>
      )}

      {/* Error Box */}
      {error && (
        <div className="admin-audit-error-box" role="alert">
          <Shield className="h-4 w-4 text-red-400 flex-shrink-0" />
          <span>{error}{activities.length ? ' Показаны последние загруженные записи.' : ''}</span>
        </div>
      )}

      {/* Toolbar Filters & Search */}
      <div className="admin-audit-toolbar">
        <div className="admin-audit-search">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            type="text"
            className="admin-audit-search-input"
            placeholder="Поиск по имени, телефону, тексту примечания или ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="admin-audit-filters">
          <div className="admin-audit-filter-group">
            <User className="h-3.5 w-3.5 text-slate-400 mr-1.5" />
            <AdminSelect
              ariaLabel="Автор действия"
              className="admin-audit-select"
              value={actorFilter}
              onValueChange={setActorFilter}
              options={[
                { value: 'all', label: 'Все авторы' },
                { value: 'admin', label: 'Администратор' },
                { value: 'system', label: 'Система' },
              ]}
            />
          </div>

          <div className="admin-audit-filter-group">
            <Filter className="h-3.5 w-3.5 text-slate-400 mr-1.5" />
            <AdminSelect
              ariaLabel="Тип действия"
              className="admin-audit-select"
              value={typeFilter}
              onValueChange={setTypeFilter}
              options={[
                { value: 'all', label: 'Все типы действий' },
                ...TYPE_FILTER_OPTIONS,
              ]}
            />
          </div>
        </div>
      </div>

      {/* Audit Timeline List */}
      <div className="admin-audit-list">
        {loading && activities.length === 0 ? (
          <div className="admin-audit-loading">
            <RefreshCw className="h-6 w-6 text-indigo-400 animate-spin mb-2" />
            <p className="text-slate-400 text-sm">Загружаю хронологию аудита...</p>
          </div>
        ) : filteredActivities.length === 0 ? (
          <div className="admin-audit-empty">
            <CheckCircle2 className="h-8 w-8 text-slate-500 mb-2" />
            <p className="text-slate-300 font-medium">Нет записей по выбранным критериям</p>
            <p className="text-xs text-slate-500 mt-1">Попробуйте сбросить поисковый запрос или фильтры</p>
          </div>
        ) : (
          filteredActivities.map((act) => {
            const typeInfo = TYPE_LABELS[act.type] || {
              label: act.type,
              color: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
            };

            const isSystem = act.actor === 'system';

            return (
              <div key={act.id} className="admin-audit-card">
                {/* Left Col: Actor & Timeline Icon */}
                <div className="admin-audit-card-icon-col">
                  <div className={`admin-audit-actor-avatar ${isSystem ? 'system' : 'admin'}`}>
                    {isSystem ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                  </div>
                </div>

                {/* Main Content */}
                <div className="admin-audit-card-main">
                  <div className="admin-audit-card-header">
                    <div className="admin-audit-card-title-row">
                      <span className={`admin-audit-type-badge border ${typeInfo.color}`}>
                        {typeInfo.label}
                      </span>

                      {act.actor && (
                        <span className="admin-audit-actor-tag">
                          {isSystem ? 'Системное событие' : 'Администратор'}
                        </span>
                      )}

                      {act.lead_name && (
                        <span className="admin-audit-lead-link-chip">
                          <User className="h-3 w-3 mr-1 text-slate-400" />
                          <strong>{act.lead_name}</strong>
                          {act.lead_phone && (
                            <span className="text-slate-400 ml-1.5 flex items-center">
                              <Phone className="h-2.5 w-2.5 mr-0.5" />
                              {act.lead_phone}
                            </span>
                          )}
                        </span>
                      )}
                    </div>

                    <div className="admin-audit-card-time" title={act.created_at}>
                      <Clock className="h-3 w-3 mr-1 inline text-slate-500" />
                      {formatTimeAgo(act.created_at)}
                    </div>
                  </div>

                  {/* Status Change Transition Chips */}
                  {['status_change', 'pipeline_stage_changed'].includes(act.type) && (act.from_val || act.to_val) && (
                    <div className="admin-audit-transition-row">
                      <span className="admin-audit-status-chip from">
                        {STATUS_NAMES[act.from_val] || act.from_val || '—'}
                      </span>
                      <ArrowRight className="h-3 w-3 text-slate-500" />
                      <span className="admin-audit-status-chip to">
                        {STATUS_NAMES[act.to_val] || act.to_val}
                      </span>
                    </div>
                  )}

                  {/* Note / Details Description */}
                  {act.note && <p className="admin-audit-note-text">{act.note}</p>}

                  {/* Card Bottom Meta */}
                  <div className="admin-audit-card-footer">
                    <details className="admin-audit-action-id">
                      <summary>Детали действия</summary>
                      <code>{act.action_id || `#${act.id}`}</code>
                    </details>

                    {act.lead_id && onOpenLead && (
                      <button
                        type="button"
                        className="admin-audit-open-lead-btn"
                        onClick={() => onOpenLead(act.lead_id)}
                      >
                        Перейти к сделке #{act.lead_id}
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Сколько показано и догрузка следующей страницы (DA-114). */}
      {activities.length > 0 && !isDemo && (
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <span className="admin-hint">Показано {activities.length} из {total}</span>
          {hasMore && (
            <button type="button" className="admin-button" disabled={loading} onClick={() => void fetchAudit(true, activities.length)}>
              Показать ещё
            </button>
          )}
        </div>
      )}
    </div>
  );
}
