import { useCallback, useEffect, useRef, useState } from 'react';
import { NotebookPen, Plus, X } from 'lucide-react';
import { createId, normalizeWeekData, type PlannerWeekData } from './plannerModel';

export interface DayNote {
  id: string;
  text: string;
}

const MAX_NOTES = 10;
const MAX_TEXT = 500;

/**
 * Быстрая заметка дня: мысль, договорённость или напоминание, которые жалко
 * потерять, но заводить ради них задачу незачем.
 *
 * Отдельного хранилища у заметки нет — она пишется в заметки этого же дня в
 * планере. Значит, записанное здесь видно и там, а не живёт двумя списками.
 * Сохранение идёт тем же циклом «перечитать неделю → изменить нужный день →
 * записать целиком»: иначе правка затёрла бы то, что записал сам планер.
 */
export default function TodayNote({
  password,
  notes,
  weekStart,
  dayIndex,
  onSaved,
}: {
  password: string;
  notes: DayNote[];
  weekStart: string;
  dayIndex: number;
  onSaved: () => void;
}) {
  const [items, setItems] = useState<DayNote[]>(notes);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setItems(notes); }, [notes]);

  const persist = useCallback(async (next: DayNote[], previous: DayNote[]) => {
    setSaving(true);
    setError('');
    try {
      const readResponse = await fetch(`/api/admin/planner?week=${encodeURIComponent(weekStart)}`, {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const readPayload = await readResponse.json().catch(() => null) as { success?: boolean; error?: string; data?: unknown } | null;
      if (!readResponse.ok || !readPayload?.success) throw new Error(readPayload?.error || `HTTP ${readResponse.status}`);

      const week: PlannerWeekData = normalizeWeekData(readPayload.data);
      week.days[dayIndex] = {
        ...week.days[dayIndex],
        notes: next.map((note) => ({ id: note.id, text: note.text })),
      };

      const saveResponse = await fetch('/api/admin/planner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
        credentials: 'same-origin',
        body: JSON.stringify({ week: weekStart, data: week }),
      });
      const savePayload = await saveResponse.json().catch(() => null) as { success?: boolean; error?: string } | null;
      if (!saveResponse.ok || !savePayload?.success) throw new Error(savePayload?.error || `HTTP ${saveResponse.status}`);
      onSaved();
    } catch (saveError) {
      // Откат: на экране не должно остаться записи, которой нет в базе.
      setItems(previous);
      setError(saveError instanceof Error ? saveError.message : 'Не удалось сохранить заметку');
    } finally {
      setSaving(false);
    }
  }, [dayIndex, onSaved, password, weekStart]);

  const add = (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim().slice(0, MAX_TEXT);
    if (!text || items.length >= MAX_NOTES) return;
    const previous = items;
    const next = [...items, { id: createId('note'), text }];
    setItems(next);
    setDraft('');
    void persist(next, previous);
    inputRef.current?.focus();
  };

  const remove = (id: string) => {
    const previous = items;
    const next = items.filter((note) => note.id !== id);
    setItems(next);
    void persist(next, previous);
  };

  return (
    <section className={`admin-panel adm-card today-note${saving ? ' is-saving' : ''}`} aria-label="Заметка дня">
      <header className="adm-card__head">
        <h3 className="admin-card-title"><NotebookPen aria-hidden="true" /> Заметка дня</h3>
        <p className="admin-hint">Мысль или договорённость, которую жалко потерять. Попадает в заметки этого дня в планере.</p>
      </header>

      {error ? <div className="admin-notice admin-notice--danger" role="alert">{error}</div> : null}

      {items.length > 0 && (
        <ul className="today-note__list">
          {items.map((note) => (
            <li key={note.id}>
              <span>{note.text}</span>
              <button
                type="button"
                className="today-note__remove"
                aria-label={`Убрать заметку: ${note.text.slice(0, 40)}`}
                title="Убрать заметку"
                disabled={saving}
                onClick={() => remove(note.id)}
              >
                <X aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {items.length < MAX_NOTES && (
        <form className="today-note__add" onSubmit={add}>
          <Plus aria-hidden="true" />
          <input
            ref={inputRef}
            value={draft}
            maxLength={MAX_TEXT}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Записать мысль на сегодня"
            aria-label="Новая заметка на сегодня"
            disabled={saving}
          />
          <button type="submit" className="admin-button admin-button--primary" disabled={saving || !draft.trim()}>
            Записать
          </button>
        </form>
      )}
    </section>
  );
}
