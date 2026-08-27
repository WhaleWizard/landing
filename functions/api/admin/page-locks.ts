import { verifyAdminPassword } from '../../_lib/auth';
import { CACHE_CONTROL } from '../../_lib/cache';
import { json } from '../../_lib/http';
import { migrationRequiredResponse } from '../../_lib/migration-guard';
import { actorHash, createPreviewToken, PREVIEW_QUERY, PREVIEW_TTL_SECONDS } from '../../_lib/page-lock-preview';
import {
  invalidatePageLockCache,
  isLockablePath,
  LOCK_MESSAGE_MAX,
  LOCK_TITLE_MAX,
  mapLockRow,
  normalizeCtaPaths,
  normalizeEta,
  normalizePagePath,
  normalizePreset,
  PAGE_LOCK_PRESETS,
  PAGE_LOCK_ROUTES,
  PAGE_LOCKS_MIGRATION,
  readSubscriberFields,
  serializeCtaPaths,
  readPageLockSnapshot,
  sanitizeLockText,
  type PageLock,
} from '../../_lib/page-locks';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

/**
 * Управление доступом к страницам.
 *
 * Единственный способ закрыть или открыть страницу. Пароль админки проверяется
 * сравнением с защитой от подбора по времени, адрес принимается только из
 * белого списка `PAGE_LOCK_ROUTES`, а каждое изменение попадает в журнал.
 * Через query string пароль не принимается никогда.
 */

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };
const MIGRATION = PAGE_LOCKS_MIGRATION;
const REASON = 'без неё нельзя закрывать страницы заглушкой';
const TRAFFIC_DAYS = 7;
const MAX_SUBSCRIBERS = 200;
const MAX_EVENTS = 40;

interface SubscriberRow {
  id: number;
  path: string;
  email: string;
  phone?: string;
  telegram?: string;
  marketing_consent?: number;
  created_at: string;
  notified_at: string | null;
}

