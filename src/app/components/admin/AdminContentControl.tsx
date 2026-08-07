import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Clock3,
  ExternalLink,
  GripVertical,
  Monitor,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  Smartphone,
  Trash2,
  Type,
} from 'lucide-react';
import { META_APPS_TESTIMONIAL_CONTENT, pageConfigs, type ServiceType } from '../../pages/ServiceLandingPage';
import { defaultHeroContent } from '../Hero';
import { defaultServicesContent, type ServicesContent } from '../Services';
import { defaultCasesContent } from '../Cases';
import { defaultCallToActionContent } from '../CallToAction';
import { defaultTestimonialsContent, defaultTestimonialsStats, type TestimonialsContent } from '../Testimonials';
import { defaultContactContent } from '../ContactForm';
import { mergeContent } from '../../hooks/useServiceContent';
import AdminFaqControl from './AdminFaqControl';
import { AdminSelect } from './AdminUI';

type TypographyPreset = 'compact' | 'standard' | 'large';
type TypographySettings = {
  titleDesktop: TypographyPreset;
  titleMobile: TypographyPreset;
  body: TypographyPreset;
};

type IntroContent = {
  badge: string;
  titlePrefix: string;
  titleAccent: string;
  description: string;
  typography: TypographySettings;
};

type EditableContent = {
  seo: { title: string; description: string };
  hero: {
    badge: string;
    titlePrefix: string;
    titleAccent: string;
    titleLines: Array<{ text: string; tone?: 'accent' | 'supporting' }>;
    paragraphs: string[];
    primaryButton: string;
    secondaryButton: string;
    stats: Array<{ value: string; label: string }>;
    typography: TypographySettings;
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

type EditorPage = ServiceType | 'home';
type EditorSection = 'seo' | 'hero' | 'services' | 'cases' | 'cta' | 'testimonials' | 'contact';

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

const DEFAULT_TYPOGRAPHY: TypographySettings = {
  titleDesktop: 'standard',
  titleMobile: 'standard',
  body: 'standard',
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

const typographyOptions = [
  { value: 'compact', label: 'Компактный' },
  { value: 'standard', label: 'Стандартный' },
  { value: 'large', label: 'Крупный' },
];

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
      })),
      paragraphs: defaultHeroContent.paragraphs.map(String),
      primaryButton: defaultHeroContent.primaryButton,
      secondaryButton: defaultHeroContent.secondaryButton,
      stats: defaultHeroContent.stats.map((item) => ({ ...item })),
      typography: { ...DEFAULT_TYPOGRAPHY },
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
      })),
      paragraphs: (source.hero.paragraphs || []).map(String),
      primaryButton: source.hero.primaryButton || '',
      secondaryButton: source.hero.secondaryButton || '',
      stats: (source.hero.stats || []).map((item) => ({ ...item })),
      typography: { ...DEFAULT_TYPOGRAPHY },
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
      // Пресеты размеров — не текст страницы, в поиске только мешают.
      if (key === 'typography' || key === 'visualSlot' || key === 'tone') return;
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

