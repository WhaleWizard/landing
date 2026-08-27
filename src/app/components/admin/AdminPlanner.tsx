import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react';
import {
  AlertTriangle,
  Angry,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CloudOff,
  CornerDownRight,
  Frown,
  Laugh,
  ListChecks,
  Loader2,
  Meh,
  Moon,
  NotebookPen,
  Plus,
  Repeat,
  RefreshCw,
  Smile,
  Star,
  Target,
  Trash2,
  Trophy,
  Zap,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { notify } from './AdminFeedback';
import { AdminSelect } from './AdminUI';
import { ProgressBar, ProgressRing, WeekProgressChart } from './AdminPlannerCharts';
import {
  DAYS_IN_WEEK,
  ENERGY_LEVELS,
  MOOD_LEVELS,
  PLANNER_LIMITS,
  SLEEP_OPTIONS,
  WEEKDAY_FULL,
  WEEKDAY_SHORT,
  addDays,
  computeStats,
  createId,
  currentWeekStart,
  emptyWeek,
  formatDayShort,
  formatPercent,
  formatWeekRange,
  formatWeekRangeShort,
  habitProgress,
  isDayFilled,
  applyTemplate,
  countTemplateItems,
  isEmptyTemplate,
  isWeekUntouched,
  mondayOf,
  normalizeWeekData,
  pendingTasks,
  templateFromWeek,
  parseIsoDate,
  shiftWeek,
  toIsoDate,
  todayIndexIn,
  weekDates,
  type PlannerCheckItem,
  type PlannerDay,
  type PlannerHabit,
  type PlannerJournal,
  type PlannerTemplate,
  type PlannerWeekData,
} from './plannerModel';

type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

const SAVE_DEBOUNCE_MS = 1200;
const SAVE_RETRY_MS = 5000;
const LOCAL_STORAGE_KEY = 'ww-admin-planner-local-v1';
const LOCAL_TEMPLATE_KEY = 'ww-admin-planner-template-v1';
const SLEEP_NONE = 'none';

const MOOD_ICONS = [Angry, Frown, Meh, Smile, Laugh] as const;

function isLocalEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  return ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
}

function readLocalTemplate(): PlannerTemplate | null {
  try {
    const raw = localStorage.getItem(LOCAL_TEMPLATE_KEY);
    return raw ? (JSON.parse(raw) as PlannerTemplate) : null;
  } catch {
    return null;
  }
}

function writeLocalTemplate(template: PlannerTemplate | null): void {
  try {
    if (template) localStorage.setItem(LOCAL_TEMPLATE_KEY, JSON.stringify(template));
    else localStorage.removeItem(LOCAL_TEMPLATE_KEY);
  } catch {
    // приватный режим браузера — сохранять некуда, это не ломает интерфейс
  }
}

function readLocalWeeks(): Record<string, PlannerWeekData> {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, PlannerWeekData>) : {};
  } catch {
    return {};
  }
}

function writeLocalWeek(week: string, data: PlannerWeekData): void {
  try {
    const all = readLocalWeeks();
    all[week] = data;
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // приватный режим браузера — сохранять некуда, это не ломает интерфейс
  }
}

function formatSavedAt(iso: string | null): string {
  if (!iso) return '';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

/* ---------- Мелкие элементы управления ---------- */

function AutoTextarea({
  value,
  onChange,
  onKeyDown,
  placeholder,
  maxLength,
  ariaLabel,
  className = '',
  focusOnMount = false,
  rows = 1,
}: {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  maxLength?: number;
  ariaLabel: string;
  className?: string;
  focusOnMount?: boolean;
  rows?: number;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const lastWidthRef = useRef(0);

  // Поле растёт под текст: длинная задача переносится, а не обрезается.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [value, rows]);

  // Ширина колонки меняется при ресайзе, смене раскладки и подгрузке шрифта —
  // без пересчёта вторая строка задачи оказывалась бы обрезанной.
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (Math.abs(width - lastWidthRef.current) < 0.5) return;
      lastWidthRef.current = width;
      element.style.height = 'auto';
      element.style.height = `${element.scrollHeight}px`;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!focusOnMount) return;
    const element = ref.current;
    if (!element) return;
    element.focus();
    element.setSelectionRange(element.value.length, element.value.length);
  }, [focusOnMount]);

  return (
    <textarea
      ref={ref}
      className={`planner-textarea ${className}`.trim()}
      rows={rows}
      value={value}
      placeholder={placeholder}
      maxLength={maxLength}
      aria-label={ariaLabel}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={onKeyDown}
    />
  );
}

function CheckBox({
  checked,
  onChange,
  label,
  disabled = false,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className="planner-checkbox"
      onClick={() => onChange(!checked)}
    >
      <span className="planner-checkbox__box">
        <Check aria-hidden="true" />
      </span>
    </button>
  );
}

function CheckRow({
  item,
  index,
  placeholder,
  maxLength,
  focusId,
  onToggle,
  onText,
  onRemove,
  onEnter,
  removeLabel,
  ordered = false,
}: {
  item: PlannerCheckItem;
  index: number;
  placeholder: string;
  maxLength: number;
  focusId: string | null;
  onToggle: (done: boolean) => void;
  onText: (text: string) => void;
  onRemove: () => void;
  onEnter: () => void;
  removeLabel: string;
  ordered?: boolean;
}) {
  const title = item.text.trim() || `${placeholder} ${index + 1}`;
  return (
    <li className="planner-row" data-done={item.done || undefined}>
      {ordered && <span className="planner-row__index" aria-hidden="true">{index + 1}</span>}
      <CheckBox checked={item.done} onChange={onToggle} label={`Отметить: ${title}`} />
      <AutoTextarea
        value={item.text}
        onChange={onText}
        placeholder={placeholder}
        maxLength={maxLength}
        ariaLabel={`${placeholder}, строка ${index + 1}`}
        focusOnMount={focusId === item.id}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            onEnter();
          }
          if (event.key === 'Backspace' && item.text === '') {
            event.preventDefault();
            onRemove();
          }
        }}
      />
      <button type="button" className="planner-row__remove" onClick={onRemove} aria-label={`${removeLabel}: ${title}`}>
        <Trash2 aria-hidden="true" />
      </button>
    </li>
  );
}

