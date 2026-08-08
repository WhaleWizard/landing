import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type RefCallback,
} from 'react';

export type TypographyPreset = 'compact' | 'standard' | 'large';
export type TypographySize = TypographyPreset | number;
export type ContentFontWeight = 300 | 400 | 500 | 600 | 700 | 800;
export type ContentTitleWeight = 'auto' | ContentFontWeight;
export type ContentTitleLineHeight = 'auto' | 'tight' | 'snug' | 'normal' | 'relaxed';
export type ContentTitleLetterSpacing = 'auto' | 'tight' | 'normal' | 'wide';
export type ContentFontCategory = 'sans' | 'serif' | 'handwritten' | 'display';
export type ContentFontSource = 'system' | 'hero' | 'library';

export type ContentFontDefinition<Id extends string = string> = {
  id: Id;
  label: string;
  cssFamily: string;
  category: ContentFontCategory;
  source: ContentFontSource;
  bodySafe: boolean;
  weights: readonly ContentFontWeight[];
  description: string;
};

/**
 * Every bundled family contains Cyrillic glyphs. `bodySafe` deliberately stays
 * conservative: decorative families remain available for headings, while the
 * body-font picker can offer only faces that are comfortable in longer copy.
 */
export const CONTENT_FONT_CATALOG = [
  {
    id: 'auto',
    label: 'Авто · стиль сайта',
    cssFamily: '',
    category: 'sans',
    source: 'system',
    bodySafe: true,
    weights: [300, 400, 500, 600, 700, 800],
    description: 'Текущий шрифт и настройки выбранной страницы.',
  },
  {
    id: 'inter',
    label: 'Inter',
    cssFamily: '"Inter Variable"',
    category: 'sans',
    source: 'system',
    bodySafe: true,
    weights: [300, 400, 500, 600, 700, 800],
    description: 'Чистый универсальный гротеск для интерфейсов и длинного текста.',
  },
  {
    id: 'onest',
    label: 'Onest',
    cssFamily: '"WW Onest"',
    category: 'sans',
    source: 'hero',
    bodySafe: true,
    weights: [400, 500, 600, 700],
    description: 'Современный нейтральный гротеск для заголовков и текста.',
  },
  {
    id: 'commissioner',
    label: 'Commissioner',
    cssFamily: '"WW Commissioner"',
    category: 'sans',
    source: 'hero',
    bodySafe: true,
    weights: [300, 400, 500, 600, 700],
    description: 'Гибкий деловой гротеск с хорошей кириллицей.',
  },
  {
    id: 'prata',
    label: 'Prata',
    cssFamily: '"WW Prata"',
    category: 'display',
    source: 'hero',
    bodySafe: false,
    weights: [400],
    description: 'Контрастный акцидентный шрифт для коротких заголовков.',
  },
  {
    id: 'caveat',
    label: 'Caveat',
    cssFamily: '"WW Caveat"',
    category: 'handwritten',
    source: 'hero',
    bodySafe: false,
    weights: [500, 600],
    description: 'Живой рукописный акцент для коротких фраз.',
  },
  {
    id: 'bad-script',
    label: 'Bad Script',
    cssFamily: '"WW Bad Script"',
    category: 'handwritten',
    source: 'hero',
    bodySafe: false,
    weights: [400],
    description: 'Мягкий рукописный шрифт с естественной кириллицей.',
  },
  {
    id: 'arsenal',
    label: 'Arsenal',
    cssFamily: '"WW Arsenal"',
    category: 'sans',
    source: 'library',
    bodySafe: true,
    weights: [400],
    description: 'Узкий гуманистический гротеск для компактной верстки.',
  },
  {
    id: 'cormorant-garamond',
    label: 'Cormorant Garamond',
    cssFamily: '"WW Cormorant Garamond"',
    category: 'display',
    source: 'library',
    bodySafe: false,
    weights: [500],
    description: 'Выразительная антиква для премиальных заголовков.',
  },
  {
    id: 'geologica',
    label: 'Geologica',
    cssFamily: '"WW Geologica"',
    category: 'sans',
    source: 'library',
    bodySafe: true,
    weights: [500],
    description: 'Характерный геометрический гротеск для UI и текста.',
  },
  {
    id: 'golos-text',
    label: 'Golos Text',
    cssFamily: '"WW Golos Text"',
    category: 'sans',
    source: 'library',
    bodySafe: true,
    weights: [500],
    description: 'Очень читаемый шрифт, спроектированный для кириллицы.',
  },
  {
    id: 'lora',
    label: 'Lora',
    cssFamily: '"WW Lora"',
    category: 'serif',
    source: 'library',
    bodySafe: true,
    weights: [500],
    description: 'Современная антиква для спокойного редакционного текста.',
  },
  {
    id: 'manrope',
    label: 'Manrope',
    cssFamily: '"WW Manrope"',
    category: 'sans',
    source: 'library',
    bodySafe: true,
    weights: [500],
    description: 'Чистый геометрический гротеск для интерфейса и контента.',
  },
  {
    id: 'marck-script',
    label: 'Marck Script',
    cssFamily: '"WW Marck Script"',
    category: 'handwritten',
    source: 'library',
    bodySafe: false,
    weights: [400],
    description: 'Плавный рукописный акцент с полноценной кириллицей.',
  },
  {
    id: 'neucha',
    label: 'Neucha',
    cssFamily: '"WW Neucha"',
    category: 'handwritten',
    source: 'library',
    bodySafe: false,
    weights: [400],
    description: 'Неформальный рукописный шрифт для живых заголовков.',
  },
  {
    id: 'old-standard-tt',
    label: 'Old Standard TT',
    cssFamily: '"WW Old Standard TT"',
    category: 'serif',
    source: 'library',
    bodySafe: true,
    weights: [400],
    description: 'Классическая книжная антиква с историческим характером.',
  },
  {
    id: 'oranienbaum',
    label: 'Oranienbaum',
    cssFamily: '"WW Oranienbaum"',
    category: 'display',
    source: 'library',
    bodySafe: false,
    weights: [400],
    description: 'Тонкая контрастная антиква для крупных заголовков.',
  },
  {
    id: 'pangolin',
    label: 'Pangolin',
    cssFamily: '"WW Pangolin"',
    category: 'handwritten',
    source: 'library',
    bodySafe: false,
    weights: [400],
    description: 'Дружелюбный рисованный шрифт для неформальных акцентов.',
  },
  {
    id: 'playfair-display',
    label: 'Playfair Display',
    cssFamily: '"WW Playfair Display"',
    category: 'display',
    source: 'library',
    bodySafe: false,
    weights: [500],
    description: 'Редакционная контрастная антиква для выразительных заголовков.',
  },
  {
    id: 'pt-serif',
    label: 'PT Serif',
    cssFamily: '"WW PT Serif"',
    category: 'serif',
    source: 'library',
    bodySafe: true,
    weights: [400],
    description: 'Надежная русская антиква для заголовков и длинного текста.',
  },
  {
    id: 'roboto-serif',
    label: 'Roboto Serif',
    cssFamily: '"WW Roboto Serif"',
    category: 'serif',
    source: 'library',
    bodySafe: true,
    weights: [500],
    description: 'Современная экранная антиква с уверенной кириллицей.',
  },
  {
    id: 'shantell-sans',
    label: 'Shantell Sans',
    cssFamily: '"WW Shantell Sans"',
    category: 'handwritten',
    source: 'library',
    bodySafe: false,
    weights: [500],
    description: 'Экспрессивный, но аккуратный рукописный шрифт.',
  },
  {
    id: 'sofia-sans',
    label: 'Sofia Sans',
    cssFamily: '"WW Sofia Sans"',
    category: 'sans',
    source: 'library',
    bodySafe: true,
    weights: [500],
    description: 'Мягкий современный гротеск для заголовков и текста.',
  },
  {
    id: 'tenor-sans',
    label: 'Tenor Sans',
    cssFamily: '"WW Tenor Sans"',
    category: 'display',
    source: 'library',
    bodySafe: false,
    weights: [400],
    description: 'Элегантный заголовочный гротеск с журнальным настроением.',
  },
  {
    id: 'unbounded',
    label: 'Unbounded',
    cssFamily: '"WW Unbounded"',
    category: 'display',
    source: 'library',
    bodySafe: false,
    weights: [500],
    description: 'Широкий футуристичный шрифт для коротких сильных заголовков.',
  },
  {
    id: 'yeseva-one',
    label: 'Yeseva One',
    cssFamily: '"WW Yeseva One"',
    category: 'display',
    source: 'library',
    bodySafe: false,
    weights: [400],
    description: 'Декоративная антиква с выразительной русской пластикой.',
  },
] as const satisfies readonly ContentFontDefinition[];

