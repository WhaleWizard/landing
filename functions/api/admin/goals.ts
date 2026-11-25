import { readWonPeriod } from '../../_lib/admin-period-facts';
import { verifyAdminPassword } from '../../_lib/auth';
import { CACHE_CONTROL } from '../../_lib/cache';
import { json, readCappedJsonBody } from '../../_lib/http';
import { getLeadsColumns, hasLeadSoftDelete } from '../../_lib/leads';
import { enforceRateLimit } from '../../_lib/rate-limit';
import { ACCOUNTING_CURRENCY, parseMoney } from '../../_lib/money';
import type { Env } from '../../_lib/types';
import { localTodayIso, sqliteLocalModifier, timezoneOffsetFromRequest } from '../../_lib/local-day';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };
const MIGRATION = '0024_admin_goals.sql';
const HISTORY_MONTHS = 12;

interface Goal {
  period: string;
  leads_target: number;
  qualified_target: number;
  revenue_target: number;
  spend_cap: number;
  currency: string;
  note: string;
}

interface PeriodFact {
  leads: number;
  /** null — в базе нет поля качества заявки: целевых не считаем, а не «0» (DA-113). */
  qualified: number | null;
  /** null — в базе нет этапов сделки: выигрыши неизвестны, а не равны нулю. */
  won: number | null;
  revenue: number | null;
  spend: number | null;
}

function isMissingTableError(error: unknown): boolean {
  return /no such table/i.test(error instanceof Error ? error.message : String(error));
}

function number(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/** Период всегда вида YYYY-MM: по нему строятся и цель, и границы месяца. */
function normalizePeriod(value: unknown, fallback: string): string {
  const raw = String(value || '').trim().slice(0, 7);
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : fallback;
}

function monthBounds(period: string): { from: string; to: string; days: number } {
  const [year, month] = period.split('-').map(Number);
  const from = `${period}-01`;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from, to: `${period}-${String(lastDay).padStart(2, '0')}`, days: lastDay };
}

