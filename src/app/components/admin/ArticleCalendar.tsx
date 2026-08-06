import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import type { Article } from '../hooks/useArticlesApi';

/**
 * Календарь публикаций: когда что вышло и что стоит в очереди.
 * Список статей отвечает на вопрос «что у меня есть», календарь — на вопрос
 * «когда я публиковал и где дыра в месяц без единого материала».
 *
 * В сетку попадают только материалы с точной датой публикации (`publishedAt`).
 * Поле `date` — человеческая подпись вида «август 2026», дня в ней нет,
 * и ставить такие статьи в конкретную клетку было бы выдумкой.
 */

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;

const monthFormatter = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function shiftMonth(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export default function ArticleCalendar({
  articles,
  onOpen,
}: {
  articles: Article[];
  onOpen: (article: Article) => void;
}) {
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, Article[]>();
    articles.forEach((article) => {
      if (!article.publishedAt) return;
      const parsed = new Date(article.publishedAt);
      if (Number.isNaN(parsed.getTime())) return;
      const key = localDayKey(parsed);
      const list = map.get(key);
      if (list) list.push(article);
      else map.set(key, [article]);
    });
    return map;
  }, [articles]);

  const withoutDate = useMemo(
    () => articles.filter((article) => !article.publishedAt || Number.isNaN(new Date(article.publishedAt).getTime())).length,
    [articles],
  );

  // Сетка начинается с понедельника той недели, в которую попало первое число.
  const cells = useMemo(() => {
    const first = startOfMonth(month);
    const weekday = first.getDay();
    const lead = weekday === 0 ? 6 : weekday - 1;
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - lead);
    return Array.from({ length: 42 }, (_, index) => (
      new Date(start.getFullYear(), start.getMonth(), start.getDate() + index)
    ));
  }, [month]);

  const todayKey = localDayKey(new Date());
  const now = Date.now();
  const selected = selectedDay ? byDay.get(selectedDay) || [] : [];

  return (
    <section className="article-calendar" aria-label="Календарь публикаций">
      <header className="article-calendar__head">
        <button
          type="button"
          className="admin-icon-button"
          onClick={() => { setMonth((current) => shiftMonth(current, -1)); setSelectedDay(null); }}
          aria-label="Предыдущий месяц"
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <strong className="article-calendar__month">{monthFormatter.format(month)}</strong>
        <button
          type="button"
          className="admin-icon-button"
          onClick={() => { setMonth((current) => shiftMonth(current, 1)); setSelectedDay(null); }}
          aria-label="Следующий месяц"
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </header>

      <div className="article-calendar__weekdays" aria-hidden="true">
        {WEEKDAYS.map((day) => <span key={day}>{day}</span>)}
      </div>

      <div className="article-calendar__grid">
        {cells.map((date) => {
          const key = localDayKey(date);
          const items = byDay.get(key) || [];
          const outside = date.getMonth() !== month.getMonth();
          const planned = items.length > 0 && items.every((article) => new Date(article.publishedAt || 0).getTime() > now);
          const title = items.length
            ? items.map((article) => article.title || article.slug).join('\n')
            : undefined;
          return (
            <button
              key={key}
              type="button"
              className="article-calendar__day"
              data-outside={outside || undefined}
              data-today={key === todayKey || undefined}
              data-has={items.length ? (planned ? 'planned' : 'published') : undefined}
              data-selected={selectedDay === key || undefined}
              disabled={items.length === 0}
              title={title}
              aria-label={items.length ? `${date.getDate()}: публикаций — ${items.length}` : String(date.getDate())}
              onClick={() => setSelectedDay((current) => (current === key ? null : key))}
            >
              <span className="article-calendar__num">{date.getDate()}</span>
              {items.length > 0 && <span className="article-calendar__dot">{items.length > 1 ? items.length : ''}</span>}
            </button>
          );
        })}
      </div>

      {selected.length > 0 && (
        <ul className="article-calendar__list">
          {/* Разовый импорт кладёт десятки материалов на одну дату — весь
              список раздул бы колонку, поэтому показываем первые десять. */}
          {selected.slice(0, 10).map((article) => (
            <li key={article.slug}>
              <button type="button" onClick={() => onOpen(article)}>
                {article.title || article.slug}
              </button>
            </li>
          ))}
          {selected.length > 10 && (
            <li className="article-calendar__more">и ещё {selected.length - 10} в этот день</li>
          )}
        </ul>
      )}

      <p className="article-calendar__note">
        <CalendarDays aria-hidden="true" />
        {withoutDate > 0
          ? `Без точной даты публикации: ${withoutDate}. Такие материалы в сетку не попадают.`
          : 'Точка — вышедшая публикация, светлая точка — запланированная.'}
      </p>
    </section>
  );
}