export type ContentFontId = (typeof CONTENT_FONT_CATALOG)[number]['id'];
export type ContentFont = (typeof CONTENT_FONT_CATALOG)[number];

export const CONTENT_FONT_OPTIONS = CONTENT_FONT_CATALOG;
export const DISPLAY_CONTENT_FONTS = CONTENT_FONT_CATALOG;
export const BODY_SAFE_CONTENT_FONTS = CONTENT_FONT_CATALOG.filter((font) => font.bodySafe);

const CONTENT_FONT_BY_ID = new Map<string, ContentFont>(
  CONTENT_FONT_CATALOG.map((font) => [font.id, font]),
);

const SERIF_FALLBACK = 'Georgia, "Times New Roman", Times, serif';
const HANDWRITTEN_FALLBACK = '"Segoe Print", "Bradley Hand", cursive';
const TITLE_AUTO_FAMILY = 'var(--ww-font-display, "Segoe UI", ui-sans-serif, system-ui, sans-serif)';
const BODY_AUTO_FAMILY = 'var(--ww-font-text, "Segoe UI", ui-sans-serif, system-ui, sans-serif)';
const DISPLAY_SERIF_FONT_IDS = new Set<ContentFontId>([
  'prata',
  'cormorant-garamond',
  'oranienbaum',
  'playfair-display',
  'yeseva-one',
]);

