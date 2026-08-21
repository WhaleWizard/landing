import { useEffect, useState } from 'react';

/**
 * Закрытые страницы на стороне сайта.
 *
 * Настоящая проверка живёт на сервере: закрытая страница не отдаётся вовсе.
 * Здесь — только знание о ней, чтобы переходы внутри сайта не рисовали
 * страницу, которую посетителю видеть нельзя, и чтобы её код вообще не
 * скачивался.
 *
 * Список приходит в разметке первой загрузки (`<meta name="ww-page-locks">`),
 * поэтому известен с нулевого байта: без лишнего запроса и без мигания.
 */

const LOCKS_META = 'ww-page-locks';
const PREVIEW_META = 'ww-page-preview';
const REFRESH_AFTER_MS = 120_000;

export interface PageLockEntry {
  path: string;
  includeChildren: boolean;
  /** Убрать ли ссылки на страницу из меню, подвала и блоков главной. */
  hideInNav: boolean;
}

function readMeta(name: string): string {
  if (typeof document === 'undefined') return '';
  return document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || '';
}

export function normalizePublicPath(value: string): string {
  const raw = String(value || '').split('?')[0].split('#')[0];
  if (!raw || raw === '/') return '/';
  return raw.replace(/\/+$/, '') || '/';
}

/**
 * Разбирает список из разметки.
 *
 * `/blog/*` — закрыт вместе с вложенными адресами, `~/blog` — закрыт, но
 * ссылки на него остаются на месте.
 */
export function parseLockList(raw: string): PageLockEntry[] {
  return raw
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const hideInNav = !item.startsWith('~');
      const withoutFlag = hideInNav ? item : item.slice(1);
      const includeChildren = withoutFlag.endsWith('/*');
      const path = normalizePublicPath(includeChildren ? withoutFlag.slice(0, -2) : withoutFlag);
      return { path, includeChildren, hideInNav };
    })
    .filter((lock) => lock.path);
}

let locks: PageLockEntry[] = parseLockList(readMeta(LOCKS_META));
// Ссылка предпросмотра открывает владельцу все закрытые страницы: гасить их
// в интерфейсе, когда сервер их уже отдал, было бы враньём.
let previewActive = readMeta(PREVIEW_META) === '1';
let lastRefreshAt = Date.now();
let refreshing: Promise<void> | null = null;

const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function isPreviewMode(): boolean {
  return previewActive;
}

export function getPageLocks(): readonly PageLockEntry[] {
  return locks;
}

export function isPathLocked(pathname: string): boolean {
  if (previewActive || locks.length === 0) return false;
  const path = normalizePublicPath(pathname);
  return locks.some((lock) => (
    lock.path === path
    || (lock.includeChildren && lock.path !== '/' && path.startsWith(`${lock.path}/`))
  ));
}

/** Публичный список закрытых страниц для меню и подвала. */
export function hiddenNavPaths(): string[] {
  if (previewActive) return [];
  return locks.filter((lock) => lock.hideInNav).map((lock) => lock.path);
}

/**
 * Обновляет список для давно открытой вкладки.
 *
 * Разметку она получила до того, как страницу закрыли, а сама на сервер за
 * новой страницей уже не ходит. Запрос крошечный и кэшируется на минуту.
 */
export function refreshPageLocks(force = false): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if (!force && Date.now() - lastRefreshAt < REFRESH_AFTER_MS) return Promise.resolve();
  if (refreshing) return refreshing;

  lastRefreshAt = Date.now();
  refreshing = fetch('/api/page-locks', { credentials: 'same-origin' })
    .then((response) => (response.ok ? response.json() : null))
    .then((payload: { locks?: Array<{ path?: string; includeChildren?: boolean; hideInNav?: boolean }> } | null) => {
      if (!payload || !Array.isArray(payload.locks)) return;
      const next = payload.locks
        .map((lock) => ({
          path: normalizePublicPath(String(lock?.path || '')),
          includeChildren: Boolean(lock?.includeChildren),
          hideInNav: lock?.hideInNav !== false,
        }))
        .filter((lock) => lock.path);
      const changed = next.length !== locks.length
        || next.some((lock, index) => (
          lock.path !== locks[index]?.path
          || lock.includeChildren !== locks[index]?.includeChildren
          || lock.hideInNav !== locks[index]?.hideInNav
        ));
      locks = next;
      if (changed) emit();
    })
    .catch(() => {
      // Сеть подвела — остаёмся с тем, что знаем. Настоящая проверка всё
      // равно на сервере, и она сработает при следующей полной загрузке.
    })
    .finally(() => {
      refreshing = null;
    });

  return refreshing;
}

/** Подписка на изменения списка: перерисовывает меню и подвал. */
export function usePageLocks(): { locked: readonly PageLockEntry[]; preview: boolean } {
  const [snapshot, setSnapshot] = useState(() => ({ locked: locks, preview: previewActive }));

  useEffect(() => {
    const listener = () => setSnapshot({ locked: locks, preview: previewActive });
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return snapshot;
}

function matches(lock: PageLockEntry, path: string): boolean {
  return lock.path === path
    || (lock.includeChildren && lock.path !== '/' && path.startsWith(`${lock.path}/`));
}

/**
 * Скрывать ли ссылку на страницу в меню, подвале и блоках главной.
 *
 * Не всякая закрытая страница прячется: у «скоро откроется» ссылку можно
 * оставить осознанно — там ждёт форма «сообщить, когда откроется».
 */
export function useIsPathHiddenInNav(): (pathname: string) => boolean {
  const snapshot = usePageLocks();
  return (pathname: string) => {
    if (snapshot.preview || snapshot.locked.length === 0) return false;
    const path = normalizePublicPath(pathname);
    return snapshot.locked.some((lock) => lock.hideInNav && matches(lock, path));
  };
}
