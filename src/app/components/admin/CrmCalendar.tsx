import { memo, useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Clock3,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import PipelineStepper, { isDealStale, type PipelineStage } from './PipelineStepper';
import { withPlural } from '../../utils/plural';
import { ownerToday } from '../../utils/publishSchedule';
import type { Priority } from './CrmBoard';

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;
const OPEN_STAGES = new Set<PipelineStage>(['new', 'contacted', 'discovery', 'proposal']);

const monthFormatter = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayFormatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', weekday: 'short', timeZone: 'UTC' });
const timeFormatter = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tashkent' });

function currentMonth(): Date {
  return new Date(`${ownerToday().slice(0, 7)}-01T00:00:00Z`);
}

function shiftMonth(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function actionTimestamp(value?: string | null): number {
  if (!value) return NaN;
  return Date.parse(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value) ? `${value.replace(' ', 'T')}Z` : value);
}

function formatTime(iso?: string | null): string {
  const time = actionTimestamp(iso);
  return Number.isFinite(time) ? timeFormatter.format(time) : '';
}

function formatMoney(value?: number | null, currency?: string): string {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '';
  const num = Number(value);
  return `${new Intl.NumberFormat('ru-RU').format(num)} ${currency || 'USD'}`;
}

interface CalendarLead {
  id: number;
  name: string;
  service: string;
  priority: Priority;
  pipeline_stage: PipelineStage;
  created_at: string;
  last_submitted_at?: string | null;
  next_action_at?: string | null;
  next_action_text?: string;
  deal_value?: number | null;
  deal_currency?: string;
}

interface CrmCalendarProps {
  leads: CalendarLead[];
  onOpenLead: (leadId: number) => void;
}

export default memo(function CrmCalendar({
  leads,
  onOpenLead,
}: CrmCalendarProps) {
  const [month, setMonth] = useState(currentMonth);
  const todayKey = ownerToday();
  const [selectedDayKey, setSelectedDayKey] = useState<string>(todayKey);
  const [showAllUnscheduled, setShowAllUnscheduled] = useState(false);
  const selectedDate = selectedDayKey.startsWith(month.toISOString().slice(0, 7))
    ? selectedDayKey
    : month.toISOString().slice(0, 10);
  const now = Date.now();

  // Календарная сетка: 42 клетки, начиная с понедельника
  const cells = useMemo(() => {
    const weekday = month.getUTCDay();
    const leadDays = weekday === 0 ? 6 : weekday - 1;
    return Array.from({ length: 42 }, (_, index) => (
      new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1 - leadDays + index))
    ));
  }, [month]);

  // Группировка сделок по дням следующего шага
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarLead[]>();
    for (const lead of leads) {
      const time = actionTimestamp(lead.next_action_at);
      if (!Number.isFinite(time)) continue;
      const key = ownerToday(time);
      const list = map.get(key) || [];
      list.push(lead);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((first, second) => actionTimestamp(first.next_action_at) - actionTimestamp(second.next_action_at));
    }
    return map;
  }, [leads]);

  // Сделки без назначенного следующего действия
  const unscheduledLeads = useMemo(() => {
    return leads.filter((lead) => OPEN_STAGES.has(lead.pipeline_stage) && !Number.isFinite(actionTimestamp(lead.next_action_at)));
  }, [leads]);

  // Просроченные сделки
  const isOverdue = (lead: CalendarLead) =>
    OPEN_STAGES.has(lead.pipeline_stage) && actionTimestamp(lead.next_action_at) < now;
  const overdueCount = leads.filter(isOverdue).length;

  const selectedDayDeals = byDay.get(selectedDate) || [];

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
              setMonth(currentMonth());
              setSelectedDayKey(ownerToday());
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
              const key = date.toISOString().slice(0, 10);
              const dayDeals = byDay.get(key) || [];
              const isOutside = date.getUTCMonth() !== month.getUTCMonth();
              const isToday = key === todayKey;
              const isSelected = key === selectedDate;
              const hasOverdue = dayDeals.some(isOverdue);

              return (
                <button
                  key={key}
                  type="button"
                  className={`crm-calendar-cell${isOutside ? ' is-outside' : ''}${isToday ? ' is-today' : ''}${isSelected ? ' is-selected' : ''}${hasOverdue ? ' has-overdue' : ''}`}
                  onClick={() => {
                    if (isOutside) setMonth(new Date(`${key.slice(0, 7)}-01T00:00:00Z`));
                    setSelectedDayKey(key);
                  }}
                  aria-label={`${date.toLocaleDateString('ru-RU', { timeZone: 'UTC' })}: ${withPlural(dayDeals.length, ['сделка', 'сделки', 'сделок'])}`}
                  aria-pressed={isSelected}
                >
                  <div className="crm-calendar-cell__top">
                    <span className="crm-calendar-cell__num">{date.getUTCDate()}</span>
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
                {dayFormatter.format(new Date(selectedDate))}
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
                      {time ? <span className="crm-calendar-item__time" title="Время Ташкента">{time}</span> : null}
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
                      {lead.deal_value != null ? (
                        <span className="admin-crm-lead__deal-badge">
                          {formatMoney(lead.deal_value, lead.deal_currency)}
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className="admin-button admin-button--quiet crm-calendar-item__open"
                        onClick={() => onOpenLead(lead.id)}
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
                {(showAllUnscheduled ? unscheduledLeads : unscheduledLeads.slice(0, 5)).map((lead) => (
                  <div key={lead.id} className="crm-calendar-unscheduled__item">
                    <span className="crm-calendar-unscheduled__name">{lead.name || 'Без имени'}</span>
                    <button
                      type="button"
                      className="admin-button admin-button--quiet admin-button--compact"
                      onClick={() => onOpenLead(lead.id)}
                    >
                      Назначить
                    </button>
                  </div>
                ))}
              </div>
              {unscheduledLeads.length > 5 && (
                <button
                  type="button"
                  className="admin-button admin-button--quiet admin-button--compact"
                  aria-expanded={showAllUnscheduled}
                  onClick={() => setShowAllUnscheduled((current) => !current)}
                >
                  {showAllUnscheduled ? 'Свернуть' : `Показать все ${unscheduledLeads.length}`}
                </button>
              )}
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
});