export function isContentFontId(value: unknown): value is ContentFontId {
  return typeof value === 'string' && CONTENT_FONT_BY_ID.has(value);
}

export function getContentFontDefinition(value: unknown): ContentFont {
  return (typeof value === 'string' && CONTENT_FONT_BY_ID.get(value)) || CONTENT_FONT_CATALOG[0];
}

export function isBodySafeContentFont(value: unknown): boolean {
  return getContentFontDefinition(value).bodySafe;
}

export function fontFamilyForContent(
  value: ContentFontId | string | null | undefined,
  role: 'title' | 'body' = 'title',
): string {
  const font = getContentFontDefinition(value);
  if (font.id === 'auto' || (role === 'body' && !font.bodySafe)) {
    return role === 'body' ? BODY_AUTO_FAMILY : TITLE_AUTO_FAMILY;
  }

  const fallback = font.category === 'serif' || DISPLAY_SERIF_FONT_IDS.has(font.id)
    ? SERIF_FALLBACK
    : font.category === 'handwritten'
      ? HANDWRITTEN_FALLBACK
      : role === 'body' ? BODY_AUTO_FAMILY : TITLE_AUTO_FAMILY;
  return `${font.cssFamily}, ${fallback}`;
}

export type ContentTypography = {
  /** Legacy presets remain valid; numeric values are interpreted as CSS px. */
  titleDesktop?: TypographySize;
  titleMobile?: TypographySize;
  /** Legacy body preset controlling both breakpoints. */
  body?: TypographyPreset;
  /** Optional exact body sizes in CSS px. */
  bodyDesktop?: number;
  bodyMobile?: number;
  titleFont?: ContentFontId;
  bodyFont?: ContentFontId;
  /** 0 and undefined both mean unlimited. */
  titleMaxLinesDesktop?: number;
  /** 0 and undefined both mean unlimited. */
  titleMaxLinesMobile?: number;
  titleWeight?: ContentTitleWeight;
  titleLineHeight?: ContentTitleLineHeight;
  titleLetterSpacing?: ContentTitleLetterSpacing;
};

