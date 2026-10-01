import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { ArrowRight, Check, Flame, ListChecks, Plus, Sparkles, X } from 'lucide-react';
import { createId, normalizeWeekData, type PlannerWeekData } from './plannerModel';
import { withPlural } from '../../utils/plural';

export interface PlanTask {
  id: string;
  text: string;
  done: boolean;
}

const MAX_TASKS = 12;
const MAX_TEXT = 300;

/**
 * Очередь сохранений «Сегодня»: план и заметка пишут одну и ту же неделю
 * планера, и два цикла «прочитать → изменить → записать» рядом стирали друг
 * друга. Следующий цикл начинается только после окончания предыдущего.
 */
export type PlannerSaveQueue = MutableRefObject<Promise<void>>;

export async function enqueueSave(queue: PlannerSaveQueue | undefined, task: () => Promise<void>): Promise<void> {
  if (!queue) return task();
  const run = queue.current.then(task, task);
  queue.current = run.catch(() => undefined);
  return run;
}

/** Правка списка задач дня как операция — применяется к свежепрочитанному списку, а не к снимку экрана. */
export type PlanTaskOp =
  | { type: 'toggle'; id: string }
  | { type: 'remove'; id: string }
  | { type: 'add'; task: PlanTask };

export function applyPlanTaskOp(tasks: PlanTask[], op: PlanTaskOp): PlanTask[] {
  switch (op.type) {
    case 'toggle':
      return tasks.map((task) => (task.id === op.id ? { ...task, done: !task.done } : task));
    case 'remove':
      return tasks.filter((task) => task.id !== op.id);
    case 'add':
      return tasks.some((task) => task.id === op.task.id) ? tasks : [...tasks, op.task];
    default:
      return tasks;
  }
}

/**
 * План на сегодня прямо на стартовом экране: отметить сделанное и дописать
 * задачу можно здесь, не уходя в планер.
 *
 * Планер хранит неделю одним JSON, поэтому сохранение всегда идёт по циклу
 * «перечитать неделю → применить правку к нужному дню → записать целиком».
 * Применяется именно операция (отметить, убрать, добавить по id), а не снимок
 * списка с экрана: иначе задача, добавленная параллельно в планере или с
 * телефона, затиралась бы при первой же отметке отсюда.
 */
