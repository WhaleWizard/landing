import { json } from '../../_lib/http';
import { CACHE_CONTROL } from '../../_lib/cache';
import { verifyAdminPassword } from '../../_lib/auth';
import { enforceRateLimit } from '../../_lib/rate-limit';
import { isTelegramConfigured } from '../../_lib/leads';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };

type CheckStatus = 'ok' | 'warn' | 'fail';

interface HealthCheck {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
}

function check(id: string, title: string, status: CheckStatus, detail: string): HealthCheck {
  return { id, title, status, detail };
}

async function tableExists(db: D1Database, name: string): Promise<boolean> {
  const row = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").bind(name).first<{ name: string }>();
  return Boolean(row?.name);
}

async function runChecks(env: Env, request: Request): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];

  // --- База данных и таблицы ---
  if (!env.DB) {
    checks.push(check('d1', 'База данных D1', 'fail', 'Биндинг DB не настроен — статьи и заявки работают на резервных источниках'));
  } else {
    try {
      const tables = ['articles', 'leads', 'page_stats_daily', 'visitor_hashes_daily', 'meta_outbox', 'meta_capi_diagnostics'];
      const missing: string[] = [];
      for (const table of tables) {
        if (!(await tableExists(env.DB, table))) missing.push(table);
      }
      if (missing.length === 0) {
        const articles = await env.DB.prepare('SELECT COUNT(*) AS c FROM articles').first<{ c: number }>();
        checks.push(check('d1', 'База данных D1', 'ok', `Все таблицы на месте, статей в базе: ${articles?.c ?? 0}`));
      } else {
        checks.push(check('d1', 'База данных D1', 'warn', `Нет таблиц: ${missing.join(', ')} — примените миграции из папки migrations/`));
      }
    } catch (error) {
      checks.push(check('d1', 'База данных D1', 'fail', error instanceof Error ? error.message : 'Ошибка запроса к базе'));
    }
  }

  // --- Статистика посещений ---
  if (env.DB) {
    try {
      const today = await env.DB.prepare("SELECT SUM(views) AS v FROM page_stats_daily WHERE day >= date('now', '-1 day')").first<{ v: number }>();
      const views = today?.v ?? 0;
      checks.push(check('stats', 'Сбор статистики посещений', views > 0 ? 'ok' : 'warn', views > 0 ? `За последние сутки записано просмотров: ${views}` : 'За сутки нет записанных просмотров — либо нет трафика, либо статистика не пишется'));
    } catch {
      checks.push(check('stats', 'Сбор статистики посещений', 'warn', 'Таблицы статистики недоступны — примените миграцию 0008'));
    }
  }

  // --- Заявки и Telegram ---
  if (env.DB) {
    try {
      const lastLead = await env.DB.prepare('SELECT created_at, telegram_delivered FROM leads ORDER BY id DESC LIMIT 1').first<{ created_at: string; telegram_delivered: number }>();
      if (!lastLead) {
        checks.push(check('leads', 'Приём заявок', 'warn', 'В базе пока нет ни одной заявки — оставьте тестовую с сайта'));
      } else {
        checks.push(check('leads', 'Приём заявок', 'ok', `Последняя заявка: ${lastLead.created_at} UTC${lastLead.telegram_delivered === 1 ? ', Telegram-уведомление доставлено' : ', Telegram-уведомление не подтверждено'}`));
      }
    } catch {
      checks.push(check('leads', 'Приём заявок', 'warn', 'Таблица заявок недоступна — примените миграцию 0008'));
    }
  }
  checks.push(
    isTelegramConfigured(env)
      ? check('telegram', 'Telegram-уведомления', 'ok', 'Секреты настроены, отправка идёт напрямую из Cloudflare. Нажмите «Тест Telegram», чтобы проверить доставку')
      : check('telegram', 'Telegram-уведомления', 'warn', 'Секреты TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID не заданы — работает запасной канал через Google Apps Script'),
  );

  // --- Meta CAPI ---
  if (!env.META_CAPI_ACCESS_TOKEN) {
    checks.push(check('capi', 'Meta CAPI', 'fail', 'META_CAPI_ACCESS_TOKEN не задан — серверные события не отправляются'));
  } else if (env.DB) {
    try {
      const [outbox, day] = await Promise.all([
        env.DB.prepare("SELECT COUNT(*) AS c FROM meta_outbox WHERE status = 'pending'").first<{ c: number }>(),
        env.DB.prepare("SELECT SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed FROM meta_capi_diagnostics WHERE created_at >= datetime('now', '-1 day')").first<{ sent: number; failed: number }>(),
      ]);
      const pending = outbox?.c ?? 0;
      const sent = day?.sent ?? 0;
      const failed = day?.failed ?? 0;
      const status: CheckStatus = failed > sent ? 'fail' : pending > 10 || failed > 0 ? 'warn' : 'ok';
      checks.push(check('capi', 'Meta CAPI', status, `За сутки: ${sent} отправлено, ${failed} ошибок; в очереди недоставленных: ${pending}`));
    } catch {
      checks.push(check('capi', 'Meta CAPI', 'warn', 'Токен задан, но таблицы диагностики недоступны'));
    }
  } else {
    checks.push(check('capi', 'Meta CAPI', 'warn', 'Токен задан; полная диагностика доступна при подключённой D1'));
  }

  // --- Хранилище файлов ---
  if (!env.BUCKET) {
    checks.push(check('r2', 'Хранилище файлов (R2)', 'fail', 'Биндинг BUCKET не настроен — загрузка файлов не работает'));
  } else {
    try {
      const listing = await env.BUCKET.list({ prefix: 'uploads/', limit: 1 });
      checks.push(check('r2', 'Хранилище файлов (R2)', 'ok', listing.objects.length > 0 ? 'Хранилище отвечает, файлы на месте' : 'Хранилище отвечает (загруженных файлов пока нет)'));
    } catch (error) {
      checks.push(check('r2', 'Хранилище файлов (R2)', 'fail', error instanceof Error ? error.message : 'Хранилище не отвечает'));
    }
  }

  // --- Страницы сайта ---
  const origin = env.SITE_URL || new URL(request.url).origin;
  for (const [id, path, title] of [
    ['page-home', '/', 'Главная страница'],
    ['page-sitemap', '/sitemap.xml', 'Карта сайта (sitemap.xml)'],
    ['page-feed', '/feed.xml', 'RSS-лента'],
  ] as const) {
    try {
      const res = await fetch(`${origin}${path}`, { headers: { 'User-Agent': 'ww-admin-health-check' } });
      checks.push(res.ok
        ? check(id, title, 'ok', `Отвечает (HTTP ${res.status})`)
        : check(id, title, 'fail', `HTTP ${res.status}`));
    } catch (error) {
      checks.push(check(id, title, 'fail', error instanceof Error ? error.message : 'Не отвечает'));
    }
  }

  return checks;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;
  if (!verifyAdminPassword(request.headers.get('X-Admin-Password') || '', env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  try {
    const checks = await runChecks(env, request);
    return json({ success: true, checks, checkedAt: new Date().toISOString() }, { headers: noStore });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : 'Health check failed' }, { status: 500, headers: noStore });
  }
};

// Действия: { action: 'telegram-test' } — тестовое сообщение в Telegram
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;
  const body = await request.json().catch(() => ({})) as { password?: string; action?: string };
  if (!verifyAdminPassword(request.headers.get('X-Admin-Password') || body.password || '', env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (body.action !== 'telegram-test') {
    return json({ success: false, error: 'Unknown action' }, { status: 400, headers: noStore });
  }
  if (!isTelegramConfigured(env)) {
    return json({ success: false, error: 'Секреты Telegram не настроены' }, { status: 503, headers: noStore });
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: env.TELEGRAM_CHAT_ID,
        text: `✅ Тест уведомлений из админки whalewzrd.com — всё работает (${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} МСК)`,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return json({ success: false, error: `Telegram ответил ошибкой ${res.status}: ${detail.slice(0, 200)}` }, { status: 502, headers: noStore });
    }
    return json({ success: true }, { headers: noStore });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : 'Не удалось отправить' }, { status: 500, headers: noStore });
  }
};