export type NormalizedContentTypography = {
  titleDesktop: TypographySize;
  titleMobile: TypographySize;
  body: TypographyPreset;
  bodyDesktop?: number;
  bodyMobile?: number;
  titleFont: ContentFontId;
  bodyFont: ContentFontId;
  titleMaxLinesDesktop: number;
  titleMaxLinesMobile: number;
  titleWeight: ContentTitleWeight;
  titleLineHeight: ContentTitleLineHeight;
  titleLetterSpacing: ContentTitleLetterSpacing;
};

export const DEFAULT_CONTENT_TYPOGRAPHY: Readonly<NormalizedContentTypography> = Object.freeze({
  titleDesktop: 'standard',
  titleMobile: 'standard',
  body: 'standard',
  titleFont: 'auto',
  bodyFont: 'auto',
  titleMaxLinesDesktop: 0,
  titleMaxLinesMobile: 0,
  titleWeight: 'auto',
  titleLineHeight: 'auto',
  titleLetterSpacing: 'auto',
});

const TYPOGRAPHY_PRESETS = new Set<TypographyPreset>(['compact', 'standard', 'large']);
const FONT_WEIGHTS = new Set<ContentFontWeight>([300, 400, 500, 600, 700, 800]);
const LINE_HEIGHT_PRESETS = new Set<ContentTitleLineHeight>(['auto', 'tight', 'snug', 'normal', 'relaxed']);
const LETTER_SPACING_PRESETS = new Set<ContentTitleLetterSpacing>(['auto', 'tight', 'normal', 'wide']);

export const TITLE_LINE_HEIGHT_VALUES: Readonly<Record<Exclude<ContentTitleLineHeight, 'auto'>, number>> = {
  tight: 0.95,
  snug: 1.05,
  normal: 1.15,
  relaxed: 1.3,
};

export const TITLE_LETTER_SPACING_VALUES: Readonly<Record<Exclude<ContentTitleLetterSpacing, 'auto'>, string>> = {
  tight: '-0.035em',
  normal: '0em',
  wide: '0.045em',
};

function isFinitePositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function normalizeTitleSize(value: unknown, fallback: TypographySize): TypographySize {
  if (isFinitePositiveNumber(value)) return Math.min(240, Math.max(8, value));
  if (typeof value === 'string' && TYPOGRAPHY_PRESETS.has(value as TypographyPreset)) {
    return value as TypographyPreset;
  }
  return fallback;
}

function normalizeOptionalBodySize(value: unknown): number | undefined {
  if (!isFinitePositiveNumber(value)) return undefined;
  return Math.min(120, Math.max(8, value));
}

function normalizeMaxLines(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
  return Math.min(6, Math.max(1, Math.floor(value)));
}

