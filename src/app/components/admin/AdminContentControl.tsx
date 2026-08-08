import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  GripVertical,
  Minus,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Trash2,
  Type,
  WandSparkles,
} from 'lucide-react';
import { META_APPS_TESTIMONIAL_CONTENT, pageConfigs, type ServiceType } from '../../pages/ServiceLandingPage';
import { defaultHeroContent } from '../Hero';
import { defaultServicesContent, type ServicesContent } from '../Services';
import { defaultCasesContent } from '../Cases';
import { defaultCallToActionContent } from '../CallToAction';
import { defaultTestimonialsContent, defaultTestimonialsStats, type TestimonialsContent } from '../Testimonials';
import { defaultContactContent } from '../ContactForm';
import { mergeContent } from '../../hooks/useServiceContent';
import {
  BODY_SAFE_CONTENT_FONTS,
  CONTENT_FONT_OPTIONS,
  DEFAULT_CONTENT_TYPOGRAPHY,
  fontFamilyForContent,
  getContentFontDefinition,
  normalizeContentTypography,
  type ContentFont,
  type ContentFontId,
  type ContentTypography,
  type NormalizedContentTypography,
  type TypographySize,
} from '../../utils/contentTypography';
import {
  HERO_TITLE_EFFECT_LABELS,
  HERO_TITLE_EFFECT_OPTIONS,
  HERO_TITLE_EFFECT_SPEED_OPTIONS,
  type HeroTitleEffect,
  type HeroTitleEffectSpeed,
} from '../HeroTitleEffect';
import AdminFaqControl from './AdminFaqControl';
import { confirmAsk } from './AdminFeedback';
import { AdminSelect } from './AdminUI';
import AdminContentPreview from './AdminContentPreview';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../ui/dialog';

type TypographySettings = NormalizedContentTypography;

type IntroContent = {
  badge: string;
  titlePrefix: string;
  titleAccent: string;
  description: string;
  typography: TypographySettings;
};

export type EditableContent = {
  seo: { title: string; description: string };
  hero: {
    badge: string;
    titlePrefix: string;
    titleAccent: string;
    /**
     * Шрифт, эффект и скорость строки необязательны: пусто — «как у всего
     * заголовка». Так одна строка может быть рукописной и печататься по
     * буквам, а соседняя оставаться обычной.
     */
    titleLines: Array<{
      text: string;
      tone?: 'accent' | 'supporting';
      font?: ContentFontId;
      effect?: HeroTitleEffect;
      speed?: HeroTitleEffectSpeed;
    }>;
    paragraphs: string[];
    primaryButton: string;
    secondaryButton: string;
    stats: Array<{ value: string; label: string }>;
    typography: TypographySettings;
    titleAnimation: {
      effect: HeroTitleEffect;
      speed: HeroTitleEffectSpeed;
      delayMs: number;
    };
  };
  services: IntroContent & {
    cards: Array<{ title: string; description: string; features: string[]; visualSlot: number }>;
    detailed: {
      title: string;
      button: string;
      sections: Array<{ title: string; text: string; visualSlot: number }>;
    };
  };
  cases: IntroContent & {
    items: Array<{ title: string; category: string; description: string; stats: Array<{ label: string; value: string }>; visualSlot: number }>;
  };
  cta: {
    badge: string;
    title: string;
    description: string;
    button: string;
    typography: TypographySettings;
  };
  testimonials: IntroContent & {
    stats: Array<{ value: string; label: string }>;
    items: Array<{ name: string; company: string; position: string; text: string }>;
  };
  contact: IntroContent & {
    bullets: string[];
    benefits: Array<{ title: string; description: string }>;
  };
};

export type EditorPage = ServiceType | 'home';
export type EditorSection = 'seo' | 'hero' | 'services' | 'cases' | 'cta' | 'testimonials' | 'contact';

type SectionPayload = {
  key: string;
  pagePath: string;
  label: string;
  draft: Record<string, unknown>;
  published: Record<string, unknown>;
  status: 'draft' | 'published';
  version: number;
  publishedVersion?: number | null;
  updatedAt?: string;
  publishedAt?: string;
};

type VersionRow = { id: number; source: 'draft' | 'published'; created_at: string };

const DEFAULT_TYPOGRAPHY: TypographySettings = { ...DEFAULT_CONTENT_TYPOGRAPHY };

const DEFAULT_HERO_TITLE_ANIMATION: EditableContent['hero']['titleAnimation'] = {
  effect: 'none',
  speed: 'normal',
  delayMs: 100,
};

const HOME_SEO = {
  title: 'Google Ads, Meta Ads и аналитика',
  description: 'Настройка и ведение Google Ads и Meta Ads с опорой на аналитику, качество заявок и продажи: GA4, GTM, Meta Pixel, CAPI и данные CRM.',
};

const PAGES: Array<{ value: EditorPage; label: string; path: string; key: string }> = [
  { value: 'home', label: 'Главная', path: '/', key: 'site:home' },
  { value: 'meta-ads', label: 'Meta Ads', path: '/meta-ads', key: 'service:meta-ads' },
  { value: 'meta-apps', label: 'Meta Apps', path: '/meta-apps', key: 'service:meta-apps' },
  { value: 'google-ads', label: 'Google Ads', path: '/google-ads', key: 'service:google-ads' },
  { value: 'consult', label: 'Консультация', path: '/consult', key: 'service:consult' },
];

const SECTION_LABELS: Record<EditorSection, string> = {
  seo: 'SEO страницы',
  hero: 'Хиро',
  services: 'Услуги и офферы',
  cases: 'Кейсы',
  cta: 'CTA',
  testimonials: 'Отзывы и доверие',
  contact: 'Форма и контакт',
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function intro(source: { badge: string; titlePrefix: string; titleAccent: string; description: string }): IntroContent {
  return {
    badge: source.badge,
    titlePrefix: source.titlePrefix,
    titleAccent: source.titleAccent,
    description: source.description,
    typography: { ...DEFAULT_TYPOGRAPHY },
  };
}

/** Модалка «Как я работаю»: иконка раздела остаётся за кодом, редактируется текст. */
function detailedDefaults(source: ServicesContent): EditableContent['services']['detailed'] {
  return {
    title: source.detailed?.title || '',
    button: source.detailed?.button || '',
    sections: (source.detailed?.sections || []).map((section, visualSlot) => ({
      title: section.title,
      text: section.text,
      visualSlot,
    })),
  };
}

function testimonialsDefaults(source: TestimonialsContent, stats = defaultTestimonialsStats): EditableContent['testimonials'] {
  return {
    ...intro(source),
    stats: stats.map((item) => ({ ...item })),
    items: (source.items ?? defaultTestimonialsContent.items ?? []).map((item) => ({ ...item })),
  };
}

function homeDefaults(): EditableContent {
  return {
    seo: { ...HOME_SEO },
    hero: {
      badge: defaultHeroContent.badge,
      titlePrefix: String(defaultHeroContent.titlePrefix || ''),
      titleAccent: String(defaultHeroContent.titleAccent || ''),
      titleLines: (defaultHeroContent.titleLines || []).map((line) => ({
        text: line.text,
        tone: line.tone === 'accent' || line.tone === 'supporting' ? line.tone : undefined,
        font: line.font,
        effect: line.effect,
        speed: line.speed,
      })),
      paragraphs: defaultHeroContent.paragraphs.map(String),
      primaryButton: defaultHeroContent.primaryButton,
      secondaryButton: defaultHeroContent.secondaryButton,
      stats: defaultHeroContent.stats.map((item) => ({ ...item })),
      typography: { ...DEFAULT_TYPOGRAPHY },
      titleAnimation: { ...DEFAULT_HERO_TITLE_ANIMATION },
    },
    services: {
      ...intro(defaultServicesContent),
      cards: defaultServicesContent.cards.map((card, visualSlot) => ({
        title: card.title,
        description: card.description,
        features: [...card.features],
        visualSlot,
      })),
      detailed: detailedDefaults(defaultServicesContent),
    },
    cases: {
      ...intro(defaultCasesContent),
      items: defaultCasesContent.items.map((item, visualSlot) => ({
        title: item.title,
        category: item.category,
        description: item.description,
        stats: item.stats.map((stat) => ({ ...stat })),
        visualSlot,
      })),
    },
    cta: { ...defaultCallToActionContent, typography: { ...DEFAULT_TYPOGRAPHY } },
    testimonials: testimonialsDefaults(defaultTestimonialsContent),
    contact: {
      ...intro(defaultContactContent),
      bullets: [],
      benefits: defaultContactContent.benefits.map((item) => ({ ...item })),
    },
  };
}

function serviceDefaults(service: ServiceType): EditableContent {
  const source = pageConfigs[service];
  return {
    seo: { title: source.seo.title, description: source.seo.description },
    hero: {
      badge: source.hero.badge || '',
      titlePrefix: String(source.hero.titlePrefix || ''),
      titleAccent: String(source.hero.titleAccent || ''),
      titleLines: (source.hero.titleLines || []).map((line) => ({
        text: line.text,
        tone: line.tone === 'accent' || line.tone === 'supporting' ? line.tone : undefined,
        font: line.font,
        effect: line.effect,
        speed: line.speed,
      })),
      paragraphs: (source.hero.paragraphs || []).map(String),
      primaryButton: source.hero.primaryButton || '',
      secondaryButton: source.hero.secondaryButton || '',
      stats: (source.hero.stats || []).map((item) => ({ ...item })),
      typography: { ...DEFAULT_TYPOGRAPHY },
      titleAnimation: { ...DEFAULT_HERO_TITLE_ANIMATION },
    },
    services: {
      ...intro(source.services),
      cards: source.services.cards.map((card, visualSlot) => ({
        title: card.title,
        description: card.description,
        features: [...card.features],
        visualSlot,
      })),
      detailed: detailedDefaults(source.services),
    },
    cases: {
      ...intro(source.cases),
      items: source.cases.items.map((item, visualSlot) => ({
        title: item.title,
        category: item.category,
        description: item.description,
        stats: item.stats.map((stat) => ({ ...stat })),
        visualSlot,
      })),
    },
    cta: { ...source.cta, typography: { ...DEFAULT_TYPOGRAPHY } },
    // Meta Apps показывает свой вариант заголовков блока отзывов.
    testimonials: testimonialsDefaults(
      service === 'meta-apps' ? META_APPS_TESTIMONIAL_CONTENT : defaultTestimonialsContent,
    ),
    contact: {
      ...intro(source.contact),
      bullets: [...source.contact.bullets],
      benefits: [],
    },
  };
}

function editableDefaults(page: EditorPage): EditableContent {
  return page === 'home' ? homeDefaults() : serviceDefaults(page);
}

function normalizeStored(page: EditorPage, raw: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!raw) return {};
  if (page !== 'home') return raw;
  return { ...raw, cta: raw.callToAction || raw.cta };
}

