import { json } from '../../_lib/http';
import { CACHE_CONTROL } from '../../_lib/cache';
import { verifyAdminPassword } from '../../_lib/auth';
import { enforceRateLimit } from '../../_lib/rate-limit';
import { sendLeadQualityEvent, type LeadQualityResult, type LeadQualityRow } from '../../_lib/lead-quality';
import type { MetaOutboxEventState } from '../../_lib/meta-outbox';
import type { Env } from '../../_lib/types';

const LEAD_STATUSES = new Set(['new', 'in_progress', 'closed']);
const PIPELINE_BY_LEGACY_STATUS = {
  new: 'new',
  in_progress: 'contacted',
  closed: 'archived',
} as const;
const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };

function getPassword(request: Request, body?: { password?: string }): string {
  return request.headers.get('X-Admin-Password') || body?.password || '';
}

function isMissingTableError(error: unknown): boolean {
  return /no such table/i.test(error instanceof Error ? error.message : String(error));
}

type AdminLeadRow = LeadQualityRow & {
  quality?: string;
  [key: string]: unknown;
};

async function attachQualityDeliveryState(env: Env, leads: AdminLeadRow[]): Promise<AdminLeadRow[]> {
  if (!env.DB || leads.length === 0) return leads;
  try {
    const outbox = await env.DB.prepare(
      `SELECT id, event_name, event_id, status, attempts, last_error, sent_at, updated_at
       FROM meta_outbox
       WHERE event_name IN ('QualifiedLead', 'UnqualifiedLead')
       ORDER BY updated_at DESC
       LIMIT 1000`
    ).all<MetaOutboxEventState>();
    const byId = new Map((outbox.results || []).map((row) => [row.id, row]));

    return leads.map((lead) => {
      const quality = lead.quality === 'target' || lead.quality === 'nontarget' ? lead.quality : '';
      if (!quality) return lead;
      const currentEventKey = String(lead.event_id || lead.id);
      const eventId = `lq:${quality}:${currentEventKey}`;
      const legacyEventId = `lq:${quality}:${lead.id}`;
      const delivery = byId.get(eventId) || byId.get(legacyEventId);
      return {
        ...lead,
        quality_meta_event_id: eventId,
        quality_meta_status: delivery?.status,
        quality_meta_attempts: delivery?.attempts,
        quality_meta_error: delivery?.last_error,
        quality_meta_sent_at: delivery?.sent_at,
      };
    });
  } catch (error) {
    if (!isMissingTableError(error)) console.warn('[Admin leads] Failed to read Meta outbox state', error);
    return leads;
  }
}

// Список заявок для админки
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  if (!verifyAdminPassword(getPassword(request), env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.DB) {
    return json({ success: false, error: 'База D1 не подключена (доступно только на продакшене)' }, { status: 503, headers: noStore });
  }

  try {
    // Повторные заявки поднимают лид наверх: сортируем по дате последней подачи.
    // SELECT * — состав колонок зависит от применённых миграций (0008/0009/0010).
    let rows;
    try {
      rows = await env.DB.prepare('SELECT * FROM leads ORDER BY COALESCE(last_submitted_at, created_at) DESC LIMIT 300').all();
    } catch (error) {
      // Миграция 0009 ещё не применена — сортируем по id
      if (!/no such column/i.test(error instanceof Error ? error.message : String(error))) throw error;
      rows = await env.DB.prepare('SELECT * FROM leads ORDER BY id DESC LIMIT 300').all();
    }
    const counts = await env.DB.prepare('SELECT status, COUNT(*) AS count FROM leads GROUP BY status').all<{ status: string; count: number }>();
    const byStatus: Record<string, number> = {};
    for (const row of counts.results || []) byStatus[row.status] = row.count;
    const leads = await attachQualityDeliveryState(env, (rows.results || []) as AdminLeadRow[]);
    return json({ success: true, leads, counts: byStatus }, { headers: noStore });
  } catch (error) {
    if (isMissingTableError(error)) {
      return json({ success: false, error: 'Таблица заявок ещё не создана — примените миграцию 0008 в D1' }, { status: 503, headers: noStore });
    }
    return json({ success: false, error: error instanceof Error ? error.message : 'Failed to load leads' }, { status: 500, headers: noStore });
  }
};

const LEAD_QUALITIES = new Set(['', 'target', 'nontarget']);

// Обновление заявки: { id, status?: new|in_progress|closed, quality?: ''|target|nontarget }
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => ({})) as { password?: string; id?: number; status?: string; quality?: string };
  if (!verifyAdminPassword(getPassword(request, body), env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.DB) {
    return json({ success: false, error: 'База D1 не подключена' }, { status: 503, headers: noStore });
  }
  const id = Number(body.id);
  const hasStatus = body.status !== undefined;
  const hasQuality = body.quality !== undefined;
  const status = String(body.status ?? '');
  const quality = String(body.quality ?? '');
  if (
    !Number.isInteger(id) || id <= 0 ||
    (!hasStatus && !hasQuality) ||
    (hasStatus && !LEAD_STATUSES.has(status)) ||
    (hasQuality && !LEAD_QUALITIES.has(quality))
  ) {
    return json({ success: false, error: 'id and valid status or quality are required' }, { status: 400, headers: noStore });
  }

  try {
    if (hasStatus) {
      const columns = await env.DB.prepare('PRAGMA table_info(leads)').all<{ name: string }>();
      const hasPipelineStage = (columns.results || []).some((column) => column.name === 'pipeline_stage');
      if (hasPipelineStage) {
        const pipelineStage = PIPELINE_BY_LEGACY_STATUS[status as keyof typeof PIPELINE_BY_LEGACY_STATUS];
        await env.DB.prepare(
          "UPDATE leads SET status = ?, pipeline_stage = ?, updated_at = datetime('now') WHERE id = ?",
        ).bind(status, pipelineStage, id).run();
      } else {
        await env.DB.prepare("UPDATE leads SET status = ?, updated_at = datetime('now') WHERE id = ?").bind(status, id).run();
      }
    }
    let meta: LeadQualityResult | undefined;
    if (hasQuality) {
      await env.DB.prepare("UPDATE leads SET quality = ?, updated_at = datetime('now') WHERE id = ?").bind(quality, id).run();
      // Метка «целевой/нецелевой» — сигнал качества для Meta.
      // Снятие метки (quality = '') событие не отправляет: «отозвать» его нельзя.
      if (quality === 'target' || quality === 'nontarget') {
        const row = await env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(id).first<LeadQualityRow>();
        if (row) {
          meta = await sendLeadQualityEvent(env, row, quality);
        }
      }
    }
    return json({ success: true, meta }, { headers: noStore });
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : 'Failed to update lead' }, { status: 500, headers: noStore });
  }
};
