import { memo, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Clock3,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import type { LeadRow } from './AdminLeads';
import PipelineStepper, { isDealStale } from './PipelineStepper';
import { withPlural } from '../../utils/plural';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;

const monthFormatter = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function shiftMonth(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function localDayKey(date: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tashkent' }).format(date);
  } catch {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }
}

function formatTime(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function formatMoney(value?: number | null, currency?: string): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '';
  const num = Number(value);
  return `${new Intl.NumberFormat('ru-RU').format(num)} ${currency || 'USD'}`;
}

interface CrmCalendarProps {
  leads: LeadRow[];
  onOpenLead: (lead: LeadRow) => void;
  password?: string;
  onChanged?: () => void;
}

export default memo(function CrmCalendar({
  leads,
  onOpenLead,
}: CrmCalendarProps) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const todayKey = localDayKey(new Date());
  const [selectedDayKey, setSelectedDayKey] = useState<string>(todayKey);

  // Календарная сетка: 42 клетки, начиная с понедельника
  const cells = useMemo(() => {
    const first = startOfMonth(month);
    const weekday = first.getDay();
    const leadDays = weekday === 0 ? 6 : weekday - 1;
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - leadDays);
    return Array.from({ length: 42 }, (_, index) => (
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
    ));
  }, [month]);

  // Группировка сделок по дням следующего шага
  const byDay = useMemo(() => {
    const map = new Map<string, LeadRow[]>();
    for (const lead of leads) {
      if (!lead.next_action_at) continue;
      const key = localDayKey(new Date(lead.next_action_at));
      const list = map.get(key) || [];
      list.push(lead);
      map.set(key, list);
    }
    return map;
  }, [leads]);

  // Сделки без назначенного следующего действия
  const unscheduledLeads = useMemo(() => {
    const openStages = ['new', 'contacted', 'discovery', 'proposal'];
    return leads.filter((lead) => openStages.includes(lead.pipeline_stage) && !lead.next_action_at);
  }, [leads]);

  // Просроченные сделки
  const overdueCount = useMemo(() => {
    const openStages = ['new', 'contacted', 'discovery', 'proposal'];
    const now = Date.now();
    return leads.filter((lead) => (
      openStages.includes(lead.pipeline_stage) &&
      lead.next_action_at &&
      new Date(lead.next_action_at).getTime() < now
    )).length;
  }, [leads]);

  const selectedDayDeals = useMemo(() => {
    return byDay.get(selectedDayKey) || [];
  }, [byDay, selectedDayKey]);

  return (
    <div className="crm-calendar-view admin-stack admin-stack--lg">
      <div className="crm-calendar-head admin-panel">
        <div className="crm-calendar-head__left">
          <div className="crm-calendar-head__nav">
            <button
              type="button"
              className="admin-button admin-button--quiet"
              onClick={() => setMonth((current) => shiftMonth(current, -1))}
              aria-label="Предыдущий месяц"
            >
              <ChevronLeft aria-hidden="true" />
            </button>
            <strong className="crm-calendar-head__title">
              {monthFormatter.format(month)}
            </strong>
            <button
              type="button"
              className="admin-button admin-button--quiet"
              onClick={() => setMonth((current) => shiftMonth(current, 1))}
              aria-label="Следующий месяц"
            >
              <ChevronRight aria-hidden="true" />
            </button>
          </div>
          <button
            type="button"
            className="admin-button admin-button--quiet crm-calendar-today-btn"
            onClick={() => {
              setMonth(startOfMonth(new Date()));
              setSelectedDayKey(todayKey);
            }}
          >
            Сегодня
          </button>
        </div>

        <div className="crm-calendar-head__stats">
          {overdueCount > 0 ? (
            <span className="crm-calendar-stat is-danger" title="Просроченные касания">
              <AlertTriangle aria-hidden="true" />
              <strong>{overdueCount}</strong> {withPlural(overdueCount, ['просрочено', 'просрочено', 'просрочено'])}
            </span>
          ) : null}
          <span className="crm-calendar-stat" title="Сделки без следующего действия">
            <Clock3 aria-hidden="true" />
            <strong>{unscheduledLeads.length}</strong> без срока
          </span>
        </div>
      </div>

      <div className="crm-calendar-main">
        <div className="crm-calendar-grid-card admin-panel">
          <div className="crm-calendar-weekdays" aria-hidden="true">
            {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
          </div>

          <div className="crm-calendar-grid">
            {cells.map((date) => {
              const key = localDayKey(date);
              const dayDeals = byDay.get(key) || [];
              const isOutside = date.getMonth() !== month.getMonth();
              const isToday = key === todayKey;
              const isSelected = key === selectedDayKey;
              const isPast = date.getTime() < new Date().setHours(0, 0, 0, 0);
              const hasOverdue = isPast && dayDeals.some((l) => ['new', 'contacted', 'discovery', 'proposal'].includes(l.pipeline_stage));

              return (
                <button
                  key={key}
                  type="button"
                  className={`crm-calendar-cell${isOutside ? ' is-outside' : ''}${isToday ? ' is-today' : ''}${isSelected ? ' is-selected' : ''}${hasOverdue ? ' has-overdue' : ''}`}
                  onClick={() => setSelectedDayKey(key)}
                  aria-label={`${date.toLocaleDateString('ru-RU')}: ${dayDeals.length} сделок`}
                >
                  <div className="crm-calendar-cell__top">
                    <span className="crm-calendar-cell__num">{date.getDate()}</span>
                    {dayDeals.length > 0 ? (
                      <span className={`crm-calendar-cell__badge${hasOverdue ? ' is-overdue' : ''}`}>
                        {dayDeals.length}
                      </span>
                    ) : null}
                  </div>

                  <div className="crm-calendar-cell__items">
                    {dayDeals.slice(0, 2).map((lead) => {
                      const stale = isDealStale(lead.pipeline_stage, lead.last_submitted_at || lead.created_at, lead.next_action_at);
                      return (
                        <div
                          key={lead.id}
                          className={`crm-calendar-pill is-${lead.priority}${stale.isStale ? ' is-stale' : ''}`}
                          title={`${lead.name || 'Сделка'} · ${lead.service || ''}`}
                        >
                          <span className="crm-calendar-pill__dot" />
                          <span className="crm-calendar-pill__name">{lead.name || 'Без имени'}</span>
                        </div>
                      );
                    })}
                    {dayDeals.length > 2 ? (
                      <span className="crm-calendar-pill__more">
                        +{dayDeals.length - 2}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Панель выбранного дня */}
        <aside className="crm-calendar-sidebar admin-panel">
          <div className="crm-calendar-sidebar__head">
            <div>
              <p className="admin-eyebrow">Расписание на день</p>
              <h3 className="crm-calendar-sidebar__date">
                {new Date(selectedDayKey).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'short' })}
              </h3>
            </div>
            <span className="admin-tag">
              {withPlural(selectedDayDeals.length, ['сделка', 'сделки', 'сделок'])}
            </span>
          </div>

          <div className="crm-calendar-sidebar__list">
            {selectedDayDeals.length > 0 ? (
              selectedDayDeals.map((lead) => {
                const time = formatTime(lead.next_action_at);
                return (
                  <div className="crm-calendar-item" key={lead.id}>
                    <div className="crm-calendar-item__header">
                      <span className={`admin-priority-dot is-${lead.priority}`} />
                      <strong className="crm-calendar-item__name">{lead.name || 'Без имени'}</strong>
                      {time ? <span className="crm-calendar-item__time">{time}</span> : null}
                    </div>

                    <div className="crm-calendar-item__stepper">
                      <PipelineStepper stage={lead.pipeline_stage} />
                    </div>

                    {lead.service ? (
                      <p className="crm-calendar-item__service">{lead.service}</p>
                    ) : null}

                    {lead.next_action_text ? (
                      <div className="crm-calendar-item__action">
                        <Clock3 aria-hidden="true" />
                        <span>{lead.next_action_text}</span>
                      </div>
                    ) : null}

                    <div className="crm-calendar-item__foot">
                      {lead.deal_value ? (
                        <span className="admin-crm-lead__deal-badge">
                          {formatMoney(lead.deal_value, lead.deal_currency)}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className="admin-button admin-button--quiet crm-calendar-item__open"
                        onClick={() => onOpenLead(lead)}
                      >
                        Открыть сделку <ArrowRight aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="admin-empty">
                <div>
                  <CalendarDays aria-hidden="true" className="w-8 h-8 text-[var(--adm-text-tertiary)] mx-auto mb-2 opacity-50" />
                  <strong>Касаний не запланировано</strong>
                  <p>На этот день пока нет напоминаний или созвонов.</p>
                </div>
              </div>
            )}
          </div>

          {unscheduledLeads.length > 0 ? (
            <div className="crm-calendar-unscheduled">
              <div className="crm-calendar-unscheduled__head">
                <Clock3 aria-hidden="true" />
                <span>Без следующего шага ({unscheduledLeads.length})</span>
              </div>
              <div className="crm-calendar-unscheduled__list">
                {unscheduledLeads.slice(0, 5).map((lead) => (
                  <div key={lead.id} className="crm-calendar-unscheduled__item">
                    <span className="crm-calendar-unscheduled__name">{lead.name || 'Без имени'}</span>
                    <button
                      type="button"
                      className="admin-button admin-button--quiet admin-button--compact"
                      onClick={() => onOpenLead(lead)}
                    >
                      Назначить
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
});
