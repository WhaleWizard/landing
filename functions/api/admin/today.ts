import { verifyAdminPassword } from '../../_lib/auth';
import { CACHE_CONTROL } from '../../_lib/cache';
import { json } from '../../_lib/http';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };

type AttentionLevel = 'critical' | 'attention' | 'info';

type Destination = 'leads' | 'articles' | 'health' | 'meta' | 'content' | 'planner' | 'attribution';

type TodayItem = {
  id: string;
  title: string;
  detail: string;
  count: number;
  level: AttentionLevel;
  destination: Destination;
};

/** Конкретное дело с именем и сроком, а не просто счётчик. */
type FocusItem = {
  id: string;
  kind: 'lead_overdue' | 'lead_new' | 'task_overdue' | 'task_today' | 'planner_task';
  title: string;
  subtitle: string;
  when: string | null;
  destination: Destination;
};

const FOCUS_LIMIT_PER_KIND = 5;

function leadTitle(row: { name?: string; email?: string; phone?: string; telegram_username?: string }): string {
  const name = String(row.name || '').trim();
  if (name) return name;
  const contact = String(row.email || row.phone || row.telegram_username || '').trim();
  return contact || 'Без имени';
}

interface PlannerTask {
  id: string;
  text: string;
  done: boolean;
}

/**
 * План на сегодня. Неделя хранится одним JSON, поэтому строка читается
 * целиком, а нужный день достаётся в коде. Возвращаются все задачи дня,
 * а не только невыполненные: экран «Сегодня» показывает их списком с
 * отметками, а не просто счётчиком.
 */
async function plannerToday(db: D1Database): Promise<{
  tasks: PlannerTask[];
  done: number;
  total: number;
  weekStart: string;
  dayIndex: number;
} | null> {
  const now = new Date();
  // В планере неделя начинается с понедельника, а getUTCDay() — с воскресенья.
  const weekdayIndex = (now.getUTCDay() + 6) % 7;
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - weekdayIndex));
  const weekStart = monday.toISOString().slice(0, 10);

  const row = await db.prepare('SELECT data_json FROM planner_weeks WHERE week_start = ?')
    .bind(weekStart)
    .first<{ data_json: string }>();

  // Недели ещё нет — это не ошибка: план на сегодня просто пустой, и его
  // можно завести прямо с этого экрана.
  const empty = { tasks: [] as PlannerTask[], done: 0, total: 0, weekStart, dayIndex: weekdayIndex };
  if (!row?.data_json) return empty;

  let parsed: { days?: Array<{ tasks?: Array<{ id?: string; text?: string; done?: boolean }> }> };
  try {
    parsed = JSON.parse(row.data_json);
  } catch {
    return empty;
  }

  const tasks = (parsed.days?.[weekdayIndex]?.tasks || [])
    .filter((task) => String(task?.text || '').trim())
    .slice(0, 30)
    .map((task, index) => ({
      id: String(task?.id || `task-${index}`),
      text: String(task?.text || '').slice(0, 300),
      done: Boolean(task?.done),
    }));

  return {
    tasks,
    done: tasks.filter((task) => task.done).length,
    total: tasks.length,
    weekStart,
    dayIndex: weekdayIndex,
  };
}

async function tableExists(db: D1Database, table: string): Promise<boolean> {
  const row = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .bind(table)
    .first<{ name: string }>();
  return Boolean(row?.name);
}

async function columnExists(db: D1Database, table: string, column: string): Promise<boolean> {
  const rows = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return (rows.results || []).some((row) => row.name === column);
}

