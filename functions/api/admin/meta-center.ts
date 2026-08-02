import { CACHE_CONTROL } from '../../_lib/cache';
import { verifyAdminPassword } from '../../_lib/auth';
import { json } from '../../_lib/http';
import { processMetaOutbox } from '../../_lib/meta-outbox';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };

const REQUIRED_SCHEMA: Record<string, string[]> = {
  meta_outbox: [
    'id', 'event_name', 'event_id', 'payload_json', 'status', 'attempts',
    'next_retry_at', 'last_error', 'created_at', 'updated_at', 'sent_at',
  ],
  meta_capi_diagnostics: [
    'id', 'event_name', 'event_id', 'status', 'events_received', 'error_code',
    'error_message', 'marketing_consent', 'created_at',
  ],
  leads: [
    'event_id', 'quality', 'fbp', 'fbc', 'event_source_url', 'external_id',
    'marketing_consent', 'consent_version', 'consent_source', 'consent_region',
    'consent_timestamp', 'consent_recorded_at',
  ],
};

const OPTIONAL_DIAGNOSTIC_COLUMNS = [
  'match_quality_score', 'score_identity', 'score_attribution',
  'score_consent', 'score_context', 'form_id', 'form_variant',
];

interface QualityTrendPoint {
  day: string;
  events: number;
  averageScore: number | null;
  sent: number;
  failed: number;
}

interface DedupeState {
  available: boolean;
  events: number;
  withEventId: number;
  coverage: number | null;
  duplicateEventIds: number;
}

/**
 * Качество совпадений по дням. Падение матчинга напрямую поднимает цену
 * заявки, но заметить его можно было только в Events Manager.
 */
async function readQualityTrend(db: D1Database, columns: Set<string>, days: number): Promise<QualityTrendPoint[]> {
  const score = columns.has('match_quality_score') ? 'AVG(match_quality_score)' : 'NULL';
  const rows = await db.prepare(`
    SELECT date(created_at) AS day,
      COUNT(*) AS events,
      ${score} AS average_score,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed
    FROM meta_capi_diagnostics
    WHERE created_at >= datetime('now', ?)
    GROUP BY day ORDER BY day ASC
  `).bind(`-${days} day`).all<{ day: string; events: number; average_score: number | null; sent: number; failed: number }>();

  return (rows.results || []).map((row) => ({
    day: String(row.day),
    events: number(row.events),
    averageScore: row.average_score === null || row.average_score === undefined
      ? null
      : Math.round(Number(row.average_score) * 10) / 10,
    sent: number(row.sent),
    failed: number(row.failed),
  }));
}

/**
 * Готовность к дедупликации с пикселем. Со стороны сервера видно только
 * половину картины: есть ли у события event_id и не ушло ли одно и то же
 * событие дважды. Совпадение с пикселем этим не проверяется — так и пишем.
 */
async function readDedupeState(db: D1Database, days: number): Promise<DedupeState> {
  const row = await db.prepare(`
    SELECT COUNT(*) AS events,
      SUM(CASE WHEN TRIM(COALESCE(event_id, '')) != '' THEN 1 ELSE 0 END) AS with_event_id
    FROM meta_capi_diagnostics
    WHERE created_at >= datetime('now', ?)
  `).bind(`-${days} day`).first<{ events: number; with_event_id: number }>();

  const duplicates = await db.prepare(`
    SELECT COUNT(*) AS total FROM (
      SELECT event_id FROM meta_capi_diagnostics
      WHERE created_at >= datetime('now', ?)
        AND TRIM(COALESCE(event_id, '')) != ''
        AND status = 'sent'
      GROUP BY event_id HAVING COUNT(*) > 1
    )
  `).bind(`-${days} day`).first<{ total: number }>();

  const events = number(row?.events);
  const withEventId = number(row?.with_event_id);
  return {
    available: true,
    events,
    withEventId,
    coverage: events > 0 ? Math.round((withEventId / events) * 1000) / 10 : null,
    duplicateEventIds: number(duplicates?.total),
  };
}

type PeriodKey = '24h' | '7d';

interface DiagnosticsAggregateRow {
  event_name: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  events_received: number;
  consent_observed: number;
  with_consent: number;
  avg_match_quality_score: number | null;
  avg_score_identity: number | null;
  avg_score_attribution: number | null;
  avg_score_consent: number | null;
  avg_score_context: number | null;
  latest_at: string | null;
}

