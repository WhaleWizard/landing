import { verifyAdminPassword } from '../../_lib/auth';
import { CACHE_CONTROL } from '../../_lib/cache';
import {
  ADMIN_CRM_PRIORITIES,
  ADMIN_CRM_STAGES,
  AdminCrmMigrationRequiredError,
  adminCrmMigrationResponse,
  assertAdminCrmSchema,
} from '../../_lib/admin-crm';
import { attachAdminQualityDelivery } from '../../_lib/admin-lead-quality-status';
import { json } from '../../_lib/http';
import { hasLeadSoftDelete } from '../../_lib/leads';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };
const MAX_LIMIT = 300;
const DEFAULT_LIMIT = 100;
const MAX_OFFSET = 100_000;
const TAG_QUERY_CHUNK = 80;

interface CrmLeadListRow {
  id: number;
  event_id?: string;
  quality?: string;
  marketing_consent?: number;
  consent_version?: number | null;
  consent_source?: string | null;
  consent_region?: string | null;
  consent_timestamp?: number | null;
  consent_recorded_at?: string | null;
  [key: string]: unknown;
}

function getPassword(request: Request): string {
  return request.headers.get('X-Admin-Password') || '';
}

function integerParam(value: string | null, fallback: number, min: number, max: number, field: string): number {
  if (value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${field} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function enumList(value: string | null, allowed: readonly string[], field: string): string[] {
  if (!value) return [];
  const items = Array.from(new Set(value.split(',').map((item) => item.trim()).filter(Boolean)));
  if (items.some((item) => !allowed.includes(item))) {
    throw new Error(`${field} must contain only: ${allowed.join(', ')}`);
  }
  return items;
}

function isoDate(value: string | null, field: string): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`${field} must be a valid ISO date`);
  return new Date(parsed).toISOString();
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

async function attachTags(db: D1Database, leads: CrmLeadListRow[]): Promise<CrmLeadListRow[]> {
  const ids = leads.map((lead) => Number(lead.id)).filter((id) => Number.isInteger(id) && id > 0);
  if (ids.length === 0) return leads;
  const tagsByLead = new Map<number, Array<{ id: number; name: string; slug: string; color: string }>>();
  // D1 не принимает больше 100 подставляемых значений в запросе, а страница
  // списка может быть длиннее — поэтому id разбираются частями.
  for (let index = 0; index < ids.length; index += TAG_QUERY_CHUNK) {
    const part = ids.slice(index, index + TAG_QUERY_CHUNK);
    const placeholders = part.map(() => '?').join(', ');
    const result = await db.prepare(
      `SELECT lt.lead_id, t.id, t.name, t.slug, t.color
       FROM crm_lead_tags lt INNER JOIN crm_tags t ON t.id = lt.tag_id
       WHERE lt.lead_id IN (${placeholders}) ORDER BY lower(t.name), t.id`,
    ).bind(...part).all<{ lead_id: number; id: number; name: string; slug: string; color: string }>();
    for (const row of result.results || []) {
      const tags = tagsByLead.get(row.lead_id) || [];
      tags.push({ id: row.id, name: row.name, slug: row.slug, color: row.color });
      tagsByLead.set(row.lead_id, tags);
    }
  }
  return leads.map((lead) => ({ ...lead, crm_tags: tagsByLead.get(lead.id) || [] }));
}

// `activeCond` отсекает заявки в корзине (миграция 0020). Пока колонки нет,
// приходит '1=1' — форма запроса не меняется, фильтр просто ничего не режет.
async function getSummary(db: D1Database, localTimeModifier: string, activeCond: string): Promise<Record<string, unknown>> {
  const [stages, values, reminders, tasks, priorities, quality] = await Promise.all([
    db.prepare(`SELECT pipeline_stage, COUNT(*) AS count FROM leads WHERE ${activeCond} GROUP BY pipeline_stage`)
      .all<{ pipeline_stage: string; count: number }>(),
    db.prepare(
      `SELECT deal_currency,
              SUM(CASE WHEN pipeline_stage IN ('new','contacted','discovery','proposal') THEN COALESCE(deal_value, 0) ELSE 0 END) AS open_value,
              SUM(CASE WHEN pipeline_stage = 'won' THEN COALESCE(deal_value, 0) ELSE 0 END) AS won_value
       FROM leads WHERE ${activeCond} GROUP BY deal_currency ORDER BY deal_currency`,
    ).all<{ deal_currency: string; open_value: number; won_value: number }>(),
    db.prepare(
      `SELECT
         SUM(CASE WHEN next_action_at IS NOT NULL AND datetime(next_action_at) < datetime('now') THEN 1 ELSE 0 END) AS overdue,
         SUM(CASE WHEN next_action_at IS NOT NULL AND date(next_action_at, ?) = date('now', ?) THEN 1 ELSE 0 END) AS today,
         SUM(CASE WHEN next_action_at IS NULL AND pipeline_stage NOT IN ('won','lost','archived') THEN 1 ELSE 0 END) AS without_next_action
       FROM leads WHERE ${activeCond}`,
    ).bind(localTimeModifier, localTimeModifier).first<{ overdue: number; today: number; without_next_action: number }>(),
    // Задачи удалённой заявки не должны висеть в счётчике «открытые задачи».
    db.prepare(
      `SELECT
         SUM(CASE WHEN t.status = 'open' THEN 1 ELSE 0 END) AS open,
         SUM(CASE WHEN t.status = 'open' AND t.due_at IS NOT NULL AND datetime(t.due_at) < datetime('now') THEN 1 ELSE 0 END) AS overdue,
         SUM(CASE WHEN t.status = 'open' AND t.due_at IS NOT NULL AND date(t.due_at, ?) = date('now', ?) THEN 1 ELSE 0 END) AS today
       FROM crm_tasks t INNER JOIN leads l ON l.id = t.lead_id
       WHERE ${activeCond.replace(/deleted_at/g, 'l.deleted_at')}`,
    ).bind(localTimeModifier, localTimeModifier).first<{ open: number; overdue: number; today: number }>(),
    db.prepare(`SELECT priority, COUNT(*) AS count FROM leads WHERE ${activeCond} GROUP BY priority`)
      .all<{ priority: string; count: number }>(),
    db.prepare(`SELECT quality, COUNT(*) AS count FROM leads WHERE ${activeCond} GROUP BY quality`)
      .all<{ quality: string; count: number }>(),
  ]);
  return {
    stages: Object.fromEntries((stages.results || []).map((row) => [row.pipeline_stage, row.count])),
    priorities: Object.fromEntries((priorities.results || []).map((row) => [row.priority, row.count])),
    quality: Object.fromEntries((quality.results || []).map((row) => [row.quality || 'unclassified', row.count])),
    values_by_currency: values.results || [],
    reminders: reminders || { overdue: 0, today: 0, without_next_action: 0 },
    tasks: tasks || { open: 0, overdue: 0, today: 0 },
  };
}

async function getFacets(db: D1Database, activeCond: string): Promise<Record<string, unknown>> {
  const [services, sources, tags] = await Promise.all([
    db.prepare(`SELECT service AS value, COUNT(*) AS count FROM leads WHERE service != '' AND ${activeCond} GROUP BY service ORDER BY count DESC, service LIMIT 100`)
      .all<{ value: string; count: number }>(),
    db.prepare(`SELECT utm_source AS value, COUNT(*) AS count FROM leads WHERE utm_source != '' AND ${activeCond} GROUP BY utm_source ORDER BY count DESC, utm_source LIMIT 100`)
      .all<{ value: string; count: number }>(),
    db.prepare(
      `SELECT t.id, t.name, t.slug, t.color,
              COUNT(l.id) AS count
       FROM crm_tags t
       LEFT JOIN crm_lead_tags lt ON lt.tag_id = t.id
       LEFT JOIN leads l ON l.id = lt.lead_id AND ${activeCond.replace(/deleted_at/g, 'l.deleted_at')}
       GROUP BY t.id ORDER BY count DESC, lower(t.name), t.id`,
    ).all<{ id: number; name: string; slug: string; color: string; count: number }>(),
  ]);
  return { services: services.results || [], utm_sources: sources.results || [], tags: tags.results || [] };
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;
  if (!verifyAdminPassword(getPassword(request), env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.DB) {
    return json({ success: false, code: 'D1_NOT_CONFIGURED', error: 'D1 is not configured' }, { status: 503, headers: noStore });
  }

  try {
    const capabilities = await assertAdminCrmSchema(env.DB, 'workspace');
    const url = new URL(request.url);
    const limit = integerParam(url.searchParams.get('limit'), DEFAULT_LIMIT, 1, MAX_LIMIT, 'limit');
    const offset = integerParam(url.searchParams.get('offset'), 0, 0, MAX_OFFSET, 'offset');
    const timezoneOffset = integerParam(url.searchParams.get('timezone_offset'), 0, -840, 840, 'timezone_offset');
    // JS getTimezoneOffset() = UTC - local. SQLite needs the inverse modifier
    // to compare stored UTC timestamps against the administrator's local day.
    const localTimeModifier = `${-timezoneOffset >= 0 ? '+' : ''}${-timezoneOffset} minutes`;
    // Заявки в корзине не попадают ни в список, ни в счётчики, ни в фасеты.
    const softDelete = await hasLeadSoftDelete(env.DB);
    const activeCond = softDelete ? 'deleted_at IS NULL' : '1=1';
    const where: string[] = [];
    if (softDelete) where.push('l.deleted_at IS NULL');
    const values: Array<string | number> = [];
    const appliedFilters: Record<string, unknown> = {};

    const q = String(url.searchParams.get('q') || '').trim().slice(0, 120);
    if (q) {
      const pattern = `%${escapeLike(q)}%`;
      const columns = ['name', 'email', 'phone', 'telegram_username', 'message', 'service', 'notes', 'next_action_text'];
      const clauses = columns.map((column) => `l.${column} LIKE ? ESCAPE '\\'`);
      values.push(...columns.map(() => pattern), pattern);
      clauses.push(`EXISTS (
        SELECT 1 FROM crm_lead_tags qlt INNER JOIN crm_tags qt ON qt.id = qlt.tag_id
        WHERE qlt.lead_id = l.id AND qt.name LIKE ? ESCAPE '\\'
      )`);
      where.push(`(${clauses.join(' OR ')})`);
      appliedFilters.q = q;
    }

    const stages = enumList(url.searchParams.get('pipeline_stage'), ADMIN_CRM_STAGES, 'pipeline_stage');
    if (stages.length) {
      where.push(`l.pipeline_stage IN (${stages.map(() => '?').join(', ')})`);
      values.push(...stages);
      appliedFilters.pipeline_stage = stages;
    }
    const priorities = enumList(url.searchParams.get('priority'), ADMIN_CRM_PRIORITIES, 'priority');
    if (priorities.length) {
      where.push(`l.priority IN (${priorities.map(() => '?').join(', ')})`);
      values.push(...priorities);
      appliedFilters.priority = priorities;
    }
    const quality = enumList(url.searchParams.get('quality'), ['unclassified', 'target', 'nontarget'], 'quality');
    if (quality.length) {
      const normalized = quality.map((item) => item === 'unclassified' ? '' : item);
      where.push(`l.quality IN (${normalized.map(() => '?').join(', ')})`);
      values.push(...normalized);
      appliedFilters.quality = quality;
    }

    const tag = String(url.searchParams.get('tag') || '').trim().slice(0, 64);
    if (tag) {
      where.push(`EXISTS (
        SELECT 1 FROM crm_lead_tags flt INNER JOIN crm_tags ft ON ft.id = flt.tag_id
        WHERE flt.lead_id = l.id AND ft.slug = ?
      )`);
      values.push(tag);
      appliedFilters.tag = tag;
    }
    const service = String(url.searchParams.get('service') || '').trim().slice(0, 160);
    if (service) { where.push('l.service = ?'); values.push(service); appliedFilters.service = service; }
    const utmSource = String(url.searchParams.get('utm_source') || '').trim().slice(0, 160);
    if (utmSource) { where.push('l.utm_source = ?'); values.push(utmSource); appliedFilters.utm_source = utmSource; }

    const from = isoDate(url.searchParams.get('from'), 'from');
    const to = isoDate(url.searchParams.get('to'), 'to');
    if (from) { where.push('datetime(l.created_at) >= datetime(?)'); values.push(from); appliedFilters.from = from; }
    if (to) { where.push('datetime(l.created_at) <= datetime(?)'); values.push(to); appliedFilters.to = to; }

    const minScore = integerParam(url.searchParams.get('min_score'), 0, 0, 100, 'min_score');
    const maxScore = integerParam(url.searchParams.get('max_score'), 100, 0, 100, 'max_score');
    if (minScore > maxScore) throw new Error('min_score cannot be greater than max_score');
    if (url.searchParams.has('min_score')) { where.push('l.lead_score >= ?'); values.push(minScore); appliedFilters.min_score = minScore; }
    if (url.searchParams.has('max_score')) { where.push('l.lead_score <= ?'); values.push(maxScore); appliedFilters.max_score = maxScore; }

    const due = url.searchParams.get('due');
    if (due) {
      if (!['overdue', 'today', 'upcoming', 'none'].includes(due)) {
        throw new Error('due must be one of: overdue, today, upcoming, none');
      }
      if (due === 'overdue') where.push("l.next_action_at IS NOT NULL AND datetime(l.next_action_at) < datetime('now')");
      if (due === 'today') {
        where.push("l.next_action_at IS NOT NULL AND date(l.next_action_at, ?) = date('now', ?)");
        values.push(localTimeModifier, localTimeModifier);
      }
      if (due === 'upcoming') where.push("l.next_action_at IS NOT NULL AND datetime(l.next_action_at) > datetime('now')");
      if (due === 'none') where.push("l.next_action_at IS NULL AND l.pipeline_stage NOT IN ('won','lost','archived')");
      appliedFilters.due = due;
    }

    const task = url.searchParams.get('task');
    if (task) {
      if (!['open', 'overdue', 'none'].includes(task)) throw new Error('task must be one of: open, overdue, none');
      if (task === 'open') where.push("EXISTS (SELECT 1 FROM crm_tasks tf WHERE tf.lead_id = l.id AND tf.status = 'open')");
      if (task === 'overdue') where.push("EXISTS (SELECT 1 FROM crm_tasks tf WHERE tf.lead_id = l.id AND tf.status = 'open' AND tf.due_at IS NOT NULL AND datetime(tf.due_at) < datetime('now'))");
      if (task === 'none') where.push("NOT EXISTS (SELECT 1 FROM crm_tasks tf WHERE tf.lead_id = l.id AND tf.status = 'open')");
      appliedFilters.task = task;
    }

    const sort = url.searchParams.get('sort') || 'recent';
    const sorts: Record<string, string> = {
      recent: 'COALESCE(l.last_submitted_at, l.created_at) DESC, l.id DESC',
      oldest: 'l.created_at ASC, l.id ASC',
      next_action: 'CASE WHEN l.next_action_at IS NULL THEN 1 ELSE 0 END, l.next_action_at ASC, l.id DESC',
      value: 'CASE WHEN l.deal_value IS NULL THEN 1 ELSE 0 END, l.deal_value DESC, l.id DESC',
      score: 'l.lead_score DESC, l.id DESC',
      priority: "CASE l.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END, l.id DESC",
    };
    if (!sorts[sort]) throw new Error(`sort must be one of: ${Object.keys(sorts).join(', ')}`);
    appliedFilters.sort = sort;

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows, totalRow, summary, facets] = await Promise.all([
      env.DB.prepare(
        `SELECT l.*,
           (SELECT COUNT(*) FROM crm_tasks ot WHERE ot.lead_id = l.id AND ot.status = 'open') AS open_tasks_count,
           (SELECT COUNT(*) FROM crm_tasks od WHERE od.lead_id = l.id AND od.status = 'open' AND od.due_at IS NOT NULL AND datetime(od.due_at) < datetime('now')) AS overdue_tasks_count
         FROM leads l ${whereSql} ORDER BY ${sorts[sort]} LIMIT ? OFFSET ?`,
      ).bind(...values, limit, offset).all<CrmLeadListRow>(),
      env.DB.prepare(`SELECT COUNT(*) AS count FROM leads l ${whereSql}`).bind(...values).first<{ count: number }>(),
      getSummary(env.DB, localTimeModifier, activeCond),
      getFacets(env.DB, activeCond),
    ]);
    let leads = await attachTags(env.DB, rows.results || []);
    leads = await attachAdminQualityDelivery(env.DB, leads);
    return json({
      success: true,
      capabilities,
      leads,
      pagination: { limit, offset, total: Number(totalRow?.count || 0), returned: leads.length },
      filters: appliedFilters,
      summary,
      facets,
    }, { headers: noStore });
  } catch (error) {
    if (error instanceof AdminCrmMigrationRequiredError) {
      return json(adminCrmMigrationResponse(error), { status: 503, headers: noStore });
    }
    if (error instanceof Error && /must be|cannot be/i.test(error.message)) {
      return json({ success: false, error: error.message }, { status: 400, headers: noStore });
    }
    return json({ success: false, error: 'Failed to load CRM leads' }, { status: 500, headers: noStore });
  }
};
