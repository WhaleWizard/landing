import { ArrowLeft, ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router';
import { useReturnTo, withReturnTo } from '../utils/siteNavigation';

export type Crumb = {
  label: string;
  /** Без to последняя крошка отрисуется как текущая страница. */
  to?: string;
};

type PageNavProps = {
  crumbs: Crumb[];
  /** Куда вести кнопку «Назад», если источник перехода неизвестен. */
  backFallback?: string;
  /** Скрыть кнопку «Назад» — например, когда рядом уже есть своя. */
  hideBack?: boolean;
  className?: string;
};

/**
 * Верхняя строка навигации: кнопка «Назад в …» + хлебные крошки.
 * Кнопка возвращает туда, откуда пользователь реально пришёл (см. useReturnTo),
 * крошки показывают место страницы в структуре сайта.
 *
 * Мобильная раскладка: кнопка и крошки — отдельными строками, длинные названия
 * обрезаются многоточием, поэтому текст не наезжает друг на друга даже на 320px.
 */
export default function PageNav({ crumbs, backFallback, hideBack = false, className = '' }: PageNavProps) {
  const location = useLocation();
  const back = useReturnTo(backFallback);
  const linkState = withReturnTo(location);

  return (
    <div className={`flex flex-col gap-2.5 text-[13px] text-muted-foreground sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5 ${className}`}>
      {!hideBack && (
        <button
          type="button"
          onClick={back.goBack}
          className="inline-flex min-h-11 max-w-full shrink-0 items-center gap-2 self-start rounded-xl border border-border/70 bg-background/40 px-3 transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{back.buttonLabel}</span>
        </button>
      )}

      <nav aria-label="Хлебные крошки" className="flex min-w-0 items-center gap-1.5">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            // Сжиматься разрешено только последней крошке — она и обрезается
            // многоточием. У остальных без shrink-0 флекс ужимал сам блок, текст
            // из него вылезал и наезжал на соседнюю крошку.
            <span key={`${crumb.label}-${index}`} className={`flex items-center gap-1.5 ${isLast ? 'min-w-0' : 'shrink-0'}`}>
              {index > 0 && (
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              {crumb.to && !isLast ? (
                <Link
                  to={crumb.to}
                  state={linkState}
                  className="inline-flex min-h-11 shrink-0 items-center rounded-lg transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
                >
                  {crumb.label}
                </Link>
              ) : (
                // Именно block, а не inline-flex: многоточие не работает,
                // когда текст лежит внутри флекс-контейнера.
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className={`block min-w-0 leading-[44px] ${isLast ? 'truncate text-foreground/75' : ''}`}
                  title={isLast ? crumb.label : undefined}
                >
                  {crumb.label}
                </span>
              )}
            </span>
          );
        })}
      </nav>
    </div>
  );
}
