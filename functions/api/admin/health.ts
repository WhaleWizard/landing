import { json } from '../../_lib/http';
import { CACHE_CONTROL } from '../../_lib/cache';
import { verifyAdminPassword } from '../../_lib/auth';
import { enforceRateLimit } from '../../_lib/rate-limit';
import { hasLeadSoftDelete, isTelegramConfigured } from '../../_lib/leads';
import { getTrackingSignatureMode, type TrackingSignatureMode } from '../../_lib/tracking-signature';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };

type CheckStatus = 'ok' | 'warn' | 'fail';

interface HealthCheck {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
}

interface TrackingSignatureAuditAggregate {
  valid: number;
  invalid: number;
  disabled: number;
  lead: number;
  meta_event: number;
  pageview: number;
}

function check(id: string, title: string, status: CheckStatus, detail: string): HealthCheck {
  return { id, title, status, detail };
}

async function tableExists(db: D1Database, name: string): Promise<boolean> {
  const row = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").bind(name).first<{ name: string }>();
  return Boolean(row?.name);
}

async function triggerExists(db: D1Database, name: string): Promise<boolean> {
  const row = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = ?").bind(name).first<{ name: string }>();
  return Boolean(row?.name);
}

function hasValidTrackingHmacSecret(env: Env): boolean {
  const secret = typeof env.TRACKING_HMAC_SECRET === 'string' ? env.TRACKING_HMAC_SECRET.trim() : '';
  return /^[0-9a-f]{64}$/i.test(secret);
}

async function getTrackingSignatureAudit(
  db: D1Database,
  mode: TrackingSignatureMode,
): Promise<TrackingSignatureAuditAggregate> {
  const row = await db.prepare(
    `SELECT
       COALESCE(SUM(CASE WHEN result = 'valid' THEN count ELSE 0 END), 0) AS valid,
       COALESCE(SUM(CASE WHEN result = 'invalid' THEN count ELSE 0 END), 0) AS invalid,
       COALESCE(SUM(CASE WHEN result = 'disabled' THEN count ELSE 0 END), 0) AS disabled,
       COALESCE(SUM(CASE WHEN endpoint = 'lead' THEN count ELSE 0 END), 0) AS lead,
       COALESCE(SUM(CASE WHEN endpoint = 'meta-event' THEN count ELSE 0 END), 0) AS meta_event,
       COALESCE(SUM(CASE WHEN endpoint = 'pageview' THEN count ELSE 0 END), 0) AS pageview
     FROM tracking_signature_daily
     WHERE mode = ?
       AND updated_at >= strftime('%s','now','-1 day')`,
  ).bind(mode).first<TrackingSignatureAuditAggregate>();
  return {
    valid: Number(row?.valid || 0),
    invalid: Number(row?.invalid || 0),
    disabled: Number(row?.disabled || 0),
    lead: Number(row?.lead || 0),
    meta_event: Number(row?.meta_event || 0),
    pageview: Number(row?.pageview || 0),
  };
}

