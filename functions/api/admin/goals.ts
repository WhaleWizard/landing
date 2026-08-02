import { verifyAdminPassword } from '../../_lib/auth';
import { CACHE_CONTROL } from '../../_lib/cache';
import { json } from '../../_lib/http';
import { getLeadsColumns, hasLeadSoftDelete } from '../../_lib/leads';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

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
  qualified: number;
  won: number;
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
): Promise<PeriodFact> {
  const { from, to } = monthBounds(period);
  const timeColumn = columns.has('last_submitted_at') ? 'COALESCE(last_submitted_at, created_at)' : 'created_at';
  const qualified = columns.has('quality') ? "SUM(CASE WHEN quality = 'target' THEN 1 ELSE 0 END)" : '0';
  const won = columns.has('pipeline_stage') ? "SUM(CASE WHEN pipeline_stage = 'won' THEN 1 ELSE 0 END)" : '0';
  const revenue = columns.has('deal_value') && columns.has('deal_currency') && columns.has('pipeline_stage')
    ? `SUM(CASE WHEN pipeline_stage = 'won' AND deal_currency = ? THEN COALESCE(deal_value, 0) ELSE 0 END)`
    : 'NULL';

  const statement = db.prepare(`
    SELECT COUNT(*) AS leads, ${qualified} AS qualified, ${won} AS won, ${revenue} AS revenue
    FROM leads
    WHERE date(${timeColumn}) >= date(?) AND date(${timeColumn}) <= date(?) AND ${activeCond}
  `);
  const row = revenue === 'NULL'
    ? await statement.bind(from, to).first<{ leads: number; qualified: number; won: number; revenue: number | null }>()
    : await statement.bind(currency, from, to).first<{ leads: number; qualified: number; won: number; revenue: number | null }>();

  let spend: number | null = null;
  try {
    const spendRow = await db.prepare(
      'SELECT COALESCE(SUM(amount), 0) AS total FROM ad_spend WHERE day >= date(?) AND day <= date(?) AND currency = ?',
    ).bind(from, to, currency).first<{ total: number }>();
    spend = round(number(spendRow?.total));
  } catch (error) {
    // Расходов может ещё не быть — это не ошибка цели.
    if (!isMissingTableError(error)) throw error;
  }

  return {
    leads: number(row?.leads),
    qualified: number(row?.qualified),
    won: number(row?.won),
    revenue: row?.revenue === null || row?.revenue === undefined ? null : round(number(row.revenue)),
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
    qualified: Math.round(fact.qualified * scale),
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
    const todayRow = await db.prepare("SELECT date('now') AS today").first<{ today: string }>();
    const today = String(todayRow?.today || new Date().toISOString().slice(0, 10));
    const period = normalizePeriod(new URL(request.url).searchParams.get('period'), today.slice(0, 7));

    let goal: Goal | null = null;
    let history: Array<{ period: string; goal: Goal | null; fact: PeriodFact }> = [];
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

    const currency = goal?.currency || 'USD';
    const columns = await getLeadsColumns(db);
    const activeCond = (await hasLeadSoftDelete(db)) ? 'deleted_at IS NULL' : '1=1';

    const fact = await readFact(db, period, currency, columns, activeCond);

    // История нужна, чтобы видеть не один месяц, а траекторию.
    const periods = Array.from({ length: HISTORY_MONTHS }, (_, index) => shiftPeriod(period, index - (HISTORY_MONTHS - 1)));
    const goalRows = await db.prepare(
      `SELECT * FROM admin_goals WHERE period >= ? AND period <= ? ORDER BY period ASC`,
    ).bind(periods[0], period).all<Goal>();
    const goalsByPeriod = new Map((goalRows.results || []).map((row) => [row.period, row]));

    history = [];
    for (const item of periods) {
      history.push({
        period: item,
        goal: goalsByPeriod.get(item) || null,
        fact: await readFact(db, item, goalsByPeriod.get(item)?.currency || currency, columns, activeCond),
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
        'Выручка — суммы выигранных сделок в валюте цели; сделки в других валютах не приводятся к ней, курсов в системе нет.',
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

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
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

  const bounded = (value: unknown, max: number): number => {
    const parsed = Number(String(value ?? '').replace(',', '.').replace(/[^\d.]/g, ''));
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return Math.min(Math.round(parsed * 100) / 100, max);
  };
  const currency = String(body.currency || 'USD').trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    return json({ success: false, error: 'Валюта — три латинские буквы, например USD' }, { status: 400, headers: noStore });
  }

  try {
    await env.DB.prepare(`
      INSERT INTO admin_goals (period, leads_target, qualified_target, revenue_target, spend_cap, currency, note)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(period) DO UPDATE SET
        leads_target = excluded.leads_target,
        qualified_target = excluded.qualified_target,
        revenue_target = excluded.revenue_target,
        spend_cap = excluded.spend_cap,
        currency = excluded.currency,
        note = excluded.note,
        updated_at = datetime('now')
    `).bind(
      period,
      Math.round(bounded(body.leads_target, 1_000_000)),
      Math.round(bounded(body.qualified_target, 1_000_000)),
      bounded(body.revenue_target, 1_000_000_000),
      bounded(body.spend_cap, 1_000_000_000),
      currency,
      String(body.note || '').replace(/\s+/g, ' ').trim().slice(0, 200),
    ).run();

    return json({ success: true, period }, { headers: noStore });
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
