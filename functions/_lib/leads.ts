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
}

function hasLeadsTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /no such table/i.test(message);
}

// Сохранение заявки в D1. Ошибки не роняют обработку лида:
// до применения миграции 0008 (или без D1) заявки просто не пишутся в базу.
export async function storeLead(env: Env, lead: LeadRecord): Promise<void> {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO leads (event_id, name, email, phone, telegram_username, contact_method, budget, message, service, page_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(event_id) DO NOTHING`
    ).bind(
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
    ).run();
  } catch (error) {
    if (!hasLeadsTableError(error)) {
      console.error('[Leads] Failed to store lead in D1:', error);
    }
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

export function buildLeadTelegramText(lead: LeadRecord): string {
  const lines = [
    '🚀 Новая заявка',
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
  return lines.map(escapeTelegramHtml).join('\n');
}

export function isTelegramConfigured(env: Env): boolean {
  return Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
}

// Прямая отправка заявки в Telegram из Cloudflare (вместо Google Apps Script).
// Токен и chat_id живут в секретах Cloudflare Pages, не в коде.
export async function sendLeadToTelegram(env: Env, lead: LeadRecord): Promise<{ ok: boolean; error?: string }> {
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
        text: buildLeadTelegramText(lead),
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