function shiftPeriod(period: string, months: number): string {
  const [year, month] = period.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + months, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function emptyGoal(period: string, currency: string): Goal {
  return {
    period,
    leads_target: 0,
    qualified_target: 0,
    revenue_target: 0,
    spend_cap: 0,
    currency,
    note: '',
  };
}

async function readFact(
  db: D1Database,
  period: string,
  currency: string,
  columns: Set<string>,
  activeCond: string,
  localModifier: string,
  today: string,
): Promise<PeriodFact> {
  const bounds = monthBounds(period);
  const from = bounds.from;
  const to = today < bounds.to ? today : bounds.to;
  const timeColumn = columns.has('last_submitted_at') ? 'COALESCE(last_submitted_at, created_at)' : 'created_at';
  const hasQuality = columns.has('quality');
  const qualified = hasQuality ? "SUM(CASE WHEN quality = 'target' THEN 1 ELSE 0 END)" : 'NULL';

  const row = await db.prepare(`
    SELECT COUNT(*) AS leads, ${qualified} AS qualified
    FROM leads
    WHERE date(${timeColumn}, ?) BETWEEN date(?) AND date(?) AND ${activeCond}
  `).bind(localModifier, from, to).first<{ leads: number; qualified: number | null }>();

  const { won, revenue } = await readWonPeriod(db, columns, activeCond, localModifier, from, to, currency);

  // Ни одной строки расходов за месяц — расходы не заведены, а не равны
  // нулю: ноль рисовал бы «Цену лида 0 USD». Строка с суммой 0, введённая
  // владельцем, остаётся честным нулём.
  let spend: number | null = null;
  try {
    const spendRow = await db.prepare(
      'SELECT COUNT(*) AS n, COALESCE(SUM(amount), 0) AS total FROM ad_spend WHERE day >= date(?) AND day <= date(?) AND currency = ?',
    ).bind(from, to, currency).first<{ n: number; total: number }>();
    spend = number(spendRow?.n) > 0 ? round(number(spendRow?.total)) : null;
  } catch (error) {
    // Расходов может ещё не быть — это не ошибка цели.
    if (!isMissingTableError(error)) throw error;
  }

  return {
    leads: number(row?.leads),
    qualified: hasQuality ? number(row?.qualified) : null,
    won,
    revenue,
    spend,
  };
}

/**
 * Прогноз к концу месяца по текущему темпу. Он честно линейный: делим факт
 * на прошедшие дни и умножаем на длину месяца. Никакой сезонности в данных
 * нет, а выдумывать модель сложнее — значит и точнее она не станет.
 */
function forecast(fact: PeriodFact, period: string, today: string): {
  elapsedDays: number;
  totalDays: number;
  leads: number | null;
  qualified: number | null;
  revenue: number | null;
  spend: number | null;
  isCurrent: boolean;
} {
  const { days } = monthBounds(period);
  const isCurrent = today.slice(0, 7) === period;
  if (!isCurrent) {
    return { elapsedDays: days, totalDays: days, leads: null, qualified: null, revenue: null, spend: null, isCurrent };
  }
  const elapsed = Math.max(1, Number(today.slice(8, 10)));
  const scale = days / elapsed;
  return {
    elapsedDays: elapsed,
    totalDays: days,
    leads: Math.round(fact.leads * scale),
    qualified: fact.qualified === null ? null : Math.round(fact.qualified * scale),
    revenue: fact.revenue === null ? null : round(fact.revenue * scale),
    spend: fact.spend === null ? null : round(fact.spend * scale),
    isCurrent,
  };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;
  if (!verifyAdminPassword(request.headers.get('X-Admin-Password') || '', env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.DB) {
    return json({ success: false, code: 'D1_NOT_BOUND', error: 'Цели хранятся в D1 и доступны на production.' }, { status: 503, headers: noStore });
  }

  const db = env.DB;
  try {
    // Дата берётся по времени владельца: SQL-функция date('now') в SQLite
    // всегда считает по Гринвичу, и с полуночи до пяти утра давала вчера.
    const today = localTodayIso(request);
    const period = normalizePeriod(new URL(request.url).searchParams.get('period'), today.slice(0, 7));

    let goal: Goal | null = null;
    const history: Array<{ period: string; currency: string; goal: Goal | null; fact: PeriodFact }> = [];
    try {
      const row = await db.prepare('SELECT * FROM admin_goals WHERE period = ?').bind(period).first<Goal>();
      goal = row || null;
    } catch (error) {
      if (isMissingTableError(error)) {
        return json({
          success: false,
          code: 'MIGRATION_REQUIRED',
          migration: MIGRATION,
          error: `Примените миграцию ${MIGRATION} — до неё цели негде хранить.`,
        }, { status: 503, headers: noStore });
      }
      throw error;
    }

    const currency = goal?.currency || ACCOUNTING_CURRENCY;
    const columns = await getLeadsColumns(db);
    const activeCond = (await hasLeadSoftDelete(db)) ? 'deleted_at IS NULL' : '1=1';
    const localModifier = sqliteLocalModifier(timezoneOffsetFromRequest(request));

    const fact = await readFact(db, period, currency, columns, activeCond, localModifier, today);

    // История нужна, чтобы видеть не один месяц, а траекторию.
    const periods = Array.from({ length: HISTORY_MONTHS }, (_, index) => shiftPeriod(period, index - (HISTORY_MONTHS - 1)));
    const goalRows = await db.prepare(
      `SELECT * FROM admin_goals WHERE period >= ? AND period <= ? ORDER BY period ASC`,
    ).bind(periods[0], period).all<Goal>();
    const goalsByPeriod = new Map((goalRows.results || []).map((row) => [row.period, row]));

    for (const item of periods) {
      const itemGoal = goalsByPeriod.get(item) || null;
      const itemCurrency = itemGoal?.currency || ACCOUNTING_CURRENCY;
      history.push({
        period: item,
        currency: itemCurrency,
        goal: itemGoal,
        fact: item === period ? fact : await readFact(db, item, itemCurrency, columns, activeCond, localModifier, today),
      });
    }

    return json({
      success: true,
      today,
      period,
      goal: goal || emptyGoal(period, currency),
      hasGoal: Boolean(goal),
      fact,
      forecast: forecast(fact, period, today),
      history,
      notes: [
        'Факт по заявкам считается по дате последней заявки контакта, как и в остальной аналитике.',
        'Выручка и выигранные сделки считаются по дате выигрыша сделки, заявки — по дате заявки. Выручка — суммы выигранных сделок в валюте цели; сделки в других валютах не приводятся к ней, курсов в системе нет.',
        'Фактические поступления учитываются в «Финансах».',
        ...(fact.revenue === null && fact.won ? ['Для итоговой суммы заполните суммы выигранных сделок в валюте цели.'] : []),
        ...(fact.qualified === null ? ['Целевые заявки не считаются: в базе нет поля качества заявки (оценка «целевой/нецелевой» в «Заявках»).'] : []),
        ...(fact.won === null ? ['Выигранные сделки и выручка не считаются: в базе нет этапов сделки CRM.'] : []),
        'Прогноз линейный: текущий темп, умноженный на длину месяца. Он не учитывает сезонность и выходные.',
      ],
    }, { headers: noStore });
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Не удалось загрузить цели',
    }, { status: 500, headers: noStore });
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  const body = await readCappedJsonBody(request) as Record<string, unknown>;
  if (!verifyAdminPassword(request.headers.get('X-Admin-Password') || String(body.password || ''), env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.DB) {
    return json({ success: false, code: 'D1_NOT_BOUND', error: 'Цели хранятся в D1 и доступны на production.' }, { status: 503, headers: noStore });
  }

  const period = normalizePeriod(body.period, '');
  if (!period) {
    return json({ success: false, error: 'Период должен быть в формате ГГГГ-ММ' }, { status: 400, headers: noStore });
  }

  // Разбор общий с расходами, финансами и клиентами. Прежний вариант менял
  // первую запятую на точку и вырезал остальное, поэтому «1,234.56» давал
  // «1.234.56» и превращался в ноль — цель по выручке молча обнулялась.
  // Пустое поле — 0, а значение вне диапазона — ошибка, а не тихий ноль
  // (DA-12): бюджет 1 000 000 001 раньше записывался как 0.
  const fieldLabels: Record<string, string> = {
    leads_target: 'План по заявкам', qualified_target: 'План по целевым', revenue_target: 'План по выручке', spend_cap: 'Потолок расхода',
  };
  const outOfRange: string[] = [];
  const bounded = (field: string, max: number): number => {
    const value = body[field];
    if (value === null || value === undefined || String(value).trim() === '') return 0;
    const parsed = parseMoney(value, max);
    if (parsed === null) outOfRange.push(fieldLabels[field]);
    return parsed ?? 0;
  };
  const targets = [
    Math.round(bounded('leads_target', 1_000_000)),
    Math.round(bounded('qualified_target', 1_000_000)),
    bounded('revenue_target', 1_000_000_000),
    bounded('spend_cap', 1_000_000_000),
  ];
  if (outOfRange.length) {
    return json({ success: false, error: `Проверьте значения: ${outOfRange.join(', ')}. Число не может быть отрицательным или больше допустимого.` }, { status: 400, headers: noStore });
  }
  const note = String(body.note || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  // Новые цели используют учётную валюту. Валюта существующей цели сохраняется при правке.
  const currency = ACCOUNTING_CURRENCY;
  // Время правки — с долями секунды и строго позже прежнего: две записи в
  // одну миллисекунду иначе получили бы одну версию, и вкладка со старым
  // снимком прошла бы проверку (та же ловушка, что FX-03 у статей).
  const now = "strftime('%Y-%m-%d %H:%M:%f', 'now')";
  const stamp = `CASE WHEN ${now} > COALESCE(updated_at, '') THEN ${now} ELSE strftime('%Y-%m-%d %H:%M:%f', updated_at, '+0.001 seconds') END`;

  try {
    // Форма присылает версию, которую видела (DA-12): пустая строка — цели
    // ещё не было, иначе — её updated_at. Вкладка со старым снимком больше
    // не возвращает чужую правку к прежнему значению. Без поля — прежняя
    // запись поверх, для уже открытых старых вкладок.
    if (typeof body.expected_updated_at === 'string') {
      const expected = body.expected_updated_at;
      const result = expected
        ? await env.DB.prepare(`
            UPDATE admin_goals SET leads_target = ?, qualified_target = ?, revenue_target = ?, spend_cap = ?, note = ?, updated_at = ${stamp}
            WHERE period = ? AND updated_at = ?
          `).bind(...targets, note, period, expected).run()
        : await env.DB.prepare(`
            INSERT INTO admin_goals (period, leads_target, qualified_target, revenue_target, spend_cap, currency, note, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ${now})
            ON CONFLICT(period) DO NOTHING
          `).bind(period, ...targets, currency, note).run();
      if (!result.meta?.changes) {
        return json({
          success: false,
          code: 'GOAL_CONFLICT',
          error: 'Цель на этот месяц уже изменили в другой вкладке. Ваши значения остались в форме: обновите данные и сохраните заново.',
        }, { status: 409, headers: noStore });
      }
    } else {
      await env.DB.prepare(`
        INSERT INTO admin_goals (period, leads_target, qualified_target, revenue_target, spend_cap, currency, note)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(period) DO UPDATE SET
          leads_target = excluded.leads_target,
          qualified_target = excluded.qualified_target,
          revenue_target = excluded.revenue_target,
          spend_cap = excluded.spend_cap,
          note = excluded.note,
          updated_at = ${stamp}
      `).bind(period, ...targets, currency, note).run();
    }

    const saved = await env.DB.prepare('SELECT updated_at FROM admin_goals WHERE period = ?').bind(period).first<{ updated_at: string }>();
    return json({ success: true, period, updated_at: saved?.updated_at }, { headers: noStore });
  } catch (error) {
    if (isMissingTableError(error)) {
      return json({
        success: false,
        code: 'MIGRATION_REQUIRED',
        migration: MIGRATION,
        error: `Примените миграцию ${MIGRATION} — до неё цели негде хранить.`,
      }, { status: 503, headers: noStore });
    }
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Не удалось сохранить цель',
    }, { status: 500, headers: noStore });
  }
};
