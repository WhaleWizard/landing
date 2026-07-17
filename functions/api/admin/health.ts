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
      const tables = [
        'articles',
        'leads',
        'page_stats_daily',
        'visitor_hashes_daily',
        'meta_outbox',
        'meta_capi_diagnostics',
        'lead_activity',
        'site_sections',
        'site_section_versions',
      ];
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

      if (!missing.includes('leads')) {
        const columns = await env.DB.prepare('PRAGMA table_info(leads)').all<{ name: string }>();
        const present = new Set((columns.results || []).map((column) => column.name));
        const required = ['event_id', 'quality', 'last_submitted_at', 'fbp', 'fbc', 'event_source_url', 'external_id', 'marketing_consent'];
        const missingColumns = required.filter((column) => !present.has(column));
        checks.push(missingColumns.length === 0
          ? check('leads-schema', 'Контекст лидов для Meta', 'ok', 'Все поля для дедупликации и событий качества доступны')
          : check('leads-schema', 'Контекст лидов для Meta', 'fail', `Не хватает колонок: ${missingColumns.join(', ')} — примените миграции 0009 и 0010`));
      }

      if (!missing.includes('leads') && !missing.includes('lead_activity')) {
        const leadColumns = await env.DB.prepare('PRAGMA table_info(leads)').all<{ name: string }>();
        const activityColumns = await env.DB.prepare('PRAGMA table_info(lead_activity)').all<{ name: string }>();
        const leadPresent = new Set((leadColumns.results || []).map((column) => column.name));
        const activityPresent = new Set((activityColumns.results || []).map((column) => column.name));
        const requiredLeadColumns = ['status', 'pipeline_stage', 'next_action_at', 'loss_reason', 'notes', 'deal_value', 'deal_currency'];
        const requiredActivityColumns = ['lead_id', 'type', 'from', 'to', 'note', 'created_at'];
        const crmReady = requiredLeadColumns.every((column) => leadPresent.has(column))
          && requiredActivityColumns.every((column) => activityPresent.has(column));
        checks.push(crmReady
          ? check('crm-schema', 'Мини-CRM', 'ok', 'Этапы, следующие действия и история лидов готовы к работе')
          : check('crm-schema', 'Мини-CRM', 'fail', 'Примените миграцию 0012_admin_control_center.sql'));
      } else {
        checks.push(check('crm-schema', 'Мини-CRM', 'fail', 'Примените миграцию 0012_admin_control_center.sql'));
      }

      if (!missing.includes('site_sections') && !missing.includes('site_section_versions')) {
        const sectionColumns = await env.DB.prepare('PRAGMA table_info(site_sections)').all<{ name: string }>();
        const versionColumns = await env.DB.prepare('PRAGMA table_info(site_section_versions)').all<{ name: string }>();
        const sectionPresent = new Set((sectionColumns.results || []).map((column) => column.name));
        const versionPresent = new Set((versionColumns.results || []).map((column) => column.name));
        const requiredSections = ['section_key', 'draft_json', 'published_json', 'status', 'version', 'published_version', 'updated_at', 'published_at'];
        const requiredVersions = ['section_key', 'snapshot_json', 'source', 'created_at'];
        const contentReady = requiredSections.every((column) => sectionPresent.has(column))
          && requiredVersions.every((column) => versionPresent.has(column));
        checks.push(contentReady
          ? check('site-content-schema', 'Тексты сайта и FAQ', 'ok', 'Черновики, публикация и история версий доступны')
          : check('site-content-schema', 'Тексты сайта и FAQ', 'fail', 'Примените миграцию 0013_site_sections.sql'));
      } else {
        checks.push(check('site-content-schema', 'Тексты сайта и FAQ', 'fail', 'Примените миграцию 0013_site_sections.sql'));
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
        env.DB.prepare(
          `SELECT
             SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
             SUM(CASE WHEN status = 'retry' THEN 1 ELSE 0 END) AS retry,
             SUM(CASE WHEN status = 'sending' THEN 1 ELSE 0 END) AS sending,
             SUM(CASE WHEN status = 'dead_letter' THEN 1 ELSE 0 END) AS dead
           FROM meta_outbox`
        ).first<{ pending: number; retry: number; sending: number; dead: number }>(),
        env.DB.prepare(
          `SELECT
             SUM(CASE WHEN status = 'sent' AND COALESCE(events_received, 0) > 0 THEN 1 ELSE 0 END) AS sent,
             SUM(CASE WHEN status = 'failed' AND marketing_consent = 1 THEN 1 ELSE 0 END) AS failed
           FROM meta_capi_diagnostics
           WHERE created_at >= datetime('now', '-1 day')`
        ).first<{ sent: number; failed: number }>(),
      ]);
      const pending = outbox?.pending ?? 0;
      const retry = outbox?.retry ?? 0;
      const sending = outbox?.sending ?? 0;
      const dead = outbox?.dead ?? 0;
      const sent = day?.sent ?? 0;
      const failed = day?.failed ?? 0;
      const status: CheckStatus = dead > 0 ? 'fail' : pending > 10 || retry > 0 || sending > 5 || failed > 0 ? 'warn' : 'ok';
      checks.push(check(
        'capi',
        'Meta CAPI',
        status,
        `За сутки Meta подтвердила: ${sent}; ошибок попыток: ${failed}. Очередь: ${pending} ожидают, ${sending} отправляются, ${retry} на повторе, ${dead} остановлены`,
      ));
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