function setAtPath(content: EditableContent, path: Array<string | number>, value: unknown): EditableContent {
  const next = clone(content) as unknown as Record<string | number, unknown>;
  let cursor = next;
  path.slice(0, -1).forEach((segment) => {
    cursor = cursor[segment] as Record<string | number, unknown>;
  });
  cursor[path[path.length - 1]] = value;
  return next as unknown as EditableContent;
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

function TypographyControls({ value, onChange }: { value: TypographySettings; onChange: (value: TypographySettings) => void }) {
  return (
    <div className="admin-typography-panel">
      <div className="admin-typography-panel__heading"><Type aria-hidden="true" /><div><strong>Размеры текста</strong><span>Безопасные пресеты сохраняют адаптивность и не ломают карточки.</span></div></div>
      <div className="admin-typography-grid">
        <AdminSelect label="Заголовок · ПК" value={value.titleDesktop} options={typographyOptions} onValueChange={(next) => onChange({ ...value, titleDesktop: next as TypographyPreset })} />
        <AdminSelect label="Заголовок · мобильный" value={value.titleMobile} options={typographyOptions} onValueChange={(next) => onChange({ ...value, titleMobile: next as TypographyPreset })} />
        <AdminSelect label="Основной текст" value={value.body} options={typographyOptions} onValueChange={(next) => onChange({ ...value, body: next as TypographyPreset })} />
      </div>
    </div>
  );
}

function titleText(content: EditableContent, section: EditorSection): { badge?: string; title: string; accent?: string; description?: string } {
  if (section === 'seo') return { title: content.seo.title, description: content.seo.description };
  if (section === 'hero') return {
    badge: content.hero.badge,
    title: content.hero.titleLines.length ? content.hero.titleLines.map((line) => line.text).join(' ') : content.hero.titlePrefix,
    accent: content.hero.titleLines.length ? undefined : content.hero.titleAccent,
    description: content.hero.paragraphs[0],
  };
  if (section === 'cta') return { badge: content.cta.badge, title: content.cta.title, description: content.cta.description };
  const value = section === 'services' ? content.services : section === 'cases' ? content.cases : section === 'testimonials' ? content.testimonials : content.contact;
  return value ? { badge: value.badge, title: value.titlePrefix, accent: value.titleAccent, description: value.description } : { title: '' };
}

function Preview({ content, section, device }: { content: EditableContent; section: EditorSection; device: 'desktop' | 'mobile' }) {
  const copy = titleText(content, section);
  const typography = section === 'seo' ? DEFAULT_TYPOGRAPHY : section === 'hero' ? content.hero.typography : section === 'cta' ? content.cta.typography : section === 'services' ? content.services.typography : section === 'cases' ? content.cases.typography : section === 'testimonials' ? content.testimonials?.typography || DEFAULT_TYPOGRAPHY : content.contact.typography;
  const heroTitleLines = section === 'hero' ? content.hero.titleLines : [];
  return (
    <div className={`admin-copy-preview admin-copy-preview--${device}`} data-title-size={device === 'mobile' ? typography.titleMobile : typography.titleDesktop} data-body-size={typography.body}>
      {copy.badge ? <span className="admin-copy-preview__badge">{copy.badge}</span> : null}
      {heroTitleLines.length > 0 ? (
        <h3>{heroTitleLines.map((line, index) => <span key={index} className={line.tone === 'accent' ? 'is-accent' : line.tone === 'supporting' ? 'is-supporting' : undefined}>{line.text || 'Новая строка'}</span>)}</h3>
      ) : (
        <h3>{copy.title}{copy.accent ? <> <em className="is-accent">{copy.accent}</em></> : null}</h3>
      )}
      {copy.description ? <p>{copy.description}</p> : null}
      {section === 'hero' && content.hero.paragraphs.slice(1).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      {section === 'hero' && content.hero.stats.length > 0 ? <dl className="admin-copy-preview__stats">{content.hero.stats.map((stat, index) => <div key={index}><dt>{stat.value || '—'}</dt><dd>{stat.label || 'Без подписи'}</dd></div>)}</dl> : null}
      {section === 'services' ? <div className="admin-preview-list">{content.services.cards.slice(0, 3).map((card, index) => <div key={index}><strong>{card.title}</strong><span>{card.description}</span></div>)}</div> : null}
      {section === 'cases' ? <div className="admin-preview-list">{content.cases.items.slice(0, 3).map((item, index) => <div key={index}><strong>{item.title}</strong><span>{item.description}</span></div>)}</div> : null}
      {section === 'testimonials' && content.testimonials ? <dl className="admin-copy-preview__stats">{content.testimonials.stats.map((stat, index) => <div key={index}><dt>{stat.value}</dt><dd>{stat.label}</dd></div>)}</dl> : null}
      {section === 'testimonials' && content.testimonials ? <div className="admin-preview-list">{content.testimonials.items.slice(0, 2).map((item, index) => <div key={index}><strong>{[item.name, item.company].filter(Boolean).join(' · ') || 'Новый отзыв'}</strong><span>{item.text}</span></div>)}</div> : null}
      {section === 'services' ? <div className="admin-preview-list">{content.services.detailed.sections.slice(0, 2).map((item, index) => <div key={index}><strong>{item.title || 'Новый раздел'}</strong><span>{item.text.split('\n')[0]}</span></div>)}</div> : null}
      {section === 'contact' ? <div className="admin-preview-list">{(content.contact.benefits.length ? content.contact.benefits : content.contact.bullets.map((item) => ({ title: item, description: '' }))).slice(0, 3).map((item, index) => <div key={index}><strong>{item.title}</strong>{item.description ? <span>{item.description}</span> : null}</div>)}</div> : null}
      {section === 'cta' ? <span className="admin-copy-preview__button">{content.cta.button}</span> : null}
      {section === 'hero' ? <span className="admin-copy-preview__button">{content.hero.primaryButton}</span> : null}
    </div>
  );
}

export default function AdminContentControl({ password }: { password: string }) {
  const [page, setPage] = useState<EditorPage>('home');
  const [content, setContent] = useState<EditableContent>(() => editableDefaults('home'));
  const [section, setSection] = useState<SectionPayload | null>(null);
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [activeSection, setActiveSection] = useState<EditorSection>('hero');
  const [preview, setPreview] = useState<'desktop' | 'mobile'>('desktop');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [publishArmed, setPublishArmed] = useState(false);
  const [contentMode, setContentMode] = useState<'pages' | 'faq'>('pages');
  const [search, setSearch] = useState('');
  const loadSequence = useRef(0);
  const contentRef = useRef(content);
  const loadedSnapshotRef = useRef(JSON.stringify(content));
  contentRef.current = content;

  const pageMeta = useMemo(() => PAGES.find((item) => item.value === page) || PAGES[0], [page]);
  // Блок отзывов есть и на страницах услуг — раньше он был только у главной.
  const availableSections = useMemo<EditorSection[]>(
    () => ['seo', 'hero', 'services', 'cases', 'cta', 'testimonials', 'contact'],
    [],
  );
  const isDirty = JSON.stringify(content) !== loadedSnapshotRef.current;

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
      const payload = await response.json().catch(() => null) as { success?: boolean; error?: string; section?: SectionPayload | null; versions?: VersionRow[] } | null;
      if (!response.ok || !payload?.success) throw new Error(payload?.error || `HTTP ${response.status}`);
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
      loadedSnapshotRef.current = JSON.stringify(next);
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

  const switchPage = (nextPage: EditorPage) => {
    if (nextPage === page) return;
    if (isDirty) {
      setNotice('Есть несохранённые изменения. Сохраните черновик или нажмите «Отменить изменения», затем смените страницу.');
      return;
    }
    loadSequence.current += 1;
    const next = editableDefaults(nextPage);
    setPage(nextPage);
    setContent(next);
    loadedSnapshotRef.current = JSON.stringify(next);
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

  const renderTypography = (key: 'hero' | 'services' | 'cases' | 'cta' | 'testimonials' | 'contact', value: TypographySettings) => (
    <TypographyControls value={value} onChange={(next) => update([key, 'typography'], next)} />
  );

  return (
    <div className="admin-stack admin-stack--lg admin-content-control">
      {contentModeSwitch}
      <div className="admin-section-header">
        <div>
          <p className="admin-eyebrow">Контент сайта</p>
          <h2 className="admin-title">Редактор страниц</h2>
          <p className="admin-subtitle">Меняется реальный текст React-страницы. Порядок основных блоков зафиксирован, а текст, абзацы и безопасные размеры можно настраивать без риска сломать вёрстку или трекинг.</p>
        </div>
        <a className="admin-button admin-button--secondary" href={pageMeta.path} target="_blank" rel="noreferrer"><ExternalLink aria-hidden="true" /> Открыть страницу</a>
      </div>

      <div className="admin-toolbar admin-content-toolbar">
        <AdminSelect label="Страница" value={page} disabled={loading} options={PAGES.map((item) => ({ value: item.value, label: item.label }))} onValueChange={(value) => switchPage(value as EditorPage)} />
        <div className="admin-content-statuses">
          <span className={section?.status === 'published' ? 'admin-state admin-state--success' : 'admin-state admin-state--warning'}>
            {section?.status === 'published' ? <Check aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
            {section?.status === 'published' ? `На сайте · v${section.version}` : section ? `Черновик · v${section.version}` : 'Статическая версия'}
          </span>
          {isDirty ? <span className="admin-state admin-state--warning">Есть несохранённые изменения</span> : <span className="admin-state">Редактор синхронизирован</span>}
        </div>
        <button className="admin-button admin-button--secondary" type="button" onClick={() => void load()} disabled={loading || isDirty}><RefreshCw className={loading ? 'animate-spin' : ''} aria-hidden="true" /> Обновить</button>
        {isDirty ? <button className="admin-button admin-button--quiet" type="button" onClick={() => { const next = editableDefaults(page); const restored = section?.draft ? mergeContent(next, normalizeStored(page, section.draft)) : next; setContent(restored); loadedSnapshotRef.current = JSON.stringify(restored); setNotice('Несохранённые изменения отменены.'); }}>Отменить изменения</button> : null}
      </div>

      {notice ? <div className="admin-notice" role="status" aria-live="polite">{notice}</div> : null}

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
                <button key={value} type="button" aria-current={activeSection === value ? 'step' : undefined} onClick={() => setActiveSection(value)}>
                  <span>{value === 'seo' ? 'SEO' : String(index)}</span><span><strong>{SECTION_LABELS[value]}</strong><small>{sectionSummary(content, value)}</small></span><ChevronRight aria-hidden="true" />
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
                {renderTypography('hero', content.hero.typography)}
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
                {renderTypography('services', content.services.typography)}
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
                {renderTypography('cases', content.cases.typography)}
              </div> : null}

              {activeSection === 'cta' ? <div className="admin-stack admin-stack--lg"><div className="admin-form-grid"><Field id="cta-badge" label="Бейдж" value={content.cta.badge} maxLength={120} onChange={(value) => update(['cta', 'badge'], value)} /><Field id="cta-title" label="Заголовок" value={content.cta.title} maxLength={260} onChange={(value) => update(['cta', 'title'], value)} /><Field id="cta-description" label="Описание" value={content.cta.description} multiline maxLength={900} onChange={(value) => update(['cta', 'description'], value)} /><Field id="cta-button" label="Кнопка" value={content.cta.button} maxLength={80} onChange={(value) => update(['cta', 'button'], value)} /></div>{renderTypography('cta', content.cta.typography)}</div> : null}

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
                {renderTypography('testimonials', content.testimonials.typography)}
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
                {renderTypography('contact', content.contact.typography)}
              </div> : null}
              <div className="admin-sticky-actions">
                {!publishArmed ? <button type="button" className="admin-button admin-button--secondary" disabled={loading || !isDirty} onClick={() => void save('save')}><Save aria-hidden="true" /><span className="admin-action-label--desktop">Сохранить черновик</span><span className="admin-action-label--mobile">Черновик</span></button> : null}
                {!publishArmed ? <button type="button" className="admin-button admin-button--primary" disabled={loading || !isDirty} onClick={() => setPublishArmed(true)}><Send aria-hidden="true" /> Опубликовать</button> : <div className="admin-confirm-inline" role="alert"><span>Опубликовать изменения на {pageMeta.path}?</span><button type="button" className="admin-button admin-button--primary" disabled={loading} onClick={() => void save('publish')}>Да, опубликовать</button><button type="button" className="admin-button admin-button--quiet" disabled={loading} onClick={() => setPublishArmed(false)}>Отмена</button></div>}
              </div>
            </div>
          </div>
        </section>

        <aside className="admin-stack admin-content-aside">
          <section className="admin-card admin-preview-card">
            <div className="admin-section-header admin-section-header--compact"><div><p className="admin-eyebrow">Живой предпросмотр</p><h3 className="admin-card-title">{SECTION_LABELS[activeSection]}</h3></div><div className="admin-icon-toggle" role="group" aria-label="Размер предпросмотра"><button type="button" aria-pressed={preview === 'desktop'} onClick={() => setPreview('desktop')}><Monitor aria-hidden="true" /><span className="sr-only">ПК</span></button><button type="button" aria-pressed={preview === 'mobile'} onClick={() => setPreview('mobile')}><Smartphone aria-hidden="true" /><span className="sr-only">Мобильный</span></button></div></div>
            <Preview content={content} section={activeSection} device={preview} />
            <p className="admin-hint">Ширина и переносы меняются вместе с режимом. Визуальные эффекты страницы остаются защищёнными текущей вёрсткой.</p>
          </section>
          <section className="admin-card"><div className="admin-section-header admin-section-header--compact"><div><p className="admin-eyebrow">История</p><h3 className="admin-card-title">Последние версии</h3></div></div>{versions.length === 0 ? <p className="admin-muted">Версии появятся после первого сохранения.</p> : <div className="admin-version-list">{versions.map((version) => <div key={version.id}><div><strong>{version.source === 'published' ? 'Публикация' : 'Черновик'}</strong><span>{new Date(`${version.created_at.replace(' ', 'T')}Z`).toLocaleString('ru-RU')}</span></div><button type="button" className="admin-icon-button" title="Восстановить в черновик" aria-label="Восстановить эту версию в черновик" disabled={loading || isDirty} onClick={() => void restore(version.id)}><RotateCcw aria-hidden="true" /></button></div>)}</div>}</section>
          <div className="admin-notice admin-notice--warning">Публикация сразу меняет видимый текст через D1. Если настроен CF_PAGES_DEPLOY_HOOK_URL, админка одновременно запускает production-сборку той же версии для SEO-HTML; черновик в поисковую копию не попадает.</div>
        </aside>
      </div>
    </div>
  );
}
