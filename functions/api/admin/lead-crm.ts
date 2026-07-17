import { verifyAdminPassword } from '../../_lib/auth';
import { CACHE_CONTROL } from '../../_lib/cache';
import {
  ADMIN_CRM_STAGES,
  AdminCrmMigrationRequiredError,
  adminCrmMigrationResponse,
  assertAdminCrmSchema,
  isAdminCrmMigrationError,
  type AdminCrmActivityRow,
  type AdminCrmLeadRow,
  type AdminCrmStage,
} from '../../_lib/admin-crm';
import { json } from '../../_lib/http';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };
const MAX_LOSS_REASON_LENGTH = 500;
const MAX_NOTES_LENGTH = 5_000;
const MAX_DEAL_VALUE = 1_000_000_000_000;
const DEFAULT_ACTIVITY_LIMIT = 100;
const MAX_ACTIVITY_LIMIT = 200;

const PATCH_FIELDS = [
  'pipeline_stage',
  'next_action_at',
  'loss_reason',
  'notes',
  'deal_value',
  'deal_currency',
] as const;

type PatchField = typeof PATCH_FIELDS[number];

interface LeadCrmPayload {
  password?: unknown;
  id?: unknown;
  lead_id?: unknown;
  pipeline_stage?: unknown;
  next_action_at?: unknown;
  loss_reason?: unknown;
  notes?: unknown;
  deal_value?: unknown;
  deal_currency?: unknown;
  [key: string]: unknown;
}

interface NormalizedPatch {
  pipeline_stage?: AdminCrmStage;
  next_action_at?: string | null;
  loss_reason?: string;
  notes?: string;
  deal_value?: number | null;
  deal_currency?: string;
}

interface Change {
  field: PatchField;
  from: string | number | null;
  to: string | number | null;
  type: string;
  note: string;
}

const ACTIVITY_TYPES: Record<PatchField, string> = {
  pipeline_stage: 'pipeline_stage_changed',
  next_action_at: 'next_action_updated',
  loss_reason: 'loss_reason_updated',
  notes: 'notes_updated',
  deal_value: 'deal_value_updated',
  deal_currency: 'deal_currency_updated',
};

const LEGACY_STATUS_BY_PIPELINE: Record<AdminCrmStage, 'new' | 'in_progress' | 'closed'> = {
  new: 'new',
  contacted: 'in_progress',
  discovery: 'in_progress',
  proposal: 'in_progress',
  won: 'closed',
  lost: 'closed',
  archived: 'closed',
};

function getPassword(request: Request, body?: LeadCrmPayload): string {
  return request.headers.get('X-Admin-Password') || String(body?.password || '');
}

function parsePositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function validationError(message: string): Error {
  const error = new Error(message);
  error.name = 'ValidationError';
  return error;
}

function normalizeBoundedText(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') throw validationError(`${field} must be a string`);
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw validationError(`${field} must be at most ${maxLength} characters`);
  }
  return normalized;
}

function normalizeNextAction(value: unknown): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 64) {
    throw validationError('next_action_at must be an ISO date-time string or null');
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw validationError('next_action_at must be a valid ISO date-time string');
  }
  return new Date(timestamp).toISOString();
}

function normalizeDealValue(value: unknown): number | null {
  if (value === null || (typeof value === 'string' && value.trim() === '')) return null;
  if (typeof value !== 'number' && typeof value !== 'string') {
    throw validationError('deal_value must be a number or null');
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_DEAL_VALUE) {
    throw validationError(`deal_value must be between 0 and ${MAX_DEAL_VALUE}`);
  }
  return Math.round(parsed * 100) / 100;
}

function normalizePatch(body: LeadCrmPayload): NormalizedPatch {
  const allowedKeys = new Set(['password', 'id', 'lead_id', ...PATCH_FIELDS]);
  const unknownFields = Object.keys(body).filter((key) => !allowedKeys.has(key));
  if (unknownFields.length > 0) {
    throw validationError(`Unknown fields: ${unknownFields.join(', ')}`);
  }

  const patch: NormalizedPatch = {};
  if (Object.prototype.hasOwnProperty.call(body, 'pipeline_stage')) {
    const stage = String(body.pipeline_stage || '');
    if (!(ADMIN_CRM_STAGES as readonly string[]).includes(stage)) {
      throw validationError(`pipeline_stage must be one of: ${ADMIN_CRM_STAGES.join(', ')}`);
    }
    patch.pipeline_stage = stage as AdminCrmStage;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'next_action_at')) {
    patch.next_action_at = normalizeNextAction(body.next_action_at);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'loss_reason')) {
    patch.loss_reason = normalizeBoundedText(body.loss_reason, 'loss_reason', MAX_LOSS_REASON_LENGTH);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
    patch.notes = normalizeBoundedText(body.notes, 'notes', MAX_NOTES_LENGTH);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'deal_value')) {
    patch.deal_value = normalizeDealValue(body.deal_value);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'deal_currency')) {
    const currency = normalizeBoundedText(body.deal_currency, 'deal_currency', 3).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) {
      throw validationError('deal_currency must be a 3-letter ISO currency code');
    }
    patch.deal_currency = currency;
  }

  if (Object.keys(patch).length === 0) {
    throw validationError(`At least one CRM field is required: ${PATCH_FIELDS.join(', ')}`);
  }
  return patch;
}

