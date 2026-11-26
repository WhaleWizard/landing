import { useEffect, useRef } from 'react';
import { typographText } from '../utils/typography';

/** Цветная часть заголовка по умолчанию — тот же градиент, что был в разметке разделов. */
export const ACCENT_TITLE_GRADIENT = 'bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent';

/**
 * Короткое слово в конце обычной части: «Реклама, аналитика и» + «регулярная
 * оптимизация». Оно уезжает на строку вместе с цветной частью, иначе «и»
 * повисло бы в конце первой строки.
 */
const TRAILING_SHORT_WORD = /^([\s\S]*?)[\s ]+(а|в|во|да|до|за|и|из|к|ко|на|но|о|об|от|по|с|со|у|без|для|над|под|при|про|или|перед|через|после|между|около)$/iu;

/** Подгонка заголовков на телефоне (FX-13). */
const MOBILE_QUERY = '(max-width: 767px)';
/** Одна строка — если кегль при этом не меньше 20 px. */
const ONE_LINE_MIN_PX = 20;
/** Заголовок раздела на телефоне не крупнее 26 px. */
const MOBILE_CAP_PX = 26;
/** Ниже этого кегля не уменьшаем: длинный заголовок тогда займёт три строки. */
const FLOOR_PX = 16;
/** Запас на округление ширины глифов. */
const SAFETY = 0.97;

let measureContext: CanvasRenderingContext2D | null = null;

function textWidth(text: string, font: string): number {
  if (!measureContext) measureContext = document.createElement('canvas').getContext('2d');
  if (!measureContext) return 0;
  measureContext.font = font;
  return measureContext.measureText(text).width;
}

/**
 * Кегль и способ переноса для телефона.
 *
 * Правило владельца (26.11.2026): заголовок раздела — одна строка, если она
 * помещается при кегле от 20 px; иначе ровно две строки с переносом по смыслу —
 * между обычной и цветной частью; три строки — только если и это не помещается
 * даже на 16 px. Ширины меряются шрифтом самого заголовка (canvas), без чтения
 * раскладки страницы.
 */
function fitHeading(heading: HTMLElement, width: number) {
  if (!window.matchMedia(MOBILE_QUERY).matches || width <= 0) {
    heading.removeAttribute('data-ww-accent-fit');
    heading.style.removeProperty('--ww-title-size');
    return;
  }
  // Задуманный кегль — без нашей подгонки.
  const mode = heading.getAttribute('data-ww-accent-fit');
  if (mode) heading.removeAttribute('data-ww-accent-fit');
  const style = getComputedStyle(heading);
  const designed = parseFloat(style.fontSize) || MOBILE_CAP_PX;
  if (mode) heading.setAttribute('data-ww-accent-fit', mode);

  const font = `${style.fontStyle} ${style.fontWeight} 100px ${style.fontFamily}`;
  const spacingEm = style.letterSpacing === 'normal' ? 0 : (parseFloat(style.letterSpacing) || 0) / designed;
  const measure = (text: string) => textWidth(text, font) + spacingEm * 100 * text.length;

  const head = heading.querySelector<HTMLElement>('[data-ww-title-head]')?.textContent?.trim() ?? '';
  const group = heading.querySelector<HTMLElement>('.ww-title-accent-group')?.textContent?.trim() ?? '';
  const full = [head, group].filter(Boolean).join(' ');
  const cap = Math.min(designed, MOBILE_CAP_PX);
  const sizeFor = (widthAt100: number) => (widthAt100 > 0 ? (width * 100 / widthAt100) * SAFETY : cap);

  const oneLine = sizeFor(measure(full));
  let nextMode: 'one' | 'split' | 'free';
  let size: number;
  if (oneLine >= ONE_LINE_MIN_PX) {
    nextMode = 'one';
    size = Math.min(cap, oneLine);
  } else {
    // Самый ровный перенос на две строки по обычным пробелам (неразрывные —
    // это привязанные предлоги, их не рвём).
    const words = full.split(' ');
    let best = Number.POSITIVE_INFINITY;
    for (let i = 1; i < words.length; i += 1) {
      best = Math.min(best, Math.max(measure(words.slice(0, i).join(' ')), measure(words.slice(i).join(' '))));
    }
    const boundary = head && group ? Math.max(measure(head), measure(group)) : Number.POSITIVE_INFINITY;
    // Граница частей — смысловой перенос; берём её, если строки не слишком
    // неровные (не больше чем на 25 % шире самого ровного варианта). Иначе
    // одно слово осталось бы одно: «Два ориентира перед запуском / рекламы».
    // Цветная часть из одного слова на своей строке — то же одинокое слово.
    const groupWords = group.split(/[\s ]+/).filter(Boolean).length;
    if (groupWords > 1 && boundary <= best * 1.25) {
      nextMode = 'split';
      size = Math.min(cap, sizeFor(boundary));
    } else {
      nextMode = 'free';
      size = Math.min(cap, sizeFor(best));
    }
  }
  size = Math.max(FLOOR_PX, Math.floor(size * 10) / 10);
  heading.style.setProperty('--ww-title-size', `${size}px`);
  heading.setAttribute('data-ww-accent-fit', nextMode);
}