function serializeContent(page: EditorPage, content: EditableContent): Record<string, unknown> {
  if (page !== 'home') return clone(content) as unknown as Record<string, unknown>;
  const { cta, ...rest } = clone(content);
  return { ...rest, callToAction: cta } as unknown as Record<string, unknown>;
}

function validateEditableContent(content: EditableContent): { section: EditorSection; message: string } | null {
  const blank = (value: string) => !value.trim();
  if (blank(content.seo.title) || blank(content.seo.description)) {
    return { section: 'seo', message: 'заполните SEO-заголовок и SEO-описание' };
  }
  if (content.hero.titleLines.length > 0) {
    if (content.hero.titleLines.some((line) => blank(line.text))) {
      return { section: 'hero', message: 'в заголовке хиро осталась пустая строка' };
    }
  } else if (blank(content.hero.titlePrefix) && blank(content.hero.titleAccent)) {
    return { section: 'hero', message: 'заполните заголовок хиро' };
  }
  if (!content.hero.paragraphs.length || content.hero.paragraphs.some(blank)) {
    return { section: 'hero', message: 'удалите пустой абзац или заполните его' };
  }
  if (content.hero.stats.some((item) => blank(item.value) || blank(item.label))) {
    return { section: 'hero', message: 'у каждой цифры хиро должны быть значение и подпись' };
  }
  if (!content.services.cards.length || content.services.cards.some((card) => (
    blank(card.title) || blank(card.description) || !card.features.length || card.features.some(blank)
  ))) {
    return { section: 'services', message: 'заполните название, описание и пункты каждой карточки услуги' };
  }
  if (!content.cases.items.length || content.cases.items.some((item) => (
    blank(item.title) || blank(item.category) || blank(item.description)
    || item.stats.some((stat) => blank(stat.value) || blank(stat.label))
  ))) {
    return { section: 'cases', message: 'заполните текст карточек кейсов и все добавленные показатели' };
  }
  if (content.services.detailed.sections.some((item) => blank(item.title) || blank(item.text))) {
    return { section: 'services', message: 'в разборе «как я работаю» остался пустой заголовок или текст' };
  }
  if (blank(content.cta.title) || blank(content.cta.button)) {
    return { section: 'cta', message: 'заполните заголовок и кнопку CTA' };
  }
  if (content.testimonials.stats.some((item) => blank(item.value) || blank(item.label))) {
    return { section: 'testimonials', message: 'у каждой цифры доверия должны быть значение и подпись' };
  }
  if (content.testimonials.items.some((item) => blank(item.name) || blank(item.text))) {
    return { section: 'testimonials', message: 'у каждого отзыва должны быть имя и текст' };
  }
  if (blank(content.contact.titlePrefix) && blank(content.contact.titleAccent)) {
    return { section: 'contact', message: 'заполните заголовок контактного блока' };
  }
  if (content.contact.benefits.some((item) => blank(item.title) || blank(item.description))) {
    return { section: 'contact', message: 'заполните все добавленные преимущества' };
  }
  if (content.contact.bullets.some(blank)) {
    return { section: 'contact', message: 'удалите пустой пункт рядом с формой или заполните его' };
  }
  return null;
}

const SEARCHABLE_TEXT_SKIP_KEYS = new Set([
  'typography', 'titleAnimation', 'visualSlot', 'tone', 'font', 'effect', 'speed',
]);

/** Все текстовые значения блока — для поиска «где это написано». */
function collectSectionTexts(value: unknown, out: string[]): void {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) out.push(trimmed);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectSectionTexts(item, out));
    return;
  }
  if (value && typeof value === 'object') {
    Object.entries(value as Record<string, unknown>).forEach(([key, item]) => {
      // Оформление — не текст страницы: без этого поиск по слову «mono»
      // находил бы строку заголовка из-за выбранного в ней шрифта.
      if (SEARCHABLE_TEXT_SKIP_KEYS.has(key)) return;
      collectSectionTexts(item, out);
    });
  }
}

function sectionTexts(content: EditableContent, section: EditorSection): string[] {
  const source = section === 'testimonials' ? content.testimonials : (content as unknown as Record<string, unknown>)[section];
  const out: string[] = [];
  collectSectionTexts(source, out);
  return out;
}

/** Короткая сводка блока для списка слева: сразу видно, где сколько всего. */
function sectionSummary(content: EditableContent, section: EditorSection): string {
  if (section === 'seo') return 'Поисковая выдача';
  if (section === 'hero') return `${content.hero.paragraphs.length} абз. · ${content.hero.stats.length} цифр`;
  if (section === 'services') return `${content.services.cards.length} карт. · ${content.services.detailed.sections.length} разд.`;
  if (section === 'cases') return `${content.cases.items.length} карточек`;
  if (section === 'cta') return 'Заголовок и кнопка';
  if (section === 'testimonials') return `${content.testimonials.items.length} отзывов · ${content.testimonials.stats.length} цифр`;
  return `${content.contact.bullets.length + content.contact.benefits.length} пунктов`;
}

function highlightSnippet(text: string, query: string): string {
  const position = text.toLocaleLowerCase('ru').indexOf(query.toLocaleLowerCase('ru'));
  if (position < 0) return text.slice(0, 90);
  const from = Math.max(0, position - 30);
  const snippet = text.slice(from, from + 110);
  return `${from > 0 ? '…' : ''}${snippet}${from + 110 < text.length ? '…' : ''}`;
}

/**
 * Копирует только ветку по пути, остальное переиспользует. Раньше здесь был
 * полный `JSON.parse(JSON.stringify(...))` на каждую нажатую клавишу — именно
 * он вместе с непрерывной перерисовкой предпросмотра и давал заметный лаг.
 */
function setAtPath(content: EditableContent, path: Array<string | number>, value: unknown): EditableContent {
  if (path.length === 0) return value as EditableContent;
  const [head, ...rest] = path;
  const branch = (content as unknown as Record<string | number, unknown>)[head];
  const nextBranch = rest.length === 0
    ? value
    : setAtPath(branch as EditableContent, rest, value);

  if (Array.isArray(content)) {
    const copy = (content as unknown as unknown[]).slice();
    copy[head as number] = nextBranch;
    return copy as unknown as EditableContent;
  }
  return { ...(content as unknown as Record<string | number, unknown>), [head]: nextBranch } as unknown as EditableContent;
}

/**
 * Текстовое поле, которое растёт под содержимое: длинные блоки вроде разбора
 * «как я работаю» больше не редактируются в окошке на четыре строки.
 */
function AutoTextarea({ id, value, maxLength, rows, onChange }: {
  id: string;
  value: string;
  maxLength: number;
  rows: number;
  onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 640)}px`;
  }, [value]);

  return (
    <textarea
      id={id}
      ref={ref}
      rows={rows}
      className="admin-input"
      maxLength={maxLength}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

function Field({ id, label, value, onChange, multiline = false, hint, maxLength = 900, rows = 4 }: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
  hint?: string;
  maxLength?: number;
  rows?: number;
}) {
  // Счётчик подсвечивается заранее, а не в момент, когда текст уже обрезан.
  const usage = maxLength > 0 ? value.length / maxLength : 0;
  const countState = usage >= 1 ? 'is-full' : usage >= 0.9 ? 'is-near' : '';

  return (
    <label className="admin-field" htmlFor={id}>
      <span className="admin-label-row">
        <span className="admin-label">{label}</span>
        <span className={`admin-char-count ${countState}`}>{value.length}/{maxLength}</span>
      </span>
      {multiline ? (
        <AutoTextarea id={id} value={value} maxLength={maxLength} rows={rows} onChange={onChange} />
      ) : (
        <input id={id} className="admin-input" maxLength={maxLength} value={value} onChange={(event) => onChange(event.target.value)} />
      )}
      {hint ? <span className="admin-hint">{hint}</span> : null}
    </label>
  );
}

function StringListEditor({ label, singular, values, maxItems, maxLength, onChange }: {
  label: string;
  singular: string;
  values: string[];
  maxItems: number;
  maxLength: number;
  onChange: (values: string[]) => void;
}) {
  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= values.length) return;
    const next = [...values];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };
  return (
    <div className="admin-field admin-field--wide">
      <div className="admin-label-row"><span className="admin-label">{label}</span><span className="admin-char-count">{values.length}/{maxItems}</span></div>
      <div className="admin-list-editor">
        {values.map((value, index) => (
          <div className="admin-list-editor__item" key={`${singular}-${index}`}>
            <div className="admin-list-editor__header">
              <span><GripVertical aria-hidden="true" /> {singular} {index + 1}</span>
              <div>
                <button type="button" className="admin-icon-button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Поднять ${singular.toLowerCase()} ${index + 1}`}><ArrowUp aria-hidden="true" /></button>
                <button type="button" className="admin-icon-button" onClick={() => move(index, 1)} disabled={index === values.length - 1} aria-label={`Опустить ${singular.toLowerCase()} ${index + 1}`}><ArrowDown aria-hidden="true" /></button>
                <button type="button" className="admin-icon-button admin-icon-button--danger" onClick={() => onChange(values.filter((_, itemIndex) => itemIndex !== index))} disabled={values.length <= 1} aria-label={`Удалить ${singular.toLowerCase()} ${index + 1}`}><Trash2 aria-hidden="true" /></button>
              </div>
            </div>
            <textarea
              className="admin-input"
              rows={singular === 'Абзац' ? 4 : 2}
              maxLength={maxLength}
              value={value}
              aria-label={`${singular} ${index + 1}`}
              onChange={(event) => onChange(values.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
            />
            <span className="admin-char-count admin-char-count--below">{value.length}/{maxLength}</span>
          </div>
        ))}
        <button type="button" className="admin-button admin-button--secondary admin-list-editor__add" disabled={values.length >= maxItems} onClick={() => onChange([...values, ''])}>
          <Plus aria-hidden="true" /> Добавить {singular.toLowerCase()}
        </button>
      </div>
    </div>
  );
}

