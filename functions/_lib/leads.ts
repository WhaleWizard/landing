import type { Env } from './types';

// Поля заявки, которые сохраняются в D1 и уходят в Telegram.
// Это подмножество нормализованного payload из api/lead.ts.
export interface LeadRecord {
  event_id?: string;
  name?: string;
  email?: string;
  phone?: string;
  telegramUsername?: string;
  contactMethod?: 'telegram' | 'whatsapp';
  budget?: string;
  message?: string;
  service?: string;
  page_path?: string;
  // Контекст для последующих событий качества лида в Meta (миграция 0010)
  fbp?: string;
  fbc?: string;
  page_url?: string;
  external_id?: string;
  marketing_consent?: boolean;
  // Durable receipt for delayed CRM -> Meta quality events (migration 0015).
  consent_version?: number;
  consent_source?: string;
  consent_region?: string;
  consent_timestamp?: number;
  // Источник лида (миграция 0011)
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
}

// Колонки таблицы leads зависят от применённых миграций (0008/0009/0010).
// Проверяем фактический состав, чтобы код работал при любом их сочетании.
let leadsColumnsCache: { columns: Set<string>; expiresAt: number } | null = null;

export async function getLeadsColumns(db: D1Database): Promise<Set<string>> {
  const now = Date.now();
  if (leadsColumnsCache && leadsColumnsCache.expiresAt > now) {
    return leadsColumnsCache.columns;
  }
  const result = await db.prepare('PRAGMA table_info(leads)').all<{ name: string }>();
  const columns = new Set((result.results || []).map((column) => column.name).filter(Boolean));
  leadsColumnsCache = { columns, expiresAt: now + 5 * 60 * 1000 };
  return columns;
}

function hasLeadsTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table/i.test(message);
}

export interface StoreLeadResult {
  durable: boolean;
  duplicate: boolean;
  repeat: boolean;
  submissionsCount: number;
  eventId: string;
  leadId?: number;
}

export class LeadStorageError extends Error {
  readonly code = 'lead_storage_failed';
  readonly retryable = true;

  constructor(message: string) {
    super(message);
    this.name = 'LeadStorageError';
  }
}

// Ключи для поиска повторной заявки от того же человека
function contactKeys(email?: string, phone?: string, telegram?: string) {
  return {
    email: String(email || '').trim().toLowerCase(),
    phone: String(phone || '').replace(/\D/g, ''),
    telegram: String(telegram || '').trim().toLowerCase().replace(/^@/, ''),
  };
}

