import { verifyAdminPassword } from '../../_lib/auth';
import { CACHE_CONTROL } from '../../_lib/cache';
import {
  ADMIN_CRM_STAGES,
  adminCrmMigrationResponse,
  assertAdminCrmSchema,
  isAdminCrmMigrationError,
} from '../../_lib/admin-crm';
import { json } from '../../_lib/http';
import { getLeadsColumns, hasLeadSoftDelete } from '../../_lib/leads';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };
/** Сделка без движения дольше этого срока считается «подвисшей». */
const STALE_DAYS = 14;
const OPEN_STAGES = "('new','contacted','discovery','proposal')";

function number(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * Валюта отчёта — та, в которой заведено больше всего сделок. Разные валюты
 * не складываются: курсов в системе нет, а «примерно» здесь недопустимо.
 */
async function detectCurrency(db: D1Database, activeCond: string): Promise<{ currency: string; others: string[] }> {
  const rows = await db.prepare(`
    SELECT deal_currency AS currency, COUNT(*) AS deals
    FROM leads
    WHERE ${activeCond} AND deal_value IS NOT NULL AND deal_value > 0
    GROUP BY deal_currency ORDER BY deals DESC LIMIT 10
  `).all<{ currency: string; deals: number }>();
  const list = (rows.results || []).map((row) => String(row.currency || 'USD'));
  return { currency: list[0] || 'USD', others: list.slice(1) };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;
  if (!verifyAdminPassword(request.headers.get('X-Admin-Password') || '', env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.DB) {
    return json({ success: false, code: 'D1_NOT_CONFIGURED', error: 'CRM-аналитика читается из D1 и доступна на production.' }, { status: 503, headers: noStore });
  }

  const db = env.DB;
  try {
    await assertAdminCrmSchema(db, 'workspace');
    const columns = await getLeadsColumns(db);
    const activeCond = (await hasLeadSoftDelete(db)) ? 'deleted_at IS NULL' : '1=1';
    const { currency, others } = await detectCurrency(db, activeCond);
    const hasClosedAt = columns.has('closed_at');
    const hasFirstResponse = columns.has('first_response_at');
    const hasPipelineChangedAt = columns.has('pipeline_changed_at');

    const [stageRows, health, tasks, cycle, revenueRows, lossRows, sourceRows, responseRow, qualityRows] = await Promise.all([
      db.prepare(`
        SELECT pipeline_stage,
          COUNT(*) AS count,
          SUM(CASE WHEN deal_currency = ? THEN COALESCE(deal_value, 0) ELSE 0 END) AS value,
          SUM(CASE WHEN deal_value IS NOT NULL AND deal_value > 0 AND deal_currency != ? THEN 1 ELSE 0 END) AS other_currency
        FROM leads WHERE ${activeCond}
        GROUP BY pipeline_stage
      `).bind(currency, currency).all<{ pipeline_stage: string; count: number; value: number; other_currency: number }>(),

      db.prepare(`
        SELECT
          SUM(CASE WHEN next_action_at IS NOT NULL AND datetime(next_action_at) < datetime('now') THEN 1 ELSE 0 END) AS overdue,
          SUM(CASE WHEN next_action_at IS NOT NULL AND date(next_action_at) = date('now') THEN 1 ELSE 0 END) AS today,
          SUM(CASE WHEN next_action_at IS NULL AND pipeline_stage IN ${OPEN_STAGES} THEN 1 ELSE 0 END) AS without_next_action,
          ${hasPipelineChangedAt
            ? `SUM(CASE WHEN pipeline_stage IN ${OPEN_STAGES} AND pipeline_changed_at IS NOT NULL AND datetime(pipeline_changed_at) < datetime('now', '-${STALE_DAYS} day') THEN 1 ELSE 0 END)`
            : 'NULL'} AS stale,
          SUM(CASE WHEN pipeline_stage IN ${OPEN_STAGES} THEN 1 ELSE 0 END) AS open_deals
        FROM leads WHERE ${activeCond}
      `).first<{ overdue: number; today: number; without_next_action: number; stale: number | null; open_deals: number }>(),

      db.prepare(`
        SELECT
          SUM(CASE WHEN t.status = 'open' THEN 1 ELSE 0 END) AS open,
          SUM(CASE WHEN t.status = 'open' AND t.due_at IS NOT NULL AND datetime(t.due_at) < datetime('now') THEN 1 ELSE 0 END) AS overdue,
          SUM(CASE WHEN t.status = 'completed' AND date(t.completed_at) >= date('now', '-30 day') THEN 1 ELSE 0 END) AS completed_30d
        FROM crm_tasks t INNER JOIN leads l ON l.id = t.lead_id
        WHERE ${activeCond.replace(/deleted_at/g, 'l.deleted_at')}
      `).first<{ open: number; overdue: number; completed_30d: number }>(),

      hasClosedAt
        ? db.prepare(`
            SELECT
              AVG(julianday(closed_at) - julianday(created_at)) AS avg_days,
              COUNT(*) AS deals
            FROM leads
            WHERE ${activeCond} AND pipeline_stage = 'won' AND closed_at IS NOT NULL
          `).first<{ avg_days: number | null; deals: number }>()
        : Promise.resolve(null),

      db.prepare(`
        SELECT strftime('%Y-%m', ${hasClosedAt ? "COALESCE(closed_at, updated_at)" : 'updated_at'}) AS month,
          COUNT(*) AS deals,
          SUM(CASE WHEN deal_currency = ? THEN COALESCE(deal_value, 0) ELSE 0 END) AS value
        FROM leads
        WHERE ${activeCond} AND pipeline_stage = 'won'
          AND ${hasClosedAt ? "COALESCE(closed_at, updated_at)" : 'updated_at'} >= date('now', '-11 months', 'start of month')
        GROUP BY month ORDER BY month ASC
      `).bind(currency).all<{ month: string; deals: number; value: number }>(),

      db.prepare(`
        SELECT TRIM(loss_reason) AS reason, COUNT(*) AS count
        FROM leads
        WHERE ${activeCond} AND pipeline_stage = 'lost' AND TRIM(COALESCE(loss_reason, '')) != ''
        GROUP BY reason ORDER BY count DESC LIMIT 8
      `).all<{ reason: string; count: number }>(),

      db.prepare(`
        SELECT
          CASE WHEN TRIM(COALESCE(${columns.has('utm_source') ? 'utm_source' : "''"}, '')) = ''
            THEN COALESCE(NULLIF(TRIM(service), ''), 'Без источника')
            ELSE LOWER(TRIM(${columns.has('utm_source') ? 'utm_source' : "''"})) END AS source,
          COUNT(*) AS deals,
          SUM(CASE WHEN deal_currency = ? THEN COALESCE(deal_value, 0) ELSE 0 END) AS value
        FROM leads
        WHERE ${activeCond} AND pipeline_stage = 'won'
        GROUP BY source ORDER BY value DESC, deals DESC LIMIT 8
      `).bind(currency).all<{ source: string; deals: number; value: number }>(),

      hasFirstResponse
        ? db.prepare(`
            SELECT
              AVG((julianday(first_response_at) - julianday(created_at)) * 24 * 60) AS avg_minutes,
              COUNT(*) AS answered
            FROM leads
            WHERE ${activeCond} AND first_response_at IS NOT NULL
          `).first<{ avg_minutes: number | null; answered: number }>()
        : Promise.resolve(null),

      columns.has('quality')
        ? db.prepare(`
            SELECT
              SUM(CASE WHEN quality = 'target' THEN 1 ELSE 0 END) AS target,
              SUM(CASE WHEN quality = 'nontarget' THEN 1 ELSE 0 END) AS nontarget,
              SUM(CASE WHEN COALESCE(quality, '') = '' THEN 1 ELSE 0 END) AS unrated
            FROM leads WHERE ${activeCond}
          `).first<{ target: number; nontarget: number; unrated: number }>()
        : Promise.resolve(null),
    ]);

    const stageMap = new Map((stageRows.results || []).map((row) => [String(row.pipeline_stage), row]));
    const stages = ADMIN_CRM_STAGES.map((stage) => {
      const row = stageMap.get(stage);
      return {
        stage,
        count: number(row?.count),
        value: round(number(row?.value)),
        otherCurrencyDeals: number(row?.other_currency),
      };
    });

    const totalLeads = stages.reduce((sum, stage) => sum + stage.count, 0);
    const wonCount = stages.find((stage) => stage.stage === 'won')?.count || 0;
    const lostCount = stages.find((stage) => stage.stage === 'lost')?.count || 0;
    const closedCount = wonCount + lostCount;

    return json({
      success: true,
      checkedAt: new Date().toISOString(),
      currency,
      otherCurrencies: others,
      stages,
      totals: {
        leads: totalLeads,
        open: number(health?.open_deals),
        won: wonCount,
        lost: lostCount,
        // Доля выигранных среди закрытых — единственная честная «конверсия»
        // без журнала переходов: открытые сделки исход ещё не определили.
        winRate: closedCount > 0 ? round((wonCount / closedCount) * 100, 1) : null,
        openValue: stages
          .filter((stage) => ['new', 'contacted', 'discovery', 'proposal'].includes(stage.stage))
          .reduce((sum, stage) => sum + stage.value, 0),
        wonValue: stages.find((stage) => stage.stage === 'won')?.value || 0,
        averageDeal: wonCount > 0 ? round((stages.find((stage) => stage.stage === 'won')?.value || 0) / wonCount) : null,
      },
      health: {
        overdue: number(health?.overdue),
        today: number(health?.today),
        withoutNextAction: number(health?.without_next_action),
        stale: health?.stale === null || health?.stale === undefined ? null : number(health.stale),
        staleDays: STALE_DAYS,
      },
      tasks: {
        open: number(tasks?.open),
        overdue: number(tasks?.overdue),
        completed30d: number(tasks?.completed_30d),
      },
      firstResponse: responseRow
        ? {
            averageMinutes: responseRow.avg_minutes === null || responseRow.avg_minutes === undefined
              ? null
              : round(number(responseRow.avg_minutes), 1),
            answered: number(responseRow.answered),
            available: true,
          }
        : { averageMinutes: null, answered: 0, available: false },
      cycle: {
        averageDays: cycle?.avg_days === null || cycle?.avg_days === undefined ? null : round(number(cycle.avg_days), 1),
        deals: number(cycle?.deals),
        available: Boolean(hasClosedAt),
      },
      quality: qualityRows
        ? { target: number(qualityRows.target), nontarget: number(qualityRows.nontarget), unrated: number(qualityRows.unrated) }
        : null,
      revenueByMonth: (revenueRows.results || []).map((row) => ({
        month: String(row.month),
        deals: number(row.deals),
        value: round(number(row.value)),
      })),
      lossReasons: (lossRows.results || []).map((row) => ({ reason: String(row.reason), count: number(row.count) })),
      wonBySource: (sourceRows.results || []).map((row) => ({
        source: String(row.source || 'Без источника'),
        deals: number(row.deals),
        value: round(number(row.value)),
      })),
      notes: [
        `Деньги показаны в ${currency}. Сделки в других валютах не приводятся к ней — курсов в системе нет.`,
        'Этапы — текущее состояние сделок, а не число переходов за период.',
        hasClosedAt
          ? `Цикл сделки — среднее число дней от заявки до закрытия среди выигранных (${number(cycle?.deals)} шт.).`
          : 'Цикл сделки не считается: в схеме нет даты закрытия.',
        hasFirstResponse
          ? 'Время первого ответа фиксируется один раз — при первом касании; повторные касания его не улучшают.'
          : 'Время первого ответа не считается: нужна миграция 0025.',
        ...(others.length ? [`Также встречаются валюты: ${others.join(', ')}.`] : []),
      ],
    }, { headers: noStore });
  } catch (error) {
    if (isAdminCrmMigrationError(error)) {
      return json(adminCrmMigrationResponse(error as never), { status: 503, headers: noStore });
    }
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Не удалось собрать CRM-аналитику',
    }, { status: 500, headers: noStore });
  }
};
