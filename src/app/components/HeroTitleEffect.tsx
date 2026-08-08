import type {
  CSSProperties,
  ElementType,
  HTMLAttributes,
  ReactNode,
} from 'react';
import {
  fontFamilyForContent,
  isContentFontId,
  type ContentFontId,
} from '../utils/contentTypography';
import '../../styles/hero-title-effects.css';

export const HERO_TITLE_EFFECTS = [
  'none',
  'fade-up',
  'fade-in',
  'slide-left',
  'slide-right',
  'blur-reveal',
  'typewriter',
  'words',
] as const;

export type HeroTitleEffect = (typeof HERO_TITLE_EFFECTS)[number];

export const HERO_TITLE_EFFECT_SPEEDS = ['slow', 'normal', 'fast'] as const;

export type HeroTitleEffectSpeed = (typeof HERO_TITLE_EFFECT_SPEEDS)[number];

export const HERO_TITLE_EFFECT_LABELS: Record<HeroTitleEffect, string> = {
  none: 'Без эффекта',
  'fade-up': 'Снизу вверх',
  'fade-in': 'Мягкое проявление',
  'slide-left': 'Появление слева',
  'slide-right': 'Появление справа',
  'blur-reveal': 'Из размытия',
  typewriter: 'Печатная машинка',
  words: 'Появление по словам',
};

export const HERO_TITLE_EFFECT_SPEED_LABELS: Record<HeroTitleEffectSpeed, string> = {
  slow: 'Медленно',
  normal: 'Обычно',
  fast: 'Быстро',
};

export const HERO_TITLE_EFFECT_OPTIONS = HERO_TITLE_EFFECTS.map((value) => ({
  value,
  label: HERO_TITLE_EFFECT_LABELS[value],
}));

export const HERO_TITLE_EFFECT_SPEED_OPTIONS = HERO_TITLE_EFFECT_SPEEDS.map((value) => ({
  value,
  label: HERO_TITLE_EFFECT_SPEED_LABELS[value],
}));

export type HeroTitleTone = 'default' | 'accent' | 'supporting';

/**
 * Строка заголовка. Шрифт, эффект и скорость необязательны: пустое значение
 * означает «как у всего заголовка», а заполненное перебивает общую настройку.
 * Так одна строка может быть рукописной и печататься по буквам, а соседняя —
 * оставаться обычной.
 */
export type HeroTitleLine = {
  text: string;
  tone?: HeroTitleTone;
  font?: ContentFontId;
  effect?: HeroTitleEffect;
  speed?: HeroTitleEffectSpeed;
};

export type HeroTitleAnimation = {
  effect?: HeroTitleEffect;
  speed?: HeroTitleEffectSpeed;
  delayMs?: number;
};

const effectSet = new Set<string>(HERO_TITLE_EFFECTS);
const speedSet = new Set<string>(HERO_TITLE_EFFECT_SPEEDS);

export function isHeroTitleEffect(value: unknown): value is HeroTitleEffect {
  return typeof value === 'string' && effectSet.has(value);
}

export function isHeroTitleEffectSpeed(value: unknown): value is HeroTitleEffectSpeed {
  return typeof value === 'string' && speedSet.has(value);
}

export function normalizeHeroTitleEffect(
  value: unknown,
  fallback: HeroTitleEffect = 'none',
): HeroTitleEffect {
  return isHeroTitleEffect(value) ? value : fallback;
}

export function normalizeHeroTitleEffectSpeed(
  value: unknown,
  fallback: HeroTitleEffectSpeed = 'normal',
): HeroTitleEffectSpeed {
  return isHeroTitleEffectSpeed(value) ? value : fallback;
}

/** Гарнитура конкретной строки; `auto` и мусор дают наследование. */
export function heroTitleLineFontStyle(font: unknown): CSSProperties | undefined {
  if (!isContentFontId(font) || font === 'auto') return undefined;
  return { fontFamily: fontFamilyForContent(font, 'title') };
}

/** Собирает итоговые настройки одной строки поверх настроек всего заголовка. */
export function resolveHeroTitleLine(
  line: HeroTitleLine | undefined,
  animation: HeroTitleAnimation | undefined,
  baseStyle?: CSSProperties,
): {
  effect: HeroTitleEffect;
  speed: HeroTitleEffectSpeed;
  delayMs: number | undefined;
  style: CSSProperties | undefined;
} {
  const source = animation || {};
  const fontStyle = heroTitleLineFontStyle(line?.font);
  return {
    effect: normalizeHeroTitleEffect(line?.effect, normalizeHeroTitleEffect(source.effect)),
    speed: normalizeHeroTitleEffectSpeed(line?.speed, normalizeHeroTitleEffectSpeed(source.speed)),
    delayMs: source.delayMs,
    style: baseStyle || fontStyle ? { ...baseStyle, ...fontStyle } : undefined,
  };
}

