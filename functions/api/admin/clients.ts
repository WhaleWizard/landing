import { json, readRequestText } from '../../_lib/http';
import { CACHE_CONTROL } from '../../_lib/cache';
import { verifyAdminPassword } from '../../_lib/auth';
import { enforceRateLimit } from '../../_lib/rate-limit';
import { normalizeCurrencyCode, parseMoney, parseMoneyOrZero } from '../../_lib/money';
import type { Env } from '../../_lib/types';

/**
 * Клиенты — то, что начинается после выигранной сделки.
 *
 * Здесь нет ни одного «примерного» числа: регулярный доход считается только
 * по активным клиентам с заполненным чеком, а разные валюты не складываются —
 * курсов в системе нет, как и в «Воронке».
 */

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };
const MIGRATION = '0032_clients.sql';
const MAX_BODY_BYTES = 128 * 1024;

const LIMITS = {
  name: 160,
  company: 200,
  contact: 200,
  text: 2000,
  note: 4000,
  url: 600,
  number: 80,
  services: 12,
} as const;

const CONTROL_CHARS = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]', 'g');

type ClientStatus = 'active' | 'paused' | 'finished';
type AccessStatus = 'waiting' | 'granted' | 'revoked';
type Health = 'ok' | 'attention' | 'critical';

interface ClientRow {
  id: number;
  lead_id: number | null;
  name: string;
  company: string;
  status: ClientStatus;
  started_at: string;
  paused_until: string | null;
  finished_at: string | null;
  finish_reason: string;
  contact_method: string;
  contact_value: string;
  timezone_offset: number | null;
  services: string;
  retainer_amount: number;
  retainer_currency: string;
  billing_day: number | null;
  contract_number: string;
  contract_signed_at: string | null;
  contract_ends_at: string | null;
  contract_auto_renew: number;
  contract_file_url: string;
  scope_included: string;
  scope_excluded: string;
  next_touch_at: string | null;
  next_touch_text: string;
  media_folder: string;
  created_at: string;
  updated_at: string;
}

function isMissingTableError(error: unknown): boolean {
  return /no such table/i.test(error instanceof Error ? error.message : String(error));
}

function migrationResponse() {
  return json(
    {
      success: false,
      migrationRequired: true,
      migration: MIGRATION,
      error: `Примените миграцию ${MIGRATION} — до неё раздел «Клиенты» негде хранить.`,
    },
    { status: 503, headers: noStore },
  );
}

function getPassword(request: Request, body?: { password?: string }): string {
  return request.headers.get('X-Admin-Password') || body?.password || '';
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value ?? '').replace(CONTROL_CHARS, '').slice(0, maxLength).trim();
}

function cleanLine(value: unknown, maxLength: number): string {
  return cleanText(value, maxLength).replace(/\s+/g, ' ');
}

/** Пустая строка вместо даты — это «не задано», а не «1970 год». */
function cleanDate(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return Number.isNaN(new Date(`${text}T00:00:00Z`).getTime()) ? null : text;
}

function cleanMonth(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return /^\d{4}-\d{2}$/.test(text) ? text : null;
}

const cleanAmount = parseMoneyOrZero;
const cleanOptionalNumber = parseMoney;
const cleanCurrency = normalizeCurrencyCode;

function cleanStatus(value: unknown): ClientStatus {
  const text = String(value ?? '');
  return text === 'paused' || text === 'finished' ? text : 'active';
}

function cleanServices(value: unknown): string {
  if (!Array.isArray(value)) return '[]';
  const list = value.slice(0, LIMITS.services).map((item) => {
    const service = (item || {}) as { name?: unknown; status?: unknown; since?: unknown };
    const status = String(service.status || '') === 'paused' ? 'paused' : 'active';
    return { name: cleanLine(service.name, 120), status, since: cleanMonth(service.since) || '' };
  }).filter((item) => item.name);
  return JSON.stringify(list);
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const target = new Date(`${iso}T00:00:00Z`).getTime();
  if (Number.isNaN(target)) return null;
  return Math.round((target - Date.now()) / 86_400_000);
}

/**
 * Светофор риска: клиенты уходят не внезапно — просто некому заметить
 * накопившиеся мелочи. Каждый повод объясняется словами, чтобы было понятно,
 * что именно чинить.
 */
