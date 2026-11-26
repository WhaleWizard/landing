import { useEffect, useRef, type ReactNode } from 'react';
import { typographText } from '../utils/typography';

/** Цветная часть заголовка по умолчанию — тот же градиент, что был в разметке разделов. */
export const ACCENT_TITLE_GRADIENT = 'bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-transparent';

/**
 * Короткое слово в конце обычной части: «Реклама, аналитика и» + «регулярная
 * оптимизация». Оно уезжает на строку вместе с цветной частью, иначе «и»
 * повисло бы в конце первой строки.
 */
const TRAILING_SHORT_WORD = /^([\s\S]*?)[\s ]+(а|в|во|да|до|за|и|из|к|ко|на|но|о|об|от|по|с|со|у|без|для|над|под|при|про|или|перед|через|после|между|около)$/iu;

/** Подгонка заголовков разделов на любой ширине (FX-13, docs/DESIGN_TYPOGRAPHY_RULES.md). */
const MOBILE_QUERY = '(max-width: 767px)';
/** Телефон: одна строка — если кегль при этом не меньше 20 px. */
const ONE_LINE_MIN_PX = 20;
/** Компьютер: ради одной строки кегль уменьшается не больше чем до 72 % задуманного. */
const DESKTOP_ONE_LINE_RATIO = 0.72;
/** Заголовок раздела на телефоне не крупнее 26 px. */
const MOBILE_CAP_PX = 26;
/** Ниже этого кегля не уменьшаем: длинный заголовок тогда займёт три строки. */
const FLOOR_PX = 16;
/** Запас на округление ширины глифов. */
const SAFETY = 0.97;
const FIT_ATTRIBUTE = 'data-ww-accent-fit';

/** Слово через дефис («онлайн-школ», «люкс-сегмента») не рвётся по дефису. */
const HYPHENATED_WORD = /[\p{L}\d]+(?:-[\p{L}\d]+)+/gu;

