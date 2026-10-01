import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { m, useReducedMotion } from 'motion/react';
import { AlertTriangle, ChevronLeft, ChevronRight, Clock3, RefreshCw } from 'lucide-react';
import LeadCountryBadge from './LeadCountryBadge';

export type PipelineStage = 'new' | 'contacted' | 'discovery' | 'proposal' | 'won' | 'lost' | 'archived';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';

export interface BoardLead {
  id: number;
  name: string;
  email: string;
  phone: string;
  telegram_username: string;
  service: string;
  country?: string;
  pipeline_stage: PipelineStage;
  priority: Priority;
  lead_score: number;
  deal_value?: number | null;
  deal_currency?: string;
  next_action_at?: string | null;
  next_action_text?: string;
  open_tasks_count?: number;
  crm_tags?: Array<{ name: string; slug?: string; color?: string }>;
  crm_revision?: number;
}

export const BOARD_STAGES: Array<{ value: PipelineStage; label: string; hint: string }> = [
  { value: 'new', label: 'Новые', hint: 'Заявка пришла, но с человеком ещё не связались.' },
  { value: 'contacted', label: 'Связались', hint: 'Первый контакт состоялся.' },
  { value: 'discovery', label: 'Обсуждение', hint: 'Выясняем задачу и бюджет.' },
  { value: 'proposal', label: 'Предложение', hint: 'Отправлено предложение, ждём решения.' },
  { value: 'won', label: 'Выиграны', hint: 'Сделка закрыта в плюс.' },
  { value: 'lost', label: 'Проиграны', hint: 'Сделка закрыта без результата.' },
  { value: 'archived', label: 'Архив', hint: 'Убрано из активной работы.' },
];

const CARD_TYPE = 'CRM_LEAD_CARD';

