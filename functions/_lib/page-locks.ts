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
  { path: '/', label: 'Главная', group: 'Главная', warning: 'Заглушку увидят все, кто зайдёт на сайт: реклама, поиск, прямые заходы.' },
  { path: '/meta-ads', label: 'Meta Ads', group: 'Услуги' },
  { path: '/meta-apps', label: 'Продвижение приложений', group: 'Услуги' },
  { path: '/google-ads', label: 'Google Ads', group: 'Услуги' },
  { path: '/consult', label: 'Консультация', group: 'Услуги' },
  { path: '/blog', label: 'Блог', group: 'Контент', hasChildren: true },
  { path: '/cases', label: 'Кейсы', group: 'Контент', hasChildren: true },
  { path: '/faq', label: 'FAQ', group: 'Контент' },
  { path: '/marketing-glossary', label: 'Словарь метрик', group: 'Контент' },
  { path: '/calculator', label: 'Калькулятор бюджета', group: 'Инструменты' },
  { path: '/roi-calculator', label: 'Калькулятор ROI', group: 'Инструменты' },
  { path: '/thank-you', label: 'Заявка отправлена', group: 'Служебные', warning: 'На эту страницу попадают после отправки формы — человек увидит заглушку вместо благодарности.' },
  { path: '/privacy-policy', label: 'Политика конфиденциальности', group: 'Юридические', warning: 'Ссылка на политику обязательна в формах и в рекламных кабинетах.' },
  { path: '/offer', label: 'Публичная оферта', group: 'Юридические' },
  { path: '/cookie-policy', label: 'Политика Cookie', group: 'Юридические' },
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
  ctaPath: string;
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

/** Вторая кнопка ведёт только на страницу сайта и только на открытую. */
export function normalizeCtaPath(value: unknown): string {
  const path = normalizePagePath(String(value || '/'));
  return LOCKABLE_PATHS.has(path) ? path : '/';
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
    ctaPath: '/',
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
    ctaPath: normalizeCtaPath(row.cta_path),
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