type HeroTitleEffectStyle = CSSProperties & {
  '--hero-title-character-count'?: number;
  '--hero-title-character-delay'?: string;
  '--hero-title-cursor-color'?: CSSProperties['color'];
  '--hero-title-delay'?: string;
  '--hero-title-word-index'?: number;
};

export type HeroTitleEffectSettings = {
  effect?: HeroTitleEffect | string | null;
  speed?: HeroTitleEffectSpeed | string | null;
  delayMs?: number;
  sequenceIndex?: number;
  sequenceGapMs?: number;
  characterCount?: number;
  cursor?: boolean;
  cursorColor?: CSSProperties['color'];
};

export type HeroTitleEffectAttributes = Pick<
  HTMLAttributes<HTMLElement>,
  'className' | 'style'
> & {
  'data-effect': HeroTitleEffect;
  'data-speed': HeroTitleEffectSpeed;
  'data-cursor'?: 'true';
};

const clampNumber = (value: number | undefined, minimum: number, maximum: number) => {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, value as number));
};

const countCharacters = (value: string) => Math.max(1, Array.from(value).length);

const joinClassNames = (...classNames: Array<string | undefined>) =>
  classNames.filter(Boolean).join(' ');

/**
 * Returns sanitized attributes for an existing heading or line element.
 * This keeps the original text node and element semantics intact.
 */
export function getHeroTitleEffectAttributes(
  settings: HeroTitleEffectSettings & {
    className?: string;
    style?: CSSProperties;
    text?: string;
  } = {},
): HeroTitleEffectAttributes {
  const {
    className,
    style,
    text = '',
    effect,
    speed,
    delayMs,
    sequenceIndex,
    sequenceGapMs,
    characterCount,
    cursor,
    cursorColor,
  } = settings;

  const safeEffect = normalizeHeroTitleEffect(effect);
  const safeSpeed = normalizeHeroTitleEffectSpeed(speed);
  const safeDelay = clampNumber(delayMs, 0, 10_000);
  const safeSequenceIndex = Math.round(clampNumber(sequenceIndex, 0, 20));
  const safeSequenceGap = clampNumber(sequenceGapMs, 0, 2_000);
  const safeCharacterCount = Math.round(
    clampNumber(characterCount ?? countCharacters(text), 1, 240),
  );
  const effectStyle: HeroTitleEffectStyle = {
    ...style,
    '--hero-title-delay': `${safeDelay + safeSequenceIndex * safeSequenceGap}ms`,
    '--hero-title-character-count': safeCharacterCount,
  };

  if (cursorColor) {
    effectStyle['--hero-title-cursor-color'] = cursorColor;
  }

  return {
    className: joinClassNames('hero-title-effect', className),
    style: effectStyle,
    'data-effect': safeEffect,
    'data-speed': safeSpeed,
    ...(safeEffect === 'typewriter' && cursor !== false
      ? { 'data-cursor': 'true' as const }
      : {}),
  };
}

function renderWords(children: ReactNode) {
  if (typeof children !== 'string' && typeof children !== 'number') {
    return (
      <span
        className="hero-title-effect__word"
        style={{ '--hero-title-word-index': 0 } as HeroTitleEffectStyle}
      >
        {children}
      </span>
    );
  }

  let wordIndex = 0;

  return String(children)
    .split(/(\s+)/u)
    .map((chunk, chunkIndex) => {
      if (/^\s+$/u.test(chunk)) return chunk;

      const currentWordIndex = wordIndex;
      wordIndex += 1;

      return (
        <span
          key={`${chunk}-${chunkIndex}`}
          className="hero-title-effect__word"
          style={{ '--hero-title-word-index': currentWordIndex } as HeroTitleEffectStyle}
        >
          {chunk}
        </span>
      );
    });
}

const TYPEWRITER_DURATIONS: Record<HeroTitleEffectSpeed, number> = {
  slow: 2600,
  normal: 1800,
  fast: 1050,
};

/*
 * Ниже — те же числа, что в hero-title-effects.css. Держать их в JS пришлось
 * ради предпросмотра: он обязан знать, когда анимация действительно кончилась.
 * Раньше там стояло фиксированное «шесть секунд на всё», и медленная печатная
 * машинка на трёх строках замирала недопечатанной.
 */
const BASE_DURATIONS: Record<HeroTitleEffectSpeed, number> = {
  slow: 1100,
  normal: 760,
  fast: 480,
};

const WORD_STAGGERS: Record<HeroTitleEffectSpeed, number> = {
  slow: 108,
  normal: 72,
  fast: 44,
};

/** Пауза между стартом соседних строк. */
export function heroTitleSequenceGapMs(effect: HeroTitleEffect, speed: HeroTitleEffectSpeed): number {
  return effect === 'typewriter' ? TYPEWRITER_DURATIONS[speed] + 120 : 90;
}

