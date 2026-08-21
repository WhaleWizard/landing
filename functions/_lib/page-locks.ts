import type { Env } from './types';

/**
 * Доступ к страницам: какие адреса сайта временно закрыты заглушкой.
 *
 * Проверка выполняется в `_middleware.ts`, то есть на каждом запросе к сайту.
 * Поэтому здесь два уровня кэша: память воркера и общий кэш дата-центра.
 * База опрашивается примерно раз в полминуты на воркер одним крошечным
 * запросом, а не на каждый показ страницы.
 *
 * Сбой базы не гасит сайт. Сначала берётся последняя удачная копия списка,
 * и только если её нет — считаем, что закрытых страниц нет. Пустой сайт во
 * время рекламного трафика обходится дороже, чем недописанная страница,
 * которую кто-то мог увидеть минуту.
 */

export type PageLockPreset = 'development' | 'update' | 'soon' | 'custom';

export interface PageLockRoute {
  path: string;
  label: string;
  group: string;
  /** У раздела есть вложенные адреса: /blog/<статья>, /cases/<кейс>. */
  hasChildren?: boolean;
  /** Предупреждение перед закрытием — для страниц с особой ценой ошибки. */
  warning?: string;
  /**
   * Куда звать вместо этой страницы, по убыванию осмысленности.
   *
   * Заглушка — это тупик, из которого человек уходит с сайта. Набор подобран
   * под тему самой страницы: с закрытого Google Ads логично предложить другие
   * каналы и кейсы, а не «Политику Cookie». Закрытые адреса и сама страница
   * из списка убираются на лету.
   */
  suggest: string[];
}

/**
 * Белый список: закрыть можно только адрес отсюда.
 *
 * Произвольную строку записать нельзя — иначе через эту функцию можно было бы
 * придумать несуществующий адрес или подсунуть чужой. Список зеркалит
 * `ROUTE_LABELS` из `src/app/utils/siteNavigation.ts`, совпадение проверяет
 * `npm run test:page-locks`.
 */
export const PAGE_LOCK_ROUTES: readonly PageLockRoute[] = [
  {
    path: '/', label: 'Главная', group: 'Главная',
    warning: 'Заглушку увидят все, кто зайдёт на сайт: реклама, поиск, прямые заходы.',
    suggest: ['/cases', '/meta-ads', '/google-ads', '/consult'],
  },
  { path: '/meta-ads', label: 'Meta Ads', group: 'Услуги', suggest: ['/cases', '/meta-apps', '/google-ads', '/consult'] },
  { path: '/meta-apps', label: 'Продвижение приложений', group: 'Услуги', suggest: ['/cases', '/meta-ads', '/consult'] },
  { path: '/google-ads', label: 'Google Ads', group: 'Услуги', suggest: ['/cases', '/meta-ads', '/consult'] },
  { path: '/consult', label: 'Консультация', group: 'Услуги', suggest: ['/cases', '/meta-ads', '/google-ads'] },
  { path: '/blog', label: 'Блог', group: 'Контент', hasChildren: true, suggest: ['/cases', '/marketing-glossary', '/faq'] },
  { path: '/cases', label: 'Кейсы', group: 'Контент', hasChildren: true, suggest: ['/meta-ads', '/google-ads', '/consult'] },
  { path: '/faq', label: 'FAQ', group: 'Контент', suggest: ['/consult', '/marketing-glossary', '/cases'] },
  { path: '/marketing-glossary', label: 'Словарь метрик', group: 'Контент', suggest: ['/blog', '/calculator', '/faq'] },
  { path: '/calculator', label: 'Калькулятор бюджета', group: 'Инструменты', suggest: ['/roi-calculator', '/consult', '/cases'] },
  { path: '/roi-calculator', label: 'Калькулятор ROI', group: 'Инструменты', suggest: ['/calculator', '/cases', '/consult'] },
  {
    path: '/thank-you', label: 'Заявка отправлена', group: 'Служебные',
    warning: 'На эту страницу попадают после отправки формы — человек увидит заглушку вместо благодарности.',
    suggest: ['/cases', '/blog'],
  },
  {
    path: '/privacy-policy', label: 'Политика конфиденциальности', group: 'Юридические',
    warning: 'На неё ссылаются все формы сайта и заглушки закрытых страниц, а ещё её требуют рекламные кабинеты. Закрытая политика рядом с галочкой согласия — прямое нарушение.',
    suggest: ['/offer', '/cookie-policy'],
  },
  {
    path: '/offer', label: 'Публичная оферта', group: 'Юридические',
    warning: 'На оферту ссылаются формы сайта.',
    suggest: ['/privacy-policy', '/cookie-policy'],
  },
  {
    path: '/cookie-policy', label: 'Политика Cookie', group: 'Юридические',
    warning: 'На неё ссылаются баннер согласия на cookie и заглушки закрытых страниц.',
    suggest: ['/privacy-policy', '/offer'],
  },
];