function normalizeConsentVersion(value: number | undefined): number | null {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function normalizeConsentTimestamp(value: number | undefined): number | null {
  if (!Number.isFinite(value) || Number(value) <= 0) return null;
  return Math.trunc(Number(value));
}

function normalizeConsentSource(value: string | undefined): string {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'user' || normalized === 'region_auto' ? normalized : '';
}

function normalizeConsentRegion(value: string | undefined): string {
  return String(value || '').trim().toUpperCase().slice(0, 40);
}

async function getTableColumns(db: D1Database, table: string): Promise<Set<string>> {
  const result = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return new Set((result.results || []).map((column) => column.name).filter(Boolean));
}

function changedRows(result: unknown): number {
  const value = (result as { meta?: { changes?: number } } | undefined)?.meta?.changes;
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

async function duplicateLeadResult(db: D1Database, eventId: string, hasDedupe: boolean): Promise<StoreLeadResult> {
  const countExpression = hasDedupe ? 'COALESCE(l.submissions_count, 1)' : '1';
  const row = await db.prepare(
    `SELECT li.lead_id, li.submission_kind, ${countExpression} AS submissions_count
     FROM lead_ingestions li
     LEFT JOIN leads l ON l.id = li.lead_id
     WHERE li.event_id = ? LIMIT 1`,
  ).bind(eventId).first<{ lead_id: number | null; submission_kind: string; submissions_count: number }>();
  return {
    durable: true,
    duplicate: true,
    repeat: row?.submission_kind === 'repeat',
    submissionsCount: Number(row?.submissions_count || 1),
    eventId,
    leadId: row?.lead_id || undefined,
  };
}

// Сохранение заявки в D1 с дедупликацией: если контакт (email / телефон /
// telegram) уже оставлял заявку — не создаём дубль, а «поднимаем» старую:
// счётчик +1, статус снова «новая», новое сообщение дописывается к истории.
// Реальную заявку подтверждаем только после устойчивой записи в D1. Если DB
// binding пропал, клиент получает retryable 503 и сохраняет заявку в своей
// офлайн-очереди вместо ложного успеха без записи в CRM.
export async function storeLead(env: Env, lead: LeadRecord): Promise<StoreLeadResult> {
  const eventId = String(lead.event_id || crypto.randomUUID());
  if (!env.DB) throw new LeadStorageError('D1 DB binding is missing');

  const db = env.DB;
  try {
    const cols = await getLeadsColumns(db);
    if (cols.size === 0) throw new LeadStorageError('D1 leads table is missing; apply migration 0008');

    const ingestionColumns = await getTableColumns(db, 'lead_ingestions');
    const ingestionReady = ['event_id', 'claim_token', 'lead_id', 'submission_kind', 'received_at']
      .every((column) => ingestionColumns.has(column));
    if (!ingestionReady) {
      throw new LeadStorageError('D1 lead idempotency ledger is missing; apply migration 0019');
    }

    const hasDedupe = cols.has('submissions_count') && cols.has('last_submitted_at'); // 0009
    const hasMetaContext = cols.has('marketing_consent'); // 0010
    const hasUtm = cols.has('utm_source'); // 0011
    const hasQuality = cols.has('quality'); // 0009
    const hasPipelineStage = cols.has('pipeline_stage'); // 0012
    const consentVersion = normalizeConsentVersion(lead.consent_version);
    const consentSource = normalizeConsentSource(lead.consent_source);
    const consentRegion = normalizeConsentRegion(lead.consent_region);
    const consentTimestamp = normalizeConsentTimestamp(lead.consent_timestamp);
    const marketingAllowed = lead.marketing_consent === true;

    const alreadyIngested = await db.prepare('SELECT event_id FROM lead_ingestions WHERE event_id = ? LIMIT 1')
      .bind(eventId)
      .first<{ event_id: string }>();
    if (alreadyIngested) return duplicateLeadResult(db, eventId, hasDedupe);

    let existing: {
      id: number;
      submissions_count: number;
      pipeline_stage?: string;
    } | null = null;
    const keys = contactKeys(lead.email, lead.phone, lead.telegramUsername);
    if (hasDedupe && (keys.email || keys.phone || keys.telegram)) {
      const recent = await db.prepare(
        `SELECT id, email, phone, telegram_username, submissions_count${hasPipelineStage ? ', pipeline_stage' : ''}
         FROM leads ORDER BY id DESC LIMIT 500`,
      ).all<{
        id: number;
        email: string;
        phone: string;
        telegram_username: string;
        submissions_count: number;
        pipeline_stage?: string;
      }>();
      for (const row of recent.results || []) {
        const rowKeys = contactKeys(row.email, row.phone, row.telegram_username);
        const sameEmail = Boolean(keys.email && rowKeys.email === keys.email);
        const samePhone = Boolean(keys.phone && rowKeys.phone === keys.phone);
        const sameTelegram = Boolean(keys.telegram && rowKeys.telegram === keys.telegram);
        if (sameEmail || samePhone || sameTelegram) {
          existing = {
            id: row.id,
            submissions_count: Number(row.submissions_count || 1),
            pipeline_stage: row.pipeline_stage,
          };
          break;
        }
      }
    }

    const claimToken = crypto.randomUUID();
    const claimStatement = db.prepare(
      `INSERT OR IGNORE INTO lead_ingestions (event_id, claim_token, received_at)
       VALUES (?, ?, datetime('now'))`,
    ).bind(eventId, claimToken);

    if (existing) {
      const dateLabel = new Date().toLocaleDateString('ru-RU');
      const addition = lead.message
        ? `— повторная заявка ${dateLabel}: ${lead.message}`
        : `— повторная заявка ${dateLabel}`;
      const set: string[] = [
        'submissions_count = submissions_count + 1',
        "last_submitted_at = datetime('now')",
        "updated_at = datetime('now')",
        "status = 'new'",
        'telegram_delivered = 0',
        'event_id = ?',
        "name = CASE WHEN ? != '' THEN ? ELSE name END",
        "email = CASE WHEN ? != '' THEN ? ELSE email END",
        "phone = CASE WHEN ? != '' THEN ? ELSE phone END",
        "telegram_username = CASE WHEN ? != '' THEN ? ELSE telegram_username END",
        'contact_method = ?',
        "budget = CASE WHEN ? != '' THEN ? ELSE budget END",
        "service = CASE WHEN ? != '' THEN ? ELSE service END",
        'page_path = ?',
        "message = substr(CASE WHEN message = '' THEN ? ELSE message || char(10) || ? END, -4000)",
      ];
      const values: Array<string | number | null> = [
        eventId,
        lead.name || '', lead.name || '',
        lead.email || '', lead.email || '',
        lead.phone || '', lead.phone || '',
        lead.telegramUsername || '', lead.telegramUsername || '',
        lead.contactMethod === 'whatsapp' ? 'whatsapp' : 'telegram',
        lead.budget || '', lead.budget || '',
        lead.service || '', lead.service || '',
        lead.page_path || '',
        addition, addition,
      ];

      if (hasMetaContext) {
        set.push('fbp = ?', 'fbc = ?', 'event_source_url = ?', 'external_id = ?', 'marketing_consent = ?');
        values.push(
          marketingAllowed ? lead.fbp || '' : '',
          marketingAllowed ? lead.fbc || '' : '',
          marketingAllowed ? lead.page_url || '' : '',
          marketingAllowed ? lead.external_id || '' : '',
          marketingAllowed ? 1 : 0,
        );
      }
      if (cols.has('consent_version')) {
        set.push('consent_version = ?');
        values.push(consentVersion);
      }
      if (cols.has('consent_source')) {
        set.push('consent_source = ?');
        values.push(consentSource);
      }
      if (cols.has('consent_region')) {
        set.push('consent_region = ?');
        values.push(consentRegion);
      }
      if (cols.has('consent_timestamp')) {
        set.push('consent_timestamp = ?');
        values.push(consentTimestamp);
      }
      if (cols.has('consent_recorded_at')) set.push("consent_recorded_at = datetime('now')");
      if (hasQuality) set.push("quality = ''");
      if (hasPipelineStage) set.push("pipeline_stage = 'new'");
      if (cols.has('next_action_at')) set.push('next_action_at = NULL');
      if (cols.has('next_action_text')) set.push("next_action_text = ''");
      if (cols.has('loss_reason')) set.push("loss_reason = ''");
      if (cols.has('closed_at')) set.push('closed_at = NULL');
      if (cols.has('last_contacted_at')) set.push('last_contacted_at = NULL');
      if (cols.has('pipeline_changed_at')) set.push("pipeline_changed_at = datetime('now')");
      if (cols.has('crm_revision')) set.push('crm_revision = crm_revision + 1');
      if (cols.has('crm_action_id')) {
        set.push('crm_action_id = ?');
        values.push(`lead-resubmitted:${eventId}`);
      }
      if (cols.has('quality_revision')) set.push('quality_revision = quality_revision + 1');
      if (cols.has('quality_updated_at')) set.push("quality_updated_at = datetime('now')");
      if (cols.has('quality_action_id')) set.push("quality_action_id = ''");
      if (cols.has('quality_processing')) set.push('quality_processing = 0');
      if (hasUtm) {
        set.push('utm_source = ?', 'utm_medium = ?', 'utm_campaign = ?', 'utm_content = ?', 'utm_term = ?');
        values.push(
          marketingAllowed ? lead.utm_source || '' : '',
          marketingAllowed ? lead.utm_medium || '' : '',
          marketingAllowed ? lead.utm_campaign || '' : '',
          marketingAllowed ? lead.utm_content || '' : '',
          marketingAllowed ? lead.utm_term || '' : '',
        );
      }

      values.push(existing.id, eventId, claimToken);
      const updateStatement = db.prepare(
        `UPDATE leads SET ${set.join(', ')}
         WHERE id = ?
           AND EXISTS (
             SELECT 1 FROM lead_ingestions
             WHERE event_id = ? AND claim_token = ?
           )`,
      ).bind(...values);

      const statements: D1PreparedStatement[] = [claimStatement, updateStatement];
      if (hasPipelineStage) {
        const activityColumns = await getTableColumns(db, 'lead_activity');
        const activityReady = ['lead_id', 'type', 'from', 'to', 'note']
          .every((column) => activityColumns.has(column));
        if (!activityReady) throw new LeadStorageError('D1 CRM activity schema is incomplete; apply migration 0012');

        const auditColumns = ['lead_id', 'type', '"from"', '"to"', 'note'];
        const auditValues: Array<string | number> = [
          existing.id,
          'lead_resubmitted',
          existing.pipeline_stage || '',
          'new',
          `Повторная заявка сохранена (${eventId})`,
        ];
        if (activityColumns.has('actor')) {
          auditColumns.push('actor');
          auditValues.push('system');
        }
        if (activityColumns.has('entity_type')) {
          auditColumns.push('entity_type');
          auditValues.push('lead');
        }
        if (activityColumns.has('entity_id')) {
          auditColumns.push('entity_id');
          auditValues.push(existing.id);
        }
        if (activityColumns.has('action_id')) {
          auditColumns.push('action_id');
          auditValues.push(`lead-resubmitted:${eventId}`);
        }
        if (activityColumns.has('metadata_json')) {
          auditColumns.push('metadata_json');
          auditValues.push(JSON.stringify({
            event_id: eventId,
            previous_stage: existing.pipeline_stage || '',
            submissions_count: existing.submissions_count + 1,
          }));
        }
        const auditPlaceholders = auditColumns.map(() => '?').join(', ');
        statements.push(db.prepare(
          `INSERT INTO lead_activity (${auditColumns.join(', ')})
           SELECT ${auditPlaceholders}
           WHERE EXISTS (
             SELECT 1 FROM lead_ingestions
             WHERE event_id = ? AND claim_token = ?
           )
           AND EXISTS (
             SELECT 1 FROM leads WHERE id = ? AND event_id = ?
           )`,
        ).bind(...auditValues, eventId, claimToken, existing.id, eventId));
      }

      statements.push(db.prepare(
        `UPDATE lead_ingestions
         SET lead_id = ?, submission_kind = 'repeat'
         WHERE event_id = ? AND claim_token = ?
           AND EXISTS (SELECT 1 FROM leads WHERE id = ? AND event_id = ?)`,
      ).bind(existing.id, eventId, claimToken, existing.id, eventId));

      const results = await db.batch(statements);
      if (changedRows(results[0]) === 0) return duplicateLeadResult(db, eventId, hasDedupe);
      if (changedRows(results[1]) === 0) {
        await db.prepare('DELETE FROM lead_ingestions WHERE event_id = ? AND claim_token = ? AND lead_id IS NULL')
          .bind(eventId, claimToken)
          .run();
        throw new LeadStorageError('D1 repeat lead update was not committed');
      }

      const stored = await db.prepare('SELECT submissions_count FROM leads WHERE id = ?')
        .bind(existing.id)
        .first<{ submissions_count: number }>();
      return {
        durable: true,
        duplicate: false,
        repeat: true,
        submissionsCount: Number(stored?.submissions_count || existing.submissions_count + 1),
        eventId,
        leadId: existing.id,
      };
    }

    const insertCols = ['event_id', 'name', 'email', 'phone', 'telegram_username', 'contact_method', 'budget', 'message', 'service', 'page_path'];
    const insertVals: Array<string | number | null> = [
      eventId,
      lead.name || '',
      lead.email || '',
      lead.phone || '',
      lead.telegramUsername || '',
      lead.contactMethod === 'whatsapp' ? 'whatsapp' : 'telegram',
      lead.budget || '',
      lead.message || '',
      lead.service || '',
      lead.page_path || '',
    ];
    const placeholders = insertCols.map(() => '?');
    if (hasDedupe) {
      insertCols.push('last_submitted_at');
      placeholders.push("datetime('now')");
    }
    if (hasMetaContext) {
      insertCols.push('fbp', 'fbc', 'event_source_url', 'external_id', 'marketing_consent');
      placeholders.push('?', '?', '?', '?', '?');
      insertVals.push(
        marketingAllowed ? lead.fbp || '' : '',
        marketingAllowed ? lead.fbc || '' : '',
        marketingAllowed ? lead.page_url || '' : '',
        marketingAllowed ? lead.external_id || '' : '',
        marketingAllowed ? 1 : 0,
      );
    }
    if (cols.has('consent_version')) {
      insertCols.push('consent_version');
      placeholders.push('?');
      insertVals.push(consentVersion);
    }
    if (cols.has('consent_source')) {
      insertCols.push('consent_source');
      placeholders.push('?');
      insertVals.push(consentSource);
    }
    if (cols.has('consent_region')) {
      insertCols.push('consent_region');
      placeholders.push('?');
      insertVals.push(consentRegion);
    }
    if (cols.has('consent_timestamp')) {
      insertCols.push('consent_timestamp');
      placeholders.push('?');
      insertVals.push(consentTimestamp);
    }
    if (cols.has('consent_recorded_at')) {
      insertCols.push('consent_recorded_at');
      placeholders.push("datetime('now')");
    }
    if (hasUtm) {
      insertCols.push('utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term');
      placeholders.push('?', '?', '?', '?', '?');
      insertVals.push(
        marketingAllowed ? lead.utm_source || '' : '',
        marketingAllowed ? lead.utm_medium || '' : '',
        marketingAllowed ? lead.utm_campaign || '' : '',
        marketingAllowed ? lead.utm_content || '' : '',
        marketingAllowed ? lead.utm_term || '' : '',
      );
    }

    const insertStatement = db.prepare(
      `INSERT INTO leads (${insertCols.join(', ')})
       SELECT ${placeholders.join(', ')}
       WHERE EXISTS (
         SELECT 1 FROM lead_ingestions WHERE event_id = ? AND claim_token = ?
       )
       ON CONFLICT(event_id) DO NOTHING`,
    ).bind(...insertVals, eventId, claimToken);
    const linkStatement = db.prepare(
      `UPDATE lead_ingestions
       SET lead_id = (SELECT id FROM leads WHERE event_id = ? LIMIT 1),
           submission_kind = 'new'
       WHERE event_id = ? AND claim_token = ?`,
    ).bind(eventId, eventId, claimToken);

    const results = await db.batch([claimStatement, insertStatement, linkStatement]);
    if (changedRows(results[0]) === 0) return duplicateLeadResult(db, eventId, hasDedupe);
    if (changedRows(results[1]) === 0) {
      const legacy = await db.prepare('SELECT id FROM leads WHERE event_id = ? LIMIT 1')
        .bind(eventId)
        .first<{ id: number }>();
      if (legacy?.id) {
        await db.prepare(
          `UPDATE lead_ingestions SET lead_id = ?, submission_kind = 'legacy'
           WHERE event_id = ? AND claim_token = ?`,
        ).bind(legacy.id, eventId, claimToken).run();
        return duplicateLeadResult(db, eventId, hasDedupe);
      }
      await db.prepare('DELETE FROM lead_ingestions WHERE event_id = ? AND claim_token = ? AND lead_id IS NULL')
        .bind(eventId, claimToken)
        .run();
      throw new LeadStorageError('D1 lead insert was not committed');
    }

    const stored = await db.prepare('SELECT id FROM leads WHERE event_id = ? LIMIT 1')
      .bind(eventId)
      .first<{ id: number }>();
    if (!stored?.id) throw new LeadStorageError('D1 lead insert could not be verified');
    return {
      durable: true,
      duplicate: false,
      repeat: false,
      submissionsCount: 1,
      eventId,
      leadId: stored.id,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Leads] Durable D1 storage failed:', message);
    if (error instanceof LeadStorageError) throw error;
    throw new LeadStorageError(message || 'Unknown D1 storage failure');
  }
}

export async function markLeadTelegramDelivered(env: Env, eventId: string | undefined): Promise<void> {
  if (!env.DB || !eventId) return;
  try {
    await env.DB.prepare('UPDATE leads SET telegram_delivered = 1, updated_at = datetime(\'now\') WHERE event_id = ?')
      .bind(eventId)
      .run();
  } catch {
    // таблицы может не быть до миграции — не критично
  }
}

function escapeTelegramHtml(value: string): string {
  return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildLeadTelegramText(lead: LeadRecord, stored?: StoreLeadResult): string {
  const lines = [
    stored?.repeat ? `🔁 Повторная заявка (№${stored.submissionsCount} от этого контакта)` : '🚀 Новая заявка',
    `Имя: ${lead.name || 'не указано'}`,
    `Email: ${lead.email || 'не указан'}`,
    `Телефон: ${lead.phone || 'не указан'}`,
    `Бюджет: ${lead.budget || 'не указан'}`,
    `Сообщение: ${lead.message || 'не указано'}`,
    `Способ связи: ${lead.contactMethod === 'whatsapp' ? 'WhatsApp' : 'Telegram'}`,
  ];
  if (lead.contactMethod !== 'whatsapp' && lead.telegramUsername) {
    lines.push(`Telegram username: ${lead.telegramUsername}`);
  }
  if (lead.service) lines.push(`Услуга: ${lead.service}`);
  if (lead.page_path) lines.push(`Страница: ${lead.page_path}`);
  const utm = [lead.utm_source, lead.utm_medium, lead.utm_campaign].filter(Boolean).join(' / ');
  if (utm) lines.push(`📍 Источник: ${utm}`);
  if (lead.utm_content) lines.push(`Объявление: ${lead.utm_content}`);
  return lines.map(escapeTelegramHtml).join('\n');
}

export function isTelegramConfigured(env: Env): boolean {
  return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
}

// Прямая отправка заявки в Telegram из Cloudflare (вместо Google Apps Script).
// Токен и chat_id живут в секретах Cloudflare Pages, не в коде.
export async function sendLeadToTelegram(env: Env, lead: LeadRecord, stored?: StoreLeadResult): Promise<{ ok: boolean; error?: string }> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return { ok: false, error: 'telegram_not_configured' };
  }
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: buildLeadTelegramText(lead, stored),
        parse_mode: 'HTML',
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      return { ok: false, error: `telegram_http_${response.status}: ${body.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'telegram_network_error' };
  }
}

function normalizeStatsPath(value: string | undefined): string {
  let raw = String(value || '').split('?')[0].split('#')[0].trim();
  if (/^https?:\/\//i.test(raw)) {
    try {
      raw = new URL(raw).pathname;
    } catch {
      raw = '/';
    }
  }
  if (!raw || !raw.startsWith('/')) return '/';
  const trimmed = raw.length > 1 ? raw.replace(/\/$/, '') : raw;
  return trimmed.slice(0, 200);
}

async function sha256Hex(value: string): Promise<string> {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Первичная (first-party) статистика посещений без cookies и личных данных:
// дневные счётчики просмотров по страницам + уникальные за день по
// обезличенному «отпечатку дня» (IP + User-Agent + дата + соль).
// Сырые IP/UA нигде не сохраняются.
export async function recordPageStats(env: Env, pagePath: string | undefined, request: Request): Promise<void> {
  if (!env.DB) return;
  const day = new Date().toISOString().slice(0, 10);
  const path = normalizeStatsPath(pagePath);
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '';
  const userAgent = request.headers.get('User-Agent') || '';
  const salt = env.TRACKING_HMAC_SECRET || env.ADMIN_PASSWORD || 'ww-stats';
  const visitorHash = await sha256Hex(`${ip}|${userAgent}|${day}|${salt}`);

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO page_stats_daily (day, page_path, views) VALUES (?, ?, 1)
         ON CONFLICT(day, page_path) DO UPDATE SET views = views + 1`
      ).bind(day, path),
      env.DB.prepare(
        'INSERT OR IGNORE INTO visitor_hashes_daily (day, visitor_hash) VALUES (?, ?)'
      ).bind(day, visitorHash),
    ]);
    // Редкая фоновая чистка старых хешей (~1% запросов), чтобы таблица не росла бесконечно.
    if (Math.random() < 0.01) {
      await env.DB.prepare("DELETE FROM visitor_hashes_daily WHERE day < date('now', '-90 day')").run();
    }
  } catch (error) {
    if (!hasLeadsTableError(error)) {
      console.error('[Stats] Failed to record page stats:', error);
    }
  }
}
