import { verifyAdminPassword } from '../../_lib/auth';
import { CACHE_CONTROL } from '../../_lib/cache';
import { json } from '../../_lib/http';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };

type AttentionLevel = 'critical' | 'attention' | 'info';

type TodayItem = {
  id: string;
  title: string;
  detail: string;
  count: number;
  level: AttentionLevel;
  destination: 'leads' | 'articles' | 'health' | 'meta' | 'content';
};

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
    const hasLeads = await tableExists(db, 'leads');
    const hasArticles = await tableExists(db, 'articles');
    const hasOutbox = await tableExists(db, 'meta_outbox');
    const hasSections = await tableExists(db, 'site_sections');

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
      const [hasPipelineStage, hasNextAction, hasLastSubmittedAt, hasStatus, hasTelegramDelivered, hasCreatedAt] = await Promise.all([
        columnExists(db, 'leads', 'pipeline_stage'),
        columnExists(db, 'leads', 'next_action_at'),
        columnExists(db, 'leads', 'last_submitted_at'),
        columnExists(db, 'leads', 'status'),
        columnExists(db, 'leads', 'telegram_delivered'),
        columnExists(db, 'leads', 'created_at'),
      ]);
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
         FROM leads`,
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
             ${terminalFilter}`,
        ).first<{ count: number }>();
        overdueActions = Number(overdue?.count || 0);
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

    const priority = { critical: 0, attention: 1, info: 2 } as const;
    items.sort((a, b) => priority[a.level] - priority[b.level] || b.count - a.count);

    return json({
      success: true,
      generatedAt: new Date().toISOString(),
      items,
      summary: {
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