function computeHealth(
  client: ClientRow,
  lastReportMonth: string | null,
  trend: { current: number | null; previous: number | null },
): { health: Health; reasons: string[] } {
  if (client.status === 'finished') return { health: 'ok', reasons: [] };

  const reasons: string[] = [];
  let health: Health = 'ok';
  const raise = (level: Health) => {
    if (level === 'critical' || (level === 'attention' && health === 'ok')) health = level;
  };

  const now = new Date();
  const previousMonth = monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
  // До десятого числа отчёт за прошлый месяц ещё не просрочен — это нормальный
  // срок на сбор цифр, а не повод краснеть.
  if (client.status === 'active' && now.getUTCDate() > 10 && lastReportMonth !== previousMonth) {
    reasons.push(`Отчёт за ${previousMonth} не отправлен`);
    raise('critical');
  }

  const untilEnd = daysUntil(client.contract_ends_at);
  if (untilEnd !== null && untilEnd >= 0 && !client.contract_auto_renew) {
    if (untilEnd <= 14) {
      reasons.push(`Договор кончается через ${untilEnd} дн.`);
      raise('critical');
    } else if (untilEnd <= 30) {
      reasons.push(`Договор кончается через ${untilEnd} дн.`);
      raise('attention');
    }
  }
  if (untilEnd !== null && untilEnd < 0 && !client.contract_auto_renew) {
    reasons.push('Договор уже закончился');
    raise('critical');
  }

  const untilTouch = daysUntil(client.next_touch_at);
  if (untilTouch !== null && untilTouch < 0) {
    reasons.push(`Следующее касание просрочено на ${Math.abs(untilTouch)} дн.`);
    raise('critical');
  }

  // Цена лида выросла больше чем на треть — повод поговорить раньше,
  // чем клиент сам придёт с вопросом «почему так дорого».
  if (trend.current !== null && trend.previous !== null && trend.previous > 0) {
    const growth = (trend.current - trend.previous) / trend.previous;
    if (growth > 0.3) {
      reasons.push(`Цена лида выросла на ${Math.round(growth * 100)}%`);
      raise('attention');
    }
  }

  if (client.status === 'paused') {
    const back = daysUntil(client.paused_until);
    if (back !== null && back < 0) {
      reasons.push('Пауза кончилась, а клиент всё ещё на паузе');
      raise('attention');
    }
  }

  return { health, reasons };
}

async function listClients(env: Env): Promise<Response> {
  const db = env.DB as D1Database;
  const [clientRows, monthRows] = await Promise.all([
    db.prepare('SELECT * FROM clients ORDER BY (status = \'finished\'), name COLLATE NOCASE').all<ClientRow>(),
    db.prepare(
      `SELECT client_id, month, report_sent_at, spend, spend_currency, leads
       FROM client_months ORDER BY month DESC`,
    ).all<{ client_id: number; month: string; report_sent_at: string | null; spend: number | null; spend_currency: string | null; leads: number | null }>(),
  ]);

  const monthsByClient = new Map<number, Array<{ month: string; reported: boolean; cpl: number | null; currency: string }>>();
  for (const row of monthRows.results || []) {
    const list = monthsByClient.get(row.client_id) || [];
    const cpl = row.spend !== null && row.leads ? row.spend / row.leads : null;
    list.push({
      month: row.month,
      reported: Boolean(row.report_sent_at),
      cpl,
      currency: String(row.spend_currency || ''),
    });
    monthsByClient.set(row.client_id, list);
  }

  const clients = (clientRows.results || []).map((client) => {
    const months = monthsByClient.get(client.id) || [];
    const lastReportMonth = months.find((item) => item.reported)?.month || null;
    const withCpl = months.filter((item) => item.cpl !== null);
    // Два месяца сравниваются только внутри одной валюты. Иначе смена валюты
    // в таблице месяцев рисовала бы «цена лида выросла на 12 000%» — число,
    // за которым нет ничего, кроме разных единиц измерения.
    const comparable = withCpl[1] && withCpl[0] && withCpl[1].currency === withCpl[0].currency;
    const { health, reasons } = computeHealth(client, lastReportMonth, {
      current: withCpl[0]?.cpl ?? null,
      previous: comparable ? withCpl[1].cpl : null,
    });
    return {
      ...client,
      services: (() => { try { return JSON.parse(client.services); } catch { return []; } })(),
      lastReportMonth,
      monthsTracked: months.length,
      health,
      healthReasons: reasons,
    };
  });

  // Регулярный доход считается по валютам раздельно: складывать доллары с
  // рублями без курса — это выдуманное число.
  const recurring = new Map<string, number>();
  let activeCount = 0;
  let withoutRetainer = 0;
  for (const client of clients) {
    if (client.status !== 'active') continue;
    // «Активных» — это про статус. Клиент без заполненного чека всё равно
    // активный: он просто не попадает в сумму регулярного дохода.
    activeCount += 1;
    if (client.retainer_amount <= 0) {
      withoutRetainer += 1;
      continue;
    }
    recurring.set(client.retainer_currency, (recurring.get(client.retainer_currency) || 0) + client.retainer_amount);
  }

  const lifetimes = clients
    .filter((client) => client.started_at)
    .map((client) => {
      const start = new Date(`${client.started_at}T00:00:00Z`).getTime();
      const end = client.finished_at ? new Date(`${client.finished_at}T00:00:00Z`).getTime() : Date.now();
      return Number.isNaN(start) || Number.isNaN(end) ? 0 : Math.max(0, (end - start) / 86_400_000);
    })
    .filter((days) => days > 0);

  return json({
    success: true,
    clients,
    summary: {
      recurring: [...recurring.entries()].map(([currency, amount]) => ({ currency, amount })),
      activeCount,
      withoutRetainer,
      totalCount: clients.length,
      needAttention: clients.filter((client) => client.health !== 'ok').length,
      averageLifetimeDays: lifetimes.length
        ? Math.round(lifetimes.reduce((sum, days) => sum + days, 0) / lifetimes.length)
        : 0,
    },
  }, { headers: noStore });
}

