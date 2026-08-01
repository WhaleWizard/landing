import { verifyAdminPassword } from '../../_lib/auth';
import { CACHE_CONTROL } from '../../_lib/cache';
import { json } from '../../_lib/http';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };
const MIGRATION = '0023_ad_spend.sql';
const MAX_ENTRIES_PER_REQUEST = 500;
const MAX_AMOUNT = 1_000_000_000;

export interface SpendEntry {
  id?: number;
  day: string;
  source: string;
  campaign: string;
  amount: number;
  currency: string;
  note: string;
}

// Переносы строк и табуляции ломают и таблицу, и выгрузку в CSV.
function sanitizeText(value: unknown, max: number): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function isMissingTableError(error: unknown): boolean {
  return /no such table/i.test(error instanceof Error ? error.message : String(error));
}

function boundedDays(request: Request): number {
  const raw = Number(new URL(request.url).searchParams.get('days') || 30);
  if (!Number.isFinite(raw)) return 30;
  return Math.min(Math.max(Math.floor(raw), 1), 365);
}

// Дата приходит из <input type="date">, но принять её вслепую нельзя:
// в SQLite нет типов, и мусор молча осел бы в таблице.
function normalizeDay(value: unknown): string | null {
  const raw = String(value || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10) === raw ? raw : null;
}

function normalizeKeyPart(value: unknown): string {
  return sanitizeText(String(value || ''), 120).trim().toLowerCase();
}

function normalizeCurrency(value: unknown): string | null {
  const raw = String(value || 'USD').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(raw) ? raw : null;
}

// «1 234,56», «1234.56» и «$1,234.56» — всё это один и тот же расход.
function normalizeAmount(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 && value <= MAX_AMOUNT ? Math.round(value * 100) / 100 : null;
  }
  const raw = String(value ?? '').replace(/[^\d.,-]/g, '').trim();
  if (!raw) return null;
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  let normalized = raw;
  if (lastComma >= 0 && lastComma > lastDot) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else {
    normalized = raw.replace(/,/g, '');
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_AMOUNT) return null;
  return Math.round(parsed * 100) / 100;
}

function normalizeEntry(raw: unknown): SpendEntry | { error: string } {
  const input = (raw || {}) as Record<string, unknown>;
  const day = normalizeDay(input.day);
  if (!day) return { error: 'Дата должна быть в формате ГГГГ-ММ-ДД' };
  const amount = normalizeAmount(input.amount);
  if (amount === null) return { error: 'Сумма должна быть числом от 0' };
  const currency = normalizeCurrency(input.currency);
  if (!currency) return { error: 'Валюта — три латинские буквы, например USD' };
  const source = normalizeKeyPart(input.source);
  if (!source) return { error: 'Укажите источник — он должен совпадать с utm_source' };
  return {
    day,
    source,
    campaign: normalizeKeyPart(input.campaign),
    amount,
    currency,
    note: sanitizeText(String(input.note || ''), 200),
  };
}

// CSV из рекламных кабинетов: заголовок обязателен, порядок колонок любой.
function parseCsv(csv: string): { entries: unknown[]; skipped: number } {
  const lines = String(csv || '').split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return { entries: [], skipped: 0 };
  const delimiter = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
  const splitLine = (line: string) => line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ''));
  const header = splitLine(lines[0]).map((cell) => cell.toLowerCase());
  const columnIndex = (...names: string[]) => {
    for (const name of names) {
      const index = header.indexOf(name);
      if (index >= 0) return index;
    }
    return -1;
  };
  const indexes = {
    day: columnIndex('day', 'date', 'дата', 'день'),
    source: columnIndex('source', 'utm_source', 'источник', 'канал'),
    campaign: columnIndex('campaign', 'utm_campaign', 'кампания'),
    amount: columnIndex('amount', 'spend', 'cost', 'сумма', 'расход', 'затраты'),
    currency: columnIndex('currency', 'валюта'),
    note: columnIndex('note', 'comment', 'заметка', 'комментарий'),
  };
  if (indexes.day < 0 || indexes.amount < 0) return { entries: [], skipped: lines.length - 1 };

  const entries: unknown[] = [];
  let skipped = 0;
  for (const line of lines.slice(1, MAX_ENTRIES_PER_REQUEST + 1)) {
    const cells = splitLine(line);
    const cell = (index: number) => (index >= 0 ? cells[index] || '' : '');
    const day = cell(indexes.day);
    if (!day) { skipped += 1; continue; }
    entries.push({
      day,
      source: cell(indexes.source),
      campaign: cell(indexes.campaign),
      amount: cell(indexes.amount),
      currency: cell(indexes.currency) || 'USD',
      note: cell(indexes.note),
    });
  }
  return { entries, skipped };
}

