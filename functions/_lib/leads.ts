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

function hasMissingColumnError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such column|has no column/i.test(message);
}

export interface StoreLeadResult {
  repeat: boolean;
  submissionsCount: number;
}

// Ключи для поиска повторной заявки от того же человека
function contactKeys(email?: string, phone?: string, telegram?: string) {
  return {
    email: String(email || '').trim().toLowerCase(),
    phone: String(phone || '').replace(/\D/g, ''),
    telegram: String(telegram || '').trim().toLowerCase().replace(/^@/, ''),
  };
}

const MAX_STORED_MESSAGE = 4000;

// Сохранение заявки в D1 с дедупликацией: если контакт (email / телефон /
// telegram) уже оставлял заявку — не создаём дубль, а «поднимаем» старую:
// счётчик +1, статус снова «новая», новое сообщение дописывается к истории.
// Ошибки не роняют обработку лида: до миграций 0008/0009 (или без D1)
// код тихо деградирует.
export async function storeLead(env: Env, lead: LeadRecord): Promise<StoreLeadResult> {
  const fallback: StoreLeadResult = { repeat: false, submissionsCount: 1 };
  if (!env.DB) return fallback;

  try {
    const cols = await getLeadsColumns(env.DB);
    if (cols.size === 0) return fallback; // таблицы ещё нет (миграция 0008 не применена)
    const hasDedupe = cols.has('submissions_count') && cols.has('last_submitted_at'); // 0009
    const hasMetaContext = cols.has('marketing_consent'); // 0010
    const hasUtm = cols.has('utm_source'); // 0011
    const hasQuality = cols.has('quality'); // 0009
    const hasPipelineStage = cols.has('pipeline_stage'); // 0012

    let existing: { id: number; submissions_count: number; message: string } | null = null;
    const keys = contactKeys(lead.email, lead.phone, lead.telegramUsername);
    if (hasDedupe && (keys.email || keys.phone || keys.telegram)) {
      // Заявок немного — сверяем контакты в коде, чтобы одинаково
      // нормализовать телефоны вида "+7 (999) ..." и "79 99...".
      const recent = await env.DB.prepare(
        'SELECT id, email, phone, telegram_username, submissions_count, message FROM leads ORDER BY id DESC LIMIT 500'
      ).all<{ id: number; email: string; phone: string; telegram_username: string; submissions_count: number; message: string }>();
      for (const row of recent.results || []) {
        const rowKeys = contactKeys(row.email, row.phone, row.telegram_username);
        const sameEmail = keys.email && rowKeys.email === keys.email;
        const samePhone = keys.phone && rowKeys.phone === keys.phone;
        const sameTelegram = keys.telegram && rowKeys.telegram === keys.telegram;
        if (sameEmail || samePhone || sameTelegram) {
          existing = { id: row.id, submissions_count: Number(row.submissions_count || 1), message: String(row.message || '') };
          break;
        }
      }
    }

    if (existing) {
      const newCount = existing.submissions_count + 1;
      const dateLabel = new Date().toLocaleDateString('ru-RU');
      const addition = lead.message ? `— повторная заявка ${dateLabel}: ${lead.message}` : `— повторная заявка ${dateLabel}`;
      const mergedMessage = `${existing.message}\n${addition}`.trim().slice(-MAX_STORED_MESSAGE);

      const set: string[] = [
        'submissions_count = ?',
        "last_submitted_at = datetime('now')",
        "updated_at = datetime('now')",
        "status = 'new'",
        'telegram_delivered = 0',
        'event_id = ?',
        "name = CASE WHEN ? != '' THEN ? ELSE name END",
        "email = CASE WHEN ? != '' THEN ? ELSE email END",
        "phone = CASE WHEN ? != '' THEN ? ELSE phone END",
        "telegram_username = CASE WHEN ? != '' THEN ? ELSE telegram_username END",
        "budget = CASE WHEN ? != '' THEN ? ELSE budget END",
        "service = CASE WHEN ? != '' THEN ? ELSE service END",
        "page_path = CASE WHEN ? != '' THEN ? ELSE page_path END",
        'message = ?',
      ];
      // порядок значений строго повторяет порядок «?» в списке set выше
      const values: Array<string | number> = [
        newCount,
        lead.event_id || crypto.randomUUID(),
        lead.name || '', lead.name || '',
        lead.email || '', lead.email || '',
        lead.phone || '', lead.phone || '',
        lead.telegramUsername || '', lead.telegramUsername || '',
        lead.budget || '', lead.budget || '',
        lead.service || '', lead.service || '',
        lead.page_path || '', lead.page_path || '',
        mergedMessage,
      ];
      if (hasMetaContext) {
        // Повторная заявка = свежий клик по рекламе: обновляем метки и согласие
        set.push(
          "fbp = CASE WHEN ? != '' THEN ? ELSE fbp END",
          "fbc = CASE WHEN ? != '' THEN ? ELSE fbc END",
          "event_source_url = CASE WHEN ? != '' THEN ? ELSE event_source_url END",
          "external_id = CASE WHEN ? != '' THEN ? ELSE external_id END",
          'marketing_consent = ?',
        );
        values.push(
          lead.fbp || '', lead.fbp || '',
          lead.fbc || '', lead.fbc || '',
          lead.page_url || '', lead.page_url || '',
          lead.external_id || '', lead.external_id || '',
          lead.marketing_consent === true ? 1 : 0,
        );
      }
      if (hasQuality) {
        // Новая отправка формы — новый Lead event_id и новое решение по качеству.
        // Старую метку нельзя автоматически переносить на следующую заявку.
        set.push("quality = ''");
      }
      if (hasPipelineStage) {
        // Повторная заявка снова требует ответа. Legacy status и CRM-этап
        // сбрасываются в одном UPDATE, чтобы два представления не расходились.
        set.push("pipeline_stage = 'new'");
      }
      if (hasUtm) {
        // Повторная заявка = новый источник: обновляем метки, если они пришли
        set.push(
          "utm_source = CASE WHEN ? != '' THEN ? ELSE utm_source END",
          "utm_medium = CASE WHEN ? != '' THEN ? ELSE utm_medium END",
          "utm_campaign = CASE WHEN ? != '' THEN ? ELSE utm_campaign END",
          "utm_content = CASE WHEN ? != '' THEN ? ELSE utm_content END",
          "utm_term = CASE WHEN ? != '' THEN ? ELSE utm_term END",
        );
        values.push(
          lead.utm_source || '', lead.utm_source || '',
          lead.utm_medium || '', lead.utm_medium || '',
          lead.utm_campaign || '', lead.utm_campaign || '',
          lead.utm_content || '', lead.utm_content || '',
          lead.utm_term || '', lead.utm_term || '',
        );
      }
      values.push(existing.id);
      await env.DB.prepare(`UPDATE leads SET ${set.join(', ')} WHERE id = ?`).bind(...values).run();
      return { repeat: true, submissionsCount: newCount };
    }

    const insertCols = ['event_id', 'name', 'email', 'phone', 'telegram_username', 'contact_method', 'budget', 'message', 'service', 'page_path'];
    const insertVals: Array<string | number> = [
      lead.event_id || crypto.randomUUID(),
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
      insertVals.push(lead.fbp || '', lead.fbc || '', lead.page_url || '', lead.external_id || '', lead.marketing_consent === true ? 1 : 0);
    }
    if (hasUtm) {
      insertCols.push('utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term');
      placeholders.push('?', '?', '?', '?', '?');
      insertVals.push(lead.utm_source || '', lead.utm_medium || '', lead.utm_campaign || '', lead.utm_content || '', lead.utm_term || '');
    }
    await env.DB.prepare(
      `INSERT INTO leads (${insertCols.join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT(event_id) DO NOTHING`
    ).bind(...insertVals).run();
    return fallback;
  } catch (error) {
    if (!hasLeadsTableError(error) && !hasMissingColumnError(error)) {
      console.error('[Leads] Failed to store lead in D1:', error);
    }
    return fallback;
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
