export const SERVICE_CONTENT_KEYS = [
  'service:meta-ads',
  'service:meta-apps',
  'service:google-ads',
  'service:consult',
] as const;

export const FAQ_CONTENT_KEY = 'site:faq' as const;
export const HOME_CONTENT_KEY = 'site:home' as const;
export const SITE_CONTENT_KEYS = [...SERVICE_CONTENT_KEYS, HOME_CONTENT_KEY, FAQ_CONTENT_KEY] as const;

export type ServiceContentKey = typeof SERVICE_CONTENT_KEYS[number];
export type SiteContentKey = typeof SITE_CONTENT_KEYS[number];

type UnknownRecord = Record<string, unknown>;

export function isServiceContentKey(value: string): value is ServiceContentKey {
  return (SERVICE_CONTENT_KEYS as readonly string[]).includes(value);
}

export function isSiteContentKey(value: string): value is SiteContentKey {
  return (SITE_CONTENT_KEYS as readonly string[]).includes(value);
}

function object(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {};
}

function text(value: unknown, max = 500): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value
    .replace(/<[^>]*>/g, '')
    .replace(/[<>]/g, '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, max);
  return normalized || undefined;
}

function texts(value: unknown, count: number, max = 500): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value.slice(0, count).map((item) => text(item, max)).filter((item): item is string => Boolean(item));
  return result.length ? result : undefined;
}

function assignText(target: UnknownRecord, source: UnknownRecord, key: string, max?: number): void {
  const value = text(source[key], max);
  if (value !== undefined) target[key] = value;
}

function sanitizeSeo(value: unknown): UnknownRecord | undefined {
  const source = object(value);
  const target: UnknownRecord = {};
  assignText(target, source, 'title', 90);
  assignText(target, source, 'description', 220);
  return Object.keys(target).length ? target : undefined;
}

function sanitizeTypography(value: unknown): UnknownRecord | undefined {
  const source = object(value);
  const allowed = new Set(['compact', 'standard', 'large']);
  const target: UnknownRecord = {};
  for (const key of ['titleDesktop', 'titleMobile', 'body'] as const) {
    if (typeof source[key] === 'string' && allowed.has(source[key] as string)) target[key] = source[key];
  }
  return Object.keys(target).length ? target : undefined;
}

function assignTypography(target: UnknownRecord, source: UnknownRecord): void {
  const typography = sanitizeTypography(source.typography);
  if (typography) target.typography = typography;
}

function assignVisualSlot(target: UnknownRecord, source: UnknownRecord): void {
  const value = Number(source.visualSlot);
  if (Number.isInteger(value) && value >= 0 && value <= 99) target.visualSlot = value;
}

function sanitizeHero(value: unknown): UnknownRecord | undefined {
  const source = object(value);
  const target: UnknownRecord = {};
  assignText(target, source, 'badge', 120);
  assignText(target, source, 'titlePrefix', 180);
  assignText(target, source, 'titleAccent', 240);
  assignText(target, source, 'primaryButton', 80);
  assignText(target, source, 'secondaryButton', 80);
  assignTypography(target, source);
  const paragraphs = texts(source.paragraphs, 3, 900);
  if (paragraphs) target.paragraphs = paragraphs;

  if (Array.isArray(source.titleLines)) {
    const titleLines = source.titleLines.slice(0, 5).map((item) => {
      const row = object(item);
      const lineText = text(row.text, 180);
      if (!lineText) return null;
      const tone = row.tone === 'accent' || row.tone === 'supporting' ? row.tone : undefined;
      return tone ? { text: lineText, tone } : { text: lineText };
    }).filter(Boolean);
    if (titleLines.length) target.titleLines = titleLines;
  }

  if (Array.isArray(source.stats)) {
    const stats = source.stats.slice(0, 4).map((item) => {
      const row = object(item);
      const valueText = text(row.value, 40);
      const label = text(row.label, 100);
      return valueText && label ? { value: valueText, label } : null;
    }).filter(Boolean);
    target.stats = stats;
  }
  return Object.keys(target).length ? target : undefined;
}