function formatDate(raw?: string | null): string {
  if (!raw) return '';
  const normalized = raw.includes('T') ? raw : `${raw.replace(' ', 'T')}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime())
    ? raw
    : date.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const OPEN_STAGES: PipelineStage[] = ['new', 'contacted', 'discovery', 'proposal'];
const CLOSED_STAGES: PipelineStage[] = ['won', 'lost', 'archived'];
/** Страница сервера (MAX_LIMIT в crm-leads) и предохранитель от бесконечной догрузки. */
const PAGE_SIZE = 300;
const MAX_PAGES = 20;

/** Просрочено — только у открытой сделки: у закрытой срок шага остаётся историей, как и в счётчиках сервера. */
function isOverdue(raw: string | null | undefined, stage: PipelineStage): boolean {
  return Boolean(raw && OPEN_STAGES.includes(stage) && new Date(raw).getTime() < Date.now());
}

interface BoardSummary {
  stages?: Record<string, number>;
  values_by_currency?: Array<{ deal_currency: string; open_value: number; won_value: number }>;
}

interface BoardPage<T> {
  success?: boolean;
  error?: string;
  leads?: T[];
  pagination?: { total?: number; returned?: number };
  summary?: BoardSummary;
}

function money(value: number | null | undefined, currency: string | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value)) || Number(value) <= 0) return '';
  return `${Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 0 })} ${currency || ''}`.trim();
}

/**
 * Сумма сделок в шапке колонки — по каждой валюте отдельно.
 *
 * Раньше здесь складывались все `deal_value` подряд, а подписывалась сумма
 * самой частой валютой доски. Колонка из двух сделок по 3000 $ и одной на
 * 250 000 ₽ показывала «256 000 $» — числа, которого не существует. Курсов в
 * системе нет, поэтому валюты не складываются нигде, и здесь тоже.
 *
 * `primary` — самая частая валюта доски: она идёт первой, чтобы привычная
 * цифра стояла на привычном месте.
 */
function columnTotals<T extends BoardLead>(leads: T[], primary: string): string {
  const totals = new Map<string, number>();
  for (const lead of leads) {
    const value = Number(lead.deal_value) || 0;
    if (value <= 0) continue;
    const code = lead.deal_currency || primary;
    totals.set(code, (totals.get(code) || 0) + value);
  }
  return [...totals.entries()]
    .sort((a, b) => (a[0] === primary ? -1 : b[0] === primary ? 1 : b[1] - a[1]))
    .map(([code, value]) => money(value, code))
    .filter(Boolean)
    .join(' · ');
}

/** Сумма выигранных по каждой валюте — с сервера, по всем сделкам, а не по загруженным. */
function wonTotals(summary: BoardSummary | null, primary: string): string {
  return (summary?.values_by_currency || [])
    .filter((row) => Number(row.won_value) > 0)
    .sort((a, b) => (a.deal_currency === primary ? -1 : b.deal_currency === primary ? 1 : Number(b.won_value) - Number(a.won_value)))
    .map((row) => money(Number(row.won_value), row.deal_currency || primary))
    .filter(Boolean)
    .join(' · ');
}

function stageIndex(stage: PipelineStage): number {
  return BOARD_STAGES.findIndex((item) => item.value === stage);
}

function BoardCard<T extends BoardLead>({
  lead,
  selected,
  disabled,
  onOpen,
  onMove,
}: {
  lead: T;
  selected: boolean;
  disabled: boolean;
  onOpen: (lead: T) => void;
  onMove: (lead: T, stage: PipelineStage) => void;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [{ isDragging }, drag] = useDrag(() => ({
    type: CARD_TYPE,
    item: { lead },
    canDrag: !disabled,
    collect: (monitor) => ({ isDragging: monitor.isDragging() }),
  }), [disabled, lead]);
  drag(ref);

  const index = stageIndex(lead.pipeline_stage);
  const previous = index > 0 ? BOARD_STAGES[index - 1] : null;
  const next = index >= 0 && index < BOARD_STAGES.length - 1 ? BOARD_STAGES[index + 1] : null;
  const overdue = isOverdue(lead.next_action_at, lead.pipeline_stage);
  const amount = money(lead.deal_value, lead.deal_currency);

  return (
    <m.div
      layout={!reduced}
      transition={{ duration: 0.18, ease: 'easeOut' }}
      ref={ref}
      className={`crm-card${selected ? ' is-selected' : ''}${isDragging ? ' is-dragging' : ''}`}
      style={{ ['--crm-card-priority' as string]: `var(--adm-priority-${lead.priority})` }}
    >
      <button type="button" className="crm-card__main" onClick={() => onOpen(lead)} aria-label={`Открыть сделку ${lead.name || 'без имени'}`}>
        <span className="crm-card__top">
          <span className={`crm-card__priority is-${lead.priority}`} aria-hidden="true" />
          <strong>{lead.name?.trim() || 'Без имени'}</strong>
          {amount ? <span className="crm-card__amount">{amount}</span> : null}
        </span>
        <span className="crm-card__sub">{lead.service || lead.email || lead.phone || 'Без контакта'}</span>
        <span className="crm-card__states">
          <LeadCountryBadge country={lead.country} />
          {overdue ? (
            <span className="is-overdue"><AlertTriangle aria-hidden="true" /> просрочено</span>
          ) : lead.next_action_at ? (
            <span><Clock3 aria-hidden="true" /> {formatDate(lead.next_action_at)}</span>
          ) : (
            <span className="is-idle">нет следующего шага</span>
          )}
          {Number(lead.open_tasks_count || 0) ? <span>{lead.open_tasks_count} задач</span> : null}
          {lead.lead_score ? <span className="crm-card__score">{lead.lead_score}</span> : null}
        </span>
        {lead.crm_tags?.length ? (
          <span className="crm-card__tags">
            {lead.crm_tags.slice(0, 3).map((tag) => (
              <span key={tag.slug || tag.name} style={{ ['--tag-color' as string]: tag.color || '#8b5cf6' } as CSSProperties}>{tag.name}</span>
            ))}
          </span>
        ) : null}
      </button>
      {/* Стрелки нужны и на телефоне (там нет перетаскивания), и для клавиатуры. */}
      <div className="crm-card__move">
        <button
          type="button"
          disabled={disabled || !previous}
          title={previous ? `Вернуть на этап «${previous.label}»` : 'Это первый этап'}
          aria-label={previous ? `Вернуть ${lead.name || 'сделку'} на этап ${previous.label}` : 'Это первый этап'}
          onClick={() => previous && onMove(lead, previous.value)}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <button
          type="button"
          disabled={disabled || !next}
          title={next ? `Перевести на этап «${next.label}»` : 'Это последний этап'}
          aria-label={next ? `Перевести ${lead.name || 'сделку'} на этап ${next.label}` : 'Это последний этап'}
          onClick={() => next && onMove(lead, next.value)}
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </m.div>
  );
}

function BoardColumn<T extends BoardLead>({
  stage,
  leads,
  total,
  value,
  selectedId,
  disabled,
  onOpen,
  onMove,
}: {
  stage: typeof BOARD_STAGES[number];
  leads: T[];
  /** Сколько сделок на этапе по данным сервера — может быть больше, чем загружено. */
  total: number;
  /** Подпись суммы колонки; пустая — суммы нет или она была бы неполной. */
  value: string;
  selectedId: number | null;
  disabled: boolean;
  onOpen: (lead: T) => void;
  onMove: (lead: T, stage: PipelineStage) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [{ isOver, canDrop }, drop] = useDrop(() => ({
    accept: CARD_TYPE,
    canDrop: (item: { lead: T }) => !disabled && item.lead.pipeline_stage !== stage.value,
    drop: (item: { lead: T }) => { onMove(item.lead, stage.value); },
    collect: (monitor) => ({ isOver: monitor.isOver(), canDrop: monitor.canDrop() }),
  }), [disabled, onMove, stage.value]);
  drop(ref);

  return (
    <section
      ref={ref}
      className={`crm-column${isOver && canDrop ? ' is-over' : ''}`}
      aria-label={`${stage.label}: ${total} сделок`}
    >
      <header className="crm-column__head">
        <div className="crm-column__title">
          <span className={`crm-column__dot is-${stage.value}`} aria-hidden="true" />
          <h3>{stage.label}</h3>
          <span className="crm-column__count">{total}</span>
        </div>
        {value ? <span className="crm-column__value">{value}</span> : null}
      </header>
      <div className="crm-column__body">
        {leads.length === 0 ? (
          <p className="crm-column__empty">{isOver && canDrop ? 'Отпусти карточку здесь' : stage.hint}</p>
        ) : leads.map((lead) => (
          <BoardCard
            key={lead.id}
            lead={lead}
            selected={selectedId === lead.id}
            disabled={disabled}
            onOpen={onOpen}
            onMove={onMove}
          />
        ))}
        {leads.length > 0 && leads.length < total ? (
          <p className="crm-column__empty">Показаны последние {leads.length} из {total}.</p>
        ) : null}
      </div>
    </section>
  );
}

/**
 * Доска сделок. Этап меняется перетаскиванием (мышь) или стрелками на карточке
 * (телефон и клавиатура). Изменение применяется сразу, а при отказе сервера
 * карточка возвращается на место — молча расходиться состояние не должно.
 */
export default function CrmBoard<T extends BoardLead>({
  password,
  editingReady,
  selectedId,
  onOpenLead,
  onChanged,
  onLeadsRefreshed,
  refreshToken,
}: {
  password: string;
  editingReady: boolean;
  selectedId: number | null;
  onOpenLead: (lead: T) => void;
  onChanged: () => void;
  /** Свежие строки доски — по ним родитель обновляет открытую карточку сделки. */
  onLeadsRefreshed?: (leads: T[]) => void;
  refreshToken: number;
}) {
  const [leads, setLeads] = useState<T[]>([]);
  // Счётчики этапов и суммы выигранных — с сервера: по всем сделкам, а не
  // по тем, что поместились в загрузку.
  const [summary, setSummary] = useState<BoardSummary | null>(null);
  // Через ссылку, а не через зависимости `load`: иначе новая функция на каждый
  // рендер родителя перезапускала бы загрузку доски по кругу.
  const refreshedRef = useRef(onLeadsRefreshed);
  refreshedRef.current = onLeadsRefreshed;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const fetchPage = useCallback(async (stages: PipelineStage[], sort: string, offset: number): Promise<BoardPage<T>> => {
    const response = await fetch(
      `/api/admin/crm-leads?pipeline_stage=${stages.join(',')}&sort=${sort}&limit=${PAGE_SIZE}&offset=${offset}`,
      { headers: { 'X-Admin-Password': password }, credentials: 'same-origin', cache: 'no-store' },
    );
    const payload = await response.json().catch(() => null) as BoardPage<T> | null;
    if (!response.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${response.status}`);
    return payload;
  }, [password]);

  /**
   * Открытые этапы грузятся целиком, страницами по 300, пока не набран total:
   * одна страница на всё молча теряла старые открытые сделки, как только
   * заявок вместе с архивом становилось больше трёхсот. Закрытые этапы —
   * только последние 300: их на доске листают редко, а счётчик берётся с
   * сервера и честно пишет «показаны последние K из M».
   */
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError('');
    try {
      const open: T[] = [];
      let first: BoardPage<T> | null = null;
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const payload = await fetchPage(OPEN_STAGES, 'priority', page * PAGE_SIZE);
        first = first || payload;
        const rows = payload.leads || [];
        open.push(...rows);
        const total = Number(payload.pagination?.total ?? open.length);
        if (rows.length < PAGE_SIZE || open.length >= total) break;
      }
      const closed = await fetchPage(CLOSED_STAGES, 'recent', 0);
      const rows = [...open, ...(closed.leads || [])];
      setSummary(closed.summary || first?.summary || null);
      setLeads(rows);
      refreshedRef.current?.(rows);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Не удалось загрузить доску');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [fetchPage]);

  useEffect(() => { void load(); }, [load, refreshToken]);

  const currency = useMemo(() => {
    const counts = new Map<string, number>();
    for (const lead of leads) {
      if (!lead.deal_value) continue;
      const code = lead.deal_currency || 'USD';
      counts.set(code, (counts.get(code) || 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'USD';
  }, [leads]);

  const move = useCallback(async (lead: T, stage: PipelineStage) => {
    if (!editingReady || lead.pipeline_stage === stage) return;
    const previousStage = lead.pipeline_stage;
    setBusy(true);
    setError('');
    setLeads((current) => current.map((item) => (item.id === lead.id ? { ...item, pipeline_stage: stage } : item)));
    try {
      const response = await fetch('/api/admin/lead-crm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
        credentials: 'same-origin',
        body: JSON.stringify({
          lead_id: lead.id,
          action: 'update_lead',
          pipeline_stage: stage,
          expected_revision: Number(lead.crm_revision || 0),
          action_id: `board-${lead.id}-${Date.now()}`,
        }),
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
      if (!response.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${response.status}`);
      if (stage === 'won') {
        // Маленький праздник за закрытую сделку; грузится только в этот момент.
        const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
        if (!media?.matches) {
          void import('canvas-confetti').then(({ default: confetti }) => {
            confetti({ particleCount: 90, spread: 68, startVelocity: 34, scalar: 0.9, origin: { y: 0.35 } });
          }).catch(() => undefined);
        }
      }
      await load(true);
      onChanged();
    } catch (moveError) {
      setLeads((current) => current.map((item) => (item.id === lead.id ? { ...item, pipeline_stage: previousStage } : item)));
      setError(moveError instanceof Error ? moveError.message : 'Не удалось сменить этап');
    } finally {
      setBusy(false);
    }
  }, [editingReady, load, onChanged, password]);

  const byStage = useMemo(() => {
    const map = new Map<PipelineStage, T[]>();
    for (const stage of BOARD_STAGES) map.set(stage.value, []);
    for (const lead of leads) {
      // Неизвестный этап (например, после ручной правки в базе) не должен
      // приводить к молча пропавшей карточке.
      const list = map.get(lead.pipeline_stage) || map.get('new') as T[];
      list.push(lead);
    }
    return map;
  }, [leads]);

  // Сколько сделок на этапе по серверу; загруженных меньше быть не может.
  const stageTotal = (stage: PipelineStage, loaded: number): number => {
    const known = summary?.stages?.[stage];
    return known === undefined ? loaded : Math.max(Number(known) || 0, loaded);
  };
  const boardTotal = BOARD_STAGES.reduce((sum, stage) => sum + stageTotal(stage.value, byStage.get(stage.value)?.length || 0), 0);

  if (loading && !leads.length) return <div className="admin-panel p-6" role="status">Загружаю доску…</div>;

  return (
    <div className="crm-board-wrap">
      {error ? <div className="admin-notice admin-notice--danger" role="alert">{error}</div> : null}
      {!editingReady ? (
        <div className="admin-notice admin-notice--warning" role="status">
          Перемещение сделок выключено, пока не применена миграция корректности CRM.
        </div>
      ) : null}
      <div className="crm-board__toolbar">
        <span className="admin-meta">Сделок на доске: {leads.length < boardTotal ? `${leads.length} из ${boardTotal}` : leads.length}. Перетащи карточку мышью или переставь стрелками.</span>
        <button type="button" className="admin-button admin-button--quiet" onClick={() => void load()} disabled={loading || busy}>
          <RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Обновить
        </button>
      </div>
      <DndProvider backend={HTML5Backend}>
        <div className="crm-board" role="list">
          {BOARD_STAGES.map((stage) => {
            const column = byStage.get(stage.value) || [];
            const total = stageTotal(stage.value, column.length);
            // Сумма колонки — только когда она посчитана по всем сделкам этапа:
            // у «Выиграны» это итог сервера, у остальных — сумма загруженных,
            // если загружены все. Неполная сумма хуже отсутствующей.
            const value = stage.value === 'won' && summary
              ? wonTotals(summary, currency)
              : column.length >= total ? columnTotals(column, currency) : '';
            return (
              <BoardColumn
                key={stage.value}
                stage={stage}
                leads={column}
                total={total}
                value={value}
                selectedId={selectedId}
                disabled={!editingReady || busy}
                onOpen={onOpenLead}
                onMove={move}
              />
            );
          })}
        </div>
      </DndProvider>
    </div>
  );
}