export function normalizeContentTypography(
  value?: ContentTypography | null,
): NormalizedContentTypography {
  const source = value || {};
  const body = typeof source.body === 'string' && TYPOGRAPHY_PRESETS.has(source.body)
    ? source.body
    : DEFAULT_CONTENT_TYPOGRAPHY.body;
  const titleWeight = source.titleWeight === 'auto' || FONT_WEIGHTS.has(source.titleWeight as ContentFontWeight)
    ? source.titleWeight as ContentTitleWeight
    : DEFAULT_CONTENT_TYPOGRAPHY.titleWeight;
  const titleLineHeight = typeof source.titleLineHeight === 'string'
    && LINE_HEIGHT_PRESETS.has(source.titleLineHeight as ContentTitleLineHeight)
    ? source.titleLineHeight as ContentTitleLineHeight
    : DEFAULT_CONTENT_TYPOGRAPHY.titleLineHeight;
  const titleLetterSpacing = typeof source.titleLetterSpacing === 'string'
    && LETTER_SPACING_PRESETS.has(source.titleLetterSpacing as ContentTitleLetterSpacing)
    ? source.titleLetterSpacing as ContentTitleLetterSpacing
    : DEFAULT_CONTENT_TYPOGRAPHY.titleLetterSpacing;

  return {
    titleDesktop: normalizeTitleSize(source.titleDesktop, DEFAULT_CONTENT_TYPOGRAPHY.titleDesktop),
    titleMobile: normalizeTitleSize(source.titleMobile, DEFAULT_CONTENT_TYPOGRAPHY.titleMobile),
    body,
    bodyDesktop: normalizeOptionalBodySize(source.bodyDesktop),
    bodyMobile: normalizeOptionalBodySize(source.bodyMobile),
    titleFont: isContentFontId(source.titleFont) ? source.titleFont : 'auto',
    bodyFont: isContentFontId(source.bodyFont) && isBodySafeContentFont(source.bodyFont) ? source.bodyFont : 'auto',
    titleMaxLinesDesktop: normalizeMaxLines(source.titleMaxLinesDesktop),
    titleMaxLinesMobile: normalizeMaxLines(source.titleMaxLinesMobile),
    titleWeight,
    titleLineHeight,
    titleLetterSpacing,
  };
}

function presetTitleClasses(
  mobile: TypographySize,
  desktop: TypographySize,
  variant: 'hero' | 'section' | 'cta' | 'contact',
): string[] {
  const mobileClass = variant === 'hero'
    ? mobile === 'compact' ? '!text-[17px] min-[360px]:!text-[19px] sm:!text-[23px]' : mobile === 'large' ? '!text-[22px] min-[360px]:!text-[24px] sm:!text-[29px]' : ''
    : variant === 'cta'
      ? mobile === 'compact' ? '!text-lg' : mobile === 'large' ? '!text-2xl' : ''
      : mobile === 'compact' ? '!text-2xl' : mobile === 'large' ? '!text-[2rem]' : '';
  const desktopClass = variant === 'hero'
    ? desktop === 'compact' ? 'md:!text-[28px] lg:!text-[29px] xl:!text-[32px]' : desktop === 'large' ? 'md:!text-[36px] lg:!text-[38px] xl:!text-[43px]' : ''
    : variant === 'cta'
      ? desktop === 'compact' ? 'md:!text-xl lg:!text-2xl' : desktop === 'large' ? 'md:!text-3xl lg:!text-4xl' : ''
      : desktop === 'compact' ? 'md:!text-3xl lg:!text-[38px]' : desktop === 'large' ? 'md:!text-[42px] lg:!text-[50px]' : '';
  return [mobileClass, desktopClass].filter(Boolean);
}

export function managedTitleClasses(
  typography: ContentTypography | undefined,
  variant: 'hero' | 'section' | 'cta' | 'contact' = 'section',
): string {
  const mobile = normalizeTitleSize(typography?.titleMobile, 'standard');
  const desktop = normalizeTitleSize(typography?.titleDesktop, 'standard');
  const classes = presetTitleClasses(mobile, desktop, variant);
  if (typeof mobile === 'number') classes.push('ww-managed-title-mobile-size');
  if (typeof desktop === 'number') classes.push('ww-managed-title-desktop-size');
  return classes.join(' ').trim();
}

export function managedBodyClasses(typography: ContentTypography | undefined): string {
  const classes: string[] = [];
  if (typography?.body === 'compact') classes.push('!text-sm md:!text-base');
  if (typography?.body === 'large') classes.push('!text-base md:!text-xl');
  if (isFinitePositiveNumber(typography?.bodyMobile)) classes.push('ww-managed-body-mobile-size');
  if (isFinitePositiveNumber(typography?.bodyDesktop)) classes.push('ww-managed-body-desktop-size');
  return classes.join(' ').trim();
}

type ManagedTypographyCustomProperty =
  | '--ww-content-title-size-mobile'
  | '--ww-content-title-size-desktop'
  | '--ww-content-body-size-mobile'
  | '--ww-content-body-size-desktop';