const LOCKABLE_PATHS = new Set(PAGE_LOCK_ROUTES.map((route) => route.path));
const ROUTE_BY_PATH = new Map(PAGE_LOCK_ROUTES.map((route) => [route.path, route]));

/**
 * Чёрный список, который нельзя переопределить ничем.
 *
 * `/admin` — иначе одной ошибкой можно закрыть себе вход в админку.
 * `/api/*` — иначе перестал бы работать приём заявок и трекинг: страницы
 * закрыты, а заявки с уже открытых страниц обязаны доходить всегда.
 */
const NEVER_LOCKED_EXACT = new Set(['/robots.txt', '/sitemap.xml', '/feed.xml', '/llms.txt']);
const NEVER_LOCKED_PREFIXES = ['/api/', '/admin'];

export interface PageLock {
  path: string;
  includeChildren: boolean;
  preset: PageLockPreset;
  title: string;
  message: string;
  eta: string;
  hideInNav: boolean;
  showSubscribe: boolean;
  /** До трёх закреплённых кнопок. Пусто — подбираем сами по теме страницы. */
  ctaPaths: string[];
  lockedAt: string;
  updatedAt: string;
}

export type PageLockSource = 'db' | 'cache' | 'stale' | 'empty' | 'no-table' | 'no-db';

export interface PageLockSnapshot {
  locks: PageLock[];
  savedAt: number;
  expiresAt: number;
  source: PageLockSource;
}

interface PageLockRow {
  path: string;
  include_children: number;
  preset: string;
  title: string;
  message: string;
  eta: string | null;
  hide_in_nav: number;
  show_subscribe: number;
  cta_path: string;
  locked_at: string | null;
  updated_at: string;
}

export const PAGE_LOCKS_MIGRATION = '0034_page_locks.sql';
export const PAGE_LOCK_CONTACTS_MIGRATION = '0035_page_lock_contacts.sql';

/**
 * Какие поля контактов доступны на заглушке.
 *
 * Телефон, телеграм и согласие на маркетинг появляются миграцией 0035. До неё
 * форма честно показывает только почту, а не падает и не теряет отправку.
 */
export interface SubscriberFields {
  phone: boolean;
  telegram: boolean;
  marketing: boolean;
}

const NO_CONTACT_FIELDS: SubscriberFields = { phone: false, telegram: false, marketing: false };
const FIELDS_TTL_MS = 5 * 60 * 1000;

let fieldsCache: { fields: SubscriberFields; expiresAt: number } | null = null;

export async function readSubscriberFields(env: Env): Promise<SubscriberFields> {
  const now = Date.now();
  if (fieldsCache && fieldsCache.expiresAt > now) return fieldsCache.fields;
  if (!env.DB) return NO_CONTACT_FIELDS;

  try {
    const result = await env.DB.prepare('PRAGMA table_info(page_lock_subscribers)').all<{ name: string }>();
    const columns = new Set((result.results || []).map((column) => String(column.name)));
    const fields: SubscriberFields = {
      phone: columns.has('phone'),
      telegram: columns.has('telegram'),
      marketing: columns.has('marketing_consent'),
    };
    fieldsCache = { fields, expiresAt: now + FIELDS_TTL_MS };
    return fields;
  } catch {
    fieldsCache = { fields: NO_CONTACT_FIELDS, expiresAt: now + FIELDS_TTL_MS };
    return NO_CONTACT_FIELDS;
  }
}