/**
 * Заголовок раздела «обычная часть + цветная часть» с переносом по смыслу.
 *
 * На компьютере: помещается в строку — одна строка, нет — цветная часть уходит
 * на следующую целиком. На телефоне кегль подбирается так, чтобы заголовок
 * занял одну строку или ровно две (см. fitHeading). Короткие предлоги и союзы
 * привязаны к следующему слову (`typographText`).
 */
export default function AccentTitle({
  prefix,
  accent,
  accentClassName = ACCENT_TITLE_GRADIENT,
}: {
  prefix?: string | null;
  accent?: string | null;
  accentClassName?: string;
}) {
  const fullPrefix = typographText(String(prefix ?? '').trim());
  const accentText = typographText(String(accent ?? '').trim());
  const match = accentText ? TRAILING_SHORT_WORD.exec(fullPrefix) : null;
  const head = match ? match[1] : fullPrefix;
  const tail = match ? match[2] : '';
  const anchorRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const heading = anchorRef.current?.closest<HTMLElement>('h1, h2, h3');
    // Без наблюдателя размеров или медиазапросов (старый браузер, тесты) —
    // заголовок остаётся в обычной вёрстке, без подгонки.
    if (!heading || typeof ResizeObserver === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    let frame = 0;
    let width = heading.clientWidth;
    const run = () => { frame = 0; fitHeading(heading, width); };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(run); };
    // Ширину берём из события наблюдателя, а не читаем раскладку в нём.
    const observer = new ResizeObserver((entries) => {
      const next = entries[entries.length - 1]?.contentRect.width ?? width;
      if (Math.abs(next - width) < 0.5 && heading.hasAttribute('data-ww-accent-fit')) return;
      width = next;
      schedule();
    });
    observer.observe(heading);
    schedule();
    // Веб-шрифт мог доехать после первого замера — меряем ещё раз.
    void document.fonts?.ready.then(schedule);
    const media = window.matchMedia(MOBILE_QUERY);
    media.addEventListener?.('change', schedule);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      observer.disconnect();
      media.removeEventListener?.('change', schedule);
      heading.removeAttribute('data-ww-accent-fit');
      heading.style.removeProperty('--ww-title-size');
    };
  }, [fullPrefix, accentText]);

  if (!accentText) {
    return <span ref={anchorRef} data-ww-title-head="">{fullPrefix}</span>;
  }
  return (
    <>
      <span ref={anchorRef} data-ww-title-head="">{head}</span>
      {head ? ' ' : null}
      {head ? <br className="ww-title-break" aria-hidden="true" /> : null}
      <span className="ww-title-accent-group">
        {tail ? `${tail} ` : null}
        <span className={accentClassName}>{accentText}</span>
      </span>
    </>
  );
}