interface PublicErrorItem {
  source: 'diagnostics' | 'outbox';
  eventName: string;
  status: string;
  code: string | null;
  message: string;
  attempts: number | null;
  createdAt: string;
}

interface ErrorItem extends PublicErrorItem {
  sortAt: number;
}

function number(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rounded(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 10) / 10 : null;
}

function percentage(part: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((part / total) * 10_000) / 100;
}

function safeErrorMessage(value: unknown): string {
  let message = String(value || '').replace(/[\r\n\t]+/g, ' ').trim();
  message = message
    .replace(/([?&](?:access_token|token|secret|key)=)[^\s&]+/gi, '$1[скрыто]')
    .replace(/(["']?(?:access_token|token|secret|key)["']?\s*[:=]\s*["']?)[^"',\s}]+/gi, '$1[скрыто]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email скрыт]')
    .replace(/(?:\+?\d[\s().-]*){8,}/g, '[телефон скрыт]')
    .replace(/\b[a-f0-9]{64}\b/gi, '[идентификатор скрыт]')
    .replace(/\bfb\.1\.\d+\.\d+\b/gi, '[Meta browser id скрыт]')
    .replace(/https?:\/\/[^\s]+/gi, (url) => {
      try {
        const parsed = new URL(url);
        return `${parsed.origin}${parsed.pathname}`;
      } catch {
        return '[URL скрыт]';
      }
    });
  return message.slice(0, 280) || 'Причина не записана';
}

async function getTables(db: D1Database): Promise<Set<string>> {
  const rows = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all<{ name: string }>();
  return new Set((rows.results || []).map((row) => row.name));
}

async function getColumns(db: D1Database, table: string): Promise<Set<string>> {
  const rows = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return new Set((rows.results || []).map((row) => row.name));
}

function formatAggregate(row: DiagnosticsAggregateRow) {
  const total = number(row.total);
  const sent = number(row.sent);
  const failed = number(row.failed);
  const skipped = number(row.skipped);
  const consentObserved = number(row.consent_observed);
  const withConsent = number(row.with_consent);
  const attempted = sent + failed;
  return {
    eventName: row.event_name || 'Unknown',
    total,
    sent,
    failed,
    skipped,
    attempted,
    eventsReceived: number(row.events_received),
    deliveryRate: percentage(sent, attempted),
    consentObserved,
    withConsent,
    consentRate: percentage(withConsent, consentObserved),
    scores: {
      match: rounded(row.avg_match_quality_score),
      identity: rounded(row.avg_score_identity),
      attribution: rounded(row.avg_score_attribution),
      consent: rounded(row.avg_score_consent),
      context: rounded(row.avg_score_context),
    },
    latestAt: row.latest_at,
  };
}

async function diagnosticsPeriod(
  db: D1Database,
  columns: Set<string>,
  modifier: string,
) {
  const result = await db.prepare(`
    WITH event_rows AS (
      SELECT
        event_name,
        CASE
          WHEN event_id IS NULL OR TRIM(event_id) = '' THEN 'diagnostic-row:' || id
          ELSE 'event-id:' || event_id
        END AS event_key,
        status,
        events_received,
        marketing_consent,
        ${columns.has('match_quality_score') ? 'match_quality_score' : 'NULL'} AS match_quality_score,
        ${columns.has('score_identity') ? 'score_identity' : 'NULL'} AS score_identity,
        ${columns.has('score_attribution') ? 'score_attribution' : 'NULL'} AS score_attribution,
        ${columns.has('score_consent') ? 'score_consent' : 'NULL'} AS score_consent,
        ${columns.has('score_context') ? 'score_context' : 'NULL'} AS score_context,
        created_at
      FROM meta_capi_diagnostics
      WHERE datetime(created_at) >= datetime('now', ?)
        AND COALESCE(service, '') NOT IN ('meta_capi_test_event', 'meta_capi_diagnostics_health')
    ),
    event_states AS (
      SELECT
        event_name,
        event_key,
        MAX(CASE WHEN status = 'sent' AND COALESCE(events_received, 0) > 0 THEN 1 ELSE 0 END) AS was_sent,
        MAX(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS was_failed,
        MAX(COALESCE(events_received, 0)) AS events_received,
        MAX(CASE WHEN marketing_consent IS NOT NULL THEN 1 ELSE 0 END) AS consent_observed,
        MAX(CASE WHEN marketing_consent = 1 THEN 1 ELSE 0 END) AS with_consent,
        MAX(match_quality_score) AS match_quality_score,
        MAX(score_identity) AS score_identity,
        MAX(score_attribution) AS score_attribution,
        MAX(score_consent) AS score_consent,
        MAX(score_context) AS score_context,
        MAX(created_at) AS latest_at
      FROM event_rows
      GROUP BY event_name, event_key
    )
    SELECT
      event_name,
      COUNT(*) AS total,
      SUM(CASE WHEN was_sent = 1 THEN 1 ELSE 0 END) AS sent,
      SUM(CASE WHEN was_sent = 0 AND was_failed = 1 THEN 1 ELSE 0 END) AS failed,
      SUM(CASE WHEN was_sent = 0 AND was_failed = 0 THEN 1 ELSE 0 END) AS skipped,
      COALESCE(SUM(events_received), 0) AS events_received,
      SUM(consent_observed) AS consent_observed,
      SUM(with_consent) AS with_consent,
      AVG(match_quality_score) AS avg_match_quality_score,
      AVG(score_identity) AS avg_score_identity,
      AVG(score_attribution) AS avg_score_attribution,
      AVG(score_consent) AS avg_score_consent,
      AVG(score_context) AS avg_score_context,
      MAX(latest_at) AS latest_at
    FROM event_states
    GROUP BY event_name
    ORDER BY total DESC, event_name ASC
  `).bind(modifier).all<DiagnosticsAggregateRow>();

  const events = (result.results || []).map(formatAggregate);
  const total = events.reduce((sum, row) => sum + row.total, 0);
  const sent = events.reduce((sum, row) => sum + row.sent, 0);
  const failed = events.reduce((sum, row) => sum + row.failed, 0);
  const skipped = events.reduce((sum, row) => sum + row.skipped, 0);
  const attempted = sent + failed;
  const consentObserved = events.reduce((sum, row) => sum + row.consentObserved, 0);
  const withConsent = events.reduce((sum, row) => sum + row.withConsent, 0);

  return {
    total,
    sent,
    failed,
    skipped,
    attempted,
    eventsReceived: events.reduce((sum, row) => sum + row.eventsReceived, 0),
    deliveryRate: percentage(sent, attempted),
    consentObserved,
    withConsent,
    consentRate: percentage(withConsent, consentObserved),
    events,
  };
}

async function getLatestErrors(
  db: D1Database,
  readiness: { diagnostics: boolean; outbox: boolean },
): Promise<PublicErrorItem[]> {
  const errors: ErrorItem[] = [];

  if (readiness.diagnostics) {
    const rows = await db.prepare(`
      SELECT event_name, status, error_code, error_message, created_at
      FROM meta_capi_diagnostics
      WHERE (status = 'failed' OR (error_message IS NOT NULL AND TRIM(error_message) != ''))
        AND COALESCE(service, '') NOT IN ('meta_capi_test_event', 'meta_capi_diagnostics_health')
      ORDER BY created_at DESC
      LIMIT 12
    `).all<{
      event_name: string; status: string; error_code: string | null;
      error_message: string | null; created_at: string;
    }>();
    for (const row of rows.results || []) {
      const sortAt = Date.parse(row.created_at || '');
      errors.push({
        source: 'diagnostics',
        eventName: String(row.event_name || 'Unknown').slice(0, 80),
        status: String(row.status || 'failed').slice(0, 24),
        code: row.error_code ? String(row.error_code).slice(0, 40) : null,
        message: safeErrorMessage(row.error_message),
        attempts: null,
        createdAt: row.created_at,
        sortAt: Number.isFinite(sortAt) ? sortAt : 0,
      });
    }
  }

  if (readiness.outbox) {
    const rows = await db.prepare(`
      SELECT event_name, status, attempts, last_error, updated_at
      FROM meta_outbox
      WHERE last_error IS NOT NULL AND TRIM(last_error) != ''
      ORDER BY updated_at DESC
      LIMIT 12
    `).all<{
      event_name: string; status: string; attempts: number;
      last_error: string; updated_at: number;
    }>();
    for (const row of rows.results || []) {
      const epoch = number(row.updated_at);
      errors.push({
        source: 'outbox',
        eventName: String(row.event_name || 'Unknown').slice(0, 80),
        status: String(row.status || 'retry').slice(0, 24),
        code: null,
        message: safeErrorMessage(row.last_error),
        attempts: number(row.attempts),
        createdAt: epoch ? new Date(epoch * 1000).toISOString() : '',
        sortAt: epoch * 1000,
      });
    }
  }

  return errors
    .sort((a, b) => b.sortAt - a.sortAt)
    .slice(0, 15)
    .map(({ sortAt: _sortAt, ...item }) => item);
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;
  if (!verifyAdminPassword(request.headers.get('X-Admin-Password') || '', env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }

  if (!env.DB) {
    return json({
      success: false,
      code: 'D1_NOT_BOUND',
      error: 'D1 не подключена в этом окружении. Локально это допустимо; проверка очереди доступна в production после биндинга DB.',
      environment: {
        d1Available: false,
        capiTokenConfigured: Boolean(env.META_CAPI_ACCESS_TOKEN),
        diagnosticsKvConfigured: Boolean(env.META_CAPI_DIAGNOSTICS),
        idempotencyKvConfigured: Boolean(env.META_CAPI_IDEMPOTENCY),
      },
    }, { status: 503, headers: noStore });
  }

  try {
    const db = env.DB;
    const tables = await getTables(db);
    const schema = [] as Array<{
      table: string; exists: boolean; ready: boolean;
      missingColumns: string[]; optionalColumnsPresent: string[];
    }>;
    const columnsByTable = new Map<string, Set<string>>();

    for (const [table, required] of Object.entries(REQUIRED_SCHEMA)) {
      const exists = tables.has(table);
      const columns = exists ? await getColumns(db, table) : new Set<string>();
      columnsByTable.set(table, columns);
      const missingColumns = required.filter((column) => !columns.has(column));
      schema.push({
        table,
        exists,
        ready: exists && missingColumns.length === 0,
        missingColumns,
        optionalColumnsPresent: table === 'meta_capi_diagnostics'
          ? OPTIONAL_DIAGNOSTIC_COLUMNS.filter((column) => columns.has(column))
          : [],
      });
    }

    const outboxReady = schema.find((item) => item.table === 'meta_outbox')?.ready === true;
    const diagnosticsReady = schema.find((item) => item.table === 'meta_capi_diagnostics')?.ready === true;

    let outbox = {
      available: false,
      total: 0,
      counts: {} as Record<string, number>,
      active: 0,
      actionable: 0,
      overdue: 0,
      staleSending: 0,
      recoveredAfterRetry: 0,
      oldestActiveAt: null as string | null,
      latestActivityAt: null as string | null,
      latestSentAt: null as string | null,
      latestRecoveredAt: null as string | null,
    };

    if (outboxReady) {
      const rows = await db.prepare('SELECT status, COUNT(*) AS count FROM meta_outbox GROUP BY status').all<{ status: string; count: number }>();
      const counts = Object.fromEntries((rows.results || []).map((row) => [row.status, number(row.count)]));
      // attempts=1 can be the first background send after the original
      // isolate died before making its direct request. Only attempts>1 proves
      // that at least one actual delivery attempt failed before recovery.
      const timing = await db.prepare(`
        SELECT
          MIN(CASE WHEN status IN ('pending', 'retry', 'sending') THEN created_at END) AS oldest_active,
          MAX(updated_at) AS latest_activity,
          MAX(sent_at) AS latest_sent,
          MAX(CASE WHEN status='sent' AND attempts > 1 THEN sent_at END) AS latest_recovered,
          SUM(CASE WHEN status='sent' AND attempts > 1 THEN 1 ELSE 0 END) AS recovered_after_retry,
          SUM(CASE WHEN status IN ('pending', 'retry') AND next_retry_at <= strftime('%s','now') THEN 1 ELSE 0 END) AS overdue,
          SUM(CASE WHEN status = 'sending' AND updated_at < strftime('%s','now') - 600 THEN 1 ELSE 0 END) AS stale_sending
        FROM meta_outbox
      `).first<{
        oldest_active: number | null; latest_activity: number | null; latest_sent: number | null;
        latest_recovered: number | null; recovered_after_retry: number; overdue: number; stale_sending: number;
      }>();
      const toIso = (epoch: number | null | undefined) => epoch ? new Date(Number(epoch) * 1000).toISOString() : null;
      outbox = {
        available: true,
        total: Object.values(counts).reduce((sum, count) => sum + count, 0),
        counts,
        active: number(counts.pending) + number(counts.retry) + number(counts.sending),
        actionable: number(timing?.overdue) + number(timing?.stale_sending) + number(counts.dead_letter),
        overdue: number(timing?.overdue),
        staleSending: number(timing?.stale_sending),
        recoveredAfterRetry: number(timing?.recovered_after_retry),
        oldestActiveAt: toIso(timing?.oldest_active),
        latestActivityAt: toIso(timing?.latest_activity),
        latestSentAt: toIso(timing?.latest_sent),
        latestRecoveredAt: toIso(timing?.latest_recovered),
      };
    }

    const diagnosticsColumns = columnsByTable.get('meta_capi_diagnostics') || new Set<string>();
    const periods: Partial<Record<PeriodKey, Awaited<ReturnType<typeof diagnosticsPeriod>>>> = {};
    if (diagnosticsReady) {
      periods['24h'] = await diagnosticsPeriod(db, diagnosticsColumns, '-1 day');
      periods['7d'] = await diagnosticsPeriod(db, diagnosticsColumns, '-7 day');
    }

    const qualityTrend = diagnosticsReady ? await readQualityTrend(db, diagnosticsColumns, 14) : [];
    const dedupe = diagnosticsReady
      ? await readDedupeState(db, 7)
      : { available: false, events: 0, withEventId: 0, coverage: null, duplicateEventIds: 0 };

    return json({
      success: true,
      checkedAt: new Date().toISOString(),
      environment: {
        d1Available: true,
        capiTokenConfigured: Boolean(env.META_CAPI_ACCESS_TOKEN),
        pixelIdSource: env.VITE_META_PIXEL_ID ? 'environment' : 'project_default',
        diagnosticsKvConfigured: Boolean(env.META_CAPI_DIAGNOSTICS),
        idempotencyKvConfigured: Boolean(env.META_CAPI_IDEMPOTENCY),
      },
      schema: {
        ready: schema.every((item) => item.ready),
        tables: schema,
      },
      outbox,
      periods,
      qualityTrend,
      dedupe,
      latestErrors: await getLatestErrors(db, { diagnostics: diagnosticsReady, outbox: outboxReady }),
      limitations: [
        'Панель показывает фактические записи D1 и ответы Meta, но не заменяет проверку Events Manager после выкладки.',
        'Дедупликация проверяется только со стороны сервера: видно, есть ли у события event_id и не ушло ли оно дважды. Совпадение с пикселем отсюда не проверить — это делает Events Manager.',
        'События объединяются по event_name + event_id: подтверждённая доставка имеет приоритет над предыдущими ошибками повтора и служебными дублями.',
        'Процент доставки считается среди уникальных подтверждённых отправок и ошибок; пропущенные по согласию события в знаменатель не входят.',
        'Процент согласия считается только среди событий, где флаг marketing_consent был записан; старые записи без флага исключаются.',
        '«Полнота сигналов» — внутренняя оценка доступного контекста от 0 до 100, а не Event Match Quality из Meta Events Manager.',
        'Счётчик восстановленных очередью ограничен сроком хранения: события качества сохраняются 180 дней, остальные доставленные события — 7 дней.',
        'Содержимое payload, токены, event_id и персональные данные через этот endpoint не возвращаются.',
      ],
    }, { headers: noStore });
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Не удалось прочитать состояние Meta CAPI',
    }, { status: 500, headers: noStore });
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;
  const body = await request.json().catch(() => ({})) as { password?: string; action?: string; limit?: number };
  if (!verifyAdminPassword(request.headers.get('X-Admin-Password') || body.password || '', env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (body.action !== 'process-outbox') {
    return json({ success: false, error: 'Unknown action' }, { status: 400, headers: noStore });
  }
  if (!env.DB) {
    return json({ success: false, error: 'D1 не подключена' }, { status: 503, headers: noStore });
  }
  const requested = Number(body.limit || 10);
  const limit = Number.isFinite(requested) ? Math.min(25, Math.max(1, Math.floor(requested))) : 10;
  try {
    const summary = await processMetaOutbox(env, limit);
    if (summary.configuration_error) {
      const messages = {
        db_not_configured: 'D1 не подключена',
        access_token_not_configured: 'Не настроен META_CAPI_ACCESS_TOKEN',
        outbox_not_configured: 'Примените D1-миграцию 0005_meta_outbox.sql',
      } as const;
      return json({
        success: false,
        code: summary.configuration_error,
        error: messages[summary.configuration_error],
        summary,
      }, { status: 503, headers: noStore });
    }
    return json({ success: true, summary }, { headers: noStore });
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Не удалось обработать очередь',
    }, { status: 500, headers: noStore });
  }
};