export default function TodayPlan({
  password,
  tasks,
  weekStart,
  dayIndex,
  streak = 0,
  queue,
  onNavigate,
  onSaved,
}: {
  password: string;
  tasks: PlanTask[];
  weekStart: string;
  dayIndex: number;
  streak?: number;
  /** Общая очередь с заметкой дня — см. enqueueSave. */
  queue?: PlannerSaveQueue;
  onNavigate: () => void;
  onSaved: () => void;
}) {
  const [items, setItems] = useState<PlanTask[]>(tasks);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setItems(tasks); }, [tasks]);

  const persist = useCallback(async (op: PlanTaskOp, previous: PlanTask[]) => {
    setSaving(true);
    setError('');
    try {
      await enqueueSave(queue, async () => {
        const headers = { 'Content-Type': 'application/json', 'X-Admin-Password': password };
        const readResponse = await fetch(`/api/admin/planner?week=${encodeURIComponent(weekStart)}`, {
          headers: { 'X-Admin-Password': password },
          credentials: 'same-origin',
          cache: 'no-store',
        });
        const readPayload = await readResponse.json().catch(() => null) as { success?: boolean; error?: string; data?: unknown } | null;
        if (!readResponse.ok || !readPayload?.success) throw new Error(readPayload?.error || `HTTP ${readResponse.status}`);

        const week: PlannerWeekData = normalizeWeekData(readPayload.data);
        const next = applyPlanTaskOp(week.days[dayIndex].tasks, op);
        if (next.length > MAX_TASKS) throw new Error(`В плане уже ${MAX_TASKS} задач — новая не поместится`);
        week.days[dayIndex] = {
          ...week.days[dayIndex],
          tasks: next.map((task) => ({ id: task.id, text: task.text, done: task.done })),
        };

        const saveResponse = await fetch('/api/admin/planner', {
          method: 'POST',
          headers,
          credentials: 'same-origin',
          body: JSON.stringify({ week: weekStart, data: week }),
        });
        const savePayload = await saveResponse.json().catch(() => null) as { success?: boolean; error?: string } | null;
        if (!saveResponse.ok || !savePayload?.success) throw new Error(savePayload?.error || `HTTP ${saveResponse.status}`);
        // На экране — то, что легло в базу: вместе с задачами, добавленными в другом месте.
        setItems(next);
      });
      onSaved();
    } catch (saveError) {
      // Откат: на экране не должно остаться отметки, которой нет в базе.
      setItems(previous);
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить план');
    } finally {
      setSaving(false);
    }
  }, [dayIndex, onSaved, password, queue, weekStart]);

  const toggle = (id: string) => {
    const previous = items;
    setItems(applyPlanTaskOp(items, { type: 'toggle', id }));
    void persist({ type: 'toggle', id }, previous);
  };

  const remove = (id: string) => {
    const previous = items;
    setItems(applyPlanTaskOp(items, { type: 'remove', id }));
    void persist({ type: 'remove', id }, previous);
  };

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim().slice(0, MAX_TEXT);
    if (!text || items.length >= MAX_TASKS) return;
    const previous = items;
    const task = { id: createId('task'), text, done: false };
    setItems(applyPlanTaskOp(items, { type: 'add', task }));
    setDraft('');
    void persist({ type: 'add', task }, previous);
    inputRef.current?.focus();
  };

  const done = items.filter((task) => task.done).length;
  const total = items.length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;
  const allDone = total > 0 && done === total;

  return (
    <section className={`admin-panel adm-card today-plan${saving ? ' is-saving' : ''}`} aria-label="План на сегодня">
      <header className="adm-card__head adm-card__head--row">
        <div>
          <h3 className="admin-card-title"><ListChecks aria-hidden="true" /> План на сегодня</h3>
          <p className="admin-hint">Что нужно сделать сегодня. Отметки сразу уходят в планер.</p>
        </div>
        <div className="today-plan__head-actions">
          {streak > 1 && (
            <span
              className="today-plan__streak"
              title="Дней подряд, когда план закрывался полностью. День без задач стрик не обрывает."
            >
              <Flame aria-hidden="true" /> {withPlural(streak, ['день', 'дня', 'дней'])} подряд
            </span>
          )}
          <button type="button" className="admin-button admin-button--quiet" onClick={onNavigate}>
            Вся неделя <ArrowRight aria-hidden="true" />
          </button>
        </div>
      </header>

      {total > 0 && (
        <div className="today-plan__progress">
          <div className="today-plan__bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label="Выполнено задач плана">
            <span style={{ width: `${progress}%` }} />
          </div>
          <span className="today-plan__count">{done} из {total}</span>
        </div>
      )}

      {error ? <div className="admin-notice admin-notice--danger" role="alert">{error}</div> : null}

      {total === 0 ? (
        <div className="today-plan__empty">
          <Sparkles aria-hidden="true" />
          <div>
            <strong>Плана на сегодня ещё нет</strong>
            <p>Запиши две-три главные задачи — они появятся и здесь, и в планере.</p>
          </div>
        </div>
      ) : (
        <ul className="today-plan__list">
          {items.map((task) => (
            <li key={task.id} className={task.done ? 'is-done' : ''}>
              <button
                type="button"
                className="today-plan__check"
                aria-pressed={task.done}
                aria-label={task.done ? `Снять отметку: ${task.text}` : `Отметить выполненной: ${task.text}`}
                disabled={saving}
                onClick={() => toggle(task.id)}
              >
                <Check aria-hidden="true" />
              </button>
              <span className="today-plan__text">{task.text}</span>
              <button
                type="button"
                className="today-plan__remove"
                aria-label={`Убрать задачу: ${task.text}`}
                title="Убрать задачу"
                disabled={saving}
                onClick={() => remove(task.id)}
              >
                <X aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {allDone && (
        <p className="today-plan__done" role="status">План на сегодня закрыт полностью. Можно выдохнуть.</p>
      )}

      {items.length < MAX_TASKS && (
        <form className="today-plan__add" onSubmit={add}>
          <Plus aria-hidden="true" />
          <input
            ref={inputRef}
            value={draft}
            maxLength={MAX_TEXT}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Добавить задачу на сегодня"
            aria-label="Новая задача на сегодня"
            disabled={saving}
          />
          <button type="submit" className="admin-button admin-button--primary" disabled={saving || !draft.trim()}>
            Добавить
          </button>
        </form>
      )}
    </section>
  );
}