function sanitizeSectionIntro(value: unknown): UnknownRecord | undefined {
  const source = object(value);
  const target: UnknownRecord = {};
  assignText(target, source, 'badge', 120);
  assignText(target, source, 'titlePrefix', 180);
  assignText(target, source, 'titleAccent', 220);
  assignText(target, source, 'description', 900);
  assignTypography(target, source);
  return Object.keys(target).length ? target : undefined;
}

function sanitizeCards(value: unknown): UnknownRecord[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const cards = value.slice(0, 8).map((item) => {
    const source = object(item);
    const target: UnknownRecord = {};
    assignText(target, source, 'title', 160);
    assignText(target, source, 'description', 700);
    const features = texts(source.features, 8, 120);
    if (features) target.features = features;
    if (!Object.keys(target).length) return null;
    assignVisualSlot(target, source);
    return target;
  }).filter(Boolean) as UnknownRecord[];
  return cards.length ? cards : undefined;
}

function sanitizeCta(value: unknown): UnknownRecord | undefined {
  const source = object(value);
  const target: UnknownRecord = {};
  assignText(target, source, 'badge', 120);
  assignText(target, source, 'title', 260);
  assignText(target, source, 'description', 900);
  assignText(target, source, 'button', 80);
  assignTypography(target, source);
  return Object.keys(target).length ? target : undefined;
}

function sanitizeContact(value: unknown): UnknownRecord | undefined {
  const source = object(value);
  const target: UnknownRecord = {};
  assignText(target, source, 'badge', 120);
  assignText(target, source, 'titlePrefix', 180);
  assignText(target, source, 'titleAccent', 220);
  assignText(target, source, 'description', 900);
  const bullets = texts(source.bullets, 8, 180);
  if (bullets) target.bullets = bullets;
  if (Array.isArray(source.benefits)) {
    const benefits = source.benefits.slice(0, 6).map((item) => {
      const row = object(item);
      const title = text(row.title, 160);
      const description = text(row.description, 400);
      return title && description ? { title, description } : null;
    }).filter(Boolean);
    if (benefits.length) target.benefits = benefits;
  }
  assignTypography(target, source);
  return Object.keys(target).length ? target : undefined;
}

function sanitizeCaseItems(value: unknown): UnknownRecord[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.slice(0, 12).map((item) => {
    const source = object(item);
    const target: UnknownRecord = {};
    assignText(target, source, 'title', 180);
    assignText(target, source, 'category', 100);
    assignText(target, source, 'description', 700);
    if (Array.isArray(source.stats)) {
      const stats = source.stats.slice(0, 6).map((stat) => {
        const row = object(stat);
        const label = text(row.label, 100);
        const valueText = text(row.value, 60);
        return label && valueText ? { label, value: valueText } : null;
      }).filter(Boolean);
      target.stats = stats;
    }
    if (!Object.keys(target).length) return null;
    assignVisualSlot(target, source);
    return target;
  }).filter((item): item is UnknownRecord => Boolean(item));
  return items.length ? items : undefined;
}

function sanitizeStats(value: unknown): UnknownRecord[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const stats = value.slice(0, 6).map((item) => {
    const row = object(item);
    const valueText = text(row.value, 60);
    const label = text(row.label, 120);
    return valueText && label ? { value: valueText, label } : null;
  }).filter(Boolean) as UnknownRecord[];
  return stats;
}

export function sanitizeServiceContent(value: unknown): UnknownRecord {
  const source = object(value);
  const target: UnknownRecord = {};
  const hero = sanitizeHero(source.hero);
  const services = sanitizeSectionIntro(source.services);
  const serviceCards = sanitizeCards(object(source.services).cards);
  if (services || serviceCards) target.services = { ...(services || {}), ...(serviceCards ? { cards: serviceCards } : {}) };
  const cases = sanitizeSectionIntro(source.cases);
  const caseItems = sanitizeCaseItems(object(source.cases).items);
  const cta = sanitizeCta(source.cta);
  const contact = sanitizeContact(source.contact);
  const seo = sanitizeSeo(source.seo);
  if (seo) target.seo = seo;
  if (hero) target.hero = hero;
  if (cases || caseItems) target.cases = { ...(cases || {}), ...(caseItems ? { items: caseItems } : {}) };
  if (cta) target.cta = cta;
  if (contact) target.contact = contact;
  return target;
}