function AddButton({ label, onClick, disabled = false }: { label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="planner-add" onClick={onClick} disabled={disabled}>
      <Plus aria-hidden="true" /> {label}
    </button>
  );
}

/* ---------- Выбор недели ---------- */

function WeekPicker({ weekStart, onSelect }: { weekStart: string; onSelect: (week: string) => void }) {
  const [open, setOpen] = useState(false);
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const date = parseIsoDate(weekStart);
    return new Date(date.getFullYear(), date.getMonth(), 1);
  });

  const todayIso = toIsoDate(new Date());

  const weeks = useMemo(() => {
    const first = mondayOf(new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1));
    return Array.from({ length: 6 }, (_, rowIndex) => {
      const rowStart = addDays(first, rowIndex * DAYS_IN_WEEK);
      return {
        iso: toIsoDate(rowStart),
        days: Array.from({ length: DAYS_IN_WEEK }, (_, dayIndex) => addDays(rowStart, dayIndex)),
      };
    });
  }, [visibleMonth]);

  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(visibleMonth),
    [visibleMonth],
  );

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          const date = parseIsoDate(weekStart);
          setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="planner-week-trigger"
          aria-label={`Неделя ${formatWeekRange(weekStart)}. Выбрать другую неделю`}
        >
          <CalendarDays aria-hidden="true" />
          <span className="planner-week-trigger__full" aria-hidden="true">{formatWeekRange(weekStart)}</span>
          <span className="planner-week-trigger__short" aria-hidden="true">{formatWeekRangeShort(weekStart)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" sideOffset={8} className="planner-weekpick">
        <div className="planner-weekpick__head">
          <button
            type="button"
            className="planner-icon-button"
            onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() - 1, 1))}
            aria-label="Предыдущий месяц"
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <strong>{monthLabel}</strong>
          <button
            type="button"
            className="planner-icon-button"
            onClick={() => setVisibleMonth((current) => new Date(current.getFullYear(), current.getMonth() + 1, 1))}
            aria-label="Следующий месяц"
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
        <div className="planner-weekpick__weekdays" aria-hidden="true">
          {WEEKDAY_SHORT.map((day) => <span key={day}>{day}</span>)}
        </div>
        <div className="planner-weekpick__rows">
          {weeks.map((week) => (
            <button
              type="button"
              key={week.iso}
              className="planner-weekpick__row"
              aria-current={week.iso === weekStart ? 'true' : undefined}
              aria-label={`Неделя ${formatWeekRange(week.iso)}`}
              onClick={() => {
                onSelect(week.iso);
                setOpen(false);
              }}
            >
              {week.days.map((day) => {
                const iso = toIsoDate(day);
                return (
                  <span
                    key={iso}
                    className="planner-weekpick__day"
                    data-outside={day.getMonth() !== visibleMonth.getMonth() || undefined}
                    data-today={iso === todayIso || undefined}
                  >
                    {day.getDate()}
                  </span>
                );
              })}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="planner-weekpick__today"
          onClick={() => {
            onSelect(currentWeekStart());
            setOpen(false);
          }}
        >
          Текущая неделя
        </button>
      </PopoverContent>
    </Popover>
  );
}

/* ---------- Карточка дня ---------- */

function DayCard({
  index,
  date,
  day,
  isActive,
  isToday,
  focusId,
  onChange,
  onFocusId,
  onCarryOver,
  carryLabel,
  carryBusy,
}: {
  index: number;
  date: Date;
  day: PlannerDay;
  isActive: boolean;
  isToday: boolean;
  focusId: string | null;
  onChange: (updater: (current: PlannerDay) => PlannerDay) => void;
  onFocusId: (id: string | null) => void;
  onCarryOver: () => void;
  carryLabel: string;
  carryBusy: boolean;
}) {
  const filled = day.tasks.filter((task) => task.text.trim());
  const done = filled.filter((task) => task.done).length;
  const progress = filled.length ? done / filled.length : 0;

  const addTask = (afterIndex?: number) => {
    const task: PlannerCheckItem = { id: createId('task'), text: '', done: false };
    onChange((current) => {
      if (current.tasks.length >= PLANNER_LIMITS.tasksPerDay) return current;
      const tasks = [...current.tasks];
      tasks.splice(afterIndex === undefined ? tasks.length : afterIndex + 1, 0, task);
      return { ...current, tasks };
    });
    onFocusId(task.id);
  };

  const addNote = () => {
    const note = { id: createId('note'), text: '' };
    onChange((current) => (
      current.notes.length >= PLANNER_LIMITS.notesPerDay
        ? current
        : { ...current, notes: [...current.notes, note] }
    ));
    onFocusId(note.id);
  };

  return (
    <article
      className="planner-day"
      data-active={isActive || undefined}
      data-today={isToday || undefined}
      aria-label={`${WEEKDAY_FULL[index]}, ${formatDayShort(date)}`}
    >
      <header className="planner-day__head">
        <div className="planner-day__title">
          <h3>{WEEKDAY_FULL[index]}</h3>
          <span className="admin-hint">{formatDayShort(date)}{isToday ? ' · сегодня' : ''}</span>
        </div>
        <ProgressRing
          value={progress}
          size="sm"
          label={`Прогресс дня: выполнено ${done} из ${filled.length}`}
        >
          <span className="planner-ring__value">{formatPercent(progress)}</span>
        </ProgressRing>
      </header>

      <ul className="planner-list">
        {day.tasks.map((task, taskIndex) => (
          <CheckRow
            key={task.id}
            item={task}
            index={taskIndex}
            placeholder="Задача"
            maxLength={PLANNER_LIMITS.taskText}
            focusId={focusId}
            removeLabel="Удалить задачу"
            onToggle={(value) => onChange((current) => ({
              ...current,
              tasks: current.tasks.map((item) => (item.id === task.id ? { ...item, done: value } : item)),
            }))}
            onText={(text) => onChange((current) => ({
              ...current,
              tasks: current.tasks.map((item) => (item.id === task.id ? { ...item, text } : item)),
            }))}
            onRemove={() => onChange((current) => ({
              ...current,
              tasks: current.tasks.filter((item) => item.id !== task.id),
            }))}
            onEnter={() => addTask(taskIndex)}
          />
        ))}
      </ul>
      <AddButton
        label="Добавить задачу"
        onClick={() => addTask()}
        disabled={day.tasks.length >= PLANNER_LIMITS.tasksPerDay}
      />

      <dl className="planner-day__counts">
        <div><dt>Выполнено</dt><dd>{done}</dd></div>
        <div><dt>Осталось</dt><dd>{Math.max(0, filled.length - done)}</dd></div>
      </dl>

      {filled.length > done && (
        <button
          type="button"
          className="planner-day__carry"
          onClick={onCarryOver}
          disabled={carryBusy}
        >
          <CornerDownRight aria-hidden="true" />
          {carryBusy ? 'Переношу…' : carryLabel}
        </button>
      )}

      <section className="planner-day__notes" aria-label={`Заметки дня: ${WEEKDAY_FULL[index]}`}>
        <h4>Заметки дня</h4>
        {day.notes.length === 0 && <p className="admin-hint">Мысли, напоминания и договорённости по этому дню.</p>}
        <ul className="planner-notes">
          {day.notes.map((note, noteIndex) => (
            <li key={note.id} className="planner-note">
              <span className="planner-row__index" aria-hidden="true">{noteIndex + 1}</span>
              <AutoTextarea
                value={note.text}
                onChange={(text) => onChange((current) => ({
                  ...current,
                  notes: current.notes.map((item) => (item.id === note.id ? { ...item, text } : item)),
                }))}
                placeholder="Заметка"
                maxLength={PLANNER_LIMITS.noteText}
                ariaLabel={`Заметка ${noteIndex + 1}`}
                focusOnMount={focusId === note.id}
              />
              <button
                type="button"
                className="planner-row__remove"
                onClick={() => onChange((current) => ({
                  ...current,
                  notes: current.notes.filter((item) => item.id !== note.id),
                }))}
                aria-label={`Удалить заметку ${noteIndex + 1}`}
              >
                <Trash2 aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <AddButton
          label="Добавить заметку"
          onClick={addNote}
          disabled={day.notes.length >= PLANNER_LIMITS.notesPerDay}
        />
      </section>
    </article>
  );
}

/* ---------- Дневник ---------- */

function JournalCard({
  index,
  date,
  journal,
  isActive,
  onChange,
}: {
  index: number;
  date: Date;
  journal: PlannerJournal;
  isActive: boolean;
  onChange: (patch: Partial<PlannerJournal>) => void;
}) {
  return (
    <article className="planner-journal" data-active={isActive || undefined}>
      <header className="planner-journal__head">
        <h3>{WEEKDAY_FULL[index]}</h3>
        <span className="admin-hint">{formatDayShort(date)}</span>
      </header>

      <div className="planner-journal__meters">
        <div className="planner-field planner-field--sleep">
          <span className="planner-field__label"><Moon aria-hidden="true" /> Сон</span>
          <AdminSelect
            compact
            ariaLabel={`Сон, ${WEEKDAY_FULL[index]}`}
            value={journal.sleep || SLEEP_NONE}
            placeholder="—"
            options={SLEEP_OPTIONS.map((option) => ({
              value: option || SLEEP_NONE,
              label: option || 'Не указано',
            }))}
            onValueChange={(value) => onChange({ sleep: value === SLEEP_NONE ? '' : value })}
          />
        </div>

        <fieldset className="planner-field planner-field--scale planner-field--energy">
          <legend className="planner-field__label">Энергия</legend>
          <div className="planner-scale" data-scale="energy">
            {ENERGY_LEVELS.map((level) => (
              <button
                type="button"
                key={level.value}
                className="planner-scale__button"
                data-level={level.value}
                aria-pressed={journal.energy >= level.value}
                aria-label={`Энергия: ${level.label}`}
                title={level.label}
                onClick={() => onChange({ energy: journal.energy === level.value ? 0 : level.value })}
              >
                <Zap aria-hidden="true" />
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="planner-field planner-field--scale planner-field--mood">
          <legend className="planner-field__label">Настроение</legend>
          <div className="planner-scale" data-scale="mood">
            {MOOD_LEVELS.map((level, moodIndex) => {
              const Icon = MOOD_ICONS[moodIndex];
              return (
                <button
                  type="button"
                  key={level.value}
                  className="planner-scale__button"
                  data-level={level.value}
                  aria-pressed={journal.mood === level.value}
                  aria-label={`Настроение: ${level.label}`}
                  title={level.label}
                  onClick={() => onChange({ mood: journal.mood === level.value ? 0 : level.value })}
                >
                  <Icon aria-hidden="true" />
                </button>
              );
            })}
          </div>
        </fieldset>
      </div>

      <div className="planner-journal__texts">
        {([
          ['lesson', 'Урок дня', 'Что понял или чему научился'],
          ['gratitude', 'Благодарность', 'За что сегодня благодарен'],
          ['thoughts', 'Мысли', 'Свободная запись о дне'],
        ] as const).map(([field, label, placeholder]) => (
          <label className="planner-field" key={field}>
            <span className="planner-field__label">{label}</span>
            <AutoTextarea
              value={journal[field]}
              onChange={(value) => onChange({ [field]: value } as Partial<PlannerJournal>)}
              placeholder={placeholder}
              maxLength={PLANNER_LIMITS.journalText}
              ariaLabel={`${label}, ${WEEKDAY_FULL[index]}`}
              className="planner-textarea--boxed"
            />
          </label>
        ))}
      </div>
    </article>
  );
}

/* ---------- Трекер привычек ---------- */

function HabitRow({
  habit,
  index,
  focusId,
  onChange,
  onRemove,
}: {
  habit: PlannerHabit;
  index: number;
  focusId: string | null;
  onChange: (patch: Partial<PlannerHabit>) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const progress = habitProgress(habit);
  const stars = Math.round(progress * 5);
  const title = habit.name.trim() || `Привычка ${index + 1}`;

  useEffect(() => {
    if (focusId === habit.id) inputRef.current?.focus();
  }, [focusId, habit.id]);

  return (
    <div className="planner-habit" data-complete={progress >= 1 || undefined}>
      <div className="planner-habit__name">
        <input
          ref={inputRef}
          className="planner-input"
          value={habit.name}
          maxLength={PLANNER_LIMITS.habitName}
          placeholder={`Привычка ${index + 1}`}
          aria-label={`Название привычки ${index + 1}`}
          onChange={(event) => onChange({ name: event.target.value })}
        />
        <button
          type="button"
          className="planner-row__remove"
          onClick={onRemove}
          aria-label={`Удалить привычку: ${title}`}
        >
          <Trash2 aria-hidden="true" />
        </button>
      </div>

      <div className="planner-habit__days">
        {WEEKDAY_SHORT.map((weekday, dayIndex) => (
          <label className="planner-habit__day" key={weekday}>
            <span className="planner-habit__weekday" aria-hidden="true">{weekday}</span>
            <CheckBox
              checked={habit.days[dayIndex]}
              label={`${title}: ${WEEKDAY_FULL[dayIndex]}`}
              onChange={(value) => onChange({
                days: habit.days.map((item, itemIndex) => (itemIndex === dayIndex ? value : item)),
              })}
            />
          </label>
        ))}
      </div>

      <div className="planner-habit__progress">
        <span className="planner-stars" aria-hidden="true">
          {[0, 1, 2, 3, 4].map((star) => (
            <Star key={star} className={star < stars ? 'is-on' : ''} style={{ '--planner-star-index': star } as CSSProperties} />
          ))}
        </span>
        <ProgressBar value={progress} label={`${title}: выполнено ${habit.days.filter(Boolean).length} из 7 дней`} />
        <span className="planner-habit__percent tabular-nums">{formatPercent(progress)}</span>
      </div>
    </div>
  );
}

/* ---------- Экран ---------- */

export default function AdminPlanner({ password }: { password: string }) {
  const [weekStart, setWeekStart] = useState(() => currentWeekStart());
  const [data, setData] = useState<PlannerWeekData>(() => emptyWeek());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [localMode, setLocalMode] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [activeDay, setActiveDay] = useState(() => {
    const index = todayIndexIn(currentWeekStart());
    return index === -1 ? 0 : index;
  });
  const [focusId, setFocusId] = useState<string | null>(null);

  const pendingRef = useRef<{ week: string; data: PlannerWeekData } | null>(null);
  const timerRef = useRef<number | null>(null);
  const flushRef = useRef<() => Promise<void>>(async () => {});
  const localModeRef = useRef(false);
  const passwordRef = useRef(password);
  const dataRef = useRef(data);
  passwordRef.current = password;
  localModeRef.current = localMode;
  dataRef.current = data;

  const dates = useMemo(() => weekDates(weekStart), [weekStart]);
  const stats = useMemo(() => computeStats(data), [data]);
  const todayIndex = useMemo(() => todayIndexIn(weekStart), [weekStart]);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;

    if (localModeRef.current) {
      writeLocalWeek(pending.week, pending.data);
      setSavedAt(new Date().toISOString());
      setSaveState('saved');
      return;
    }

    setSaveState('saving');
    try {
      const response = await fetch('/api/admin/planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': passwordRef.current },
        credentials: 'same-origin',
        body: JSON.stringify({ password: passwordRef.current, week: pending.week, data: pending.data }),
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
      if (!response.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${response.status}`);
      setSavedAt(new Date().toISOString());
      setSaveState('saved');
    } catch {
      // Возвращаем изменения в очередь и пробуем сами: сеть моргнула или сервер
      // притормозил — пользователю не нужно ничего нажимать.
      pendingRef.current = pendingRef.current || pending;
      setSaveState('error');
      if (!timerRef.current) {
        timerRef.current = window.setTimeout(() => { void flushRef.current(); }, SAVE_RETRY_MS);
      }
    }
  }, []);

  flushRef.current = flush;

  const scheduleSave = useCallback((week: string, next: PlannerWeekData) => {
    pendingRef.current = { week, data: next };
    setSaveState('pending');
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => { void flush(); }, SAVE_DEBOUNCE_MS);
  }, [flush]);

  const update = useCallback((updater: (current: PlannerWeekData) => PlannerWeekData) => {
    const next = updater(dataRef.current);
    if (next === dataRef.current) return;
    dataRef.current = next;
    setData(next);
    scheduleSave(weekStart, next);
  }, [scheduleSave, weekStart]);

  const [template, setTemplate] = useState<PlannerTemplate | null>(null);
  const [templateMigration, setTemplateMigration] = useState('');
  const [templateBusy, setTemplateBusy] = useState(false);
  const [templateApplied, setTemplateApplied] = useState(false);
  // Неделя, в которую шаблон уже подставляли: без этого он возвращался бы
  // сразу после того, как все дела из него удалили вручную.
  const appliedWeekRef = useRef<string | null>(null);

  const loadTemplate = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/planner-template', {
        headers: { 'X-Admin-Password': passwordRef.current },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as {
        success?: boolean; template?: PlannerTemplate | null; migration?: string;
      } | null;
      if (!response.ok || !payload?.success) {
        if (payload?.migration) setTemplateMigration(payload.migration);
        else if (response.status === 503 && isLocalEnvironment()) setTemplate(readLocalTemplate());
        return;
      }
      setTemplateMigration('');
      setTemplate(isEmptyTemplate(payload.template ?? null) ? null : payload.template ?? null);
    } catch {
      // Шаблон — удобство, а не основа: планер работает и без него.
    }
  }, []);

  useEffect(() => { void loadTemplate(); }, [loadTemplate]);

  const persistTemplate = useCallback(async (next: PlannerTemplate | null): Promise<boolean> => {
    setTemplateBusy(true);
    try {
      if (localModeRef.current) {
        writeLocalTemplate(next);
        setTemplate(next);
        return true;
      }
      const response = await fetch('/api/admin/planner-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': passwordRef.current },
        credentials: 'same-origin',
        body: JSON.stringify({
          password: passwordRef.current,
          template: next || { days: [], goals: [] },
          clear: !next,
        }),
      });
      const payload = await response.json().catch(() => null) as {
        success?: boolean; error?: string; template?: PlannerTemplate | null; migration?: string;
      } | null;
      if (!response.ok || !payload?.success) {
        if (payload?.migration) setTemplateMigration(payload.migration);
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      setTemplateMigration('');
      setTemplate(isEmptyTemplate(payload.template ?? null) ? null : payload.template ?? null);
      return true;
    } catch (error) {
      notify.error('Шаблон не сохранился', error instanceof Error ? error.message : undefined);
      return false;
    } finally {
      setTemplateBusy(false);
    }
  }, []);

  const [carryingDay, setCarryingDay] = useState<number | null>(null);

  /**
   * Перенос невыполненного на следующий день. Внутри недели это обычная правка
   * текущей записи; из воскресенья задачи уезжают в следующую неделю — это
   * отдельная строка в базе, поэтому её приходится прочитать и сохранить
   * отдельным запросом. Из текущей недели задачи убираются только после того,
   * как следующая действительно сохранилась: иначе при обрыве сети они бы
   * исчезли из одного дня и не появились в другом.
   */
  const carryOver = useCallback(async (index: number) => {
    if (carryingDay !== null) return;
    const moving = pendingTasks(dataRef.current.days[index]);
    if (!moving.length) return;

    const withoutCarried = (day: PlannerDay, carried: PlannerCheckItem[]): PlannerDay => ({
      ...day,
      tasks: day.tasks.filter((task) => !carried.some((item) => item.id === task.id)),
    });

    if (index < DAYS_IN_WEEK - 1) {
      const capacity = Math.max(0, PLANNER_LIMITS.tasksPerDay - dataRef.current.days[index + 1].tasks.length);
      const carried = moving.slice(0, capacity);
      if (!carried.length) {
        notify.error('В следующем дне нет места', `Там уже ${PLANNER_LIMITS.tasksPerDay} задач — сначала разберите их.`);
        return;
      }
      update((current) => ({
        ...current,
        days: current.days.map((day, dayIndex) => {
          if (dayIndex === index) return withoutCarried(day, carried);
          if (dayIndex === index + 1) return { ...day, tasks: [...day.tasks, ...carried] };
          return day;
        }),
      }));
      notify.success(`Перенесено задач: ${carried.length}`, `Теперь они на ${WEEKDAY_FULL[index + 1]}.`);
      return;
    }

    const nextWeek = shiftWeek(weekStart, 1);
    setCarryingDay(index);
    try {
      let targetData: PlannerWeekData;
      if (localModeRef.current) {
        targetData = normalizeWeekData(readLocalWeeks()[nextWeek]);
      } else {
        const response = await fetch(`/api/admin/planner?week=${encodeURIComponent(nextWeek)}`, {
          headers: { 'X-Admin-Password': passwordRef.current },
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const payload = await response.json().catch(() => null) as { success?: boolean; data?: unknown; error?: string } | null;
        if (!response.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${response.status}`);
        targetData = normalizeWeekData(payload.data);
      }

      const capacity = Math.max(0, PLANNER_LIMITS.tasksPerDay - targetData.days[0].tasks.length);
      const carried = moving.slice(0, capacity);
      if (!carried.length) throw new Error(`В понедельнике следующей недели уже ${PLANNER_LIMITS.tasksPerDay} задач`);

      const merged: PlannerWeekData = {
        ...targetData,
        days: targetData.days.map((day, dayIndex) => (
          dayIndex === 0 ? { ...day, tasks: [...day.tasks, ...carried] } : day
        )),
      };

      if (localModeRef.current) {
        writeLocalWeek(nextWeek, merged);
      } else {
        const response = await fetch('/api/admin/planner', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Password': passwordRef.current },
          credentials: 'same-origin',
          body: JSON.stringify({ password: passwordRef.current, week: nextWeek, data: merged }),
        });
        const payload = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
        if (!response.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${response.status}`);
      }

      update((current) => ({
        ...current,
        days: current.days.map((day, dayIndex) => (dayIndex === index ? withoutCarried(day, carried) : day)),
      }));
      notify.success(`Перенесено задач: ${carried.length}`, 'Они ждут в понедельник следующей недели.');
    } catch (error) {
      notify.error('Не удалось перенести', error instanceof Error ? error.message : undefined);
    } finally {
      setCarryingDay(null);
    }
  }, [carryingDay, update, weekStart]);

  const saveWeekAsTemplate = useCallback(async () => {
    const next = templateFromWeek(dataRef.current);
    if (isEmptyTemplate(next)) {
      notify.error('Нечего сохранять', 'Сначала заполните задачи или цели недели.');
      return;
    }
    if (await persistTemplate(next)) {
      appliedWeekRef.current = weekStart;
      notify.success('Шаблон недели сохранён', `Повторяющихся дел: ${countTemplateItems(next)}.`);
    }
  }, [persistTemplate, weekStart]);

  const applyTemplateNow = useCallback(() => {
    if (!template) return;
    update((current) => applyTemplate(current, template));
    appliedWeekRef.current = weekStart;
    setTemplateApplied(false);
    notify.success('Шаблон подставлен', 'Заполнились только пустые дни — написанное не тронуто.');
  }, [template, update, weekStart]);

  const forgetTemplate = useCallback(async () => {
    if (await persistTemplate(null)) notify.success('Шаблон забыт');
  }, [persistTemplate]);

  const load = useCallback(async (week: string) => {
    setLoading(true);
    setLoadError('');
    setTemplateApplied(false);
    try {
      const response = await fetch(`/api/admin/planner?week=${encodeURIComponent(week)}`, {
        headers: { 'X-Admin-Password': passwordRef.current },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as {
        success?: boolean;
        error?: string;
        data?: unknown;
        updatedAt?: string | null;
      } | null;

      if (!response.ok || !payload?.success) {
        // На localhost базы D1 нет — планер продолжает работать в этом браузере,
        // чтобы раздел можно было проверять и в разработке.
        if (response.status === 503 && isLocalEnvironment()) {
          setLocalMode(true);
          localModeRef.current = true;
          dataRef.current = normalizeWeekData(readLocalWeeks()[week]);
          setData(dataRef.current);
          setSavedAt(null);
          setSaveState('idle');
          return;
        }
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }

      setLocalMode(false);
      localModeRef.current = false;
      dataRef.current = normalizeWeekData(payload.data);
      setData(dataRef.current);
      setSavedAt(payload.updatedAt || null);
      setSaveState('idle');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Не удалось загрузить планер');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(weekStart);
  }, [load, weekStart]);

  // Шаблон подставляется сам только в пустую текущую или будущую неделю и без
  // сохранения: пролистывание недель не должно плодить записи в базе. Дела
  // сохранятся вместе с первой же настоящей правкой.
  useEffect(() => {
    if (loading || !template || appliedWeekRef.current === weekStart) return;
    if (weekStart < currentWeekStart()) return;
    if (!isWeekUntouched(dataRef.current)) return;
    appliedWeekRef.current = weekStart;
    const next = applyTemplate(dataRef.current, template);
    dataRef.current = next;
    setData(next);
    setTemplateApplied(true);
  }, [loading, template, weekStart]);

  // Закрытие вкладки не отменяет последнюю правку: обычный fetch на выгрузке
  // страницы браузер может оборвать, поэтому недосохранённое уходит sendBeacon.
  //
  // Одного `beforeunload` мало. На телефоне вкладку почти всегда закрывают не
  // явно, а переключением приложения, и Safari на iOS в этом случае события не
  // присылает вовсе — доезжают только `pagehide` и переход в скрытое состояние.
  // Повторный вызов безвреден: после удачной отправки очередь очищается.
  useEffect(() => {
    const handler = () => {
      const pending = pendingRef.current;
      if (!pending) return;
      if (localModeRef.current) {
        writeLocalWeek(pending.week, pending.data);
        pendingRef.current = null;
        return;
      }
      const body = new Blob(
        [JSON.stringify({ password: passwordRef.current, week: pending.week, data: pending.data })],
        { type: 'application/json' },
      );
      if (navigator.sendBeacon?.('/api/admin/planner', body)) {
        pendingRef.current = null;
      }
    };
    const onHidden = () => {
      if (document.visibilityState === 'hidden') handler();
    };
    window.addEventListener('beforeunload', handler);
    window.addEventListener('pagehide', handler);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('beforeunload', handler);
      window.removeEventListener('pagehide', handler);
      document.removeEventListener('visibilitychange', onHidden);
      void flush();
    };
  }, [flush]);

  const goToWeek = useCallback((week: string) => {
    void flush();
    setWeekStart(week);
    const index = todayIndexIn(week);
    setActiveDay(index === -1 ? 0 : index);
  }, [flush]);

  const addGoal = () => {
    const goal: PlannerCheckItem = { id: createId('goal'), text: '', done: false };
    update((current) => (
      current.goals.length >= PLANNER_LIMITS.goals ? current : { ...current, goals: [...current.goals, goal] }
    ));
    setFocusId(goal.id);
  };

  const addHabit = () => {
    const habit: PlannerHabit = {
      id: createId('habit'),
      name: '',
      days: Array.from({ length: DAYS_IN_WEEK }, () => false),
    };
    update((current) => (
      current.habits.length >= PLANNER_LIMITS.habits ? current : { ...current, habits: [...current.habits, habit] }
    ));
    setFocusId(habit.id);
  };

  const saveBadge = (() => {
    if (saveState === 'saving') return { icon: Loader2, text: 'Сохраняю…', className: 'admin-state', spin: true };
    if (saveState === 'pending') return { icon: Loader2, text: 'Есть изменения', className: 'admin-state', spin: false };
    if (saveState === 'error') return { icon: AlertTriangle, text: 'Не сохранено', className: 'admin-state admin-state--danger', spin: false };
    if (savedAt) return { icon: CheckCircle2, text: `Сохранено ${formatSavedAt(savedAt)}`, className: 'admin-state admin-state--success', spin: false };
    return { icon: CheckCircle2, text: 'Всё сохранено', className: 'admin-state', spin: false };
  })();
  const SaveIcon = saveBadge.icon;

  const namedHabits = data.habits.filter((habit) => habit.name.trim());

  return (
    <div className="admin-stack admin-stack--lg planner">
      <section className="admin-card admin-card--hero planner-hero" aria-labelledby="planner-title">
        <div className="planner-hero__top">
          <div>
            <p className="admin-eyebrow">Личный контур</p>
            <h2 id="planner-title" className="admin-title">Планер недели</h2>
            <p className="admin-subtitle">
              Цели, задачи по дням, привычки и дневник — с автосохранением и живой аналитикой.
            </p>
          </div>
          <div className="planner-hero__state">
            <span className={saveBadge.className}>
              <SaveIcon aria-hidden="true" className={saveBadge.spin ? 'animate-spin' : ''} />
              {saveBadge.text}
            </span>
            {saveState === 'error' && (
              <button type="button" className="admin-button admin-button--compact" onClick={() => void flush()}>
                <RefreshCw aria-hidden="true" /> Повторить
              </button>
            )}
          </div>
        </div>

        <div className="planner-weeknav">
          <button
            type="button"
            className="planner-icon-button"
            onClick={() => goToWeek(shiftWeek(weekStart, -1))}
            aria-label="Предыдущая неделя"
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <WeekPicker weekStart={weekStart} onSelect={goToWeek} />
          <button
            type="button"
            className="planner-icon-button"
            onClick={() => goToWeek(shiftWeek(weekStart, 1))}
            aria-label="Следующая неделя"
          >
            <ChevronRight aria-hidden="true" />
          </button>
          {weekStart !== currentWeekStart() && (
            <button type="button" className="admin-button admin-button--compact" onClick={() => goToWeek(currentWeekStart())}>
              Сегодня
            </button>
          )}
        </div>

        <div className="planner-template">
          <div className="planner-template__info">
            <strong><Repeat aria-hidden="true" /> Шаблон недели</strong>
            <span className="admin-hint">
              {templateMigration
                ? `Примените миграцию ${templateMigration} — до неё шаблон негде хранить.`
                : template
                  ? `Повторяющихся дел: ${countTemplateItems(template)}. Новая пустая неделя открывается уже с ними.`
                  : 'Сохраните удачную неделю как шаблон — повторяющиеся дела будут появляться в новых неделях сами.'}
            </span>
          </div>
          <div className="planner-template__actions">
            <button
              type="button"
              className="admin-button admin-button--compact"
              disabled={templateBusy || Boolean(templateMigration)}
              onClick={() => void saveWeekAsTemplate()}
            >
              {template ? 'Обновить шаблон' : 'Сделать шаблоном'}
            </button>
            {template && (
              <>
                <button type="button" className="admin-button admin-button--compact" disabled={templateBusy} onClick={applyTemplateNow}>
                  Подставить
                </button>
                <button type="button" className="admin-button admin-button--quiet admin-button--compact" disabled={templateBusy} onClick={() => void forgetTemplate()}>
                  Забыть
                </button>
              </>
            )}
          </div>
        </div>

        {templateApplied && (
          <p className="planner-notice planner-notice--info">
            <Repeat aria-hidden="true" />
            Дела подставлены из шаблона. Они сохранятся, как только вы что-нибудь измените в неделе.
          </p>
        )}

        {localMode && (
          <p className="planner-notice">
            <CloudOff aria-hidden="true" />
            Локальный режим: базы D1 нет, неделя хранится только в этом браузере. На сайте данные пишутся в базу.
          </p>
        )}
      </section>

      {loading && (
        <div className="admin-empty" role="status">
          <Loader2 aria-hidden="true" className="animate-spin" />
          <div><strong>Загружаю неделю</strong><p>{formatWeekRange(weekStart)}</p></div>
        </div>
      )}

      {!loading && loadError && (
        <div className="admin-empty" role="alert">
          <AlertTriangle aria-hidden="true" />
          <div>
            <strong>Планер недоступен</strong>
            <p>{loadError}</p>
          </div>
          <button type="button" className="admin-button admin-button--compact" onClick={() => void load(weekStart)}>
            <RefreshCw aria-hidden="true" /> Повторить
          </button>
        </div>
      )}

      {!loading && !loadError && (
        <>
          <div className="planner-overview">
            <section className="admin-card planner-total" aria-label="Итог недели">
              <ProgressRing
                value={stats.progress}
                size="lg"
                label={`Прогресс недели: выполнено ${stats.done} из ${stats.total} задач`}
              >
                <span className="planner-ring__hero">{formatPercent(stats.progress)}</span>
                <span className="planner-ring__caption">выполнено</span>
              </ProgressRing>
              <p className="planner-total__caption">
                {stats.total > 0
                  ? `${stats.done} из ${stats.total} задач недели`
                  : 'Задач пока нет — добавьте первую в любой день'}
              </p>
            </section>

            <section className="admin-card planner-chart-card" aria-label="График прогресса недели">
              <WeekProgressChart
                days={stats.days}
                dates={dates}
                bestDayIndex={stats.bestDayIndex}
                activeIndex={activeDay}
                todayIndex={todayIndex}
                onSelectDay={setActiveDay}
              />
            </section>
          </div>

          <div className="planner-stats">
            <div className="admin-card planner-stat" data-tone="tasks">
              <span className="planner-stat__label"><span className="planner-stat__icon"><ListChecks aria-hidden="true" /></span> Задачи</span>
              <strong className="planner-stat__value">{stats.total}</strong>
            </div>
            <div className="admin-card planner-stat" data-tone="done">
              <span className="planner-stat__label"><span className="planner-stat__icon"><CheckCircle2 aria-hidden="true" /></span> Готово</span>
              <strong className="planner-stat__value">{stats.done}</strong>
            </div>
            <div className="admin-card planner-stat" data-tone="best">
              <span className="planner-stat__label"><span className="planner-stat__icon"><Trophy aria-hidden="true" /></span> Лучший день</span>
              <strong className="planner-stat__value planner-stat__value--text">
                {stats.bestDayIndex === -1 ? '—' : WEEKDAY_SHORT[stats.bestDayIndex]}
              </strong>
            </div>
            <div className="admin-card planner-stat" data-tone="goals">
              <span className="planner-stat__label"><span className="planner-stat__icon"><Target aria-hidden="true" /></span> Цели</span>
              <strong className="planner-stat__value">{stats.goalsDone}<span className="planner-stat__of"> / {stats.goalsTotal}</span></strong>
            </div>
            <div className="admin-card planner-stat" data-tone="habits">
              <span className="planner-stat__label"><span className="planner-stat__icon"><Repeat aria-hidden="true" /></span> Привычки</span>
              <strong className="planner-stat__value">
                {stats.habitSlots ? formatPercent(stats.habitChecks / stats.habitSlots) : '—'}
              </strong>
            </div>
          </div>

          <section className="admin-card planner-section" aria-labelledby="planner-goals">
            <div className="planner-section__head">
              <div>
                <h3 id="planner-goals" className="admin-card-title">Цели недели</h3>
                <p className="admin-hint">Коротко и измеримо: «3 тренировки», «10 сценариев рилсов».</p>
              </div>
              <span className="admin-state">{stats.goalsDone} из {stats.goalsTotal}</span>
            </div>
            <ul className="planner-list planner-list--goals">
              {data.goals.map((goal, index) => (
                <CheckRow
                  key={goal.id}
                  item={goal}
                  index={index}
                  ordered
                  placeholder="Цель"
                  maxLength={PLANNER_LIMITS.goalText}
                  focusId={focusId}
                  removeLabel="Удалить цель"
                  onToggle={(value) => update((current) => ({
                    ...current,
                    goals: current.goals.map((item) => (item.id === goal.id ? { ...item, done: value } : item)),
                  }))}
                  onText={(text) => update((current) => ({
                    ...current,
                    goals: current.goals.map((item) => (item.id === goal.id ? { ...item, text } : item)),
                  }))}
                  onRemove={() => update((current) => ({
                    ...current,
                    goals: current.goals.filter((item) => item.id !== goal.id),
                  }))}
                  onEnter={addGoal}
                />
              ))}
            </ul>
            {data.goals.length === 0 && <p className="admin-hint">Пока целей нет. Добавьте до {PLANNER_LIMITS.goals} штук.</p>}
            <AddButton label="Добавить цель" onClick={addGoal} disabled={data.goals.length >= PLANNER_LIMITS.goals} />
          </section>

          <section className="planner-section planner-section--days" aria-labelledby="planner-days">
            <div className="planner-section__head planner-section__head--bare">
              <div>
                <h3 id="planner-days" className="admin-card-title">Дни недели</h3>
                <p className="admin-hint">Enter — новая задача, Shift+Enter — перенос строки.</p>
              </div>
            </div>

            <div className="planner-daystrip" role="group" aria-label="Выбор дня">
              {dates.map((date, index) => {
                const dayStats = stats.days[index];
                return (
                  <button
                    type="button"
                    key={toIsoDate(date)}
                    aria-pressed={activeDay === index}
                    aria-label={`${WEEKDAY_FULL[index]}, ${formatDayShort(date)}: выполнено ${dayStats.done} из ${dayStats.total}`}
                    className="planner-daystrip__tab"
                    data-today={index === todayIndex || undefined}
                    onClick={() => setActiveDay(index)}
                  >
                    <span className="planner-daystrip__name">{WEEKDAY_SHORT[index]}</span>
                    <span className="planner-daystrip__date">{date.getDate()}</span>
                    <span
                      className="planner-daystrip__meter"
                      data-filled={dayStats.total > 0 || undefined}
                      aria-hidden="true"
                    >
                      <span style={{ width: `${dayStats.progress * 100}%` }} />
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="planner-days">
              {dates.map((date, index) => (
                <DayCard
                  key={toIsoDate(date)}
                  index={index}
                  date={date}
                  day={data.days[index]}
                  isActive={activeDay === index}
                  isToday={todayIndex === index}
                  focusId={focusId}
                  onFocusId={setFocusId}
                  onChange={(updater) => update((current) => ({
                    ...current,
                    days: current.days.map((day, dayIndex) => (dayIndex === index ? updater(day) : day)),
                  }))}
                  onCarryOver={() => void carryOver(index)}
                  carryBusy={carryingDay === index}
                  carryLabel={
                    index === DAYS_IN_WEEK - 1
                      ? 'Перенести на следующую неделю'
                      : index === todayIndex
                        ? 'Перенести невыполненное на завтра'
                        : `Перенести на ${WEEKDAY_FULL[index + 1]}`
                  }
                />
              ))}
            </div>
          </section>

          <section className="admin-card planner-section" aria-labelledby="planner-habits">
            <div className="planner-section__head">
              <div>
                <h3 id="planner-habits" className="admin-card-title">Трекер привычек</h3>
                <p className="admin-hint">5–7 привычек, отметка за каждый выполненный день.</p>
              </div>
              <span className="admin-state">
                {stats.habitSlots ? `${stats.habitChecks} из ${stats.habitSlots}` : 'нет привычек'}
              </span>
            </div>

            {namedHabits.length === 0 && data.habits.length === 0 && (
              <p className="admin-hint">Например: «Сон до 23:00», «Зарядка 10 минут», «Чтение 20 страниц».</p>
            )}

            <div className="planner-habits">
              {data.habits.map((habit, index) => (
                <HabitRow
                  key={habit.id}
                  habit={habit}
                  index={index}
                  focusId={focusId}
                  onChange={(patch) => update((current) => ({
                    ...current,
                    habits: current.habits.map((item) => (item.id === habit.id ? { ...item, ...patch } : item)),
                  }))}
                  onRemove={() => update((current) => ({
                    ...current,
                    habits: current.habits.filter((item) => item.id !== habit.id),
                  }))}
                />
              ))}
            </div>
            <AddButton
              label="Добавить привычку"
              onClick={addHabit}
              disabled={data.habits.length >= PLANNER_LIMITS.habits}
            />
          </section>

          <section className="admin-card planner-section" aria-labelledby="planner-journal">
            <div className="planner-section__head">
              <div>
                <h3 id="planner-journal" className="admin-card-title">Дневник</h3>
                <p className="admin-hint">Сон, энергия, настроение и три короткие записи о дне.</p>
              </div>
              <span className="admin-state">
                <NotebookPen aria-hidden="true" />
                {data.days.filter((day) => isDayFilled(day)).length} из {DAYS_IN_WEEK} дней
              </span>
            </div>
            <div className="planner-journals">
              {dates.map((date, index) => (
                <JournalCard
                  key={toIsoDate(date)}
                  index={index}
                  date={date}
                  journal={data.days[index].journal}
                  isActive={activeDay === index}
                  onChange={(patch) => update((current) => ({
                    ...current,
                    days: current.days.map((day, dayIndex) => (
                      dayIndex === index ? { ...day, journal: { ...day.journal, ...patch } } : day
                    )),
                  }))}
                />
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