interface LockRow {
  path: string;
  locked: number;
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

function unauthorized(): Response {
  return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
}

function noDatabase(): Response {
  return json({
    success: false,
    code: 'D1_NOT_BOUND',
    error: 'Доступ к страницам хранится в D1 и работает на production.',
  }, { status: 503, headers: noStore });
}

/**
 * Запрос на изменение должен приходить со своего же сайта.
 *
 * Нестандартный заголовок с паролем браузер и так не отправит на чужой домен
 * без разрешения, но проверка источника закрывает вопрос полностью.
 */
function isForeignOrigin(request: Request): boolean {
  const origin = request.headers.get('Origin');
  if (!origin) return false;
  try {
    return new URL(origin).host !== new URL(request.url).host;
  } catch {
    return true;
  }
}

function siteUrl(env: Env, request: Request): string {
  if (env.SITE_URL) return env.SITE_URL.replace(/\/$/, '');
  return new URL(request.url).origin.replace(/\/$/, '');
}

function rowToLock(row: LockRow): PageLock & { locked: boolean } {
  return { ...mapLockRow(row), locked: Number(row.locked) === 1 };
}

async function readTraffic(db: D1Database): Promise<Record<string, number>> {
  const since = new Date(Date.now() - TRAFFIC_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  try {
    const result = await db
      .prepare('SELECT page_path, SUM(views) AS views FROM page_stats_daily WHERE day >= ? GROUP BY page_path')
      .bind(since)
      .all<{ page_path: string; views: number }>();
    const traffic: Record<string, number> = {};
    for (const row of result.results || []) {
      traffic[normalizePagePath(row.page_path)] = Number(row.views) || 0;
    }
    return traffic;
  } catch {
    // Статистика посещений — подсказка, а не условие работы раздела.
    return {};
  }
}

/**
 * Сколько человек ждут открытия каждой страницы.
 *
 * Считается отдельным запросом, а не фильтром по уже загруженному списку:
 * список подписчиков ограничен последними двумя сотнями, и на 201-м контакте
 * счётчик у карточки начал бы занижать реальное число.
 */
async function readWaitingCounts(db: D1Database): Promise<Record<string, number>> {
  const result = await db
    .prepare('SELECT path, COUNT(*) AS waiting FROM page_lock_subscribers WHERE notified_at IS NULL GROUP BY path')
    .all<{ path: string; waiting: number }>();
  const counts: Record<string, number> = {};
  for (const row of result.results || []) {
    counts[normalizePagePath(row.path)] = Number(row.waiting) || 0;
  }
  return counts;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env, waitUntil }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;
  if (!verifyAdminPassword(request.headers.get('X-Admin-Password') || '', env)) return unauthorized();
  if (!env.DB) return noDatabase();

  try {
    const [rows, events, subscribers, waitingCounts] = await Promise.all([
      env.DB.prepare('SELECT * FROM page_locks ORDER BY path ASC').all<LockRow>(),
      env.DB.prepare(`SELECT path, action, created_at FROM page_lock_events
        ORDER BY id DESC LIMIT ${MAX_EVENTS}`).all<{ path: string; action: string; created_at: string }>(),
      env.DB.prepare(`SELECT * FROM page_lock_subscribers
        ORDER BY id DESC LIMIT ${MAX_SUBSCRIBERS}`).all<SubscriberRow>(),
      readWaitingCounts(env.DB),
    ]);

    const traffic = await readTraffic(env.DB);
    const snapshot = await readPageLockSnapshot(env, waitUntil);
    const saved = new Map((rows.results || []).map((row) => [normalizePagePath(row.path), rowToLock(row)]));

    const routes = PAGE_LOCK_ROUTES.map((route) => {
      const state = saved.get(route.path);
      return {
        ...route,
        locked: Boolean(state?.locked),
        includeChildren: Boolean(state?.includeChildren),
        preset: state?.preset || 'development',
        title: state?.title || '',
        message: state?.message || '',
        eta: state?.eta || '',
        hideInNav: state ? state.hideInNav : true,
        showSubscribe: state ? state.showSubscribe : true,
        ctaPaths: state?.ctaPaths || [],
        lockedAt: state?.lockedAt || '',
        updatedAt: state?.updatedAt || '',
        weeklyViews: traffic[route.path] || 0,
        waiting: waitingCounts[route.path] || 0,
      };
    });

    return json({
      success: true,
      routes,
      presets: PAGE_LOCK_PRESETS,
      limits: { title: LOCK_TITLE_MAX, message: LOCK_MESSAGE_MAX },
      events: (events.results || []).map((event) => ({
        path: event.path,
        action: event.action,
        createdAt: event.created_at,
      })),
      subscribers: (subscribers.results || []).map((item) => ({
        id: item.id,
        path: item.path,
        email: item.email || '',
        phone: item.phone || '',
        telegram: item.telegram || '',
        marketingConsent: Number(item.marketing_consent || 0) === 1,
        createdAt: item.created_at,
        notifiedAt: item.notified_at || '',
      })),
      fields: await readSubscriberFields(env),
      trafficDays: TRAFFIC_DAYS,
      listSource: snapshot.source,
    }, { headers: noStore });
  } catch (error) {
    return migrationRequiredResponse(error, MIGRATION, REASON);
  }
};

interface SavePayload {
  path?: string;
  ctaPaths?: unknown;
  locked?: boolean;
  includeChildren?: boolean;
  preset?: string;
  title?: string;
  message?: string;
  eta?: string;
  hideInNav?: boolean;
  showSubscribe?: boolean;
  ctaPath?: string;
}

async function writeEvent(db: D1Database, path: string, action: string, hash: string): Promise<void> {
  try {
    await db.prepare('INSERT INTO page_lock_events (path, action, actor_hash) VALUES (?, ?, ?)')
      .bind(path, action, hash)
      .run();
  } catch {
    // Журнал не должен мешать самой операции: он про наблюдаемость, не про доступ.
  }
}

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;
  if (isForeignOrigin(request)) return unauthorized();

  const body = await request.json().catch(() => ({})) as SavePayload & { password?: string; action?: string; id?: number };
  if (!verifyAdminPassword(request.headers.get('X-Admin-Password') || body.password || '', env)) return unauthorized();
  if (!env.DB) return noDatabase();

  const action = String(body.action || 'save');
  const hash = await actorHash(request, env);