async function readSpendRows(db: D1Database, days: number): Promise<SpendEntry[]> {
  const rows = await db.prepare(`
    SELECT id, day, source, campaign, amount, currency, note
    FROM ad_spend
    WHERE day >= date('now', ?)
    ORDER BY day DESC, source ASC, campaign ASC
    LIMIT 2000
  `).bind(`-${days - 1} day`).all<SpendEntry>();
  return (rows.results || []).map((row) => ({ ...row, amount: Number(row.amount) || 0 }));
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;
  if (!verifyAdminPassword(request.headers.get('X-Admin-Password') || '', env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.DB) {
    return json({ success: false, code: 'D1_NOT_BOUND', error: 'Расходы хранятся в D1 и доступны на production.' }, { status: 503, headers: noStore });
  }

  const days = boundedDays(request);
  try {
    const entries = await readSpendRows(env.DB, days);
    const totals = new Map<string, number>();
    for (const entry of entries) {
      totals.set(entry.currency, (totals.get(entry.currency) || 0) + entry.amount);
    }
    // Подсказка для поля «Источник»: что реально встречается в заявках.
    const knownSources = await env.DB.prepare(`
      SELECT DISTINCT LOWER(TRIM(utm_source)) AS source FROM leads
      WHERE TRIM(COALESCE(utm_source, '')) != '' LIMIT 50
    `).all<{ source: string }>().catch(() => ({ results: [] as Array<{ source: string }> }));

    return json({
      success: true,
      days,
      entries,
      totals: [...totals.entries()].map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 })),
      knownSources: (knownSources.results || []).map((row) => row.source).filter(Boolean),
    }, { headers: noStore });
  } catch (error) {
    if (isMissingTableError(error)) {
      return json({ success: false, code: 'MIGRATION_REQUIRED', migration: MIGRATION, error: `Примените миграцию ${MIGRATION} — до неё расходы негде хранить.` }, { status: 503, headers: noStore });
    }
    return json({ success: false, error: error instanceof Error ? error.message : 'Не удалось прочитать расходы' }, { status: 500, headers: noStore });
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => ({})) as {
    password?: string; action?: string; entries?: unknown[]; csv?: string; id?: number; days?: number;
  };
  if (!verifyAdminPassword(request.headers.get('X-Admin-Password') || body.password || '', env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.DB) {
    return json({ success: false, code: 'D1_NOT_BOUND', error: 'Расходы хранятся в D1 и доступны на production.' }, { status: 503, headers: noStore });
  }

  const db = env.DB;
  const days = Math.min(Math.max(Math.floor(Number(body.days || 30)) || 30, 1), 365);

  try {
    if (body.action === 'delete') {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) {
        return json({ success: false, error: 'Некорректный идентификатор строки' }, { status: 400, headers: noStore });
      }
      await db.prepare('DELETE FROM ad_spend WHERE id = ?').bind(id).run();
      return json({ success: true, deleted: 1, entries: await readSpendRows(db, days) }, { headers: noStore });
    }

    if (body.action !== 'upsert' && body.action !== 'import_csv') {
      return json({ success: false, error: 'Неизвестное действие' }, { status: 400, headers: noStore });
    }

    const parsed = body.action === 'import_csv' ? parseCsv(String(body.csv || '')) : { entries: body.entries || [], skipped: 0 };
    const rawEntries = Array.isArray(parsed.entries) ? parsed.entries.slice(0, MAX_ENTRIES_PER_REQUEST) : [];
    if (!rawEntries.length) {
      return json({
        success: false,
        error: body.action === 'import_csv'
          ? 'В файле не нашлись колонки с датой и суммой. Нужны заголовки date/день и amount/сумма.'
          : 'Нечего сохранять',
      }, { status: 400, headers: noStore });
    }

    const valid: SpendEntry[] = [];
    const errors: string[] = [];
    for (const raw of rawEntries) {
      const entry = normalizeEntry(raw);
      if ('error' in entry) {
        if (errors.length < 5) errors.push(entry.error);
        continue;
      }
      valid.push(entry);
    }
    if (!valid.length) {
      return json({ success: false, error: errors[0] || 'Ни одну строку не удалось разобрать', errors }, { status: 400, headers: noStore });
    }

    // Один и тот же день + источник + кампания + валюта — это один расход:
    // повторный ввод заменяет сумму, а не удваивает её.
    const statements = valid.map((entry) => db.prepare(`
      INSERT INTO ad_spend (day, source, campaign, amount, currency, note)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(day, source, campaign, currency) DO UPDATE SET
        amount = excluded.amount,
        note = excluded.note,
        updated_at = datetime('now')
    `).bind(entry.day, entry.source, entry.campaign, entry.amount, entry.currency, entry.note));

    for (let index = 0; index < statements.length; index += 50) {
      await db.batch(statements.slice(index, index + 50));
    }

    return json({
      success: true,
      saved: valid.length,
      skipped: parsed.skipped + (rawEntries.length - valid.length),
      errors,
      entries: await readSpendRows(db, days),
    }, { headers: noStore });
  } catch (error) {
    if (isMissingTableError(error)) {
      return json({ success: false, code: 'MIGRATION_REQUIRED', migration: MIGRATION, error: `Примените миграцию ${MIGRATION} — до неё расходы негде хранить.` }, { status: 503, headers: noStore });
    }
    return json({ success: false, error: error instanceof Error ? error.message : 'Не удалось сохранить расходы' }, { status: 500, headers: noStore });
  }
};