export type ManagedTypographyStyle = CSSProperties
  & Partial<Record<ManagedTypographyCustomProperty, string>>;

export function managedTitleStyle(typography: ContentTypography | undefined): ManagedTypographyStyle {
  if (!typography) return {};
  const normalized = normalizeContentTypography(typography);
  const style: ManagedTypographyStyle = {};

  if (typeof normalized.titleMobile === 'number') {
    style['--ww-content-title-size-mobile'] = `${normalized.titleMobile}px`;
  }
  if (typeof normalized.titleDesktop === 'number') {
    style['--ww-content-title-size-desktop'] = `${normalized.titleDesktop}px`;
  }
  if (typography.titleFont) {
    style.fontFamily = fontFamilyForContent(normalized.titleFont, 'title');
  }
  if (normalized.titleWeight !== 'auto') style.fontWeight = normalized.titleWeight;
  if (normalized.titleLineHeight !== 'auto') {
    style.lineHeight = TITLE_LINE_HEIGHT_VALUES[normalized.titleLineHeight];
  }
  if (normalized.titleLetterSpacing !== 'auto') {
    style.letterSpacing = TITLE_LETTER_SPACING_VALUES[normalized.titleLetterSpacing];
  }
  return style;
}

export function managedBodyStyle(typography: ContentTypography | undefined): ManagedTypographyStyle {
  if (!typography) return {};
  const normalized = normalizeContentTypography(typography);
  const style: ManagedTypographyStyle = {};
  if (normalized.bodyMobile !== undefined) {
    style['--ww-content-body-size-mobile'] = `${normalized.bodyMobile}px`;
  }
  if (normalized.bodyDesktop !== undefined) {
    style['--ww-content-body-size-desktop'] = `${normalized.bodyDesktop}px`;
  }
  if (typography.bodyFont) {
    style.fontFamily = fontFamilyForContent(normalized.bodyFont, 'body');
  }
  return style;
}

export const managedTitleStyles = managedTitleStyle;
export const managedBodyStyles = managedBodyStyle;

function countRenderedTextLines(element: HTMLElement): number {
  const documentRef = element.ownerDocument;
  if (!documentRef || !element.textContent?.trim()) return 0;
  const range = documentRef.createRange();
  range.selectNodeContents(element);
  const rectangles = Array.from(range.getClientRects())
    .filter((rect) => rect.width > 0.5 && rect.height > 0.5)
    .sort((left, right) => left.top - right.top || left.left - right.left);
  range.detach?.();

  const lineTops: number[] = [];
  for (const rectangle of rectangles) {
    const middle = rectangle.top + rectangle.height / 2;
    if (!lineTops.some((known) => Math.abs(known - middle) <= 2)) lineTops.push(middle);
  }
  return lineTops.length;
}

function hasNestedNowrap(element: HTMLElement): boolean {
  return Array.from(element.querySelectorAll<HTMLElement>('*')).some((child) => (
    window.getComputedStyle(child).whiteSpace === 'nowrap'
  ));
}

function elementTextFits(element: HTMLElement, maxLines: number, singleLine: boolean): boolean {
  if (element.clientWidth <= 0) return true;
  const horizontalFit = element.scrollWidth <= element.clientWidth + 1;
  if (!horizontalFit) return false;
  if (singleLine) return countRenderedTextLines(element) <= 1;
  if (maxLines <= 0) return true;

  const measuredLines = countRenderedTextLines(element);
  if (measuredLines > 0) return measuredLines <= maxLines;

  const computed = window.getComputedStyle(element);
  const fontSize = Number.parseFloat(computed.fontSize) || 16;
  const lineHeight = Number.parseFloat(computed.lineHeight) || fontSize * 1.2;
  const padding = (Number.parseFloat(computed.paddingTop) || 0)
    + (Number.parseFloat(computed.paddingBottom) || 0);
  return element.scrollHeight <= lineHeight * maxLines + padding + 1;
}