export function sanitizeHomeContent(value: unknown): UnknownRecord {
  const source = object(value);
  const target: UnknownRecord = {};
  const seo = sanitizeSeo(source.seo);
  const hero = sanitizeHero(source.hero);
  const services = sanitizeSectionIntro(source.services);
  const serviceCards = sanitizeCards(object(source.services).cards);
  const cases = sanitizeSectionIntro(source.cases);
  const caseItems = sanitizeCaseItems(object(source.cases).items);
  const callToAction = sanitizeCta(source.callToAction);
  const testimonials = sanitizeSectionIntro(source.testimonials);
  const testimonialStats = sanitizeStats(object(source.testimonials).stats);
  const contact = sanitizeContact(source.contact);
  if (seo) target.seo = seo;
  if (hero) target.hero = hero;
  if (services || serviceCards) target.services = { ...(services || {}), ...(serviceCards ? { cards: serviceCards } : {}) };
  if (cases || caseItems) target.cases = { ...(cases || {}), ...(caseItems ? { items: caseItems } : {}) };
  if (callToAction) target.callToAction = callToAction;
  if (testimonials || testimonialStats) target.testimonials = { ...(testimonials || {}), ...(testimonialStats ? { stats: testimonialStats } : {}) };
  if (contact) target.contact = contact;
  return target;
}

const FAQ_CATEGORIES = new Set([
  'Старт', 'Бюджет', 'Аналитика', 'Приложения', 'Результат', 'Процесс', 'Консультация',
]);
const FAQ_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function fallbackFaqId(question: string): string {
  let hash = 2166136261;
  for (let index = 0; index < question.length; index += 1) {
    hash ^= question.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `legacy-${(hash >>> 0).toString(36)}`;
}

export function sanitizeFaqContent(value: unknown): UnknownRecord {
  const source = object(value);
  const target: UnknownRecord = {};
  const seo = sanitizeSeo(source.seo);
  if (seo) target.seo = seo;
  if (!Array.isArray(source.items)) return target;
  const items = source.items.slice(0, 100).map((item) => {
    const row = object(item);
    const question = text(row.question, 240);
    const answer = text(row.answer, 1_200);
    const category = text(row.category, 40);
    const details = texts(row.details, 10, 700);
    if (!question || !answer || !category || !FAQ_CATEGORIES.has(category)) return null;
    const rawId = text(row.id, 80);
    const id = rawId && FAQ_ID_PATTERN.test(rawId) ? rawId : fallbackFaqId(question);
    const relatedTermIds = (texts(row.relatedTermIds, 20, 80) || []).filter((termId) => FAQ_ID_PATTERN.test(termId));
    const sourceIds = (texts(row.sourceIds, 20, 80) || []).filter((sourceId) => FAQ_ID_PATTERN.test(sourceId));
    const rawReviewedAt = text(row.reviewedAt, 10);
    const reviewedAt = rawReviewedAt && /^\d{4}-\d{2}-\d{2}$/.test(rawReviewedAt) ? rawReviewedAt : undefined;
    return {
      id,
      question,
      answer,
      category,
      details: details || [],
      ...(relatedTermIds.length ? { relatedTermIds } : {}),
      ...(sourceIds.length ? { sourceIds } : {}),
      ...(reviewedAt ? { reviewedAt } : {}),
    };
  }).filter(Boolean);
  if (items.length) target.items = items;
  return target;
}

export function sanitizeSiteContent(key: SiteContentKey, value: unknown): UnknownRecord {
  if (key === FAQ_CONTENT_KEY) return sanitizeFaqContent(value);
  if (key === HOME_CONTENT_KEY) return sanitizeHomeContent(value);
  return sanitizeServiceContent(value);
}

export function safeJsonObject(raw: string | null | undefined): UnknownRecord {
  if (!raw) return {};
  try {
    return sanitizeServiceContent(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function safeSiteJsonObject(key: SiteContentKey, raw: string | null | undefined): UnknownRecord {
  if (!raw) return {};
  try {
    return sanitizeSiteContent(key, JSON.parse(raw));
  } catch {
    return {};
  }
}