function keepHyphenatedWords(text: string): ReactNode {
  if (!text.includes('-')) return text;
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(HYPHENATED_WORD)) {
    const index = match.index ?? 0;
    if (index > last) parts.push(text.slice(last, index));
    parts.push(<span key={index} className="whitespace-nowrap">{match[0]}</span>);
    last = index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

let measureContext: CanvasRenderingContext2D | null = null;

function textWidth(text: string, font: string): number {
  if (!measureContext) measureContext = document.createElement('canvas').getContext('2d');
  if (!measureContext) return 0;
  measureContext.font = font;
  return measureContext.measureText(text).width;
}

function clearFit(heading: HTMLElement) {
  heading.removeAttribute(FIT_ATTRIBUTE);
  heading.style.removeProperty('--ww-title-size');
  heading.style.removeProperty('--ww-title-max');
}

/**
 * Кегль и способ переноса заголовка раздела.
 *
 * Правило владельца (26–27.11.2026), одинаковое для всех страниц: одна строка,
 * если для неё кегль не нужно уменьшать сильнее, чем до 72 % задуманного на
 * компьютере или до 20 px на телефоне; иначе ровно две строки с переносом по
 * смыслу — между обычной и цветной частью; три строки — только если и это не
 * помещается даже на 16 px. На телефоне заголовок не крупнее 26 px.
 *
 * Ширина берётся из задуманной вёрстки (подгонка на время замера снимается) и
 * фиксируется: иначе ограничение ширины в `ch` сжималось бы вместе с кеглем, и
 * подгонка гонялась бы сама за собой. Ширина текста — canvas-замер шрифтом
 * самого заголовка. Вызывается в кадре анимации, а не в ResizeObserver.
 */
function fitHeading(heading: HTMLElement) {
  const mobile = window.matchMedia(MOBILE_QUERY).matches;
  clearFit(heading);
  // Заголовок первого экрана мог получить кегль до JavaScript от встроенного
  // скрипта (scripts/title-prefit.js, с !important). Раньше его снимала старая
  // подгонка; для заголовков AccentTitle она отключена — снимаем здесь, иначе
  // предварительный кегль перебивал правило навсегда.
  if (heading.hasAttribute('data-ww-title-prefit')) {
    heading.removeAttribute('data-ww-title-prefit');
    if (heading.style.getPropertyPriority('font-size') === 'important') heading.style.removeProperty('font-size');
  }
  const style = getComputedStyle(heading);
  const designed = parseFloat(style.fontSize) || MOBILE_CAP_PX;
  const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  // На телефоне узкая колонка в `ch` давала лишнюю строку — берём ширину родителя.
  const box = mobile ? (heading.parentElement ?? heading) : heading;
  const boxStyle = mobile ? getComputedStyle(box) : style;
  const boxPadding = mobile
    ? (parseFloat(boxStyle.paddingLeft) || 0) + (parseFloat(boxStyle.paddingRight) || 0)
    : padding;
  const width = box.clientWidth - boxPadding;
  if (width <= 0) return;

  const font = `${style.fontStyle} ${style.fontWeight} 100px ${style.fontFamily}`;
  const spacingEm = style.letterSpacing === 'normal' ? 0 : (parseFloat(style.letterSpacing) || 0) / designed;
  const measure = (text: string) => textWidth(text, font) + spacingEm * 100 * text.length;

  const head = heading.querySelector<HTMLElement>('[data-ww-title-head]')?.textContent?.trim() ?? '';
  const group = heading.querySelector<HTMLElement>('.ww-title-accent-group')?.textContent?.trim() ?? '';
  const full = [head, group].filter(Boolean).join(' ');
  const cap = mobile ? Math.min(designed, MOBILE_CAP_PX) : designed;
  const oneLineMin = mobile ? ONE_LINE_MIN_PX : Math.max(ONE_LINE_MIN_PX, designed * DESKTOP_ONE_LINE_RATIO);
  const sizeFor = (widthAt100: number) => (widthAt100 > 0 ? (width * 100 / widthAt100) * SAFETY : cap);

  const oneLine = sizeFor(measure(full));
  let nextMode: 'one' | 'split' | 'free';
  let size: number;
  if (oneLine >= oneLineMin) {
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
    const groupWords = group.split(/[\s\u00A0]+/).filter(Boolean).length;
    if (groupWords > 1 && boundary <= best * 1.25) {
      nextMode = 'split';
      size = Math.min(cap, sizeFor(boundary));
    } else {
      nextMode = 'free';
      size = Math.min(cap, sizeFor(best));
    }
  }
  // Подгонка только уменьшает: мелкий по замыслу заголовок не растёт до порога.
  size = Math.min(cap, Math.max(Math.min(FLOOR_PX, cap), Math.floor(size * 10) / 10));
  heading.style.setProperty('--ww-title-size', `${size}px`);
  heading.style.setProperty('--ww-title-max', mobile ? 'none' : `${Math.round(width + padding)}px`);
  heading.setAttribute(FIT_ATTRIBUTE, nextMode);
}

/**
 * Заголовок раздела «обычная часть + цветная часть» с переносом по смыслу.
 *
 * На любой ширине кегль подбирается так, чтобы заголовок занял одну строку
 * или ровно две, с переносом между частями (см. fitHeading). Без JavaScript —
 * обычная вёрстка: цветная часть переносится целиком. Короткие предлоги и
 * союзы привязаны к следующему слову (`typographText`).
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
    // Без медиазапросов (старый браузер, тесты) — обычная вёрстка, без подгонки.
    if (!heading || typeof window.matchMedia !== 'function') return undefined;
    let frame = 0;
    let lastWidth = window.innerWidth;
    const run = () => { frame = 0; fitHeading(heading); };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(run); };
    // Пересчёт — только при смене ширины окна: высота меняется от адресной
    // строки iPhone при каждой прокрутке, и пересчёт на ней дёргал бы страницу.
    const onResize = () => {
      if (Math.abs(window.innerWidth - lastWidth) < 1) return;
      lastWidth = window.innerWidth;
      schedule();
    };
    schedule();
    // Веб-шрифт мог доехать после первого замера — меряем ещё раз.
    void document.fonts?.ready.then(schedule);
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      clearFit(heading);
    };
  }, [fullPrefix, accentText]);

  if (!accentText) {
    return <span ref={anchorRef} data-ww-title-head="">{keepHyphenatedWords(fullPrefix)}</span>;
  }
  return (
    <>
      <span ref={anchorRef} data-ww-title-head="">{keepHyphenatedWords(head)}</span>
      {head ? ' ' : null}
      {head ? <br className="ww-title-break" aria-hidden="true" /> : null}
      <span className="ww-title-accent-group">
        {tail ? `${tail} ` : null}
        <span className={accentClassName}>{keepHyphenatedWords(accentText)}</span>
      </span>
    </>
  );
}