export type ManagedTitleFitOptions = {
  enabled?: boolean;
  /** Optional fixed limit, useful outside ContentTypography. 0 means unlimited. */
  maxLines?: number;
  /** Fit to one line even when the element's CSS does not set white-space: nowrap. */
  nowrap?: boolean;
  /** The fit algorithm will not shrink below this readable floor. */
  minFontSize?: number;
  /** Must match the responsive typography breakpoint. */
  desktopMinWidth?: number;
};

/**
 * Returns a callback ref that reduces a managed heading's font size until its
 * full text fits. It never applies overflow clipping or line-clamp. The hook
 * reacts to container, viewport, content, and web-font changes and restores the
 * author's original inline size when no limit is active.
 */
export function useManagedTitleFit<T extends HTMLElement = HTMLHeadingElement>(
  typography: ContentTypography | undefined,
  options: ManagedTitleFitOptions = {},
): RefCallback<T> {
  const [element, setElement] = useState<T | null>(null);
  const setRef = useCallback<RefCallback<T>>((nextElement) => {
    setElement(nextElement);
  }, []);

  const enabled = options.enabled !== false;
  const explicitMaxLines = normalizeMaxLines(options.maxLines);
  const hasExplicitMaxLines = options.maxLines !== undefined;
  const forceNowrap = options.nowrap === true;
  const minFontSize = isFinitePositiveNumber(options.minFontSize)
    ? Math.max(4, options.minFontSize)
    : 8;
  const desktopMinWidth = isFinitePositiveNumber(options.desktopMinWidth)
    ? options.desktopMinWidth
    : 768;
  const mobileMaxLines = normalizeMaxLines(typography?.titleMaxLinesMobile);
  const desktopMaxLines = normalizeMaxLines(typography?.titleMaxLinesDesktop);
  const titleDesktop = typography?.titleDesktop;
  const titleMobile = typography?.titleMobile;
  const titleFont = typography?.titleFont;
  const titleWeight = typography?.titleWeight;
  const titleLineHeight = typography?.titleLineHeight;
  const titleLetterSpacing = typography?.titleLetterSpacing;

  useEffect(() => {
    if (!element || typeof window === 'undefined' || typeof document === 'undefined') return undefined;

    let cancelled = false;
    let animationFrame = 0;
    let applyingFit = false;
    let lastAppliedFontSize = '';
    let originalFontSize = element.style.getPropertyValue('font-size');
    let originalFontSizePriority = element.style.getPropertyPriority('font-size');

    const restoreOriginalFontSize = () => {
      if (!lastAppliedFontSize) return;
      if (originalFontSize) {
        element.style.setProperty('font-size', originalFontSize, originalFontSizePriority);
      } else {
        element.style.removeProperty('font-size');
      }
      lastAppliedFontSize = '';
    };

    const resetBeforeMeasurement = () => {
      const current = element.style.getPropertyValue('font-size');
      if (lastAppliedFontSize && current === lastAppliedFontSize) {
        restoreOriginalFontSize();
        return;
      }
      if (current !== lastAppliedFontSize) {
        originalFontSize = current;
        originalFontSizePriority = element.style.getPropertyPriority('font-size');
        lastAppliedFontSize = '';
      }
    };

    const fit = () => {
      animationFrame = 0;
      if (cancelled || applyingFit || !element.isConnected || !enabled) {
        if (!enabled) restoreOriginalFontSize();
        return;
      }

      applyingFit = true;
      resetBeforeMeasurement();

      const maxLines = hasExplicitMaxLines
        ? explicitMaxLines
        : window.innerWidth >= desktopMinWidth ? desktopMaxLines : mobileMaxLines;
      const computedWhiteSpace = window.getComputedStyle(element).whiteSpace;
      const wholeHeadingNowrap = forceNowrap || computedWhiteSpace === 'nowrap';
      const nestedNowrap = hasNestedNowrap(element);

      // Unlimited, normally wrapping headings must retain their authored CSS.
      if (maxLines <= 0 && !wholeHeadingNowrap && !nestedNowrap) {
        applyingFit = false;
        return;
      }

      const originalWhiteSpace = element.style.getPropertyValue('white-space');
      const originalWhiteSpacePriority = element.style.getPropertyPriority('white-space');
      if (forceNowrap && computedWhiteSpace !== 'nowrap') {
        element.style.setProperty('white-space', 'nowrap', 'important');
      }

      const computed = window.getComputedStyle(element);
      const authoredSize = Number.parseFloat(computed.fontSize);
      if (!Number.isFinite(authoredSize) || authoredSize <= 0 || element.clientWidth <= 0) {
        if (forceNowrap && computedWhiteSpace !== 'nowrap') {
          if (originalWhiteSpace) element.style.setProperty('white-space', originalWhiteSpace, originalWhiteSpacePriority);
          else element.style.removeProperty('white-space');
        }
        applyingFit = false;
        return;
      }

      if (elementTextFits(element, maxLines, wholeHeadingNowrap)) {
        if (forceNowrap && computedWhiteSpace !== 'nowrap') {
          if (originalWhiteSpace) element.style.setProperty('white-space', originalWhiteSpace, originalWhiteSpacePriority);
          else element.style.removeProperty('white-space');
        }
        applyingFit = false;
        return;
      }

      const floor = Math.min(authoredSize, minFontSize);
      let low = floor;
      let high = authoredSize;
      let best = floor;
      element.style.setProperty('font-size', `${floor}px`, 'important');

      if (elementTextFits(element, maxLines, wholeHeadingNowrap)) {
        for (let iteration = 0; iteration < 12 && high - low > 0.1; iteration += 1) {
          const candidate = (low + high) / 2;
          element.style.setProperty('font-size', `${candidate}px`, 'important');
          if (elementTextFits(element, maxLines, wholeHeadingNowrap)) {
            best = candidate;
            low = candidate;
          } else {
            high = candidate;
          }
        }
      }

      lastAppliedFontSize = `${Math.floor(best * 10) / 10}px`;
      element.style.setProperty('font-size', lastAppliedFontSize, 'important');

      if (forceNowrap && computedWhiteSpace !== 'nowrap') {
        if (originalWhiteSpace) element.style.setProperty('white-space', originalWhiteSpace, originalWhiteSpacePriority);
        else element.style.removeProperty('white-space');
      }
      applyingFit = false;
    };

    const scheduleFit = () => {
      if (cancelled || animationFrame) return;
      animationFrame = window.requestAnimationFrame(fit);
    };

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(scheduleFit)
      : null;
    resizeObserver?.observe(element);

    const mutationObserver = typeof MutationObserver !== 'undefined'
      ? new MutationObserver(scheduleFit)
      : null;
    mutationObserver?.observe(element, { childList: true, characterData: true, subtree: true });

    const fontSet = document.fonts;
    const onFontsLoaded = () => scheduleFit();
    void fontSet?.ready.then(onFontsLoaded).catch(() => undefined);
    fontSet?.addEventListener?.('loadingdone', onFontsLoaded);
    window.addEventListener('resize', scheduleFit, { passive: true });
    window.addEventListener('orientationchange', scheduleFit, { passive: true });
    scheduleFit();

    return () => {
      cancelled = true;
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      mutationObserver?.disconnect();
      fontSet?.removeEventListener?.('loadingdone', onFontsLoaded);
      window.removeEventListener('resize', scheduleFit);
      window.removeEventListener('orientationchange', scheduleFit);
      restoreOriginalFontSize();
    };
  }, [
    element,
    enabled,
    explicitMaxLines,
    hasExplicitMaxLines,
    forceNowrap,
    minFontSize,
    desktopMinWidth,
    mobileMaxLines,
    desktopMaxLines,
    titleDesktop,
    titleMobile,
    titleFont,
    titleWeight,
    titleLineHeight,
    titleLetterSpacing,
  ]);

  return setRef;
}
