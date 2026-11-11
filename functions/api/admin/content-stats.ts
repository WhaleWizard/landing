import { verifyAdminPassword } from '../../_lib/auth';
import { CACHE_CONTROL } from '../../_lib/cache';
import { json } from '../../_lib/http';
import { getLeadsColumns, hasLeadSoftDelete } from '../../_lib/leads';
import { localTodayIsoFromOffset, sqliteLocalModifier, timezoneOffsetFromRequest } from '../../_lib/local-day';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };

interface PublicationCounts {
  slug: string;
  views: number | null;
  leads: number | null;
  consentedLeads: number | null;
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

/** Slug остаётся прежним при переносе между блогом и кейсами. */
function publicationSlug(path: string): string | undefined {
  return /^\/(?:blog|cases)\/([^/]+)\/?$/.exec(path.split(/[?#]/, 1)[0])?.[1];
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
  const offset = timezoneOffsetFromRequest(request);
  const localToday = localTodayIsoFromOffset(offset);
  const utcToday = localTodayIsoFromOffset(0);
  const localModifier = sqliteLocalModifier(offset);

  try {
    const [hasPageStats, hasLeads] = await Promise.all([
      tableExists(db, 'page_stats_daily'),
      tableExists(db, 'leads'),
    ]);

    const publications = new Map<string, PublicationCounts>();
    const statsFor = (slug: string): PublicationCounts => {
      const stored = publications.get(slug);
      if (stored) return stored;
      const counts = { slug, views: null, leads: null, consentedLeads: null };
      publications.set(slug, counts);
      return counts;
    };

    if (hasPageStats) {
      const rows = await db.prepare(`
        SELECT page_path, SUM(views) AS views
        FROM page_stats_daily
        WHERE day BETWEEN date(?, ?) AND ?
          AND (page_path LIKE '/blog/%' OR page_path LIKE '/cases/%')
        GROUP BY page_path
      `).bind(utcToday, modifier, utcToday).all<{ page_path: string; views: number }>();
      for (const row of rows.results || []) {
        const slug = publicationSlug(row.page_path);
        if (!slug) continue;
        const stats = statsFor(slug);
        stats.views = (stats.views ?? 0) + row.views;
      }
    }

    let leadsAvailable = false;
    let consentAvailable = false;
    if (hasLeads) {
      const columns = await getLeadsColumns(db);
      leadsAvailable = columns.has('page_path') && columns.has('created_at');
      if (leadsAvailable) {
        consentAvailable = columns.has('marketing_consent');
        const activeCond = (await hasLeadSoftDelete(db)) ? 'deleted_at IS NULL' : '1=1';
        const timeColumn = columns.has('last_submitted_at') ? 'COALESCE(last_submitted_at, created_at)' : 'created_at';
        const localWindow = `date(${timeColumn}, ?) BETWEEN date(?, ?) AND ?`;
        const utcWindow = `date(${timeColumn}) BETWEEN date(?, ?) AND ?`;
        const localParams = [localModifier, localToday, modifier, localToday];
        const utcParams = [utcToday, modifier, utcToday];
        const eligible = consentAvailable ? `marketing_consent = 1 AND ${utcWindow}` : '';
        const rows = await db.prepare(`
          SELECT page_path, SUM(CASE WHEN ${localWindow} THEN 1 ELSE 0 END) AS leads,
            ${eligible ? `SUM(CASE WHEN ${eligible} THEN 1 ELSE 0 END)` : 'NULL'} AS consented_leads
          FROM leads
          WHERE (${localWindow}${eligible ? ` OR (${eligible})` : ''})
            AND (page_path LIKE '/blog/%' OR page_path LIKE '/cases/%')
            AND ${activeCond}
          GROUP BY page_path
        `).bind(...localParams, ...(eligible ? utcParams : []), ...localParams, ...(eligible ? utcParams : []))
          .all<{ page_path: string; leads: number; consented_leads: number | null }>();
        for (const row of rows.results || []) {
          const slug = publicationSlug(row.page_path);
          if (!slug) continue;
          const stats = statsFor(slug);
          stats.leads = (stats.leads ?? 0) + row.leads;
          if (row.consented_leads !== null) {
            stats.consentedLeads = (stats.consentedLeads ?? 0) + row.consented_leads;
          }
        }
      }
    }

    const pages = [...publications.values()].map(({ slug, views, leads, consentedLeads }) => ({
      slug,
      views,
      leads: leadsAvailable ? leads ?? 0 : null,
      conversion: consentAvailable && views !== null && views > 0
        ? Math.round(((consentedLeads ?? 0) / views) * 10_000) / 100
        : null,
    })).sort((a, b) => (b.leads ?? -1) - (a.leads ?? -1) || (b.views ?? -1) - (a.views ?? -1));

    return json({
      success: true,
      days,
      pages,
      coverage: { pageStats: hasPageStats, leads: leadsAvailable, consent: consentAvailable },
      notes: [
        'Все заявки считаются по местным датам. Конверсия сравнивает просмотры и заявки с согласием на маркетинговые cookie за одинаковые дни UTC.',
        'У недавно вышедших материалов было меньше времени собрать просмотры и заявки за выбранный период.',
      ],
    }, { headers: noStore });
  } catch (error) {
    return json({
      success: false,
      error: error instanceof Error ? error.message : 'Не удалось собрать статистику публикаций',
    }, { status: 500, headers: noStore });
  }
};