async function runChecks(env: Env, request: Request): Promise<HealthCheck[]> {
  const checks: HealthCheck[] = [];
  const signatureMode = getTrackingSignatureMode(env);
  const configuredSignatureMode = String(env.TRACKING_SIGNATURE_MODE || 'monitor').trim().toLowerCase();
  const signatureModeRecognized = ['off', 'monitor', 'enforce'].includes(configuredSignatureMode);
  let trackingNonceTableReady = false;
  let trackingAuditTableReady = false;

  // --- База данных и таблицы ---
  if (!env.DB) {
    checks.push(check('d1', 'База данных D1', 'fail', 'Биндинг DB не настроен — статьи могут использовать резервный источник, а /api/lead намеренно отвечает retryable 503, чтобы заявка не потерялась вне CRM'));
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
        'crm_notes',
        'crm_tasks',
        'crm_tags',
        'crm_lead_tags',
        'site_sections',
        'site_section_versions',
        'tracking_request_nonces',
        'tracking_signature_daily',
        'lead_ingestions',
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

      trackingNonceTableReady = !missing.includes('tracking_request_nonces');
      trackingAuditTableReady = !missing.includes('tracking_signature_daily');
      const trackingSignatureSchemaReady = trackingNonceTableReady && trackingAuditTableReady;
      checks.push(trackingSignatureSchemaReady
        ? check('tracking-signature-schema', 'Защита tracking-запросов', 'ok', 'Миграция 0018 применена: атомарная защита от повторов и обезличенный журнал подписей доступны')
        : check(
          'tracking-signature-schema',
          'Защита tracking-запросов',
          signatureMode === 'enforce' ? 'fail' : 'warn',
          `Не хватает таблиц миграции 0018: ${[
            trackingNonceTableReady ? '' : 'tracking_request_nonces',
            trackingAuditTableReady ? '' : 'tracking_signature_daily',
          ].filter(Boolean).join(', ')}. В режиме enforce tracking-запросы нельзя безопасно принимать без D1`,
        ));

      const leadIngestionReady = !missing.includes('lead_ingestions');
      checks.push(leadIngestionReady
        ? check('lead-ingestion-schema', 'Надёжный приём заявок', 'ok', 'Миграция 0019 применена: повторы заявок распознаются по event_id без повторной записи и уведомления')
        : check('lead-ingestion-schema', 'Надёжный приём заявок', 'fail', 'Примените миграцию 0019_lead_ingestion_idempotency.sql — до этого /api/lead намеренно отвечает retryable 503, чтобы не потерять заявку'));

      if (!missing.includes('leads')) {
        const columns = await env.DB.prepare('PRAGMA table_info(leads)').all<{ name: string }>();
        const present = new Set((columns.results || []).map((column) => column.name));
        const required = [
          'event_id', 'quality', 'last_submitted_at', 'fbp', 'fbc', 'event_source_url', 'external_id',
          'marketing_consent', 'consent_version', 'consent_source', 'consent_region', 'consent_timestamp', 'consent_recorded_at',
        ];
        const missingColumns = required.filter((column) => !present.has(column));
        checks.push(missingColumns.length === 0
          ? check('leads-schema', 'Контекст лидов для Meta', 'ok', 'Все поля для дедупликации и событий качества доступны')
          : check('leads-schema', 'Контекст лидов для Meta', 'fail', `Не хватает колонок: ${missingColumns.join(', ')} — примените миграции 0009, 0010 и 0015`));
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

        const workspaceTablesReady = ['crm_notes', 'crm_tasks', 'crm_tags', 'crm_lead_tags']
          .every((table) => !missing.includes(table));
        const requiredWorkspaceLeadColumns = [
          'priority', 'lead_score', 'next_action_text', 'pipeline_changed_at',
          'last_contacted_at', 'closed_at', 'crm_revision',
        ];
        const requiredWorkspaceActivityColumns = ['actor', 'entity_type', 'entity_id', 'action_id', 'metadata_json'];
        const workspaceReady = crmReady
          && workspaceTablesReady
          && requiredWorkspaceLeadColumns.every((column) => leadPresent.has(column))
          && requiredWorkspaceActivityColumns.every((column) => activityPresent.has(column));
        checks.push(workspaceReady
          ? check('crm-workspace-schema', 'Рабочее пространство CRM', 'ok', 'Приоритеты, задачи, заметки, теги и журнал действий доступны')
          : check('crm-workspace-schema', 'Рабочее пространство CRM', 'fail', 'Примените миграцию 0014_crm_workspace.sql'));

        let correctnessReady = false;
        if (workspaceTablesReady) {
          const [noteColumns, taskColumns] = await Promise.all([
            env.DB.prepare('PRAGMA table_info(crm_notes)').all<{ name: string }>(),
            env.DB.prepare('PRAGMA table_info(crm_tasks)').all<{ name: string }>(),
          ]);
          const notePresent = new Set((noteColumns.results || []).map((column) => column.name));
          const taskPresent = new Set((taskColumns.results || []).map((column) => column.name));
          const requiredCorrectnessLeadColumns = [
            'crm_action_id', 'quality_revision', 'quality_updated_at', 'quality_action_id', 'quality_processing',
          ];
          correctnessReady = workspaceReady
            && requiredCorrectnessLeadColumns.every((column) => leadPresent.has(column))
            && ['revision', 'action_id'].every((column) => notePresent.has(column) && taskPresent.has(column));
        }
        checks.push(correctnessReady
          ? check('crm-correctness-schema', 'Безопасное сохранение CRM', 'ok', 'Защита от повторов и конфликтов между вкладками активна')
          : check('crm-correctness-schema', 'Безопасное сохранение CRM', 'fail', 'Примените миграцию 0017_crm_correctness.sql'));
      } else {
        checks.push(check('crm-schema', 'Мини-CRM', 'fail', 'Примените миграцию 0012_admin_control_center.sql'));
        checks.push(check('crm-workspace-schema', 'Рабочее пространство CRM', 'fail', 'Примените миграцию 0014_crm_workspace.sql'));
        checks.push(check('crm-correctness-schema', 'Безопасное сохранение CRM', 'fail', 'Примените миграцию 0017_crm_correctness.sql'));
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

      if (!missing.includes('meta_capi_diagnostics')) {
        const retentionReady = await triggerExists(env.DB, 'trg_meta_capi_diagnostics_retention');
        checks.push(retentionReady
          ? check('meta-diagnostics-retention', 'Хранение диагностики Meta', 'ok', 'D1 автоматически удаляет диагностические записи старше 90 дней')
          : check('meta-diagnostics-retention', 'Хранение диагностики Meta', 'warn', 'Примените миграцию 0016_meta_diagnostics_retention.sql'));
      }
    } catch (error) {
      checks.push(check('d1', 'База данных D1', 'fail', error instanceof Error ? error.message : 'Ошибка запроса к базе'));
    }
  }

  if (!checks.some((item) => item.id === 'tracking-signature-schema')) {
    checks.push(check(
      'tracking-signature-schema',
      'Защита tracking-запросов',
      signatureMode === 'enforce' ? 'fail' : 'warn',
      env.DB
        ? 'Не удалось подтвердить таблицы миграции 0018. В режиме enforce tracking-запросы нельзя безопасно принимать без D1'
        : 'Биндинг DB не настроен: миграцию 0018 и атомарную защиту от повторных запросов проверить невозможно',
    ));
  }
  if (!checks.some((item) => item.id === 'lead-ingestion-schema')) {
    checks.push(check(
      'lead-ingestion-schema',
      'Надёжный приём заявок',
      'fail',
      env.DB
        ? 'Не удалось подтвердить миграцию 0019_lead_ingestion_idempotency.sql — /api/lead будет отвечать retryable 503'
        : 'Биндинг DB не настроен: надёжный приём заявок недоступен, /api/lead будет отвечать retryable 503',
    ));
  }

  // --- Подпись tracking-запросов ---
  const trackingSecretReady = hasValidTrackingHmacSecret(env);
  const signatureAuditReady = Boolean(env.DB && trackingNonceTableReady && trackingAuditTableReady);
  if (signatureMode === 'off') {
    checks.push(check(
      'tracking-signature-config',
      'Подпись tracking-запросов',
      'warn',
      `Режим off: подпись запросов отключена${trackingSecretReady ? '' : '; TRACKING_HMAC_SECRET отсутствует или не соответствует формату ровно 64 hex-символа'}`,
    ));
  } else if (!signatureModeRecognized) {
    checks.push(check(
      'tracking-signature-config',
      'Подпись tracking-запросов',
      'warn',
      `TRACKING_SIGNATURE_MODE не распознан, поэтому безопасно используется monitor. ${trackingSecretReady ? 'Формат секрета корректен' : 'TRACKING_HMAC_SECRET отсутствует или не соответствует формату ровно 64 hex-символа'}`,
    ));
  } else if (!trackingSecretReady) {
    checks.push(check(
      'tracking-signature-config',
      'Подпись tracking-запросов',
      signatureMode === 'enforce' ? 'fail' : 'warn',
      `${signatureMode}: TRACKING_HMAC_SECRET отсутствует или не соответствует формату ровно 64 hex-символа. Значение секрета в диагностике не выводится`,
    ));
  } else if (!signatureAuditReady) {
    checks.push(check(
      'tracking-signature-config',
      'Подпись tracking-запросов',
      signatureMode === 'enforce' ? 'fail' : 'warn',
      `${signatureMode}: формат секрета корректен, но D1-таблицы миграции 0018 недоступны${signatureMode === 'enforce' ? ' — enforce нельзя считать безопасно настроенным' : ''}`,
    ));
  } else {
    try {
      const audit = await getTrackingSignatureAudit(env.DB!, signatureMode);
      const traffic = `валидных: ${audit.valid}, невалидных: ${audit.invalid}; lead: ${audit.lead}, meta-event: ${audit.meta_event}, pageview: ${audit.pageview}`;
      const approximateWindow = 'Показаны дневные агрегаты, обновлявшиеся за последние 24 часа; граница периода приблизительная';
      if (signatureMode === 'monitor') {
        // «Валидных: 0» в monitor — норма, а не проблема: события отправляет
        // браузер посетителя, а секрет подписи в браузер отдавать нельзя.
        // Enforce станет возможен только с серверным контуром отправки.
        checks.push(check(
          'tracking-signature-config',
          'Подпись tracking-запросов',
          'ok',
          `Штатный режим monitor: запросы наблюдаются, но не блокируются. «Валидных: 0» — это норма, браузер не подписывает запросы, и включать enforce нельзя. ${traffic}. ${approximateWindow}`,
        ));
      } else {
        const status: CheckStatus = audit.valid === 0 && audit.invalid > 0
          ? 'fail'
          : audit.valid === 0 || audit.invalid > 0 ? 'warn' : 'ok';
        const conclusion = audit.valid === 0 && audit.invalid > 0
          ? 'За период нет ни одного принятого запроса, есть только отклонённые'
          : audit.valid === 0
            ? 'За период ещё нет подтверждённых подписанных запросов'
            : audit.invalid > 0
              ? 'Подписанные запросы принимаются, но также есть отклонённые'
              : 'Подписанные запросы принимаются, отклонённых не зафиксировано';
        checks.push(check(
          'tracking-signature-config',
          'Подпись tracking-запросов',
          status,
          `Enforce активен. ${conclusion}. ${traffic}. ${approximateWindow}`,
        ));
      }
    } catch {
      checks.push(check(
        'tracking-signature-config',
        'Подпись tracking-запросов',
        signatureMode === 'enforce' ? 'fail' : 'warn',
        `${signatureMode}: формат секрета корректен, но агрегаты tracking_signature_daily за последние 24 часа прочитать не удалось`,
      ));
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
      const activeOnly = (await hasLeadSoftDelete(env.DB)) ? ' WHERE deleted_at IS NULL' : '';
      const lastLead = await env.DB.prepare(`SELECT created_at, telegram_delivered FROM leads${activeOnly} ORDER BY id DESC LIMIT 1`).first<{ created_at: string; telegram_delivered: number }>();
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
      const [outbox, day, verified] = await Promise.all([
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
           WHERE created_at >= datetime('now', '-1 day')
             AND COALESCE(service, '') NOT IN ('meta_capi_test_event', 'meta_capi_diagnostics_health')`
        ).first<{ sent: number; failed: number }>(),
        env.DB.prepare(
          `SELECT MAX(created_at) AS confirmed_at
           FROM meta_capi_diagnostics
           WHERE status = 'sent'
             AND COALESCE(events_received, 0) > 0
             AND COALESCE(service, '') NOT IN ('meta_capi_test_event', 'meta_capi_diagnostics_health')`
        ).first<{ confirmed_at: string | null }>(),
      ]);
      const pending = outbox?.pending ?? 0;
      const retry = outbox?.retry ?? 0;
      const sending = outbox?.sending ?? 0;
      const dead = outbox?.dead ?? 0;
      const sent = day?.sent ?? 0;
      const failed = day?.failed ?? 0;
      const confirmedAt = verified?.confirmed_at || null;
      const status: CheckStatus = dead > 0
        ? 'fail'
        : !confirmedAt || pending > 10 || retry > 0 || sending > 5 || failed > 0 ? 'warn' : 'ok';
      checks.push(check(
        'capi',
        'Meta CAPI',
        status,
        confirmedAt
          ? `Реальная доставка подтверждалась Meta (${confirmedAt} UTC). За сутки подтверждено: ${sent}; ошибок попыток: ${failed}. Очередь: ${pending} ожидают, ${sending} отправляются, ${retry} на повторе, ${dead} остановлены`
          : `Токен настроен, но реальная production-доставка ещё не подтверждена ответом Meta. За сутки ошибок попыток: ${failed}. Очередь: ${pending} ожидают, ${sending} отправляются, ${retry} на повторе, ${dead} остановлены`,
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