  try {
    if (action === 'preview_token') {
      const token = await createPreviewToken(env);
      if (!token) {
        return json({ success: false, error: 'Пароль админки не задан на сервере — ссылку предпросмотра подписать нечем.' }, { status: 503, headers: noStore });
      }
      const path = isLockablePath(body.path || '/') ? normalizePagePath(body.path || '/') : '/';
      await writeEvent(env.DB, path, 'preview', hash);
      return json({
        success: true,
        url: `${siteUrl(env, request)}${path}?${PREVIEW_QUERY}=${encodeURIComponent(token)}`,
        expiresInMinutes: Math.round(PREVIEW_TTL_SECONDS / 60),
      }, { headers: noStore });
    }

    if (action === 'unlock_all') {
      const locked = await env.DB.prepare('SELECT path FROM page_locks WHERE locked = 1').all<{ path: string }>();
      await env.DB.prepare("UPDATE page_locks SET locked = 0, updated_at = datetime('now') WHERE locked = 1").run();
      for (const row of locked.results || []) {
        await writeEvent(env.DB, normalizePagePath(row.path), 'unlock', hash);
      }
      await invalidatePageLockCache();
      return json({ success: true, opened: (locked.results || []).length }, { headers: noStore });
    }

    if (action === 'mark_notified') {
      const path = normalizePagePath(String(body.path || ''));
      if (!isLockablePath(path)) {
        return json({ success: false, error: 'Неизвестный адрес страницы' }, { status: 400, headers: noStore });
      }
      await env.DB.prepare("UPDATE page_lock_subscribers SET notified_at = datetime('now') WHERE path = ? AND notified_at IS NULL")
        .bind(path)
        .run();
      return json({ success: true }, { headers: noStore });
    }

    if (action === 'delete_subscriber') {
      const id = Number(body.id || 0);
      if (!Number.isInteger(id) || id <= 0) {
        return json({ success: false, error: 'Не указана запись' }, { status: 400, headers: noStore });
      }
      await env.DB.prepare('DELETE FROM page_lock_subscribers WHERE id = ?').bind(id).run();
      return json({ success: true }, { headers: noStore });
    }

    if (action !== 'save') {
      return json({ success: false, error: 'Неизвестное действие' }, { status: 400, headers: noStore });
    }

    const path = normalizePagePath(String(body.path || ''));
    // Белый список: закрыть можно только известную страницу сайта. Всё
    // остальное — включая /admin и /api/* — отклоняется без разговоров.
    if (!isLockablePath(path)) {
      return json({ success: false, error: 'Эту страницу закрывать нельзя' }, { status: 400, headers: noStore });
    }

    const locked = body.locked === true;
    const includeChildren = path !== '/' && body.includeChildren === true;
    const preset = normalizePreset(body.preset);
    const title = sanitizeLockText(body.title, LOCK_TITLE_MAX);
    const message = sanitizeLockText(body.message, LOCK_MESSAGE_MAX);
    const eta = normalizeEta(body.eta);
    const ctaPaths = normalizeCtaPaths(body.ctaPaths ?? body.ctaPath);

    // Правка текстов при неизменном доступе — это «update», а не «закрыл» или
    // «открыл»: журнал должен читаться как история доступа, а не как шум.
    const previous = await env.DB.prepare('SELECT locked FROM page_locks WHERE path = ?')
      .bind(path)
      .first<{ locked: number }>();
    const wasLocked = Number(previous?.locked || 0) === 1;

    await env.DB.prepare(`INSERT INTO page_locks
      (path, locked, include_children, preset, title, message, eta, hide_in_nav, show_subscribe, cta_path, locked_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 1 THEN datetime('now') ELSE NULL END, datetime('now'))
      ON CONFLICT(path) DO UPDATE SET
        locked = excluded.locked,
        include_children = excluded.include_children,
        preset = excluded.preset,
        title = excluded.title,
        message = excluded.message,
        eta = excluded.eta,
        hide_in_nav = excluded.hide_in_nav,
        show_subscribe = excluded.show_subscribe,
        cta_path = excluded.cta_path,
        locked_at = CASE
          WHEN excluded.locked = 1 THEN COALESCE(page_locks.locked_at, excluded.locked_at)
          ELSE NULL END,
        updated_at = datetime('now')`)
      .bind(
        path,
        locked ? 1 : 0,
        includeChildren ? 1 : 0,
        preset,
        title,
        message,
        eta || null,
        body.hideInNav === false ? 0 : 1,
        body.showSubscribe === false ? 0 : 1,
        serializeCtaPaths(ctaPaths),
        locked ? 1 : 0,
      )
      .run();

    await writeEvent(env.DB, path, wasLocked === locked ? 'update' : (locked ? 'lock' : 'unlock'), hash);
    await invalidatePageLockCache();

    return json({ success: true, path, locked }, { headers: noStore });
  } catch (error) {
    return migrationRequiredResponse(error, MIGRATION, REASON);
  }
};