function comparableValue(field: PatchField, value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (field === 'deal_value') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return String(value);
}

function buildChanges(current: AdminCrmLeadRow, patch: NormalizedPatch): Change[] {
  const changes: Change[] = [];
  for (const field of PATCH_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
    const from = comparableValue(field, current[field]);
    const to = comparableValue(field, patch[field]);
    if (from === to) continue;
    changes.push({
      field,
      from,
      to,
      type: ACTIVITY_TYPES[field],
      note: field === 'notes' ? String(to || '') : '',
    });
  }
  return changes;
}

function serializeActivityValue(value: string | number | null): string | null {
  return value === null ? null : String(value);
}

async function getCrmLead(db: D1Database, id: number): Promise<AdminCrmLeadRow | null> {
  return db.prepare(
    `SELECT id, pipeline_stage, next_action_at, loss_reason, notes, deal_value, deal_currency
     FROM leads WHERE id = ?`,
  ).bind(id).first<AdminCrmLeadRow>();
}

function migrationRequired(): Response {
  return json(adminCrmMigrationResponse(), { status: 503, headers: noStore });
}

function internalError(message: string): Response {
  return json({ success: false, error: message }, { status: 500, headers: noStore });
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

  const url = new URL(request.url);
  const leadId = parsePositiveInteger(url.searchParams.get('lead_id') || url.searchParams.get('id'));
  if (!leadId) {
    return json({ success: false, error: 'A valid lead_id is required' }, { status: 400, headers: noStore });
  }
  const requestedLimit = Number(url.searchParams.get('limit') || DEFAULT_ACTIVITY_LIMIT);
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), MAX_ACTIVITY_LIMIT)
    : DEFAULT_ACTIVITY_LIMIT;

  try {
    await assertAdminCrmSchema(env.DB);
    const lead = await getCrmLead(env.DB, leadId);
    if (!lead) {
      return json({ success: false, error: 'Lead not found' }, { status: 404, headers: noStore });
    }
    const result = await env.DB.prepare(
      `SELECT id, lead_id, type, "from" AS "from", "to" AS "to", note, created_at
       FROM lead_activity
       WHERE lead_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
    ).bind(leadId, limit).all<AdminCrmActivityRow>();
    return json({ success: true, lead, activities: result.results || [] }, { headers: noStore });
  } catch (error) {
    if (error instanceof AdminCrmMigrationRequiredError || isAdminCrmMigrationError(error)) {
      return migrationRequired();
    }
    return internalError('Failed to load lead activity');
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => ({})) as LeadCrmPayload;
  if (!verifyAdminPassword(getPassword(request, body), env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.DB) {
    return json({ success: false, code: 'D1_NOT_CONFIGURED', error: 'D1 is not configured' }, { status: 503, headers: noStore });
  }

  const leadId = parsePositiveInteger(body.lead_id ?? body.id);
  if (!leadId) {
    return json({ success: false, error: 'A valid lead_id is required' }, { status: 400, headers: noStore });
  }

  let patch: NormalizedPatch;
  try {
    patch = normalizePatch(body);
  } catch (error) {
    return json({ success: false, error: error instanceof Error ? error.message : 'Invalid CRM data' }, { status: 400, headers: noStore });
  }

  try {
    await assertAdminCrmSchema(env.DB);
    const current = await getCrmLead(env.DB, leadId);
    if (!current) {
      return json({ success: false, error: 'Lead not found' }, { status: 404, headers: noStore });
    }

    const changes = buildChanges(current, patch);
    if (changes.length === 0) {
      return json({ success: true, changed: false, lead: current, activities_created: 0 }, { headers: noStore });
    }

    const setParts = changes.map((change) => `${change.field} = ?`);
    const updateValues = changes.map((change) => change.to);
    const pipelineChange = changes.find((change) => change.field === 'pipeline_stage');
    if (pipelineChange?.to) {
      setParts.push('status = ?');
      updateValues.push(LEGACY_STATUS_BY_PIPELINE[pipelineChange.to as AdminCrmStage]);
    }
    const setClause = setParts.join(', ');
    const statements: D1PreparedStatement[] = [
      env.DB.prepare(`UPDATE leads SET ${setClause}, updated_at = datetime('now') WHERE id = ?`)
        .bind(...updateValues, leadId),
      ...changes.map((change) => env.DB.prepare(
        `INSERT INTO lead_activity (lead_id, type, "from", "to", note)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(
        leadId,
        change.type,
        change.field === 'notes' ? null : serializeActivityValue(change.from),
        change.field === 'notes' ? null : serializeActivityValue(change.to),
        change.note,
      )),
    ];
    await env.DB.batch(statements);

    const lead = await getCrmLead(env.DB, leadId);
    return json({ success: true, changed: true, lead, activities_created: changes.length }, { headers: noStore });
  } catch (error) {
    if (error instanceof AdminCrmMigrationRequiredError || isAdminCrmMigrationError(error)) {
      return migrationRequired();
    }
    return internalError('Failed to update lead CRM data');
  }
};
