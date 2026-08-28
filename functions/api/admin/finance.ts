import { json, readRequestText } from '../../_lib/http';
import { CACHE_CONTROL } from '../../_lib/cache';
import { verifyAdminPassword } from '../../_lib/auth';
import { enforceRateLimit } from '../../_lib/rate-limit';
import { ACCOUNTING_CURRENCY, parseMoneyOrZero } from '../../_lib/money';
import type { Env } from '../../_lib/types';

/**
 * Финансы: счета, свои расходы, часы по клиентам и настройки.
 *
 * Эндпоинт отдаёт сырые списки за последние 12 месяцев, а сводки считает
 * интерфейс: так переключение периода не требует нового запроса, а у соло-
 * специалиста этих строк десятки, не тысячи.
 *
 * Разные валюты не складываются нигде — курсов в системе нет.
 */

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };
const MIGRATION = '0033_finance.sql';
const MAX_BODY_BYTES = 64 * 1024;
const CONTROL_CHARS = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]', 'g');

function isMissingTableError(error: unknown): boolean {
  return /no such table/i.test(error instanceof Error ? error.message : String(error));
}

function migrationResponse() {
  return json(
    {
      success: false,
      migrationRequired: true,
      migration: MIGRATION,
      error: `Примените миграцию ${MIGRATION} — до неё раздел «Финансы» негде хранить.`,
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

function cleanDate(value: unknown): string | null {
  const text = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  return Number.isNaN(new Date(`${text}T00:00:00Z`).getTime()) ? null : text;
}

function cleanMonth(value: unknown): string {
  const text = String(value ?? '').trim();
  return /^\d{4}-\d{2}$/.test(text) ? text : '';
}

/**
 * Денежная строка в число. «1234.56», «1 234,56», «$1,234.56» — одно и то же.
 *
 * Раньше заменялась только **первая** запятая, поэтому «1,234.56» превращалось
 * в «1.234.56», давало NaN и молча сохранялось как **ноль**. Правило здесь то
 * же, что в `ad-spend.ts` и в поле ввода админки: последний разделитель —
 * десятичный, остальные разрядные.
 */
const cleanAmount = parseMoneyOrZero;

function cleanInvoiceStatus(value: unknown): string {
  const text = String(value ?? '');
  return ['draft', 'issued', 'paid', 'cancelled'].includes(text) ? text : 'draft';
}

/** Первое число месяца, с которого показываем историю: год назад. */
function historyFrom(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), 1)).toISOString().slice(0, 10);
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

  const db = env.DB;
  const since = historyFrom();

  try {
    const [invoices, expenses, times, settings] = await Promise.all([
      db.prepare(
        `SELECT * FROM invoices
         WHERE (issued_at IS NULL OR issued_at >= ?) OR (paid_at IS NOT NULL AND paid_at >= ?)
         ORDER BY COALESCE(issued_at, created_at) DESC, id DESC`,
      ).bind(since, since).all(),
      db.prepare('SELECT * FROM finance_expenses WHERE day >= ? ORDER BY day DESC, id DESC').bind(since).all(),
      db.prepare('SELECT * FROM time_entries WHERE day >= ? ORDER BY day DESC, id DESC').bind(since).all(),
      db.prepare('SELECT * FROM finance_settings WHERE id = 1').first(),
    ]);

    // Список клиентов нужен для подписей и массового выставления счетов.
    let clients: unknown[] = [];
    try {
      const rows = await db.prepare(
        `SELECT id, name, status, retainer_amount, retainer_currency, billing_day
         FROM clients ORDER BY name COLLATE NOCASE`,
      ).all();
      clients = rows.results || [];
    } catch (clientsError) {
      // Раздел «Клиенты» может быть без миграции — финансы работают и без него.
      if (!isMissingTableError(clientsError)) throw clientsError;
    }

    return json({
      success: true,
      invoices: invoices.results || [],
      expenses: expenses.results || [],
      timeEntries: times.results || [],
      clients,
      settings: settings || { tax_rate: 0, target_hourly_rate: 0, main_currency: 'USD', requisites: '' },
      today: new Date().toISOString().slice(0, 10),
    }, { headers: noStore });
  } catch (error) {
    if (isMissingTableError(error)) return migrationResponse();
    return json(
      { success: false, error: error instanceof Error ? error.message : 'Не удалось загрузить финансы' },
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
    if (action === 'save_invoice') {
      const clientId = Number(body.client_id || 0) || null;
      const values = [
        clientId,
        cleanText(body.number, 60),
        cleanMonth(body.period),
        cleanAmount(body.amount),
        ACCOUNTING_CURRENCY,
        cleanDate(body.issued_at),
        cleanDate(body.due_at),
        cleanDate(body.paid_at),
        cleanInvoiceStatus(body.status),
        cleanText(body.note, 500),
      ];
      if (id) {
        await db.prepare(
          `UPDATE invoices SET client_id = ?, number = ?, period = ?, amount = ?, currency = ?,
             issued_at = ?, due_at = ?, paid_at = ?, status = ?, note = ?, updated_at = datetime('now')
           WHERE id = ?`,
        ).bind(...values, id).run();
      } else {
        await db.prepare(
          `INSERT INTO invoices (client_id, number, period, amount, currency, issued_at, due_at, paid_at, status, note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(...values).run();
      }
      return json({ success: true }, { headers: noStore });
    }

    if (action === 'mark_paid') {
      if (!id) return json({ success: false, error: 'Нужен id счёта' }, { status: 400, headers: noStore });
      const paidAt = cleanDate(body.paid_at) || new Date().toISOString().slice(0, 10);
      await db.prepare(
        `UPDATE invoices SET status = 'paid', paid_at = ?, updated_at = datetime('now') WHERE id = ?`,
      ).bind(paidAt, id).run();
      return json({ success: true, paid_at: paidAt }, { headers: noStore });
    }

    if (action === 'delete_invoice') {
      if (!id) return json({ success: false, error: 'Нужен id счёта' }, { status: 400, headers: noStore });
      await db.prepare('DELETE FROM invoices WHERE id = ?').bind(id).run();
      return json({ success: true }, { headers: noStore });
    }

    /**
     * Массовое выставление за месяц: у абонентки счета из месяца в месяц
     * одинаковые. Клиенты, у которых счёт за этот месяц уже есть, молча
     * пропускаются — повторное нажатие не создаёт дублей.
     */
    if (action === 'issue_month') {
      const period = cleanMonth(body.period);
      if (!period) return json({ success: false, error: 'Нужен месяц в виде 2026-08' }, { status: 400, headers: noStore });

      // Берём всех активных, а не только тех, у кого заполнен чек: клиента без
      // чека надо не молча пропустить, а назвать. Иначе кнопка отвечает «у всех
      // уже есть счёт» там, где счёт просто некому было выставить.
      const clients = await db.prepare(
        `SELECT id, retainer_amount, retainer_currency, billing_day FROM clients
         WHERE status = 'active'`,
      ).all<{ id: number; retainer_amount: number; retainer_currency: string; billing_day: number | null }>();

      const existing = await db.prepare('SELECT client_id FROM invoices WHERE period = ?').bind(period).all<{ client_id: number }>();
      const already = new Set((existing.results || []).map((row) => row.client_id));

      const active = clients.results || [];
      const billable = active.filter((client) => Number(client.retainer_amount) > 0);
      const withoutRetainer = active.length - billable.length;
      const alreadyBilled = billable.filter((client) => already.has(client.id)).length;

      const [year, month] = period.split('-').map(Number);
      const statements = billable
        .filter((client) => !already.has(client.id))
        .map((client) => {
          const day = client.billing_day || 1;
          const issued = `${period}-${String(day).padStart(2, '0')}`;
          const due = new Date(Date.UTC(year, month - 1, day + 7)).toISOString().slice(0, 10);
          return db.prepare(
            `INSERT INTO invoices (client_id, period, amount, currency, issued_at, due_at, status)
             VALUES (?, ?, ?, ?, ?, ?, 'issued')`,
          ).bind(client.id, period, client.retainer_amount, client.retainer_currency, issued, due);
        });

      if (statements.length) await db.batch(statements);
      return json({
        success: true,
        created: statements.length,
        skipped: alreadyBilled,
        without_retainer: withoutRetainer,
        active_clients: active.length,
      }, { headers: noStore });
    }

    if (action === 'save_expense') {
      const values = [
        cleanDate(body.day) || new Date().toISOString().slice(0, 10),
        cleanText(body.category, 80),
        cleanAmount(body.amount),
        ACCOUNTING_CURRENCY,
        cleanText(body.note, 300),
      ];
      if (id) {
        await db.prepare('UPDATE finance_expenses SET day = ?, category = ?, amount = ?, currency = ?, note = ? WHERE id = ?')
          .bind(...values, id).run();
      } else {
        await db.prepare('INSERT INTO finance_expenses (day, category, amount, currency, note) VALUES (?, ?, ?, ?, ?)')
          .bind(...values).run();
      }
      return json({ success: true }, { headers: noStore });
    }

    if (action === 'delete_expense') {
      if (!id) return json({ success: false, error: 'Нужен id расхода' }, { status: 400, headers: noStore });
      await db.prepare('DELETE FROM finance_expenses WHERE id = ?').bind(id).run();
      return json({ success: true }, { headers: noStore });
    }

    if (action === 'save_time') {
      const hours = Number(String(body.hours ?? '').replace(',', '.'));
      if (!Number.isFinite(hours) || hours <= 0 || hours > 24) {
        return json({ success: false, error: 'Часы — число от 0 до 24' }, { status: 400, headers: noStore });
      }
      const values = [
        Number(body.client_id || 0) || null,
        cleanDate(body.day) || new Date().toISOString().slice(0, 10),
        Math.round(hours * 100) / 100,
        cleanText(body.note, 300),
      ];
      if (id) {
        await db.prepare('UPDATE time_entries SET client_id = ?, day = ?, hours = ?, note = ? WHERE id = ?')
          .bind(...values, id).run();
      } else {
        await db.prepare('INSERT INTO time_entries (client_id, day, hours, note) VALUES (?, ?, ?, ?)')
          .bind(...values).run();
      }
      return json({ success: true }, { headers: noStore });
    }

    if (action === 'delete_time') {
      if (!id) return json({ success: false, error: 'Нужен id записи' }, { status: 400, headers: noStore });
      await db.prepare('DELETE FROM time_entries WHERE id = ?').bind(id).run();
      return json({ success: true }, { headers: noStore });
    }

    if (action === 'save_settings') {
      const taxRate = Math.max(0, Math.min(100, Number(String(body.tax_rate ?? '').replace(',', '.')) || 0));
      const hourly = cleanAmount(body.target_hourly_rate);
      await db.prepare(
        `INSERT INTO finance_settings (id, tax_rate, target_hourly_rate, main_currency, requisites, updated_at)
         VALUES (1, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET
           tax_rate = excluded.tax_rate,
           target_hourly_rate = excluded.target_hourly_rate,
           main_currency = excluded.main_currency,
           requisites = excluded.requisites,
           updated_at = datetime('now')`,
      ).bind(taxRate, hourly, ACCOUNTING_CURRENCY, cleanText(body.requisites, 2000)).run();
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
