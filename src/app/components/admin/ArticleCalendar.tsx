import { memo, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import type { Article } from '../hooks/useArticlesApi';
import { ownerToday } from '../../utils/publishSchedule';

/**
 * Календарь публикаций: когда что вышло и что стоит в очереди.
 * Список статей отвечает на вопрос «что у меня есть», календарь — на вопрос
 * «когда я публиковал и где дыра в месяц без единого материала».
 *
 * В сетку попадают только материалы с точной датой публикации (`publishedAt`).
 * Поле `date` — человеческая подпись вида «август 2026», дня в ней нет,
 * и ставить такие статьи в конкретную клетку было бы выдумкой.
 *
 * Черновики в сетку не попадают: на сайте их нет, и точка «вышедшая» у
 * шестисот импортированных черновиков прятала бы настоящие дыры в графике.
 * Сколько их осталось за сеткой, написано под календарём.
 */

const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'] as const;

const monthFormatter = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });

function currentMonth(): Date {
  return new Date(`${ownerToday().slice(0, 7)}-01T00:00:00Z`);
}

function shiftMonth(date: Date, months: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function hasExactDate(article: Article): boolean {
  return Boolean(article.publishedAt) && !Number.isNaN(new Date(article.publishedAt || '').getTime());
}

function ArticleCalendar({
  articles,
  onOpen,
}: {
  articles: Article[];
  onOpen: (article: Article) => void;
}) {
  const [month, setMonth] = useState(currentMonth);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(10);

  const byDay = useMemo(() => {
    const map = new Map<string, Article[]>();
    articles.forEach((article) => {
      // Черновик с датой — это не публикация в этот день, а заготовка.
      if (article.status === 'draft' || !hasExactDate(article)) return;
      const key = ownerToday(Date.parse(article.publishedAt || ''));
      const list = map.get(key);
      if (list) list.push(article);
      else map.set(key, [article]);
    });
    return map;
  }, [articles]);

  const drafts = useMemo(() => articles.filter((article) => article.status === 'draft').length, [articles]);
  // Опубликованные без точной даты — отдельная цифра: черновики в неё не входят.
  const withoutDate = useMemo(
    () => articles.filter((article) => article.status !== 'draft' && !hasExactDate(article)).length,
    [articles],
  );
  const outsideNote = [
    withoutDate > 0 ? `Без точной даты публикации: ${withoutDate}. Такие материалы в сетку не попадают.` : '',
    drafts > 0 ? `Черновиков вне сетки: ${drafts} — они ещё не вышли.` : '',
  ].filter(Boolean).join(' ');

  // Сетка начинается с понедельника той недели, в которую попало первое число.
  const cells = useMemo(() => {
    const weekday = month.getUTCDay();
    const lead = weekday === 0 ? 6 : weekday - 1;
    return Array.from({ length: 42 }, (_, index) => (
      new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1 - lead + index))
    ));
  }, [month]);

  const todayKey = ownerToday();
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
          const key = date.toISOString().slice(0, 10);
          const day = date.getUTCDate();
          const items = byDay.get(key) || [];
          const outside = date.getUTCMonth() !== month.getUTCMonth();
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
              aria-label={items.length ? `${day}: публикаций — ${items.length}` : String(day)}
              aria-pressed={items.length ? selectedDay === key : undefined}
              onClick={() => {
                setVisibleCount(10);
                setSelectedDay((current) => (current === key ? null : key));
              }}
            >
              <span className="article-calendar__num">{day}</span>
              {items.length > 0 && <span className="article-calendar__dot">{items.length > 1 ? items.length : ''}</span>}
            </button>
          );
        })}
      </div>

      {selected.length > 0 && (
        <ul className="article-calendar__list">
          {selected.slice(0, visibleCount).map((article) => (
            <li key={article.slug}>
              <button type="button" onClick={() => onOpen(article)}>
                {article.title || article.slug}
              </button>
            </li>
          ))}
          {selected.length > visibleCount && (
            <li><button type="button" onClick={() => setVisibleCount((count) => count + 10)}>
              Показать ещё {Math.min(10, selected.length - visibleCount)}
            </button></li>
          )}
        </ul>
      )}

      <p className="article-calendar__note">
        <CalendarDays aria-hidden="true" />
        {outsideNote || 'Точка — вышедшая публикация, светлая точка — запланированная.'}
      </p>
    </section>
  );
}

// memo: список статей меняется редко, а обработчик открытия приходит
// стабильным — иначе календарь перерисовывался на каждую букву в редакторе.
export default memo(ArticleCalendar);