/** Сброс после применения миграции: иначе поля появятся только через пять минут. */
export function invalidateSubscriberFields(): void {
  fieldsCache = null;
}

const MEMORY_TTL_MS = 30_000;
const DEGRADED_TTL_MS = 10_000;
// Копия живёт час: это запас на случай, когда база недоступна дольше минуты.
const CACHE_TTL_SECONDS = 3600;
const CACHE_KEY = 'https://internal-page-locks.local/v1';

const SELECT_LOCKS = `SELECT path, include_children, preset, title, message, eta,
  hide_in_nav, show_subscribe, cta_path, locked_at, updated_at
  FROM page_locks WHERE locked = 1 ORDER BY path ASC`;

let memory: PageLockSnapshot | null = null;

/** Адрес без хвостового слеша, запроса и якоря: '/blog/' и '/blog' — одно и то же. */
export function normalizePagePath(value: string): string {
  const raw = String(value || '').split('?')[0].split('#')[0].trim();
  if (!raw || raw === '/') return '/';
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`;
  return withSlash.replace(/\/+$/, '') || '/';
}

/** Можно ли вообще закрывать этот адрес. Белый список плюс чёрный поверх него. */
export function isLockablePath(value: string): boolean {
  const path = normalizePagePath(value);
  if (NEVER_LOCKED_EXACT.has(path)) return false;
  if (NEVER_LOCKED_PREFIXES.some((prefix) => path === prefix.replace(/\/$/, '') || path.startsWith(prefix))) return false;
  return LOCKABLE_PATHS.has(path);
}

export function pageLockRoute(path: string): PageLockRoute | null {
  return ROUTE_BY_PATH.get(normalizePagePath(path)) || null;
}

export function pageLockLabel(path: string): string {
  return pageLockRoute(path)?.label || normalizePagePath(path);
}

export function normalizePreset(value: unknown): PageLockPreset {
  const raw = String(value || '').trim();
  return raw === 'update' || raw === 'soon' || raw === 'custom' ? raw : 'development';
}

/** Дата в формате YYYY-MM-DD или пусто. Всё остальное отбрасывается. */
export function normalizeEta(value: unknown): string {
  const raw = String(value || '').trim().slice(0, 10);
  return /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(raw) ? raw : '';
}

/**
 * Тексты заглушки — только простой текст.
 *
 * Ни HTML, ни ссылок: заглушка отдаётся всем подряд, и разметка в ней
 * означала бы чужой скрипт или чужую ссылку на своём домене.
 */
export function sanitizeLockText(value: unknown, maxLength: number): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

export const LOCK_TITLE_MAX = 80;
export const LOCK_MESSAGE_MAX = 260;

export const MAX_CTA_PATHS = 3;

/**
 * Закреплённые кнопки заглушки: только страницы сайта, только из белого списка.
 *
 * Принимается и список, и старая строка с одним адресом — колонка `cta_path`
 * заполнялась одиночным значением до появления выбора из трёх кнопок.
 */
export function normalizeCtaPaths(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : String(value ?? '').split(',');
  const result: string[] = [];
  for (const item of raw) {
    const path = normalizePagePath(String(item || ''));
    // '/' означает «подбирай сам»: главная и так всегда последняя в подборе.
    if (path === '/' || !LOCKABLE_PATHS.has(path) || result.includes(path)) continue;
    result.push(path);
    if (result.length >= MAX_CTA_PATHS) break;
  }
  return result;
}

/** Обратно в колонку: пустой список — пустая строка. */
export function serializeCtaPaths(paths: readonly string[]): string {
  return paths.join(',');
}

export const PAGE_LOCK_PRESETS: Readonly<Record<Exclude<PageLockPreset, 'custom'>, { title: string; message: string }>> = {
  development: {
    title: 'Страница в разработке',
    message: 'Дописываем этот раздел, чтобы он был честным и полезным. Скоро откроем — а пока посмотрите то, что уже работает.',
  },
  update: {
    title: 'Страница обновляется',
    message: 'Обновляем содержимое: цифры, примеры и формулировки должны быть актуальными. Загляните чуть позже.',
  },
  soon: {
    title: 'Скоро откроется',
    message: 'Готовим раздел к запуску. Оставьте почту — напишем, как только всё будет готово.',
  },
};

/** Заголовок и текст заглушки: свои, если заданы, иначе из пресета. */
export function resolveLockCopy(lock: PageLock): { title: string; message: string } {
  const preset = lock.preset === 'custom' ? null : PAGE_LOCK_PRESETS[lock.preset];
  return {
    title: lock.title || preset?.title || PAGE_LOCK_PRESETS.development.title,
    message: lock.message || preset?.message || PAGE_LOCK_PRESETS.development.message,
  };
}

export interface LockSuggestion {
  path: string;
  label: string;
}

/**
 * Куда звать человека с заглушки.
 *
 * Заглушка без выхода — это уход с сайта. Порядок такой: сначала ручной выбор
 * владельца, если он его сделал, затем набор под тему самой страницы, в конце
 * главная. Из списка выкидываются сама страница и всё, что тоже закрыто, —
 * иначе кнопка вела бы на вторую заглушку подряд.
 */
export function resolveLockSuggestions(
  lock: PageLock,
  locks: readonly PageLock[],
  limit = 3,
): LockSuggestion[] {
  const current = normalizePagePath(lock.path);
  const route = pageLockRoute(current);
  // Главной в списке кнопок нет намеренно: ссылка на неё стоит отдельной
  // строкой внизу карточки и не занимает слот тематической подсказки.
  const candidates = [
    ...(lock.ctaPaths || []),
    ...(route?.suggest || []),
  ];

  const seen = new Set<string>([current]);
  const result: LockSuggestion[] = [];

  for (const candidate of candidates) {
    const path = normalizePagePath(candidate);
    if (seen.has(path) || !LOCKABLE_PATHS.has(path)) continue;
    if (findPageLock(locks, path)) continue;
    seen.add(path);
    result.push({ path, label: pageLockLabel(path) });
    if (result.length >= limit) break;
  }

  return result;
}

const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

/** «2026-08-25» → «25 августа». Пустая строка, если даты нет. */
export function formatEta(eta: string): string {
  const normalized = normalizeEta(eta);
  if (!normalized) return '';
  const [, month, day] = normalized.split('-');
  const monthName = MONTHS_GENITIVE[Number(month) - 1];
  if (!monthName) return '';
  return `${Number(day)} ${monthName}`;
}

export function emptyLock(path: string): PageLock {
  return {
    path: normalizePagePath(path),
    includeChildren: false,
    preset: 'development',
    title: '',
    message: '',
    eta: '',
    hideInNav: true,
    showSubscribe: true,
    ctaPaths: [],
    lockedAt: '',
    updatedAt: '',
  };
}

export function mapLockRow(row: PageLockRow): PageLock {
  const path = normalizePagePath(row.path);
  return {
    path,
    // У главной вложенных адресов нет: '/' с потомками закрыл бы весь сайт
    // целиком, включая страницы, которые владелец не трогал.
    includeChildren: path !== '/' && Number(row.include_children) === 1,
    preset: normalizePreset(row.preset),
    title: sanitizeLockText(row.title, LOCK_TITLE_MAX),
    message: sanitizeLockText(row.message, LOCK_MESSAGE_MAX),
    eta: normalizeEta(row.eta),
    hideInNav: Number(row.hide_in_nav) === 1,
    showSubscribe: Number(row.show_subscribe) === 1,
    ctaPaths: normalizeCtaPaths(row.cta_path),
    lockedAt: String(row.locked_at || ''),
    updatedAt: String(row.updated_at || ''),
  };
}

function isMissingTable(error: unknown): boolean {
  return /no such table|no such column/i.test(error instanceof Error ? error.message : String(error));
}

function cacheRequest(): Request {
  return new Request(CACHE_KEY, { method: 'GET' });
}

async function readCachedSnapshot(): Promise<PageLockSnapshot | null> {
  try {
    const cached = await caches.default.match(cacheRequest());
    if (!cached) return null;
    const parsed = await cached.json() as { locks?: unknown; savedAt?: unknown };
    if (!Array.isArray(parsed?.locks)) return null;
    const savedAt = Number(parsed.savedAt) || 0;
    return {
      locks: parsed.locks.map((lock) => lock as PageLock).filter((lock) => Boolean(lock?.path)),
      savedAt,
      expiresAt: savedAt + MEMORY_TTL_MS,
      source: 'cache',
    };
  } catch {
    return null;
  }
}

async function writeCachedSnapshot(snapshot: PageLockSnapshot): Promise<void> {
  try {
    await caches.default.put(
      cacheRequest(),
      new Response(JSON.stringify({ locks: snapshot.locks, savedAt: snapshot.savedAt }), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': `max-age=${CACHE_TTL_SECONDS}`,
        },
      }),
    );
  } catch {
    // Кэш — ускорение, а не источник истины: сбой записи ничего не ломает.
  }
}

/**
 * Сбрасывает кэш после изменения в админке.
 *
 * Общий кэш дата-центра удаляется сразу, память других воркеров живёт своей
 * жизнью — поэтому полное применение занимает до полуминуты. Быстрее нельзя
 * без запроса к базе на каждый показ страницы.
 */
export async function invalidatePageLockCache(): Promise<void> {
  memory = null;
  try {
    await caches.default.delete(cacheRequest());
  } catch {
    // См. выше: кэш не источник истины.
  }
}

export async function readPageLockSnapshot(
  env: Env,
  waitUntil?: (promise: Promise<unknown>) => void,
): Promise<PageLockSnapshot> {
  const now = Date.now();
  if (memory && memory.expiresAt > now) return memory;

  const cached = await readCachedSnapshot();
  if (cached && cached.expiresAt > now) {
    memory = cached;
    return cached;
  }

  if (!env.DB) {
    const snapshot: PageLockSnapshot = {
      locks: cached?.locks || [],
      savedAt: now,
      expiresAt: now + MEMORY_TTL_MS,
      source: cached ? 'stale' : 'no-db',
    };
    memory = snapshot;
    return snapshot;
  }

  try {
    const result = await env.DB.prepare(SELECT_LOCKS).all<PageLockRow>();
    const snapshot: PageLockSnapshot = {
      locks: (result.results || []).map(mapLockRow),
      savedAt: now,
      expiresAt: now + MEMORY_TTL_MS,
      source: 'db',
    };
    memory = snapshot;
    const write = writeCachedSnapshot(snapshot);
    if (waitUntil) waitUntil(write);
    else void write;
    return snapshot;
  } catch (error) {
    // Миграция ещё не применена — это не сбой: закрытых страниц просто нет.
    if (isMissingTable(error)) {
      const snapshot: PageLockSnapshot = { locks: [], savedAt: now, expiresAt: now + MEMORY_TTL_MS, source: 'no-table' };
      memory = snapshot;
      return snapshot;
    }

    // Настоящий сбой базы: держим последнюю известную копию и пробуем снова
    // через несколько секунд, но сайт не гасим.
    const snapshot: PageLockSnapshot = {
      locks: cached?.locks || [],
      savedAt: cached?.savedAt || now,
      expiresAt: now + DEGRADED_TTL_MS,
      source: cached ? 'stale' : 'empty',
    };
    memory = snapshot;
    return snapshot;
  }
}

/** Закрыт ли конкретный адрес. Учитывает блокировку раздела вместе с вложенными. */
export function findPageLock(locks: readonly PageLock[], pathname: string): PageLock | null {
  const path = normalizePagePath(pathname);
  for (const lock of locks) {
    if (lock.path === path) return lock;
    if (lock.includeChildren && lock.path !== '/' && path.startsWith(`${lock.path}/`)) return lock;
  }
  return null;
}

/**
 * Компактный список для разметки страницы.
 *
 * Формат: `/blog/*` — закрыт вместе с вложенными, `~/blog` — закрыт, но ссылки
 * на него в меню остаются (страница «скоро откроется», куда владелец хочет
 * вести людей осознанно).
 */
export function serializeLockPaths(locks: readonly PageLock[]): string {
  return locks
    .map((lock) => `${lock.hideInNav ? '' : '~'}${lock.path}${lock.includeChildren ? '/*' : ''}`)
    .join(' ');
}

/** Адреса, которые не должны попадать в меню, sitemap и RSS. */
export function isPathHiddenByLock(locks: readonly PageLock[], pathname: string): boolean {
  const lock = findPageLock(locks, pathname);
  return Boolean(lock);
}