function pushItem(items: TodayItem[], item: TodayItem): void {
  if (item.count > 0) items.push(item);
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
      error: 'База D1 не подключена. Экран «Сегодня» получает рабочие данные только в Cloudflare.',
      localOnly: true,
    }, { status: 503, headers: noStore });
  }

  try {
    const db = env.DB;
    const items: TodayItem[] = [];
    const focus: FocusItem[] = [];
    const hasLeads = await tableExists(db, 'leads');
    const hasArticles = await tableExists(db, 'articles');
    const hasOutbox = await tableExists(db, 'meta_outbox');
    const hasSections = await tableExists(db, 'site_sections');
    const hasTasks = await tableExists(db, 'crm_tasks');
    const hasPlanner = await tableExists(db, 'planner_weeks');

    let newLeads = 0;
    let overdueActions = 0;
    let telegramMissing = 0;
    let drafts = 0;
    let planned = 0;
    let outboxPending = 0;
    let outboxRetry = 0;
    let outboxDead = 0;
    let contentDrafts = 0;

    if (hasLeads) {
      const [hasPipelineStage, hasNextAction, hasLastSubmittedAt, hasStatus, hasTelegramDelivered, hasCreatedAt, hasSoftDelete, hasNextActionText] = await Promise.all([
        columnExists(db, 'leads', 'pipeline_stage'),
        columnExists(db, 'leads', 'next_action_at'),
        columnExists(db, 'leads', 'last_submitted_at'),
        columnExists(db, 'leads', 'status'),
        columnExists(db, 'leads', 'telegram_delivered'),
        columnExists(db, 'leads', 'created_at'),
        columnExists(db, 'leads', 'deleted_at'),
        columnExists(db, 'leads', 'next_action_text'),
      ]);
      // Заявки в корзине (миграция 0020) не попадают в сводку дня.
      const activeCond = hasSoftDelete ? 'deleted_at IS NULL' : '1=1';
      const newLeadPredicate = hasPipelineStage
        ? "COALESCE(pipeline_stage, 'new') = 'new'"
        : hasStatus ? "status = 'new'" : '0';
      const leadTime = hasLastSubmittedAt && hasCreatedAt
        ? 'COALESCE(last_submitted_at, created_at)'
        : hasCreatedAt ? 'created_at' : 'NULL';
      const missingTelegramPredicate = hasTelegramDelivered && hasCreatedAt
        ? `telegram_delivered=0 AND datetime(${leadTime}) >= datetime('now', '-7 day')`
        : '0';
      const leadSummary = await db.prepare(
        `SELECT
           SUM(CASE WHEN ${newLeadPredicate} THEN 1 ELSE 0 END) AS fresh,
           SUM(CASE WHEN ${missingTelegramPredicate} THEN 1 ELSE 0 END) AS telegram_missing
         FROM leads WHERE ${activeCond}`,
      ).first<{ fresh: number; telegram_missing: number }>();
      newLeads = Number(leadSummary?.fresh || 0);
      telegramMissing = Number(leadSummary?.telegram_missing || 0);

      if (hasNextAction) {
        const terminalFilter = hasPipelineStage
          ? "AND COALESCE(pipeline_stage, '') NOT IN ('won', 'lost', 'archived')"
          : '';
        const overdue = await db.prepare(
          `SELECT COUNT(*) AS count FROM leads
           WHERE next_action_at IS NOT NULL
             AND next_action_at != ''
             AND datetime(next_action_at) < datetime('now')
             AND ${activeCond}
             ${terminalFilter}`,
        ).first<{ count: number }>();
        overdueActions = Number(overdue?.count || 0);
      }

      // Имена и сроки вместо голых счётчиков: по такому списку сразу видно,
      // кому именно писать, и не нужно открывать CRM ради выяснения.
      if (hasNextAction) {
        const terminalFilter = hasPipelineStage
          ? "AND COALESCE(pipeline_stage, '') NOT IN ('won', 'lost', 'archived')"
          : '';
        const rows = await db.prepare(
          `SELECT id, name, email, phone, telegram_username, service, next_action_at
             ${hasNextActionText ? ', next_action_text' : ''}
           FROM leads
           WHERE next_action_at IS NOT NULL AND next_action_at != ''
             AND datetime(next_action_at) < datetime('now')
             AND ${activeCond} ${terminalFilter}
           ORDER BY datetime(next_action_at) ASC LIMIT ${FOCUS_LIMIT_PER_KIND}`,
        ).all<{
          id: number; name: string; email: string; phone: string; telegram_username: string;
          service: string; next_action_at: string; next_action_text?: string;
        }>();
        for (const row of rows.results || []) {
          focus.push({
            id: `lead-overdue-${row.id}`,
            kind: 'lead_overdue',
            title: leadTitle(row),
            subtitle: String(row.next_action_text || '').trim() || row.service || 'Следующий шаг просрочен',
            when: row.next_action_at,
            destination: 'leads',
          });
        }
      }

      if (hasCreatedAt) {
        const rows = await db.prepare(
          `SELECT id, name, email, phone, telegram_username, service, ${leadTime} AS at
           FROM leads
           WHERE ${newLeadPredicate} AND ${activeCond}
           ORDER BY datetime(${leadTime}) DESC LIMIT ${FOCUS_LIMIT_PER_KIND}`,
        ).all<{ id: number; name: string; email: string; phone: string; telegram_username: string; service: string; at: string }>();
        for (const row of rows.results || []) {
          focus.push({
            id: `lead-new-${row.id}`,
            kind: 'lead_new',
            title: leadTitle(row),
            subtitle: row.service ? `Новая заявка · ${row.service}` : 'Новая заявка',
            when: row.at,
            destination: 'leads',
          });
        }
      }

      pushItem(items, {
        id: 'new-leads',
        title: 'Новые заявки ждут ответа',
        detail: 'Откройте очередь и зафиксируйте следующий шаг по каждой заявке.',
        count: newLeads,
        level: newLeads >= 5 ? 'critical' : 'attention',
        destination: 'leads',
      });
      pushItem(items, {
        id: 'overdue-actions',
        title: 'Просрочены следующие действия',
        detail: 'Контакты, которым уже пора написать или позвонить.',
        count: overdueActions,
        level: 'critical',
        destination: 'leads',
      });
      pushItem(items, {
        id: 'telegram-missing',
        title: 'Нет подтверждения Telegram',
        detail: 'Проверьте доставку уведомлений по заявкам за последние 7 дней.',
        count: telegramMissing,
        level: 'attention',
        destination: 'health',
      });
    }

    if (hasArticles) {
      const hasStatus = await columnExists(db, 'articles', 'status');
      const hasPublishedAt = await columnExists(db, 'articles', 'published_at');
      if (hasStatus) {
        const row = await db.prepare("SELECT COUNT(*) AS count FROM articles WHERE status='draft'")
          .first<{ count: number }>();
        drafts = Number(row?.count || 0);
      }
      if (hasPublishedAt) {
        const row = await db.prepare(
          "SELECT COUNT(*) AS count FROM articles WHERE published_at IS NOT NULL AND datetime(published_at) > datetime('now')",
        ).first<{ count: number }>();
        planned = Number(row?.count || 0);
      }
      pushItem(items, {
        id: 'content-drafts',
        title: 'Черновики контента',
        detail: 'Материалы сохранены, но ещё не опубликованы.',
        count: drafts,
        level: 'info',
        destination: 'articles',
      });
      pushItem(items, {
        id: 'scheduled-content',
        title: 'Публикации запланированы',
        detail: 'Проверьте дату и финальный вид материалов до автоматической публикации.',
        count: planned,
        level: 'info',
        destination: 'articles',
      });
    }

    if (hasOutbox && await columnExists(db, 'meta_outbox', 'status')) {
      const outbox = await db.prepare(
        `SELECT
           SUM(CASE WHEN status='pending' THEN 1 ELSE 0 END) AS pending,
           SUM(CASE WHEN status='retry' THEN 1 ELSE 0 END) AS retry,
           SUM(CASE WHEN status='dead_letter' THEN 1 ELSE 0 END) AS dead
         FROM meta_outbox`,
      ).first<{ pending: number; retry: number; dead: number }>();
      outboxPending = Number(outbox?.pending || 0);
      outboxRetry = Number(outbox?.retry || 0);
      outboxDead = Number(outbox?.dead || 0);

      pushItem(items, {
        id: 'outbox-retry',
        title: 'Meta-события ожидают повтора',
        detail: 'События сохранены в очереди и будут отправлены повторно.',
        count: outboxPending + outboxRetry,
        level: outboxRetry > 0 ? 'attention' : 'info',
        destination: 'meta',
      });
      pushItem(items, {
        id: 'outbox-dead',
        title: 'Meta-события остановлены',
        detail: 'Исчерпаны попытки или Meta вернула постоянную ошибку — нужна диагностика.',
        count: outboxDead,
        level: 'critical',
        destination: 'meta',
      });
    }

    if (hasSections && await columnExists(db, 'site_sections', 'status')) {
      const row = await db.prepare("SELECT COUNT(*) AS count FROM site_sections WHERE status='draft'")
        .first<{ count: number }>();
      contentDrafts = Number(row?.count || 0);
      pushItem(items, {
        id: 'site-copy-drafts',
        title: 'Изменения сайта не опубликованы',
        detail: 'Проверьте тексты в desktop/mobile preview и опубликуйте готовые версии.',
        count: contentDrafts,
        level: 'info',
        destination: 'content',
      });
    }

    let tasksOpen = 0;
    let tasksOverdue = 0;
    let tasksToday = 0;
    if (hasTasks && hasLeads) {
      const activeCond = (await columnExists(db, 'leads', 'deleted_at')) ? 'l.deleted_at IS NULL' : '1=1';
      const counters = await db.prepare(
        `SELECT
           SUM(CASE WHEN t.status = 'open' THEN 1 ELSE 0 END) AS open,
           SUM(CASE WHEN t.status = 'open' AND t.due_at IS NOT NULL AND datetime(t.due_at) < datetime('now') THEN 1 ELSE 0 END) AS overdue,
           SUM(CASE WHEN t.status = 'open' AND t.due_at IS NOT NULL AND date(t.due_at) = date('now') THEN 1 ELSE 0 END) AS today
         FROM crm_tasks t INNER JOIN leads l ON l.id = t.lead_id
         WHERE ${activeCond}`,
      ).first<{ open: number; overdue: number; today: number }>();
      tasksOpen = Number(counters?.open || 0);
      tasksOverdue = Number(counters?.overdue || 0);
      tasksToday = Number(counters?.today || 0);

      const rows = await db.prepare(
        `SELECT t.id, t.title, t.due_at, l.name, l.email, l.phone, l.telegram_username
         FROM crm_tasks t INNER JOIN leads l ON l.id = t.lead_id
         WHERE t.status = 'open' AND t.due_at IS NOT NULL
           AND date(t.due_at) <= date('now') AND ${activeCond}
         ORDER BY datetime(t.due_at) ASC LIMIT ${FOCUS_LIMIT_PER_KIND * 2}`,
      ).all<{ id: number; title: string; due_at: string; name: string; email: string; phone: string; telegram_username: string }>();
      for (const row of rows.results || []) {
        const overdue = new Date(row.due_at).getTime() < Date.now();
        focus.push({
          id: `task-${row.id}`,
          kind: overdue ? 'task_overdue' : 'task_today',
          title: String(row.title || 'Задача').slice(0, 200),
          subtitle: `Задача по сделке · ${leadTitle(row)}`,
          when: row.due_at,
          destination: 'leads',
        });
      }

      pushItem(items, {
        id: 'crm-tasks-overdue',
        title: 'Просроченные задачи',
        detail: 'Задачи по сделкам, срок которых уже прошёл.',
        count: tasksOverdue,
        level: 'critical',
        destination: 'leads',
      });
    }

    // План на сегодня показывается отдельным списком с отметками, поэтому
    // в «Фокус дня» он больше не дублируется.
    const planner = hasPlanner ? await plannerToday(db) : null;

    const priority = { critical: 0, attention: 1, info: 2 } as const;
    items.sort((a, b) => priority[a.level] - priority[b.level] || b.count - a.count);

    // Порядок фокуса: сначала то, что уже горит, потом сегодняшнее, потом новое.
    const focusRank = { lead_overdue: 0, task_overdue: 1, task_today: 2, lead_new: 3, planner_task: 4 } as const;
    focus.sort((a, b) => focusRank[a.kind] - focusRank[b.kind]
      || (a.when || '').localeCompare(b.when || ''));

    return json({
      success: true,
      generatedAt: new Date().toISOString(),
      items,
      focus,
      planner,
      health: {
        outboxPending,
        outboxRetry,
        outboxDead,
        telegramMissing,
      },
      summary: {
        tasksOpen,
        tasksOverdue,
        tasksToday,
        newLeads,
        overdueActions,
        telegramMissing,
        drafts,
        planned,
        outboxPending,
        outboxRetry,
        outboxDead,
        contentDrafts,
      },
    }, { headers: noStore });
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Не удалось собрать рабочую сводку',
    }, { status: 500, headers: noStore });
  }
};
