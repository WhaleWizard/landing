import { verifyAdminPassword } from '../../_lib/auth';
import { CACHE_CONTROL } from '../../_lib/cache';
import { json } from '../../_lib/http';
import { getLeadsColumns, hasLeadSoftDelete } from '../../_lib/leads';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };

interface PageRow {
  path: string;
  views: number;
  leads: number;
  conversion: number | null;
}

function number(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function boundedDays(request: Request): number {
  const raw = Number(new URL(request.url).searchParams.get('days') || 90);
  if (!Number.isFinite(raw)) return 90;
  return Math.min(Math.max(Math.floor(raw), 7), 365);
}

async function tableExists(db: D1Database, name: string): Promise<boolean> {
  const row = await db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .bind(name)
    .first<{ name: string }>();
  return Boolean(row?.name);
}

/** Только страницы публикаций: остальные разрезы живут в разделе «Воронка». */
function isPublicationPath(path: string): boolean {
  return /^\/(blog|cases)\/[^/]+\/?$/.test(path);
}

function normalizePath(path: string): string {
  const clean = String(path || '').split('?')[0].split('#')[0];
  return clean.length > 1 && clean.endsWith('/') ? clean.slice(0, -1) : clean;
}

/**
 * Сколько трафика и заявок принесла каждая публикация. Данные для этого уже
 * есть — у заявки хранится страница входа, а у страницы дневные просмотры,
 * но нигде не сводились вместе. Без этой связки нельзя сказать, какой
 * материал окупается, а какой просто занимает место.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;
  if (!verifyAdminPassword(request.headers.get('X-Admin-Password') || '', env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.DB) {
    return json({
      success: false,
      code: 'D1_NOT_BOUND',
      error: 'Статистика публикаций читается из D1 и доступна на production.',
    }, { status: 503, headers: noStore });
  }

  const db = env.DB;
  const days = boundedDays(request);
  const modifier = `-${days - 1} day`;

  try {
    const [hasPageStats, hasLeads] = await Promise.all([
      tableExists(db, 'page_stats_daily'),
      tableExists(db, 'leads'),
    ]);

    const views = new Map<string, number>();
    if (hasPageStats) {
      const rows = await db.prepare(`
        SELECT page_path, SUM(views) AS views
        FROM page_stats_daily
        WHERE day >= date('now', ?)
        GROUP BY page_path
        ORDER BY views DESC
        LIMIT 500
      `).bind(modifier).all<{ page_path: string; views: number }>();
      for (const row of rows.results || []) {
        const path = normalizePath(row.page_path);
        if (isPublicationPath(path)) views.set(path, number(row.views));
      }
    }

    const leads = new Map<string, number>();
    let leadsAvailable = false;
    if (hasLeads) {
      const columns = await getLeadsColumns(db);
      leadsAvailable = columns.has('page_path') && columns.has('created_at');
      if (leadsAvailable) {
        const activeCond = (await hasLeadSoftDelete(db)) ? 'deleted_at IS NULL' : '1=1';
        const timeColumn = columns.has('last_submitted_at') ? 'COALESCE(last_submitted_at, created_at)' : 'created_at';
        const rows = await db.prepare(`
          SELECT page_path, COUNT(*) AS leads
          FROM leads
          WHERE date(${timeColumn}) >= date('now', ?)
            AND TRIM(COALESCE(page_path, '')) != ''
            AND ${activeCond}
          GROUP BY page_path
          LIMIT 500
        `).bind(modifier).all<{ page_path: string; leads: number }>();
        for (const row of rows.results || []) {
          const path = normalizePath(row.page_path);
          if (isPublicationPath(path)) leads.set(path, number(row.leads));
        }
      }
    }

    const paths = new Set([...views.keys(), ...leads.keys()]);
    const pages: PageRow[] = [...paths].map((path) => {
      const pageViews = views.get(path) || 0;
      const pageLeads = leads.get(path) || 0;
      return {
        path,
        views: pageViews,
        leads: pageLeads,
        conversion: pageViews > 0 ? Math.round((pageLeads / pageViews) * 10_000) / 100 : null,
      };
    }).sort((a, b) => b.leads - a.leads || b.views - a.views);

    return json({
      success: true,
      days,
      pages,
      coverage: { pageStats: hasPageStats, leads: leadsAvailable },
      notes: [
        'Заявка засчитывается публикации, если это была страница входа в форму — то есть человек оставил заявку именно с неё.',
        'Просмотры и заявки берутся за один и тот же период, поэтому свежая статья выглядит скромнее старой просто из-за возраста.',
      ],
    }, { headers: noStore });
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Не удалось собрать статистику публикаций',
    }, { status: 500, headers: noStore });
  }
};
