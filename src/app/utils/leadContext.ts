// Слепок только что отправленной заявки для страницы благодарности.
//
// Страница благодарности одна на весь сайт, а приходят на неё с пяти разных
// форм. Без этого слепка она не знает ни имени, ни услуги, ни канала связи —
// и вынуждена показывать всем один безличный текст.
//
// Хранение — sessionStorage: слепок нужен ровно на один переход и должен
// пережить обновление страницы, но не должен жить дольше вкладки. В заявку и
// в трекинг эти данные не попадают, они уже отправлены на сервер отдельно.

const CONTEXT_KEY = 'ww_lead_context_v1';
const MAX_AGE_MS = 1000 * 60 * 60 * 2; // 2 часа: вкладку могли оставить открытой
const MAX_NAME_LENGTH = 24;

export type LeadContactChannel = 'telegram' | 'whatsapp' | 'email' | 'phone';

export type LeadServiceSlug = 'home' | 'meta-ads' | 'google-ads' | 'meta-apps' | 'consult';

export type LeadContext = {
  /** Только имя, без фамилии — им подписывается заголовок страницы. */
  name?: string;
  serviceSlug: LeadServiceSlug;
  serviceLabel?: string;
  /** Куда человек ждёт ответ — страница называет канал явно. */
  channel?: LeadContactChannel;
  /** Оставил ли почту: только таким показываем напоминание про папку «Спам». */
  hasEmail?: boolean;
  savedAt: number;
};

const SERVICE_SLUGS: readonly LeadServiceSlug[] = [
  'home',
  'meta-ads',
  'google-ads',
  'meta-apps',
  'consult',
];

const CHANNELS: readonly LeadContactChannel[] = ['telegram', 'whatsapp', 'email', 'phone'];

/**
 * Из «Руслан Шошин» получается «Руслан». Заодно обрезаем длину: в заголовок
 * первого экрана поле формы прилетает как есть, и строка на сорок символов
 * разносит вёрстку.
 */
function firstName(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const first = value.trim().split(/\s+/)[0];
  if (!first) return undefined;
  const cleaned = first.replace(/[^\p{L}\p{N}'’-]/gu, '');
  if (cleaned.length < 2) return undefined;
  return cleaned.slice(0, MAX_NAME_LENGTH);
}

export function saveLeadContext(context: Omit<LeadContext, 'savedAt'>): void {
  try {
    const payload: LeadContext = {
      ...context,
      name: firstName(context.name),
      savedAt: Date.now(),
    };
    sessionStorage.setItem(CONTEXT_KEY, JSON.stringify(payload));
  } catch {
    /* приватный режим или переполненное хранилище — страница покажет общий вариант */
  }
}

export function readLeadContext(): LeadContext | null {
  try {
    const raw = sessionStorage.getItem(CONTEXT_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<LeadContext> | null;
    if (!parsed || typeof parsed !== 'object') return null;

    const savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : 0;
    if (!savedAt || Date.now() - savedAt > MAX_AGE_MS) {
      clearLeadContext();
      return null;
    }

    const serviceSlug = SERVICE_SLUGS.includes(parsed.serviceSlug as LeadServiceSlug)
      ? (parsed.serviceSlug as LeadServiceSlug)
      : 'home';
    const channel = CHANNELS.includes(parsed.channel as LeadContactChannel)
      ? (parsed.channel as LeadContactChannel)
      : undefined;

    return {
      name: typeof parsed.name === 'string' ? firstName(parsed.name) : undefined,
      serviceSlug,
      serviceLabel: typeof parsed.serviceLabel === 'string' ? parsed.serviceLabel : undefined,
      channel,
      hasEmail: parsed.hasEmail === true,
      savedAt,
    };
  } catch {
    return null;
  }
}

export function clearLeadContext(): void {
  try {
    sessionStorage.removeItem(CONTEXT_KEY);
  } catch {
    /* нечего чистить */
  }
}
