export const SERVICE_CONTENT_KEYS = [
  'service:meta-ads',
  'service:google-ads',
  'service:consult',
  'service:meta-apps',
] as const;

export const FAQ_CONTENT_KEY = 'site:faq' as const;
export const SITE_CONTENT_KEYS = [...SERVICE_CONTENT_KEYS, FAQ_CONTENT_KEY] as const;

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

function sanitizeHero(value: unknown): UnknownRecord | undefined {
  const source = object(value);
  const target: UnknownRecord = {};
  assignText(target, source, 'badge', 120);
  assignText(target, source, 'titlePrefix', 180);
  assignText(target, source, 'titleAccent', 240);
  assignText(target, source, 'primaryButton', 80);
  assignText(target, source, 'secondaryButton', 80);
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
    if (stats.length) target.stats = stats;
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
    return Object.keys(target).length ? target : null;
  }).filter((item): item is UnknownRecord => Boolean(item));
  return cards.length ? cards : undefined;
}

function sanitizeCta(value: unknown): UnknownRecord | undefined {
  const source = object(value);
  const target: UnknownRecord = {};
  assignText(target, source, 'badge', 120);
  assignText(target, source, 'title', 260);
  assignText(target, source, 'description', 900);
  assignText(target, source, 'button', 80);
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
  return Object.keys(target).length ? target : undefined;
}

export function sanitizeServiceContent(value: unknown): UnknownRecord {
  const source = object(value);
  const target: UnknownRecord = {};
  const hero = sanitizeHero(source.hero);
  const services = sanitizeSectionIntro(source.services);
  const serviceCards = sanitizeCards(object(source.services).cards);
  if (services || serviceCards) target.services = { ...(services || {}), ...(serviceCards ? { cards: serviceCards } : {}) };
  const cases = sanitizeSectionIntro(source.cases);
  const cta = sanitizeCta(source.cta);
  const contact = sanitizeContact(source.contact);
  if (hero) target.hero = hero;
  if (cases) target.cases = cases;
  if (cta) target.cta = cta;
  if (contact) target.contact = contact;
  return target;
}

const FAQ_CATEGORIES = new Set([
  'Старт', 'Бюджет', 'Результат', 'Аналитика', 'Процесс', 'Приложения', 'Консультация',
]);

export function sanitizeFaqContent(value: unknown): UnknownRecord {
  const source = object(value);
  if (!Array.isArray(source.items)) return {};
  const items = source.items.slice(0, 100).map((item) => {
    const row = object(item);
    const question = text(row.question, 240);
    const answer = text(row.answer, 1_200);
    const category = text(row.category, 40);
    const details = texts(row.details, 10, 700);
    if (!question || !answer || !category || !FAQ_CATEGORIES.has(category)) return null;
    return { question, answer, category, details: details || [] };
  }).filter(Boolean);
  return items.length ? { items } : {};
}

export function sanitizeSiteContent(key: SiteContentKey, value: unknown): UnknownRecord {
  return key === FAQ_CONTENT_KEY ? sanitizeFaqContent(value) : sanitizeServiceContent(value);
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
