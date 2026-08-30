import { useEffect, useRef, type ReactNode } from 'react';
import { preferredScrollBehavior } from '../../utils/motionPreference';

// Каркас юридического документа: оглавление, разделы-аккордеоны, прогресс
// чтения. Разделы — нативные <details>, поэтому весь текст остаётся в HTML
// (важно для SEO-версии страниц), а сворачивание работает даже без JS.
export type LegalSection = {
  title: string;
  body: ReactNode;
  important?: boolean;
};

type LegalDocProps = {
  intro?: ReactNode;
  sections: LegalSection[];
  /** Префикс для якорей, чтобы два документа на одной странице не конфликтовали */
  idPrefix: string;
};

function splitTitle(title: string): { num: string | null; text: string } {
  const match = title.match(/^(\d+)\.\s*(.*)$/);
  if (!match) return { num: null, text: title };
  return { num: match[1], text: match[2] };
}

export default function LegalDoc({ intro, sections, idPrefix }: LegalDocProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLSpanElement>(null);

  // Прогресс чтения: слушаем ближайшего скроллящегося родителя
  // (в попапе это тело модалки, на странице — окно).
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let scrollParent: HTMLElement | null = root.parentElement;
    while (scrollParent) {
      const { overflowY } = getComputedStyle(scrollParent);
      if (overflowY === 'auto' || overflowY === 'scroll') break;
      scrollParent = scrollParent.parentElement;
    }

    const target: HTMLElement | Window = scrollParent ?? window;
    let frame = 0;

    const update = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        const scrollTop = scrollParent ? scrollParent.scrollTop : window.scrollY;
        const max = scrollParent
          ? scrollParent.scrollHeight - scrollParent.clientHeight
          : document.documentElement.scrollHeight - window.innerHeight;
        const progress = max > 0 ? Math.min(1, Math.max(0, scrollTop / max)) : 0;
        progressRef.current?.style.setProperty('--legal-progress', String(progress));
      });
    };

    update();
    target.addEventListener('scroll', update, { passive: true });
    // Высота меняется при раскрытии разделов
    const toggles = Array.from(root.querySelectorAll('details'));
    toggles.forEach((d) => d.addEventListener('toggle', update));

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      target.removeEventListener('scroll', update);
      toggles.forEach((d) => d.removeEventListener('toggle', update));
    };
  }, []);

  const sectionId = (index: number) => `${idPrefix}-sec-${index + 1}`;

  const openSection = (index: number) => {
    const el = rootRef.current?.querySelector<HTMLDetailsElement>(`#${sectionId(index)}`);
    if (!el) return;
    el.open = true;
    el.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'start' });
  };

  const setAll = (open: boolean) => {
    rootRef.current
      ?.querySelectorAll<HTMLDetailsElement>('details.legal-sec')
      .forEach((d) => { d.open = open; });
  };

  return (
    <div ref={rootRef} className="legal-doc">
      <div className="legal-progress" aria-hidden="true">
        <span ref={progressRef} />
      </div>

      {intro ? <div className="legal-intro">{intro}</div> : null}

      <details className="legal-toc">
        <summary>Содержание</summary>
        <ol>
          {sections.map((section, index) => (
            <li key={section.title}>
              <a
                href={`#${sectionId(index)}`}
                onClick={(event) => {
                  event.preventDefault();
                  openSection(index);
                }}
              >
                {section.title}
                {section.important ? <em className="legal-badge">важно</em> : null}
              </a>
            </li>
          ))}
        </ol>
      </details>

      <div className="legal-controls">
        <button type="button" onClick={() => setAll(true)}>Развернуть всё</button>
        <span aria-hidden="true">·</span>
        <button type="button" onClick={() => setAll(false)}>Свернуть всё</button>
      </div>

      {sections.map((section, index) => {
        const { num, text } = splitTitle(section.title);
        return (
          <details
            key={section.title}
            id={sectionId(index)}
            className={`legal-sec${section.important ? ' legal-sec-important' : ''}`}
            open={index === 0}
          >
            <summary>
              {num ? <span className="legal-num" aria-hidden="true">{num}</span> : null}
              <span className="legal-sec-title">
                {text}
                {section.important ? <em className="legal-badge">важно</em> : null}
              </span>
              <span className="legal-chevron" aria-hidden="true" />
            </summary>
            <div className="legal-sec-body">{section.body}</div>
          </details>
        );
      })}
    </div>
  );
}