/** Сколько играет одна строка от своего старта до полной готовности. */
export function heroTitleLineDurationMs(
  effect: HeroTitleEffect,
  speed: HeroTitleEffectSpeed,
  text: string,
): number {
  if (effect === 'none') return 0;
  // Курсор мигает ещё три такта по 720 мс после последней буквы.
  if (effect === 'typewriter') return TYPEWRITER_DURATIONS[speed] + 720 * 3;
  if (effect === 'words') {
    const words = Math.max(1, text.trim().split(/\s+/u).filter(Boolean).length);
    return BASE_DURATIONS[speed] + (words - 1) * WORD_STAGGERS[speed];
  }
  return BASE_DURATIONS[speed];
}

/**
 * Общая длительность появления заголовка: самая поздняя строка от нуля до
 * своего конца. Строки стартуют по очереди, поэтому решает не самая долгая,
 * а та, у которой сумма задержки и длительности больше всех.
 */
export function heroTitleTotalDurationMs(
  lines: Array<Pick<HeroTitleLine, 'text' | 'effect' | 'speed'>>,
  animation: HeroTitleAnimation | undefined,
): number {
  const base = animation || {};
  const startDelay = clampNumber(base.delayMs, 0, 10_000);
  let total = 0;
  lines.forEach((line, index) => {
    const effect = normalizeHeroTitleEffect(line.effect, normalizeHeroTitleEffect(base.effect));
    if (effect === 'none') return;
    const speed = normalizeHeroTitleEffectSpeed(line.speed, normalizeHeroTitleEffectSpeed(base.speed));
    const start = startDelay + index * heroTitleSequenceGapMs(effect, speed);
    total = Math.max(total, start + heroTitleLineDurationMs(effect, speed, line.text));
  });
  return total;
}

function renderTypewriter(text: string, speed: HeroTitleEffectSpeed) {
  const characters = Array.from(text);
  const stepMs = TYPEWRITER_DURATIONS[speed] / Math.max(1, characters.length);
  let characterIndex = 0;

  return text.split(/(\s+)/u).map((chunk, chunkIndex) => {
    if (/^\s+$/u.test(chunk)) {
      characterIndex += Array.from(chunk).length;
      return chunk;
    }

    const chunkCharacters = Array.from(chunk).map((character) => {
      const index = characterIndex;
      characterIndex += 1;
      return (
        <span
          key={`${chunkIndex}-${index}`}
          className="hero-title-effect__character"
          style={{ '--hero-title-character-delay': `${Math.round(index * stepMs)}ms` } as HeroTitleEffectStyle}
        >
          {character}
        </span>
      );
    });

    return (
      <span className="hero-title-effect__typeword" key={`word-${chunkIndex}`}>
        {chunkCharacters}
      </span>
    );
  });
}

export interface HeroTitleEffectProps
  extends Omit<HTMLAttributes<HTMLElement>, 'children'>,
    HeroTitleEffectSettings {
  as?: ElementType;
  children: ReactNode;
  /** Plain text is used only to choose natural typewriter step count. */
  text?: string;
}

/**
 * Animates a complete title or one explicit title line. Text is never typed by
 * JavaScript or removed from the DOM, so final wrapping and accessible content
 * are identical to the non-animated version.
 */
export function HeroTitleEffect({
  as: Component = 'span',
  children,
  effect = 'none',
  speed = 'normal',
  delayMs = 0,
  sequenceIndex = 0,
  sequenceGapMs = 90,
  characterCount,
  cursor = true,
  cursorColor,
  text,
  className,
  style,
  ...elementProps
}: HeroTitleEffectProps) {
  const plainText = text ?? (
    typeof children === 'string' || typeof children === 'number'
      ? String(children)
      : ''
  );
  const normalizedEffect = normalizeHeroTitleEffect(effect);
  const normalizedSpeed = normalizeHeroTitleEffectSpeed(speed);
  const effectiveSequenceGap = normalizedEffect === 'typewriter'
    ? TYPEWRITER_DURATIONS[normalizedSpeed] + 120
    : sequenceGapMs;
  const attributes = getHeroTitleEffectAttributes({
    effect: normalizedEffect,
    speed: normalizedSpeed,
    delayMs,
    sequenceIndex,
    sequenceGapMs: effectiveSequenceGap,
    characterCount,
    cursor,
    cursorColor,
    className,
    style,
    text: plainText,
  });
  const safeEffect = attributes['data-effect'];
  const safeSpeed = attributes['data-speed'];

  return (
    <Component {...elementProps} {...attributes}>
      {safeEffect === 'words'
        ? renderWords(children)
        : safeEffect === 'typewriter' && plainText
          ? <span>{renderTypewriter(plainText, safeSpeed)}</span>
          : children}
    </Component>
  );
}

export default HeroTitleEffect;