async function getClient(env: Env, id: number): Promise<Response> {
  const db = env.DB as D1Database;
  const client = await db.prepare('SELECT * FROM clients WHERE id = ?').bind(id).first<ClientRow>();
  if (!client) return json({ success: false, error: 'Клиент не найден' }, { status: 404, headers: noStore });

  const [months, access, notes] = await Promise.all([
    db.prepare('SELECT * FROM client_months WHERE client_id = ? ORDER BY month DESC').bind(id).all(),
    db.prepare('SELECT * FROM client_access WHERE client_id = ? ORDER BY id').bind(id).all(),
    db.prepare('SELECT * FROM client_notes WHERE client_id = ? ORDER BY pinned DESC, created_at DESC').bind(id).all(),
  ]);

  return json({
    success: true,
    client: {
      ...client,
      services: (() => { try { return JSON.parse(client.services); } catch { return []; } })(),
    },
    months: months.results || [],
    access: access.results || [],
    notes: notes.results || [],
  }, { headers: noStore });
}

/** Поля карточки, которые приходят одним объектом при сохранении. */
function clientFields(body: Record<string, unknown>): { columns: string[]; values: unknown[] } {
  const map: Array<[string, unknown]> = [
    ['name', cleanLine(body.name, LIMITS.name)],
    ['company', cleanLine(body.company, LIMITS.company)],
    ['status', cleanStatus(body.status)],
    ['started_at', cleanDate(body.started_at) || new Date().toISOString().slice(0, 10)],
    ['paused_until', cleanDate(body.paused_until)],
    ['finished_at', cleanDate(body.finished_at)],
    ['finish_reason', cleanText(body.finish_reason, LIMITS.text)],
    ['contact_method', cleanLine(body.contact_method, 40)],
    ['contact_value', cleanLine(body.contact_value, LIMITS.contact)],
    ['timezone_offset', (() => {
      const parsed = Number(body.timezone_offset);
      return Number.isFinite(parsed) && Math.abs(parsed) <= 840 ? Math.round(parsed) : null;
    })()],
    ['services', cleanServices(body.services)],
    ['retainer_amount', cleanAmount(body.retainer_amount)],
    ['retainer_currency', cleanCurrency(body.retainer_currency)],
    ['billing_day', (() => {
      const parsed = Number(body.billing_day);
      return Number.isInteger(parsed) && parsed >= 1 && parsed <= 28 ? parsed : null;
    })()],
    ['contract_number', cleanLine(body.contract_number, LIMITS.number)],
    ['contract_signed_at', cleanDate(body.contract_signed_at)],
    ['contract_ends_at', cleanDate(body.contract_ends_at)],
    ['contract_auto_renew', body.contract_auto_renew ? 1 : 0],
    ['contract_file_url', cleanLine(body.contract_file_url, LIMITS.url)],
    ['scope_included', cleanText(body.scope_included, LIMITS.text)],
    ['scope_excluded', cleanText(body.scope_excluded, LIMITS.text)],
    ['next_touch_at', cleanDate(body.next_touch_at)],
    ['next_touch_text', cleanLine(body.next_touch_text, 240)],
    ['media_folder', cleanLine(body.media_folder, 120)],
  ];
  return { columns: map.map(([column]) => column), values: map.map(([, value]) => value) };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;
  if (!verifyAdminPassword(getPassword(request), env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.DB) {
    return json(
      { success: false, localOnly: true, error: 'База D1 не подключена (доступно только на продакшене)' },
      { status: 503, headers: noStore },
    );
  }

  try {
    const params = new URL(request.url).searchParams;
    // Быстрая проверка «а этот лид уже стал клиентом?» — чтобы карточка сделки
    // в CRM не тянула ради этого весь список.
    const leadId = Number(params.get('lead_id') || 0);
    if (leadId > 0) {
      const found = await (env.DB as D1Database)
        .prepare('SELECT id, name FROM clients WHERE lead_id = ?')
        .bind(leadId)
        .first<{ id: number; name: string }>();
      return json({ success: true, client: found || null }, { headers: noStore });
    }
    const id = Number(params.get('id') || 0);
    return id > 0 ? await getClient(env, id) : await listClients(env);
  } catch (error) {
    if (isMissingTableError(error)) return migrationResponse();
    return json(
      { success: false, error: error instanceof Error ? error.message : 'Не удалось загрузить клиентов' },
      { status: 500, headers: noStore },
    );
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  const raw = await readRequestText(request, MAX_BODY_BYTES);
  if (!raw.ok) return json({ success: false, error: 'Слишком большой объём данных' }, { status: 413, headers: noStore });

  let body: Record<string, unknown>;
  try {
    body = raw.text ? JSON.parse(raw.text) : {};
  } catch {
    return json({ success: false, error: 'Некорректный JSON' }, { status: 400, headers: noStore });
  }

  if (!verifyAdminPassword(getPassword(request, body as { password?: string }), env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.DB) return json({ success: false, error: 'База D1 не подключена' }, { status: 503, headers: noStore });

  const db = env.DB;
  const action = String(body.action || '');
  const id = Number(body.id || 0);

  try {
    if (action === 'create') {
      const { columns, values } = clientFields(body);
      const leadId = Number(body.lead_id || 0) || null;
      if (!String(values[0] || '').trim()) {
        return json({ success: false, error: 'Без имени клиента карточка бессмысленна' }, { status: 400, headers: noStore });
      }
      if (leadId) {
        const existing = await db.prepare('SELECT id FROM clients WHERE lead_id = ?').bind(leadId).first<{ id: number }>();
        if (existing) {
          return json({ success: false, error: 'Из этой сделки клиент уже заведён', clientId: existing.id }, { status: 409, headers: noStore });
        }
      }
      const allColumns = ['lead_id', ...columns];
      const result = await db.prepare(
        `INSERT INTO clients (${allColumns.join(', ')}) VALUES (${allColumns.map(() => '?').join(', ')})`,
      ).bind(leadId, ...values).run() as { meta?: { last_row_id?: number } };
      return json({ success: true, id: result.meta?.last_row_id || 0 }, { headers: noStore });
    }

    if (!id) return json({ success: false, error: 'Нужен id клиента' }, { status: 400, headers: noStore });

    if (action === 'update') {
      const { columns, values } = clientFields(body);
      await db.prepare(
        `UPDATE clients SET ${columns.map((column) => `${column} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`,
      ).bind(...values, id).run();
      return json({ success: true }, { headers: noStore });
    }

    if (action === 'set_month') {
      const month = cleanMonth(body.month);
      if (!month) return json({ success: false, error: 'Нужен месяц в виде 2026-08' }, { status: 400, headers: noStore });
      await db.prepare(
        `INSERT INTO client_months (client_id, month, report_sent_at, report_url, spend, spend_currency, leads, sales, revenue, note, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(client_id, month) DO UPDATE SET
           report_sent_at = excluded.report_sent_at,
           report_url = excluded.report_url,
           spend = excluded.spend,
           spend_currency = excluded.spend_currency,
           leads = excluded.leads,
           sales = excluded.sales,
           revenue = excluded.revenue,
           note = excluded.note,
           updated_at = datetime('now')`,
      ).bind(
        id,
        month,
        cleanDate(body.report_sent_at),
        cleanLine(body.report_url, LIMITS.url),
        cleanOptionalNumber(body.spend),
        cleanCurrency(body.spend_currency, ''),
        cleanOptionalNumber(body.leads),
        cleanOptionalNumber(body.sales),
        cleanOptionalNumber(body.revenue),
        cleanText(body.note, LIMITS.text),
      ).run();
      return json({ success: true, month }, { headers: noStore });
    }

    if (action === 'delete_month') {
      const month = cleanMonth(body.month);
      if (!month) return json({ success: false, error: 'Нужен месяц' }, { status: 400, headers: noStore });
      await db.prepare('DELETE FROM client_months WHERE client_id = ? AND month = ?').bind(id, month).run();
      return json({ success: true }, { headers: noStore });
    }

    if (action === 'set_access') {
      const name = cleanLine(body.name, 120);
      if (!name) return json({ success: false, error: 'Нужно название доступа' }, { status: 400, headers: noStore });
      const status = ['granted', 'revoked', 'waiting'].includes(String(body.status)) ? String(body.status) as AccessStatus : 'waiting';
      const accessId = Number(body.access_id || 0);
      if (accessId) {
        await db.prepare(
          `UPDATE client_access SET name = ?, status = ?, note = ?, changed_at = datetime('now')
           WHERE id = ? AND client_id = ?`,
        ).bind(name, status, cleanLine(body.note, 240), accessId, id).run();
      } else {
        await db.prepare('INSERT INTO client_access (client_id, name, status, note) VALUES (?, ?, ?, ?)')
          .bind(id, name, status, cleanLine(body.note, 240)).run();
      }
      return json({ success: true }, { headers: noStore });
    }

    if (action === 'delete_access') {
      const accessId = Number(body.access_id || 0);
      if (!accessId) return json({ success: false, error: 'Нужен id доступа' }, { status: 400, headers: noStore });
      await db.prepare('DELETE FROM client_access WHERE id = ? AND client_id = ?').bind(accessId, id).run();
      return json({ success: true }, { headers: noStore });
    }

    if (action === 'add_note') {
      const noteBody = cleanText(body.body, LIMITS.note);
      if (!noteBody) return json({ success: false, error: 'Пустую памятку сохранять незачем' }, { status: 400, headers: noStore });
      await db.prepare('INSERT INTO client_notes (client_id, body, pinned) VALUES (?, ?, ?)')
        .bind(id, noteBody, body.pinned ? 1 : 0).run();
      return json({ success: true }, { headers: noStore });
    }

    if (action === 'delete_note') {
      const noteId = Number(body.note_id || 0);
      if (!noteId) return json({ success: false, error: 'Нужен id памятки' }, { status: 400, headers: noStore });
      await db.prepare('DELETE FROM client_notes WHERE id = ? AND client_id = ?').bind(noteId, id).run();
      return json({ success: true }, { headers: noStore });
    }

    if (action === 'delete') {
      // Карточка клиента — это история отношений; удаление уносит и её,
      // поэтому оно всегда осознанное действие из интерфейса с подтверждением.
      await db.batch([
        db.prepare('DELETE FROM client_months WHERE client_id = ?').bind(id),
        db.prepare('DELETE FROM client_access WHERE client_id = ?').bind(id),
        db.prepare('DELETE FROM client_notes WHERE client_id = ?').bind(id),
        db.prepare('DELETE FROM clients WHERE id = ?').bind(id),
      ]);
      return json({ success: true }, { headers: noStore });
    }

    return json({ success: false, error: 'Неизвестное действие' }, { status: 400, headers: noStore });
  } catch (error) {
    if (isMissingTableError(error)) return migrationResponse();
    return json(
      { success: false, error: error instanceof Error ? error.message : 'Не удалось сохранить' },
      { status: 500, headers: noStore },
    );
  }
};