function moveItem<T>(values: T[], index: number, direction: -1 | 1): T[] {
  const target = index + direction;
  if (target < 0 || target >= values.length) return values;
  const next = [...values];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function OrderedItemHeader({
  label,
  index,
  count,
  minItems = 0,
  onMove,
  onDelete,
}: {
  label: string;
  index: number;
  count: number;
  minItems?: number;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
}) {
  const itemNumber = index + 1;
  return (
    <div className="admin-list-editor__header">
      <span><GripVertical aria-hidden="true" /> {label} {itemNumber}</span>
      <div role="group" aria-label={`Управление: ${label.toLowerCase()} ${itemNumber}`}>
        <button type="button" className="admin-icon-button" onClick={() => onMove(-1)} disabled={index === 0} title="Поднять выше" aria-label={`Поднять ${label.toLowerCase()} ${itemNumber}`}><ArrowUp aria-hidden="true" /></button>
        <button type="button" className="admin-icon-button" onClick={() => onMove(1)} disabled={index === count - 1} title="Опустить ниже" aria-label={`Опустить ${label.toLowerCase()} ${itemNumber}`}><ArrowDown aria-hidden="true" /></button>
        <button type="button" className="admin-icon-button admin-icon-button--danger" onClick={onDelete} disabled={count <= minItems} title={count <= minItems ? `Нужно оставить минимум ${minItems}` : 'Удалить'} aria-label={`Удалить ${label.toLowerCase()} ${itemNumber}`}><Trash2 aria-hidden="true" /></button>
      </div>
    </div>
  );
}

function AddItemButton({ label, count, maxItems, onAdd }: {
  label: string;
  count: number;
  maxItems: number;
  onAdd: () => void;
}) {
  return (
    <button type="button" className="admin-button admin-button--secondary admin-list-editor__add" disabled={count >= maxItems} onClick={onAdd}>
      <Plus aria-hidden="true" /> {label}
    </button>
  );
}

const FONT_CATEGORY_LABELS = {
  all: 'Все',
  sans: 'Без засечек',
  serif: 'С засечками',
  mono: 'Печатная машинка',
  display: 'Акцентные',
  handwritten: 'Рукописные',
} as const;

/**
 * Карточка шрифта в диалоге. Гарнитура применяется, только когда карточка
 * реально появилась на экране: в библиотеке под девяносто семейств, и без
 * этого одно открытие списка тянуло бы десяток мегабайт шрифтов.
 */
function FontCard({
  font,
  role,
  sample,
  selected,
  onSelect,
}: {
  font: ContentFont;
  role: 'title' | 'body';
  sample: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node || revealed) return;
    // Видимые сразу карточки показываем без ожидания наблюдателя: он срабатывает
    // только на следующем кадре отрисовки, и первый экран успевал мигнуть.
    const box = node.getBoundingClientRect();
    if (box.height > 0 && box.top < window.innerHeight + 220 && box.bottom > -220) {
      setRevealed(true);
      return;
    }
    if (typeof IntersectionObserver === 'undefined') {
      setRevealed(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setRevealed(true);
    }, { rootMargin: '220px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [revealed]);

  const family = revealed ? fontFamilyForContent(font.id, role) : undefined;
  return (
    <button
      ref={ref}
      type="button"
      className="admin-font-card"
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="admin-font-card__name">
        <strong style={{ fontFamily: family }}>{font.label}</strong>
        {selected ? <Check aria-hidden="true" /> : null}
      </span>
      <span className="admin-font-card__sample" style={{ fontFamily: family }}>
        {sample || 'Клиенты выбирают результат'}
      </span>
      <small>{font.description}</small>
    </button>
  );
}

function FontPicker({
  label,
  value,
  role,
  sample,
  inheritLabel,
  onChange,
}: {
  label: string;
  value: ContentFontId;
  role: 'title' | 'body';
  sample: string;
  /** Чем подписать вариант «auto» — у строки это «как у заголовка». */
  inheritLabel?: string;
  onChange: (value: ContentFontId) => void;
}) {
  const [open, setOpen] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [category, setCategory] = useState<keyof typeof FONT_CATEGORY_LABELS>('all');
  const selected = getContentFontDefinition(value);
  const source = role === 'body' ? BODY_SAFE_CONTENT_FONTS : CONTENT_FONT_OPTIONS;
  const normalizedSearch = searchValue.trim().toLocaleLowerCase('ru');
  const options = source.filter((font) => (
    (category === 'all' || font.category === category)
    && (!normalizedSearch || `${font.label} ${font.description}`.toLocaleLowerCase('ru').includes(normalizedSearch))
  ));

  return (
    <div className="admin-field">
      <span className="admin-label">{label}</span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button type="button" className="admin-font-trigger">
            <span style={{ fontFamily: fontFamilyForContent(selected.id, role) }}>
              {inheritLabel && selected.id === 'auto' ? inheritLabel : selected.label}
            </span>
            <small>{selected.description}</small>
          </button>
        </DialogTrigger>
        <DialogContent className="admin-font-dialog">
          <DialogHeader>
            <DialogTitle>{label}</DialogTitle>
            <DialogDescription>
              {options.length} из {source.length}: все варианты локальные и с кириллицей.
              Посетителю загрузится только выбранная гарнитура.
            </DialogDescription>
          </DialogHeader>
          <div className="admin-font-dialog__toolbar">
            <label className="admin-font-search">
              <Search aria-hidden="true" />
              <input
                type="search"
                className="admin-input"
                placeholder="Найти шрифт"
                value={searchValue}
                onChange={(event) => setSearchValue(event.target.value)}
              />
            </label>
            <div className="admin-font-categories" role="group" aria-label="Категория шрифта">
              {(Object.keys(FONT_CATEGORY_LABELS) as Array<keyof typeof FONT_CATEGORY_LABELS>).map((key) => (
                <button type="button" key={key} aria-pressed={category === key} onClick={() => setCategory(key)}>
                  {FONT_CATEGORY_LABELS[key]}
                </button>
              ))}
            </div>
          </div>
          <div className="admin-font-grid">
            {options.map((font) => (
              <FontCard
                key={font.id}
                font={font}
                role={role}
                sample={sample}
                selected={selected.id === font.id}
                onSelect={() => {
                  onChange(font.id);
                  setOpen(false);
                }}
              />
            ))}
            {options.length === 0 ? <p className="admin-muted">По такому запросу шрифтов не нашлось.</p> : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type HeroTitleLineValue = EditableContent['hero']['titleLines'][number];

/**
 * Оформление одной строки заголовка. Пустое значение здесь всегда значит
 * «как у всего заголовка», поэтому владелец может тронуть только ту строку,
 * которую действительно хочет выделить, и не трогать остальные.
 */
function TitleLineStyleControls({
  line,
  blockFont,
  blockEffect,
  onChange,
}: {
  line: HeroTitleLineValue;
  blockFont: ContentFontId;
  blockEffect: HeroTitleEffect;
  onChange: (patch: Partial<HeroTitleLineValue>) => void;
}) {
  const effectValue = line.effect ?? 'inherit';
  const lineEffect = line.effect ?? blockEffect;
  const blockFontLabel = blockFont === 'auto' ? '' : getContentFontDefinition(blockFont).label;

  return (
    <div className="admin-line-style">
      <FontPicker
        label="Шрифт строки"
        value={line.font ?? 'auto'}
        role="title"
        sample={line.text || 'Пример строки'}
        inheritLabel={blockFontLabel ? `Как у заголовка · ${blockFontLabel}` : 'Как у заголовка'}
        onChange={(font) => onChange({ font: font === 'auto' ? undefined : font })}
      />
      <AdminSelect
        label="Эффект строки"
        value={effectValue}
        options={[
          { value: 'inherit', label: `Как у заголовка · ${HERO_TITLE_EFFECT_LABELS[blockEffect]}` },
          ...HERO_TITLE_EFFECT_OPTIONS,
        ]}
        onValueChange={(next) => onChange({
          effect: next === 'inherit' ? undefined : next as HeroTitleEffect,
          // Скорость без своего эффекта смысла не имеет.
          speed: next === 'inherit' || next === 'none' ? undefined : line.speed,
        })}
      />
      {line.effect && line.effect !== 'none' ? (
        <AdminSelect
          label="Скорость строки"
          value={line.speed ?? 'inherit'}
          options={[{ value: 'inherit', label: 'Как у заголовка' }, ...HERO_TITLE_EFFECT_SPEED_OPTIONS]}
          onValueChange={(next) => onChange({ speed: next === 'inherit' ? undefined : next as HeroTitleEffectSpeed })}
        />
      ) : null}
      {lineEffect !== 'none' && (line.font || line.effect) ? (
        <p className="admin-hint admin-line-style__note">
          Строки появляются по очереди сверху вниз — задержка считается от общей настройки блока.
        </p>
      ) : null}
    </div>
  );
}

function TypographySizeControl({
  label,
  value,
  min,
  max,
  recommended,
  onChange,
}: {
  label: string;
  value: TypographySize | undefined;
  min: number;
  max: number;
  recommended: number;
  onChange: (value: TypographySize) => void;
}) {
  const numericValue = typeof value === 'number' ? value : recommended;
  const inherited = typeof value !== 'number';
  const inheritedLabel = value === 'compact' ? 'Компактный пресет' : value === 'large' ? 'Крупный пресет' : 'Как в дизайне';
  return (
    <div className="admin-size-control">
      <div className="admin-label-row">
        <span className="admin-label">{label}</span>
        <output>{inherited ? inheritedLabel : `${numericValue} px`}</output>
      </div>
      <div className="admin-size-control__row">
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={numericValue}
          aria-label={label}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <button
          type="button"
          className="admin-button admin-button--quiet admin-button--compact"
          aria-pressed={inherited}
          onClick={() => onChange('standard')}
        >
          Авто
        </button>
      </div>
    </div>
  );
}

function TypographyControls({
  value,
  variant,
  sample,
  onChange,
}: {
  value: TypographySettings;
  variant: 'hero' | 'section' | 'cta' | 'contact';
  sample: string;
  onChange: (value: TypographySettings) => void;
}) {
  const normalized = normalizeContentTypography(value);
  const titleRecommendations = variant === 'hero'
    ? { mobile: 32, desktop: 56 }
    : variant === 'cta'
      ? { mobile: 26, desktop: 36 }
      : variant === 'contact'
        ? { mobile: 32, desktop: 44 }
        : { mobile: 32, desktop: 44 };
  const selectedTitleFont = getContentFontDefinition(normalized.titleFont);
  const weightOptions = [
    { value: 'auto', label: 'Как в дизайне' },
    ...(normalized.titleFont === 'auto'
      ? []
      : selectedTitleFont.weights.map((weight) => ({ value: String(weight), label: String(weight) }))),
  ];
  const update = (patch: Partial<ContentTypography>) => onChange(normalizeContentTypography({ ...normalized, ...patch }));
  const lineOptions = [
    { value: '0', label: 'Без ограничения' },
    ...Array.from({ length: 6 }, (_, index) => ({ value: String(index + 1), label: `${index + 1} ${index === 0 ? 'строка' : index < 4 ? 'строки' : 'строк'}` })),
  ];

  return (
    <section className="admin-typography-panel" aria-labelledby={`typography-${variant}`}>
      <div className="admin-typography-panel__heading">
        <Type aria-hidden="true" />
        <div>
          <strong id={`typography-${variant}`}>Оформление текста</strong>
          <span>Шрифты с кириллицей, отдельные размеры для экранов и безопасное ограничение строк без обрезания текста.</span>
        </div>
        <button
          type="button"
          className="admin-button admin-button--quiet admin-button--compact admin-typography-reset"
          onClick={() => onChange({ ...DEFAULT_CONTENT_TYPOGRAPHY })}
        >
          Сбросить
        </button>
      </div>

      <div className="admin-font-role-grid">
        <FontPicker label="Шрифт заголовка" value={normalized.titleFont} role="title" sample={sample} onChange={(titleFont) => update({ titleFont, titleWeight: 'auto' })} />
        <FontPicker label="Шрифт основного текста" value={normalized.bodyFont} role="body" sample="Понятный текст помогает принять решение" onChange={(bodyFont) => update({ bodyFont })} />
      </div>

      <div className="admin-typography-subsection">
        <div className="admin-typography-subsection__heading">
          <strong>Размеры</strong>
          <span>«Авто» сохраняет исходный дизайн конкретной страницы.</span>
        </div>
        <div className="admin-size-grid">
          <TypographySizeControl label="Заголовок · ПК" value={normalized.titleDesktop} min={20} max={96} recommended={titleRecommendations.desktop} onChange={(titleDesktop) => update({ titleDesktop })} />
          <TypographySizeControl label="Заголовок · телефон" value={normalized.titleMobile} min={16} max={64} recommended={titleRecommendations.mobile} onChange={(titleMobile) => update({ titleMobile })} />
          <TypographySizeControl label="Текст · ПК" value={normalized.bodyDesktop} min={12} max={28} recommended={18} onChange={(bodyDesktop) => update({ bodyDesktop: typeof bodyDesktop === 'number' ? bodyDesktop : undefined, body: 'standard' })} />
          <TypographySizeControl label="Текст · телефон" value={normalized.bodyMobile} min={12} max={24} recommended={16} onChange={(bodyMobile) => update({ bodyMobile: typeof bodyMobile === 'number' ? bodyMobile : undefined, body: 'standard' })} />
        </div>
      </div>

      <div className="admin-typography-grid admin-typography-grid--advanced">
        <AdminSelect label="Максимум строк · ПК" value={String(normalized.titleMaxLinesDesktop)} options={lineOptions} onValueChange={(next) => update({ titleMaxLinesDesktop: Number(next) })} />
        <AdminSelect label="Максимум строк · телефон" value={String(normalized.titleMaxLinesMobile)} options={lineOptions} onValueChange={(next) => update({ titleMaxLinesMobile: Number(next) })} />
        <AdminSelect label="Насыщенность заголовка" value={String(normalized.titleWeight)} options={weightOptions} onValueChange={(next) => update({ titleWeight: next === 'auto' ? 'auto' : Number(next) as TypographySettings['titleWeight'] })} />
        <AdminSelect label="Межстрочный интервал" value={normalized.titleLineHeight} options={[{ value: 'auto', label: 'Как в дизайне' }, { value: 'tight', label: 'Плотный' }, { value: 'snug', label: 'Собранный' }, { value: 'normal', label: 'Обычный' }, { value: 'relaxed', label: 'Свободный' }]} onValueChange={(next) => update({ titleLineHeight: next as TypographySettings['titleLineHeight'] })} />
        <AdminSelect label="Расстояние между буквами" value={normalized.titleLetterSpacing} options={[{ value: 'auto', label: 'Как в дизайне' }, { value: 'tight', label: 'Плотно' }, { value: 'normal', label: 'Обычно' }, { value: 'wide', label: 'Шире' }]} onValueChange={(next) => update({ titleLetterSpacing: next as TypographySettings['titleLetterSpacing'] })} />
      </div>
      {(normalized.titleMaxLinesDesktop > 0 || normalized.titleMaxLinesMobile > 0) ? (
        <p className="admin-typography-note">Если текст не помещается, сайт немного уменьшит заголовок, но никогда не обрежет слова.</p>
      ) : null}
    </section>
  );
}

const HERO_EFFECT_DESCRIPTIONS: Record<HeroTitleEffect, string> = {
  none: 'Сразу',
  'fade-up': 'Мягко снизу',
  'fade-in': 'Проявление',
  'slide-left': 'Слева',
  'slide-right': 'Справа',
  'blur-reveal': 'Из фокуса',
  typewriter: 'По буквам',
  words: 'По словам',
};

function AdminNumberStepper({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  const update = (direction: -1 | 1) => onChange(Math.min(max, Math.max(min, value + direction * step)));
  return (
    <div className="admin-field">
      <span className="admin-label">{label}</span>
      <div className="admin-number-stepper" role="group" aria-label={label}>
        <button type="button" onClick={() => update(-1)} disabled={value <= min} aria-label={`Уменьшить: ${label}`}><Minus aria-hidden="true" /></button>
        <output aria-live="polite">{value}{suffix}</output>
        <button type="button" onClick={() => update(1)} disabled={value >= max} aria-label={`Увеличить: ${label}`}><Plus aria-hidden="true" /></button>
      </div>
    </div>
  );
}

function HeroEffectControls({
  value,
  onChange,
}: {
  value: EditableContent['hero']['titleAnimation'];
  onChange: (value: EditableContent['hero']['titleAnimation']) => void;
}) {
  return (
    <section className="admin-motion-panel" aria-labelledby="hero-motion-title">
      <div className="admin-typography-panel__heading">
        <WandSparkles aria-hidden="true" />
        <div>
          <strong id="hero-motion-title">Появление заголовка</strong>
          <span>Эффект проигрывается один раз и автоматически отключается для людей, выбравших уменьшение движения.</span>
        </div>
      </div>
      <div className="admin-effect-grid" role="group" aria-label="Эффект появления заголовка">
        {HERO_TITLE_EFFECT_OPTIONS.map((option) => (
          <button
            type="button"
            key={option.value}
            className="admin-effect-card"
            aria-pressed={value.effect === option.value}
            onClick={() => onChange({ ...value, effect: option.value })}
          >
            <span>{option.label}</span>
            <small>{HERO_EFFECT_DESCRIPTIONS[option.value]}</small>
          </button>
        ))}
      </div>
      {value.effect !== 'none' ? (
        <div className="admin-motion-settings">
          <AdminSelect
            label="Скорость"
            value={value.speed}
            options={HERO_TITLE_EFFECT_SPEED_OPTIONS}
            onValueChange={(speed) => onChange({ ...value, speed: speed as HeroTitleEffectSpeed })}
          />
          <AdminNumberStepper
            label="Задержка перед стартом"
            value={value.delayMs}
            min={0}
            max={2000}
            step={100}
            suffix=" мс"
            onChange={(delayMs) => onChange({ ...value, delayMs })}
          />
        </div>
      ) : null}
    </section>
  );
}

export default function AdminContentControl({ password }: { password: string }) {
  const [page, setPage] = useState<EditorPage>('home');
  const [content, setContent] = useState<EditableContent>(() => editableDefaults('home'));
  const [section, setSection] = useState<SectionPayload | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [activeSection, setActiveSection] = useState<EditorSection>('hero');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [publishArmed, setPublishArmed] = useState(false);
  const [contentMode, setContentMode] = useState<'pages' | 'faq'>('pages');
  const [search, setSearch] = useState('');
  // Отдельно от notice: «нужна миграция» — не ошибка редактора, а недоделанная
  // настройка базы, и подсказка должна пережить любое следующее сообщение.
  const [migration, setMigration] = useState('');
  const loadSequence = useRef(0);
  const contentRef = useRef(content);
  // Сохранённая версия держится в состоянии, а не в ref: от неё зависит и
  // «есть несохранённые изменения», и отметки изменённых блоков, а ref не
  // вызывает перерисовку и обе подсказки отставали на один шаг.
  const [baseline, setBaseline] = useState<EditableContent>(content);

  // Один stringify на изменение контента вместо двух на каждый рендер.
  const contentSignature = useMemo(() => JSON.stringify(content), [content]);
  const baselineSignature = useMemo(() => JSON.stringify(baseline), [baseline]);
  useEffect(() => { contentRef.current = content; }, [content]);

  const pageMeta = useMemo(() => PAGES.find((item) => item.value === page) || PAGES[0], [page]);
  // Блок отзывов есть и на страницах услуг — раньше он был только у главной.
  const availableSections = useMemo<EditorSection[]>(
    () => ['seo', 'hero', 'services', 'cases', 'cta', 'testimonials', 'contact'],
    [],
  );
  const isDirty = contentSignature !== baselineSignature;

  /**
   * Какие блоки отличаются от сохранённой версии. Правка одного заголовка
   * раньше просто зажигала «есть несохранённые изменения» — по какой странице
   * и в каком блоке, приходилось вспоминать самому.
   */
  const changedSections = useMemo(() => {
    const changed = new Set<EditorSection>();
    if (!isDirty) return changed;
    availableSections.forEach((value) => {
      const left = JSON.stringify((content as unknown as Record<string, unknown>)[value]);
      const right = JSON.stringify((baseline as unknown as Record<string, unknown>)[value]);
      if (left !== right) changed.add(value);
    });
    return changed;
  }, [availableSections, baseline, content, isDirty]);

  /** Вернуть один блок к сохранённому виду, не трогая правки в остальных. */
  const revertSection = (value: EditorSection) => {
    setContent((current) => setAtPath(current, [value], clone((baseline as unknown as Record<string, unknown>)[value])));
    setPublishArmed(false);
    setNotice(`Блок «${SECTION_LABELS[value]}» возвращён к сохранённой версии.`);
  };

  // Поиск по всем текстам страницы: показывает, в каком блоке лежит фраза,
  // и открывает его. Без него длинные блоки приходится обходить вручную.
  const searchQuery = search.trim();
  const searchHits = useMemo(() => {
    if (searchQuery.length < 2) return [];
    const needle = searchQuery.toLocaleLowerCase('ru');
    return availableSections.flatMap((value) => {
      const match = sectionTexts(content, value).find((item) => item.toLocaleLowerCase('ru').includes(needle));
      return match ? [{ section: value, snippet: highlightSnippet(match, searchQuery) }] : [];
    });
  }, [availableSections, content, searchQuery]);

  const load = useCallback(async (preserveNotice = false): Promise<boolean> => {
    const requestId = ++loadSequence.current;
    const contentAtRequest = JSON.stringify(contentRef.current);
    setLoading(true);
    if (!preserveNotice) setNotice('');
    try {
      const response = await fetch(`/api/admin/site-sections?key=${encodeURIComponent(pageMeta.key)}`, {
        headers: { 'X-Admin-Password': password },
        credentials: 'same-origin',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => null) as {
        success?: boolean; error?: string; code?: string; migration?: string;
        section?: SectionPayload | null; versions?: VersionRow[];
      } | null;
      if (!response.ok || !payload?.success) {
        setMigration(payload?.code === 'MIGRATION_REQUIRED' ? String(payload.migration || '') : '');
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      setMigration('');
      if (requestId !== loadSequence.current) return false;
      if (JSON.stringify(contentRef.current) !== contentAtRequest) {
        setNotice('Ответ получен, но не применён: в редакторе уже есть более новые несохранённые изменения.');
        return false;
      }
      const defaults = editableDefaults(page);
      const next = payload.section?.draft ? mergeContent(defaults, normalizeStored(page, payload.section.draft)) : defaults;
      setSection(payload.section || null);
      setVersions(payload.versions || []);
      setContent(next);
      setBaseline(next);
      return true;
    } catch (error) {
      if (requestId !== loadSequence.current) return false;
      setNotice(error instanceof Error ? error.message : 'Не удалось загрузить тексты');
      return false;
    } finally {
      if (requestId === loadSequence.current) setLoading(false);
    }
  }, [page, pageMeta.key, password]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!isDirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const switchPage = async (nextPage: EditorPage) => {
    if (nextPage === page) return;
    // Раньше редактор просто отказывался переключаться и оставлял владельца
    // гадать, что делать дальше. Теперь выбор явный и остаётся в одном окне.
    if (isDirty) {
      const discard = await confirmAsk({
        title: `Перейти на страницу «${PAGES.find((item) => item.value === nextPage)?.label}»?`,
        description: `Несохранённые правки в блоках «${[...changedSections].map((value) => SECTION_LABELS[value]).join('», «')}» пропадут. Сначала сохраните черновик, если они нужны.`,
        confirmLabel: 'Перейти и потерять правки',
        cancelLabel: 'Остаться',
        tone: 'danger',
      });
      if (!discard) return;
    }
    loadSequence.current += 1;
    const next = editableDefaults(nextPage);
    setPage(nextPage);
    setContent(next);
    setBaseline(next);
    setSection(null);
    setVersions([]);
    setActiveSection('hero');
    setNotice('');
    setPublishArmed(false);
  };

  const update = (path: Array<string | number>, value: unknown) => {
    setContent((current) => setAtPath(current, path, value));
    setPublishArmed(false);
  };

  const convertHeroTitleToLines = () => {
    const lines: EditableContent['hero']['titleLines'] = [];
    const prefix = content.hero.titlePrefix.trim();
    const accent = content.hero.titleAccent.trim();
    if (prefix) lines.push({ text: prefix });
    if (accent) lines.push({ text: accent, tone: 'accent' });
    update(['hero', 'titleLines'], lines.length ? lines : [{ text: '' }]);
  };

  const restoreHeroTitleParts = () => {
    setContent((current) => {
      const next = clone(current);
      next.hero.titlePrefix = current.hero.titleLines
        .filter((line) => line.tone !== 'accent')
        .map((line) => line.text.trim())
        .filter(Boolean)
        .join(' ');
      next.hero.titleAccent = current.hero.titleLines
        .filter((line) => line.tone === 'accent')
        .map((line) => line.text.trim())
        .filter(Boolean)
        .join(' ');
      next.hero.titleLines = [];
      return next;
    });
    setPublishArmed(false);
  };

  const save = async (action: 'save' | 'publish') => {
    const savedContent = clone(content);
    const validationIssue = validateEditableContent(savedContent);
    if (validationIssue) {
      setActiveSection(validationIssue.section);
      setPublishArmed(false);
      setNotice(`Не сохранено: ${validationIssue.message}.`);
      return;
    }
    setLoading(true);
    setNotice(action === 'publish' ? 'Публикую…' : 'Сохраняю черновик…');
    try {
      const response = await fetch('/api/admin/site-sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
        credentials: 'same-origin',
        body: JSON.stringify({ action, key: pageMeta.key, pagePath: pageMeta.path, label: pageMeta.label, content: serializeContent(page, savedContent) }),
      });
      const payload = await response.json().catch(() => null) as {
        success?: boolean;
        error?: string;
        seoBuild?: { configured?: boolean; triggered?: boolean; error?: string };
      } | null;
      if (!response.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${response.status}`);
      setPublishArmed(false);
      if (JSON.stringify(contentRef.current) !== JSON.stringify(savedContent)) {
        setNotice('Версия на момент нажатия сохранена. Более новые изменения остались в редакторе.');
      } else {
        const refreshed = await load(true);
        if (refreshed) {
          if (action === 'publish' && payload.seoBuild?.triggered) {
            setNotice('Опубликовано: версия уже доступна из D1, production-сборка SEO-HTML запущена автоматически.');
          } else if (action === 'publish' && payload.seoBuild?.configured) {
            setNotice(`Текст опубликован, но SEO-сборку запустить не удалось${payload.seoBuild.error ? `: ${payload.seoBuild.error}` : '.'}`);
          } else if (action === 'publish') {
            setNotice('Текст опубликован. Для автоматического обновления SEO-HTML добавьте секрет CF_PAGES_DEPLOY_HOOK_URL.');
          } else {
            setNotice('Черновик сохранён. Публичная версия не изменилась.');
          }
        }
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось сохранить');
    } finally {
      setLoading(false);
    }
  };

  const restore = async (versionId: number) => {
    if (isDirty) {
      setNotice('Сначала сохраните или отмените текущие изменения — восстановление версии заменит черновик.');
      return;
    }
    setLoading(true);
    setNotice('Восстанавливаю версию в черновик…');
    try {
      const response = await fetch('/api/admin/site-sections', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Password': password },
        credentials: 'same-origin',
        body: JSON.stringify({ action: 'restore', key: pageMeta.key, versionId }),
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; error?: string } | null;
      if (!response.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${response.status}`);
      const refreshed = await load(true);
      if (refreshed) setNotice('Версия восстановлена в черновик. Проверьте её перед публикацией.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Не удалось восстановить версию');
    } finally {
      setLoading(false);
    }
  };

  const contentModeSwitch = (
    <div className="admin-segmented admin-content-mode" role="group" aria-label="Тип контента">
      <button type="button" aria-pressed={contentMode === 'pages'} onClick={() => setContentMode('pages')}>Страницы</button>
      <button type="button" aria-pressed={contentMode === 'faq'} onClick={() => setContentMode('faq')}>FAQ</button>
    </div>
  );

  if (contentMode === 'faq') return <div className="admin-stack admin-stack--lg">{contentModeSwitch}<AdminFaqControl password={password} /></div>;

  const renderTypography = (
    key: 'hero' | 'services' | 'cases' | 'cta' | 'testimonials' | 'contact',
    value: TypographySettings,
    variant: 'hero' | 'section' | 'cta' | 'contact',
    sample: string,
  ) => (
    <TypographyControls value={value} variant={variant} sample={sample} onChange={(next) => update([key, 'typography'], next)} />
  );

  return (
    <div className="admin-stack admin-stack--lg admin-content-control">
      {contentModeSwitch}
      <div className="admin-section-header">
        <div>
          <p className="admin-eyebrow">Контент сайта</p>
          <h2 className="admin-title">Редактор сайта</h2>
          <p className="admin-subtitle">Рабочая студия страниц: меняйте текст, типографику и эффекты, сразу проверяйте реальную вёрстку на разных экранах и публикуйте только готовый результат.</p>
        </div>
        <a className="admin-button admin-button--secondary" href={pageMeta.path} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" /> Открыть страницу</a>
      </div>

      <div className="admin-toolbar admin-content-toolbar">
        <AdminSelect label="Страница" value={page} disabled={loading} options={PAGES.map((item) => ({ value: item.value, label: item.label }))} onValueChange={(value) => { void switchPage(value as EditorPage); }} />
        <div className="admin-content-statuses">
          <span className={section?.status === 'published' ? 'admin-state admin-state--success' : 'admin-state admin-state--warning'}>
            {section?.status === 'published' ? <Check aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
            {section?.status === 'published' ? `На сайте · v${section.version}` : section ? `Черновик · v${section.version}` : 'Статическая версия'}
          </span>
          {isDirty ? (
            <span className="admin-state admin-state--warning">
              Не сохранено: {[...changedSections].map((value) => SECTION_LABELS[value]).join(', ')}
            </span>
          ) : <span className="admin-state">Редактор синхронизирован</span>}
        </div>
        <button className="admin-button admin-button--secondary" type="button" onClick={() => void load()} disabled={loading || isDirty}><RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Обновить</button>
        {isDirty ? <button className="admin-button admin-button--quiet" type="button" onClick={() => { const next = editableDefaults(page); const restored = section?.draft ? mergeContent(next, normalizeStored(page, section.draft)) : next; setContent(restored); setBaseline(restored); setNotice('Несохранённые изменения отменены.'); }}>Отменить изменения</button> : null}
      </div>

      {migration ? (
        <div className="admin-notice admin-notice--warning" role="status">
          Примените миграцию <code>{migration}</code> к production D1 — до неё тексты страниц негде хранить,
          сайт продолжает показывать версию из кода, а сохранение здесь работать не будет.
        </div>
      ) : null}
      {notice ? <div className="admin-notice" role="status" aria-live="polite">{notice}</div> : null}

      <AdminContentPreview page={page} section={activeSection} content={content} />

      <div className="admin-content-layout">
        <section className="admin-card admin-content-editor">
          <div className="admin-editor-workspace">
            <nav className="admin-block-nav" aria-label="Порядок блоков страницы">
              <p className="admin-label">Порядок на странице</p>
              <div className="admin-block-search">
                <Search aria-hidden="true" />
                <input
                  type="search"
                  className="admin-input"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Найти текст на странице"
                  aria-label="Поиск по текстам страницы"
                />
              </div>
              {searchQuery.length >= 2 ? (
                <div className="admin-block-search__results">
                  {searchHits.length === 0 ? (
                    <p className="admin-meta">Ничего не нашлось на этой странице.</p>
                  ) : searchHits.map((hit) => (
                    <button key={hit.section} type="button" className="admin-block-search__hit" onClick={() => { setActiveSection(hit.section); setSearch(''); }}>
                      <strong>{SECTION_LABELS[hit.section]}</strong>
                      <span>{hit.snippet}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              {availableSections.map((value, index) => (
                <button
                  key={value}
                  type="button"
                  aria-current={activeSection === value ? 'step' : undefined}
                  data-changed={changedSections.has(value) ? 'true' : undefined}
                  onClick={() => setActiveSection(value)}
                >
                  <span>{value === 'seo' ? 'SEO' : String(index)}</span>
                  <span>
                    <strong>{SECTION_LABELS[value]}</strong>
                    <small>{changedSections.has(value) ? 'Изменён, не сохранён' : sectionSummary(content, value)}</small>
                  </span>
                  <ChevronRight aria-hidden="true" />
                </button>
              ))}
            </nav>
            <div className="admin-block-nav-mobile">
              <AdminSelect label="Редактируемый блок" value={activeSection} options={availableSections.map((value, index) => ({ value, label: value === 'seo' ? `SEO · ${SECTION_LABELS[value]}` : `${index}. ${SECTION_LABELS[value]}` }))} onValueChange={(value) => setActiveSection(value as EditorSection)} />
            </div>

            <div className="admin-block-editor">
              <div className="admin-block-editor__heading">
                <span>{activeSection === 'seo' ? 'SEO' : availableSections.indexOf(activeSection)}</span>
                <div><p className="admin-eyebrow">Редактируемый блок</p><h3>{SECTION_LABELS[activeSection]}</h3></div>
                {changedSections.has(activeSection) ? (
                  <button
                    type="button"
                    className="admin-button admin-button--quiet admin-button--compact"
                    onClick={() => revertSection(activeSection)}
                  >
                    <RotateCcw aria-hidden="true" /> Вернуть блок
                  </button>
                ) : null}
              </div>

              {activeSection === 'seo' ? <div className="admin-form-grid">
                <Field id="seo-title" label="SEO-заголовок" value={content.seo.title} maxLength={90} hint="Рекомендуемая длина — примерно 45–65 знаков." onChange={(value) => update(['seo', 'title'], value)} />
                <Field id="seo-description" label="SEO-описание" value={content.seo.description} multiline maxLength={220} hint="Рекомендуемая длина — примерно 120–170 знаков." onChange={(value) => update(['seo', 'description'], value)} />
                <div className="admin-notice admin-field--wide">Canonical URL, robots, Open Graph URL и техническая разметка защищены кодом. Здесь меняется только текст сниппета и его синхронизированная SEO-копия.</div>
              </div> : null}

              {activeSection === 'hero' ? <div className="admin-stack admin-stack--lg">
                <div className="admin-form-grid">
                  <Field id="hero-badge" label="Бейдж" value={content.hero.badge} maxLength={120} onChange={(value) => update(['hero', 'badge'], value)} />
                  {content.hero.titleLines.length === 0 ? <><Field id="hero-prefix" label="Основная часть заголовка" value={content.hero.titlePrefix} maxLength={180} onChange={(value) => update(['hero', 'titlePrefix'], value)} /><Field id="hero-accent" label="Выделенная часть" value={content.hero.titleAccent} maxLength={240} onChange={(value) => update(['hero', 'titleAccent'], value)} /></> : null}
                  <Field id="hero-primary" label="Основная кнопка" value={content.hero.primaryButton} maxLength={80} onChange={(value) => update(['hero', 'primaryButton'], value)} />
                  <Field id="hero-secondary" label="Вторая кнопка" value={content.hero.secondaryButton} maxLength={80} onChange={(value) => update(['hero', 'secondaryButton'], value)} />
                </div>
                {content.hero.titleLines.length === 0 ? (
                  <div className="admin-notice admin-stack">
                    <span><strong>Нужен точный перенос заголовка?</strong> Разделите его на отдельные строки и задайте стиль каждой строке. На мобильном и ПК порядок останется одинаковым.</span>
                    <div><button type="button" className="admin-button admin-button--secondary" onClick={convertHeroTitleToLines}><Plus aria-hidden="true" /> Разделить на строки</button></div>
                  </div>
                ) : (
                  <div className="admin-field admin-field--wide">
                    <div className="admin-label-row"><span className="admin-label">Строки заголовка</span><span className="admin-char-count">{content.hero.titleLines.length}/5</span></div>
                    <div className="admin-list-editor">
                      {content.hero.titleLines.map((line, index) => (
                        <div className="admin-list-editor__item" key={index}>
                          <OrderedItemHeader
                            label="Строка"
                            index={index}
                            count={content.hero.titleLines.length}
                            minItems={1}
                            onMove={(direction) => update(['hero', 'titleLines'], moveItem(content.hero.titleLines, index, direction))}
                            onDelete={() => update(['hero', 'titleLines'], content.hero.titleLines.filter((_, itemIndex) => itemIndex !== index))}
                          />
                          <div className="admin-inline-fields">
                            <Field id={`hero-line-${index}`} label="Текст" value={line.text} maxLength={180} onChange={(value) => update(['hero', 'titleLines', index, 'text'], value)} />
                            <AdminSelect label="Выделение" value={line.tone || 'default'} options={[{ value: 'default', label: 'Обычная' }, { value: 'accent', label: 'Акцент' }, { value: 'supporting', label: 'Поддерживающая' }]} onValueChange={(value) => update(['hero', 'titleLines', index, 'tone'], value === 'default' ? undefined : value)} />
                          </div>
                          <TitleLineStyleControls
                            line={line}
                            blockFont={content.hero.typography?.titleFont ?? 'auto'}
                            blockEffect={content.hero.titleAnimation?.effect ?? 'none'}
                            onChange={(patch) => update(['hero', 'titleLines', index], { ...line, ...patch })}
                          />
                        </div>
                      ))}
                      <div className="admin-content-statuses">
                        <AddItemButton label="Добавить строку" count={content.hero.titleLines.length} maxItems={5} onAdd={() => update(['hero', 'titleLines'], [...content.hero.titleLines, { text: '' }])} />
                        <button type="button" className="admin-button admin-button--quiet" onClick={restoreHeroTitleParts}><RotateCcw aria-hidden="true" /> Вернуть две части</button>
                      </div>
                    </div>
                    <span className="admin-hint">При возврате обычного режима все строки без акцента объединятся в основную часть, строки с акцентом — в выделенную.</span>
                  </div>
                )}
                <StringListEditor label="Абзацы под заголовком" singular="Абзац" values={content.hero.paragraphs} maxItems={3} maxLength={900} onChange={(value) => update(['hero', 'paragraphs'], value)} />
                <div className="admin-field admin-field--wide">
                  <div className="admin-label-row"><span className="admin-label">Подтверждённые цифры</span><span className="admin-char-count">{content.hero.stats.length}/4</span></div>
                  <div className="admin-list-editor">
                    {content.hero.stats.map((stat, index) => (
                      <div className="admin-list-editor__item" key={index}>
                        <OrderedItemHeader
                          label="Показатель"
                          index={index}
                          count={content.hero.stats.length}
                          onMove={(direction) => update(['hero', 'stats'], moveItem(content.hero.stats, index, direction))}
                          onDelete={() => update(['hero', 'stats'], content.hero.stats.filter((_, itemIndex) => itemIndex !== index))}
                        />
                        <div className="admin-stat-fields"><Field id={`hero-stat-value-${index}`} label="Значение" value={stat.value} maxLength={40} onChange={(value) => update(['hero', 'stats', index, 'value'], value)} /><Field id={`hero-stat-label-${index}`} label="Подпись" value={stat.label} maxLength={100} onChange={(value) => update(['hero', 'stats', index, 'label'], value)} /></div>
                      </div>
                    ))}
                    <AddItemButton label="Добавить показатель" count={content.hero.stats.length} maxItems={4} onAdd={() => update(['hero', 'stats'], [...content.hero.stats, { value: '', label: '' }])} />
                  </div>
                  <span className="admin-hint">Публикуйте только цифры, подтверждённые кейсом или рекламным кабинетом.</span>
                </div>
                <HeroEffectControls value={content.hero.titleAnimation} onChange={(next) => update(['hero', 'titleAnimation'], next)} />
                {renderTypography('hero', content.hero.typography, 'hero', content.hero.titleLines[0]?.text || content.hero.titlePrefix)}
              </div> : null}

              {activeSection === 'services' ? <div className="admin-stack admin-stack--lg">
                <div className="admin-form-grid"><Field id="services-badge" label="Бейдж" value={content.services.badge} maxLength={120} onChange={(value) => update(['services', 'badge'], value)} /><Field id="services-prefix" label="Заголовок" value={content.services.titlePrefix} maxLength={180} onChange={(value) => update(['services', 'titlePrefix'], value)} /><Field id="services-accent" label="Акцент заголовка" value={content.services.titleAccent} maxLength={220} onChange={(value) => update(['services', 'titleAccent'], value)} /><Field id="services-description" label="Описание блока" value={content.services.description} multiline maxLength={900} onChange={(value) => update(['services', 'description'], value)} /></div>
                <div className="admin-field admin-field--wide">
                  <div className="admin-label-row"><span className="admin-label">Карточки услуг</span><span className="admin-char-count">{content.services.cards.length}/8</span></div>
                  <div className="admin-list-editor">
                    {content.services.cards.map((card, index) => (
                      <div key={index}>
                        <OrderedItemHeader
                          label="Карточка"
                          index={index}
                          count={content.services.cards.length}
                          minItems={1}
                          onMove={(direction) => update(['services', 'cards'], moveItem(content.services.cards, index, direction))}
                          onDelete={() => update(['services', 'cards'], content.services.cards.filter((_, itemIndex) => itemIndex !== index))}
                        />
                        <details className="admin-disclosure" open={index === 0}>
                          <summary><span>{card.title || 'Новая карточка услуги'}</span><ChevronRight aria-hidden="true" /></summary>
                          <div className="admin-form-grid"><Field id={`service-title-${index}`} label="Название" value={card.title} maxLength={160} onChange={(value) => update(['services', 'cards', index, 'title'], value)} /><Field id={`service-description-${index}`} label="Описание" value={card.description} multiline maxLength={700} onChange={(value) => update(['services', 'cards', index, 'description'], value)} /><StringListEditor label="Что входит" singular="Пункт" values={card.features} maxItems={8} maxLength={120} onChange={(value) => update(['services', 'cards', index, 'features'], value)} /></div>
                        </details>
                      </div>
                    ))}
                    <AddItemButton label="Добавить карточку" count={content.services.cards.length} maxItems={8} onAdd={() => update(['services', 'cards'], [...content.services.cards, { title: '', description: '', features: [''], visualSlot: content.services.cards.length % editableDefaults(page).services.cards.length }])} />
                  </div>
                </div>

                <div className="admin-field admin-field--wide">
                  <div className="admin-label-row">
                    <span className="admin-label">Разбор «{content.services.detailed.title || 'Как я работаю'}»</span>
                    <span className="admin-char-count">{content.services.detailed.sections.length}/8</span>
                  </div>
                  <span className="admin-hint">Всплывающее окно по кнопке под карточками услуг. Самый длинный текст страницы — раньше правился только в коде.</span>
                  <div className="admin-form-grid">
                    <Field id="services-detailed-title" label="Заголовок окна" value={content.services.detailed.title} maxLength={160} onChange={(value) => update(['services', 'detailed', 'title'], value)} />
                    <Field id="services-detailed-button" label="Кнопка внизу окна" value={content.services.detailed.button} maxLength={80} onChange={(value) => update(['services', 'detailed', 'button'], value)} />
                  </div>
                  <div className="admin-list-editor">
                    {content.services.detailed.sections.map((item, index) => (
                      <div key={index}>
                        <OrderedItemHeader
                          label="Раздел"
                          index={index}
                          count={content.services.detailed.sections.length}
                          onMove={(direction) => update(['services', 'detailed', 'sections'], moveItem(content.services.detailed.sections, index, direction))}
                          onDelete={() => update(['services', 'detailed', 'sections'], content.services.detailed.sections.filter((_, itemIndex) => itemIndex !== index))}
                        />
                        <details className="admin-disclosure" open={index === 0}>
                          <summary><span>{item.title || 'Новый раздел'}</span><ChevronRight aria-hidden="true" /></summary>
                          <div className="admin-form-grid">
                            <Field id={`detailed-title-${index}`} label="Заголовок раздела" value={item.title} maxLength={200} onChange={(value) => update(['services', 'detailed', 'sections', index, 'title'], value)} />
                            <Field
                              id={`detailed-text-${index}`}
                              label="Текст раздела"
                              value={item.text}
                              multiline
                              rows={10}
                              maxLength={2500}
                              hint="Пустая строка разделяет абзацы. Строка, начинающаяся с «•», выводится пунктом списка."
                              onChange={(value) => update(['services', 'detailed', 'sections', index, 'text'], value)}
                            />
                          </div>
                        </details>
                      </div>
                    ))}
                    <AddItemButton
                      label="Добавить раздел"
                      count={content.services.detailed.sections.length}
                      maxItems={8}
                      onAdd={() => update(['services', 'detailed', 'sections'], [...content.services.detailed.sections, {
                        title: '',
                        text: '',
                        visualSlot: content.services.detailed.sections.length % Math.max(1, editableDefaults(page).services.detailed.sections.length),
                      }])}
                    />
                  </div>
                  <span className="admin-hint">Значок слева от заголовка закреплён за позицией раздела и меняется вместе с порядком.</span>
                </div>
                {renderTypography('services', content.services.typography, 'section', `${content.services.titlePrefix} ${content.services.titleAccent}`.trim())}
              </div> : null}

              {activeSection === 'cases' ? <div className="admin-stack admin-stack--lg">
                <div className="admin-form-grid"><Field id="cases-badge" label="Бейдж" value={content.cases.badge} maxLength={120} onChange={(value) => update(['cases', 'badge'], value)} /><Field id="cases-prefix" label="Заголовок" value={content.cases.titlePrefix} maxLength={180} onChange={(value) => update(['cases', 'titlePrefix'], value)} /><Field id="cases-accent" label="Акцент заголовка" value={content.cases.titleAccent} maxLength={220} onChange={(value) => update(['cases', 'titleAccent'], value)} /><Field id="cases-description" label="Описание блока" value={content.cases.description} multiline maxLength={900} onChange={(value) => update(['cases', 'description'], value)} /></div>
                <div className="admin-field admin-field--wide">
                  <div className="admin-label-row"><span className="admin-label">Карточки кейсов</span><span className="admin-char-count">{content.cases.items.length}/12</span></div>
                  <div className="admin-list-editor">
                    {content.cases.items.map((item, index) => (
                      <div key={index}>
                        <OrderedItemHeader
                          label="Карточка"
                          index={index}
                          count={content.cases.items.length}
                          minItems={1}
                          onMove={(direction) => update(['cases', 'items'], moveItem(content.cases.items, index, direction))}
                          onDelete={() => update(['cases', 'items'], content.cases.items.filter((_, itemIndex) => itemIndex !== index))}
                        />
                        <details className="admin-disclosure" open={index === 0}>
                          <summary><span>{item.title || 'Новая карточка кейса'}</span><ChevronRight aria-hidden="true" /></summary>
                          <div className="admin-form-grid">
                            <Field id={`case-title-${index}`} label="Название" value={item.title} maxLength={180} onChange={(value) => update(['cases', 'items', index, 'title'], value)} />
                            <Field id={`case-category-${index}`} label="Категория" value={item.category} maxLength={100} onChange={(value) => update(['cases', 'items', index, 'category'], value)} />
                            <Field id={`case-description-${index}`} label="Описание" value={item.description} multiline maxLength={700} onChange={(value) => update(['cases', 'items', index, 'description'], value)} />
                            <div className="admin-field admin-field--wide">
                              <div className="admin-label-row"><span className="admin-label">Цифры карточки</span><span className="admin-char-count">{item.stats.length}/6</span></div>
                              <div className="admin-list-editor">
                                {item.stats.map((stat, statIndex) => (
                                  <div className="admin-list-editor__item" key={statIndex}>
                                    <OrderedItemHeader
                                      label="Показатель"
                                      index={statIndex}
                                      count={item.stats.length}
                                      onMove={(direction) => update(['cases', 'items', index, 'stats'], moveItem(item.stats, statIndex, direction))}
                                      onDelete={() => update(['cases', 'items', index, 'stats'], item.stats.filter((_, itemIndex) => itemIndex !== statIndex))}
                                    />
                                    <div className="admin-stat-fields"><Field id={`case-${index}-stat-${statIndex}-value`} label="Значение" value={stat.value} maxLength={60} onChange={(value) => update(['cases', 'items', index, 'stats', statIndex, 'value'], value)} /><Field id={`case-${index}-stat-${statIndex}-label`} label="Подпись" value={stat.label} maxLength={100} onChange={(value) => update(['cases', 'items', index, 'stats', statIndex, 'label'], value)} /></div>
                                  </div>
                                ))}
                                <AddItemButton label="Добавить показатель" count={item.stats.length} maxItems={6} onAdd={() => update(['cases', 'items', index, 'stats'], [...item.stats, { value: '', label: '' }])} />
                              </div>
                            </div>
                          </div>
                        </details>
                      </div>
                    ))}
                    <AddItemButton label="Добавить карточку" count={content.cases.items.length} maxItems={12} onAdd={() => update(['cases', 'items'], [...content.cases.items, { title: '', category: '', description: '', stats: [], visualSlot: content.cases.items.length % editableDefaults(page).cases.items.length }])} />
                  </div>
                </div>
                {renderTypography('cases', content.cases.typography, 'section', `${content.cases.titlePrefix} ${content.cases.titleAccent}`.trim())}
              </div> : null}

              {activeSection === 'cta' ? <div className="admin-stack admin-stack--lg"><div className="admin-form-grid"><Field id="cta-badge" label="Бейдж" value={content.cta.badge} maxLength={120} onChange={(value) => update(['cta', 'badge'], value)} /><Field id="cta-title" label="Заголовок" value={content.cta.title} maxLength={260} onChange={(value) => update(['cta', 'title'], value)} /><Field id="cta-description" label="Описание" value={content.cta.description} multiline maxLength={900} onChange={(value) => update(['cta', 'description'], value)} /><Field id="cta-button" label="Кнопка" value={content.cta.button} maxLength={80} onChange={(value) => update(['cta', 'button'], value)} /></div>{renderTypography('cta', content.cta.typography, 'cta', content.cta.title)}</div> : null}

              {activeSection === 'testimonials' && content.testimonials ? <div className="admin-stack admin-stack--lg">
                <div className="admin-form-grid"><Field id="testimonials-badge" label="Бейдж" value={content.testimonials.badge} maxLength={120} onChange={(value) => update(['testimonials', 'badge'], value)} /><Field id="testimonials-prefix" label="Заголовок" value={content.testimonials.titlePrefix} maxLength={180} onChange={(value) => update(['testimonials', 'titlePrefix'], value)} /><Field id="testimonials-accent" label="Акцент заголовка" value={content.testimonials.titleAccent} maxLength={220} onChange={(value) => update(['testimonials', 'titleAccent'], value)} /><Field id="testimonials-description" label="Описание" value={content.testimonials.description} multiline maxLength={900} onChange={(value) => update(['testimonials', 'description'], value)} /></div>
                <div className="admin-field admin-field--wide">
                  <div className="admin-label-row"><span className="admin-label">Цифры доверия</span><span className="admin-char-count">{content.testimonials.stats.length}/6</span></div>
                  <div className="admin-list-editor">
                    {content.testimonials.stats.map((stat, index) => (
                      <div className="admin-list-editor__item" key={index}>
                        <OrderedItemHeader
                          label="Показатель"
                          index={index}
                          count={content.testimonials!.stats.length}
                          onMove={(direction) => update(['testimonials', 'stats'], moveItem(content.testimonials!.stats, index, direction))}
                          onDelete={() => update(['testimonials', 'stats'], content.testimonials!.stats.filter((_, itemIndex) => itemIndex !== index))}
                        />
                        <div className="admin-stat-fields"><Field id={`trust-value-${index}`} label="Значение" value={stat.value} maxLength={60} onChange={(value) => update(['testimonials', 'stats', index, 'value'], value)} /><Field id={`trust-label-${index}`} label="Подпись" value={stat.label} maxLength={120} onChange={(value) => update(['testimonials', 'stats', index, 'label'], value)} /></div>
                      </div>
                    ))}
                    <AddItemButton label="Добавить показатель" count={content.testimonials.stats.length} maxItems={6} onAdd={() => update(['testimonials', 'stats'], [...content.testimonials!.stats, { value: '', label: '' }])} />
                  </div>
                  <span className="admin-hint">Оставляйте только те цифры, которые сможете подтвердить данными или кейсом.</span>
                </div>

                <div className="admin-field admin-field--wide">
                  <div className="admin-label-row">
                    <span className="admin-label">Карточки отзывов</span>
                    <span className="admin-char-count">{content.testimonials.items.length}/40</span>
                  </div>
                  <span className="admin-hint">Порядок здесь — это порядок в карусели на сайте. Инициалы в кружке считаются из имени автоматически.</span>
                  <div className="admin-list-editor">
                    {content.testimonials.items.map((item, index) => (
                      <div key={index}>
                        <OrderedItemHeader
                          label="Отзыв"
                          index={index}
                          count={content.testimonials.items.length}
                          minItems={1}
                          onMove={(direction) => update(['testimonials', 'items'], moveItem(content.testimonials.items, index, direction))}
                          onDelete={() => update(['testimonials', 'items'], content.testimonials.items.filter((_, itemIndex) => itemIndex !== index))}
                        />
                        <details className="admin-disclosure" open={index === 0}>
                          <summary>
                            <span>{item.name || 'Новый отзыв'}{item.company ? ` · ${item.company}` : ''}</span>
                            <ChevronRight aria-hidden="true" />
                          </summary>
                          <div className="admin-form-grid">
                            <Field id={`review-name-${index}`} label="Имя" value={item.name} maxLength={80} onChange={(value) => update(['testimonials', 'items', index, 'name'], value)} />
                            <Field id={`review-company-${index}`} label="Компания" value={item.company} maxLength={120} hint="Показывается плашкой над текстом отзыва." onChange={(value) => update(['testimonials', 'items', index, 'company'], value)} />
                            <Field id={`review-position-${index}`} label="Должность" value={item.position} maxLength={120} onChange={(value) => update(['testimonials', 'items', index, 'position'], value)} />
                            <Field id={`review-text-${index}`} label="Текст отзыва" value={item.text} multiline rows={5} maxLength={900} onChange={(value) => update(['testimonials', 'items', index, 'text'], value)} />
                          </div>
                        </details>
                      </div>
                    ))}
                    <AddItemButton
                      label="Добавить отзыв"
                      count={content.testimonials.items.length}
                      maxItems={40}
                      onAdd={() => update(['testimonials', 'items'], [...content.testimonials.items, { name: '', company: '', position: '', text: '' }])}
                    />
                  </div>
                </div>
                {renderTypography('testimonials', content.testimonials.typography, 'section', `${content.testimonials.titlePrefix} ${content.testimonials.titleAccent}`.trim())}
              </div> : null}

              {activeSection === 'contact' ? <div className="admin-stack admin-stack--lg">
                <div className="admin-form-grid"><Field id="contact-badge" label="Бейдж" value={content.contact.badge} maxLength={120} onChange={(value) => update(['contact', 'badge'], value)} /><Field id="contact-prefix" label="Заголовок" value={content.contact.titlePrefix} maxLength={180} onChange={(value) => update(['contact', 'titlePrefix'], value)} /><Field id="contact-accent" label="Акцент заголовка" value={content.contact.titleAccent} maxLength={220} onChange={(value) => update(['contact', 'titleAccent'], value)} /><Field id="contact-description" label="Описание" value={content.contact.description} multiline maxLength={900} onChange={(value) => update(['contact', 'description'], value)} /></div>
                {page === 'home' ? (
                  <div className="admin-field admin-field--wide">
                    <div className="admin-label-row"><span className="admin-label">Преимущества рядом с формой</span><span className="admin-char-count">{content.contact.benefits.length}/6</span></div>
                    <div className="admin-list-editor">
                      {content.contact.benefits.map((item, index) => (
                        <div className="admin-list-editor__item" key={index}>
                          <OrderedItemHeader
                            label="Преимущество"
                            index={index}
                            count={content.contact.benefits.length}
                            minItems={1}
                            onMove={(direction) => update(['contact', 'benefits'], moveItem(content.contact.benefits, index, direction))}
                            onDelete={() => update(['contact', 'benefits'], content.contact.benefits.filter((_, itemIndex) => itemIndex !== index))}
                          />
                          <div className="admin-form-grid"><Field id={`benefit-title-${index}`} label="Заголовок" value={item.title} maxLength={160} onChange={(value) => update(['contact', 'benefits', index, 'title'], value)} /><Field id={`benefit-description-${index}`} label="Описание" value={item.description} multiline maxLength={400} onChange={(value) => update(['contact', 'benefits', index, 'description'], value)} /></div>
                        </div>
                      ))}
                      <AddItemButton label="Добавить преимущество" count={content.contact.benefits.length} maxItems={6} onAdd={() => update(['contact', 'benefits'], [...content.contact.benefits, { title: '', description: '' }])} />
                    </div>
                  </div>
                ) : <StringListEditor label="Что обсудим" singular="Пункт" values={content.contact.bullets} maxItems={8} maxLength={180} onChange={(value) => update(['contact', 'bullets'], value)} />}
                {renderTypography('contact', content.contact.typography, 'contact', `${content.contact.titlePrefix} ${content.contact.titleAccent}`.trim())}
              </div> : null}
              <div className="admin-sticky-actions">
                {!publishArmed ? <button type="button" className="admin-button admin-button--secondary" disabled={loading || !isDirty} onClick={() => void save('save')}><Save aria-hidden="true" /><span className="admin-action-label--desktop">Сохранить черновик</span><span className="admin-action-label--mobile">Черновик</span></button> : null}
                {!publishArmed ? <button type="button" className="admin-button admin-button--primary" disabled={loading || !isDirty} onClick={() => setPublishArmed(true)}><Send aria-hidden="true" /> Опубликовать</button> : <div className="admin-confirm-inline" role="alert"><span>Опубликовать изменения на {pageMeta.path}?</span><button type="button" className="admin-button admin-button--primary" disabled={loading} onClick={() => void save('publish')}>Да, опубликовать</button><button type="button" className="admin-button admin-button--quiet" disabled={loading} onClick={() => setPublishArmed(false)}>Отмена</button></div>}
              </div>
            </div>
          </div>
        </section>

        <aside className="admin-stack admin-content-aside">
          <section className="admin-card"><div className="admin-section-header admin-section-header--compact"><div><p className="admin-eyebrow">История</p><h3 className="admin-card-title">Последние версии</h3></div></div>{versions.length === 0 ? <p className="admin-muted">Версии появятся после первого сохранения.</p> : <div className="admin-version-list">{versions.map((version) => <div key={version.id}><div><strong>{version.source === 'published' ? 'Публикация' : 'Черновик'}</strong><span>{new Date(`${version.created_at.replace(' ', 'T')}Z`).toLocaleString('ru-RU')}</span></div><button type="button" className="admin-icon-button" title="Восстановить в черновик" aria-label="Восстановить эту версию в черновик" disabled={loading || isDirty} onClick={() => void restore(version.id)}><RotateCcw aria-hidden="true" /></button></div>)}</div>}</section>
          <div className="admin-notice admin-notice--warning">Публикация сразу меняет видимый текст через D1. Если настроен CF_PAGES_DEPLOY_HOOK_URL, админка одновременно запускает production-сборку той же версии для SEO-HTML; черновик в поисковую копию не попадает.</div>
        </aside>
      </div>
    </div>
  );
}
