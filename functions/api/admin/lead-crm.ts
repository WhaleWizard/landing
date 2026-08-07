import { verifyAdminPassword } from '../../_lib/auth';
import { CACHE_CONTROL } from '../../_lib/cache';
import {
  ADMIN_CRM_PRIORITIES,
  ADMIN_CRM_STAGES,
  ADMIN_CRM_TASK_KINDS,
  ADMIN_CRM_TASK_STATUSES,
  AdminCrmMigrationRequiredError,
  adminCrmMigrationResponse,
  assertAdminCrmSchema,
  createCrmActivityStatement,
  isAdminCrmMigrationError,
  type AdminCrmActivityRow,
  type AdminCrmCapabilities,
  type AdminCrmLeadRow,
  type AdminCrmPriority,
  type AdminCrmStage,
  type AdminCrmTaskKind,
  type AdminCrmTaskStatus,
} from '../../_lib/admin-crm';
import { json } from '../../_lib/http';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };
const MAX_LOSS_REASON_LENGTH = 500;
const MAX_SUMMARY_NOTES_LENGTH = 5_000;
const MAX_NOTE_LENGTH = 10_000;
const MAX_TASK_TITLE_LENGTH = 240;
const MAX_NEXT_ACTION_TEXT_LENGTH = 240;
const MAX_DEAL_VALUE = 1_000_000_000_000;
const MAX_TAGS_PER_LEAD = 20;
const MAX_TAG_NAME_LENGTH = 40;
const DEFAULT_ACTIVITY_LIMIT = 100;
const MAX_ACTIVITY_LIMIT = 200;
const DEFAULT_TASK_LIMIT = 100;
const MAX_TASK_LIMIT = 300;

const BASE_PATCH_FIELDS = [
  'pipeline_stage',
  'next_action_at',
  'loss_reason',
  'notes',
  'deal_value',
  'deal_currency',
] as const;

const WORKSPACE_PATCH_FIELDS = [
  'priority',
  'lead_score',
  'next_action_text',
] as const;

type BasePatchField = typeof BASE_PATCH_FIELDS[number];
type WorkspacePatchField = typeof WORKSPACE_PATCH_FIELDS[number];
type PatchField = BasePatchField | WorkspacePatchField;

interface LeadCrmPayload {
  password?: unknown;
  action?: unknown;
  id?: unknown;
  lead_id?: unknown;
  note_id?: unknown;
  task_id?: unknown;
  duplicate_id?: unknown;
  expected_revision?: unknown;
  expected_updated_at?: unknown;
  action_id?: unknown;
  pipeline_stage?: unknown;
  next_action_at?: unknown;
  next_action_text?: unknown;
  loss_reason?: unknown;
  notes?: unknown;
  deal_value?: unknown;
  deal_currency?: unknown;
  priority?: unknown;
  lead_score?: unknown;
  body?: unknown;
  pinned?: unknown;
  title?: unknown;
  kind?: unknown;
  status?: unknown;
  due_at?: unknown;
  tags?: unknown;
  [key: string]: unknown;
}

interface NormalizedPatch {
  pipeline_stage?: AdminCrmStage;
  next_action_at?: string | null;
  next_action_text?: string;
  loss_reason?: string;
  notes?: string;
  deal_value?: number | null;
  deal_currency?: string;
  priority?: AdminCrmPriority;
  lead_score?: number;
}

interface Change {
  field: PatchField;
  from: string | number | null;
  to: string | number | null;
  type: string;
  note: string;
}

interface CrmNoteRow {
  id: number;
  lead_id: number;
  body: string;
  pinned: number;
  created_at: string;
  updated_at: string;
  revision?: number;
  action_id?: string;
}

interface CrmTaskRow {
  id: number;
  lead_id: number;
  title: string;
  kind: AdminCrmTaskKind;
  status: AdminCrmTaskStatus;
  priority: AdminCrmPriority;
  due_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  revision?: number;
  action_id?: string;
  lead_name?: string;
  lead_service?: string;
  pipeline_stage?: AdminCrmStage;
}

interface CrmTagRow {
  id: number;
  name: string;
  slug: string;
  color: string;
  created_at: string;
  updated_at: string;
  leads_count?: number;
}

const ACTIVITY_TYPES: Record<PatchField, string> = {
  pipeline_stage: 'pipeline_stage_changed',
  next_action_at: 'next_action_updated',
  next_action_text: 'next_action_text_updated',
  loss_reason: 'loss_reason_updated',
  notes: 'notes_updated',
  deal_value: 'deal_value_updated',
  deal_currency: 'deal_currency_updated',
  priority: 'priority_updated',
  lead_score: 'lead_score_updated',
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

function parseBoundedInteger(value: unknown, min: number, max: number, field: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw validationError(`${field} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

function parseBoolean(value: unknown, field: string): boolean {
  if (value === true || value === 1 || value === '1') return true;
  if (value === false || value === 0 || value === '0') return false;
  throw validationError(`${field} must be a boolean`);
}

function validationError(message: string): Error {
  const error = new Error(message);
  error.name = 'ValidationError';
  return error;
}

function conflictError(message: string): Error {
  const error = new Error(message);
  error.name = 'ConflictError';
  return error;
}

function normalizeBoundedText(value: unknown, field: string, maxLength: number, required = false): string {
  if (typeof value !== 'string') throw validationError(`${field} must be a string`);
  const normalized = value.trim();
  if (required && !normalized) throw validationError(`${field} is required`);
  if (normalized.length > maxLength) {
    throw validationError(`${field} must be at most ${maxLength} characters`);
  }
  return normalized;
}

function normalizeDateTime(value: unknown, field: string): string | null {
  if (value === null || value === '') return null;
  if (typeof value !== 'string' || value.length > 64) {
    throw validationError(`${field} must be an ISO date-time string or null`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw validationError(`${field} must be a valid ISO date-time string`);
  return new Date(timestamp).toISOString();
}

function normalizeActionId(value: unknown): string {
  if (value === undefined || value === null || value === '') return crypto.randomUUID();
  const actionId = normalizeBoundedText(value, 'action_id', 80, true);
  if (!/^[a-zA-Z0-9:_-]+$/.test(actionId)) {
    throw validationError('action_id contains unsupported characters');
  }
  return actionId;
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

function normalizeEnum<T extends string>(value: unknown, field: string, allowed: readonly T[]): T {
  const normalized = String(value || '');
  if (!allowed.includes(normalized as T)) {
    throw validationError(`${field} must be one of: ${allowed.join(', ')}`);
  }
  return normalized as T;
}

function normalizeLeadPatch(body: LeadCrmPayload, workspace: boolean): NormalizedPatch {
  const allowedKeys = new Set([
    'password', 'action', 'id', 'lead_id', 'expected_revision', 'action_id',
    ...BASE_PATCH_FIELDS,
    ...(workspace ? WORKSPACE_PATCH_FIELDS : []),
  ]);
  const unknownFields = Object.keys(body).filter((key) => !allowedKeys.has(key));
  if (unknownFields.length > 0) throw validationError(`Unknown fields: ${unknownFields.join(', ')}`);

  const patch: NormalizedPatch = {};
  if (Object.prototype.hasOwnProperty.call(body, 'pipeline_stage')) {
    patch.pipeline_stage = normalizeEnum(body.pipeline_stage, 'pipeline_stage', ADMIN_CRM_STAGES);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'next_action_at')) {
    patch.next_action_at = normalizeDateTime(body.next_action_at, 'next_action_at');
  }
  if (Object.prototype.hasOwnProperty.call(body, 'next_action_text')) {
    if (!workspace) throw new AdminCrmMigrationRequiredError('workspace');
    patch.next_action_text = normalizeBoundedText(body.next_action_text, 'next_action_text', MAX_NEXT_ACTION_TEXT_LENGTH);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'loss_reason')) {
    patch.loss_reason = normalizeBoundedText(body.loss_reason, 'loss_reason', MAX_LOSS_REASON_LENGTH);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'notes')) {
    patch.notes = normalizeBoundedText(body.notes, 'notes', MAX_SUMMARY_NOTES_LENGTH);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'deal_value')) patch.deal_value = normalizeDealValue(body.deal_value);
  if (Object.prototype.hasOwnProperty.call(body, 'deal_currency')) {
    const currency = normalizeBoundedText(body.deal_currency, 'deal_currency', 3).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw validationError('deal_currency must be a 3-letter ISO currency code');
    patch.deal_currency = currency;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'priority')) {
    if (!workspace) throw new AdminCrmMigrationRequiredError('workspace');
    patch.priority = normalizeEnum(body.priority, 'priority', ADMIN_CRM_PRIORITIES);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'lead_score')) {
    if (!workspace) throw new AdminCrmMigrationRequiredError('workspace');
    patch.lead_score = parseBoundedInteger(body.lead_score, 0, 100, 'lead_score');
  }
  if (Object.keys(patch).length === 0) {
    const fields = workspace ? [...BASE_PATCH_FIELDS, ...WORKSPACE_PATCH_FIELDS] : BASE_PATCH_FIELDS;
    throw validationError(`At least one CRM field is required: ${fields.join(', ')}`);
  }
  return patch;
}

function comparableValue(field: PatchField, value: unknown): string | number | null {
  if (value === null || value === undefined) return null;
  if (field === 'deal_value' || field === 'lead_score') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
  }
  return String(value);
}

function buildChanges(current: AdminCrmLeadRow, patch: NormalizedPatch): Change[] {
  const changes: Change[] = [];
  for (const field of [...BASE_PATCH_FIELDS, ...WORKSPACE_PATCH_FIELDS]) {
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

function leadSelect(workspace: boolean, correctness = false): string {
  const base = 'id, pipeline_stage, next_action_at, loss_reason, notes, deal_value, deal_currency, updated_at';
  if (!workspace) return base;
  return `${base}, priority, lead_score, next_action_text, pipeline_changed_at, last_contacted_at, closed_at, crm_revision${correctness ? ', crm_action_id' : ''}`;
}

async function getCrmLead(db: D1Database, id: number, workspace: boolean, correctness = false): Promise<AdminCrmLeadRow | null> {
  return db.prepare(`SELECT ${leadSelect(workspace, correctness)} FROM leads WHERE id = ?`).bind(id).first<AdminCrmLeadRow>();
}

function activitySelect(auditContext: boolean): string {
  const base = 'id, lead_id, type, "from" AS "from", "to" AS "to", note, created_at';
  return auditContext ? `${base}, actor, entity_type, entity_id, action_id, metadata_json` : base;
}

async function getLeadBundle(
  db: D1Database,
  leadId: number,
  capabilities: AdminCrmCapabilities,
  activityLimit = DEFAULT_ACTIVITY_LIMIT,
): Promise<Record<string, unknown> | null> {
  const lead = await getCrmLead(db, leadId, capabilities.workspace, capabilities.correctness);
  if (!lead) return null;
  const activityPromise = db.prepare(
    `SELECT ${activitySelect(capabilities.auditContext)}
     FROM lead_activity WHERE lead_id = ?
     ORDER BY created_at DESC, id DESC LIMIT ?`,
  ).bind(leadId, activityLimit).all<AdminCrmActivityRow>();

  if (!capabilities.workspace) {
    const activities = await activityPromise;
    return { lead, activities: activities.results || [], notes: [], tasks: [], tags: [] };
  }

  const [activities, notes, tasks, tags] = await Promise.all([
    activityPromise,
    db.prepare(
      `SELECT id, lead_id, body, pinned, created_at, updated_at${capabilities.correctness ? ', revision, action_id' : ''} FROM crm_notes
       WHERE lead_id = ? ORDER BY pinned DESC, created_at DESC, id DESC`,
    ).bind(leadId).all<CrmNoteRow>(),
    db.prepare(
      `SELECT id, lead_id, title, kind, status, priority, due_at, completed_at, created_at, updated_at${capabilities.correctness ? ', revision, action_id' : ''}
       FROM crm_tasks WHERE lead_id = ?
       ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END,
                CASE WHEN due_at IS NULL THEN 1 ELSE 0 END, due_at ASC, id DESC`,
    ).bind(leadId).all<CrmTaskRow>(),
    db.prepare(
      `SELECT t.id, t.name, t.slug, t.color, t.created_at, t.updated_at
       FROM crm_tags t INNER JOIN crm_lead_tags lt ON lt.tag_id = t.id
       WHERE lt.lead_id = ? ORDER BY lower(t.name), t.id`,
    ).bind(leadId).all<CrmTagRow>(),
  ]);
  return {
    lead,
    activities: activities.results || [],
    notes: notes.results || [],
    tasks: tasks.results || [],
    tags: tags.results || [],
  };
}

function migrationRequired(error?: AdminCrmMigrationRequiredError): Response {
  return json(adminCrmMigrationResponse(error), { status: 503, headers: noStore });
}

function handleError(error: unknown, fallback: string): Response {
  if (error instanceof AdminCrmMigrationRequiredError) return migrationRequired(error);
  if (isAdminCrmMigrationError(error)) return migrationRequired();
  if (error instanceof Error && error.name === 'ValidationError') {
    return json({ success: false, error: error.message }, { status: 400, headers: noStore });
  }
  if (error instanceof Error && error.name === 'ConflictError') {
    return json({ success: false, code: 'CRM_CONFLICT', error: error.message }, { status: 409, headers: noStore });
  }
  return json({ success: false, error: fallback }, { status: 500, headers: noStore });
}

function resultLastRowId(result: { meta?: { last_row_id?: number } }): number | null {
  const id = Number((result.meta as { last_row_id?: number } | undefined)?.last_row_id);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function resultChanges(result: { meta?: { changes?: number } } | undefined): number {
  return Number(result?.meta?.changes || 0);
}

function createGuardedLeadActivityStatement(
  db: D1Database,
  leadId: number,
  change: Change,
  actionId: string,
): D1PreparedStatement {
  return db.prepare(
    `INSERT INTO lead_activity
       (lead_id, type, "from", "to", note, actor, entity_type, entity_id, action_id, metadata_json)
     SELECT id, ?, ?, ?, ?, 'admin', 'lead', id, ?, ?
     FROM leads WHERE id = ? AND crm_action_id = ?`,
  ).bind(
    change.type,
    change.field === 'notes' ? null : change.from,
    change.field === 'notes' ? null : change.to,
    change.note,
    actionId,
    JSON.stringify({ field: change.field, before: change.from, after: change.to }),
    leadId,
    actionId,
  );
}

function normalizeTagSlug(name: string): string {
  return name.normalize('NFKC').toLocaleLowerCase('ru-RU')
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

async function columnExists(db: D1Database, table: string, column: string): Promise<boolean> {
  const rows = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  return (rows.results || []).some((row) => row.name === column);
}

function normalizeTagColor(value: unknown): string {
  if (value === undefined || value === null || value === '') return '#8b5cf6';
  const color = String(value).trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(color)) throw validationError('tag color must be a 6-digit hex color');
  return color;
}

async function updateLead(
  db: D1Database,
  body: LeadCrmPayload,
  leadId: number,
  capabilities: AdminCrmCapabilities,
): Promise<Record<string, unknown>> {
  if (capabilities.workspace && !capabilities.correctness) {
    throw new AdminCrmMigrationRequiredError('correctness');
  }
  const patch = normalizeLeadPatch(body, capabilities.workspace);
  const current = await getCrmLead(db, leadId, capabilities.workspace, capabilities.correctness);
  if (!current) throw Object.assign(new Error('Lead not found'), { name: 'NotFoundError' });
  const actionId = normalizeActionId(body.action_id);
  if (capabilities.correctness && current.crm_action_id === actionId) {
    return { changed: false, idempotent: true, lead: current, activities_created: 0, action_id: actionId };
  }
  let expectedRevision: number | null = null;
  if (capabilities.workspace) {
    if (body.expected_revision === undefined) throw validationError('expected_revision is required');
    expectedRevision = parseBoundedInteger(body.expected_revision, 0, Number.MAX_SAFE_INTEGER, 'expected_revision');
    const expected = expectedRevision;
    if (expected !== Number(current.crm_revision || 0)) {
      throw conflictError('Lead was changed in another tab. Reload it before saving.');
    }
  }

  const changes = buildChanges(current, patch);
  if (changes.length === 0) {
    return { changed: false, lead: current, activities_created: 0 };
  }

  const setParts = changes.map((change) => `${change.field} = ?`);
  const updateValues: Array<string | number | null> = changes.map((change) => change.to);
  const pipelineChange = changes.find((change) => change.field === 'pipeline_stage');
  if (pipelineChange?.to) {
    const stage = pipelineChange.to as AdminCrmStage;
    setParts.push('status = ?');
    updateValues.push(LEGACY_STATUS_BY_PIPELINE[stage]);
    if (capabilities.workspace) {
      setParts.push("pipeline_changed_at = datetime('now')");
      if (stage === 'contacted' || stage === 'discovery' || stage === 'proposal') {
        setParts.push("last_contacted_at = datetime('now')");
        // Время первого ответа (миграция 0025) пишется только один раз:
        // повторные касания не должны улучшать эту метрику задним числом.
        if (await columnExists(db, 'leads', 'first_response_at')) {
          setParts.push("first_response_at = COALESCE(first_response_at, datetime('now'))");
        }
      }
      if (stage === 'won' || stage === 'lost') setParts.push("closed_at = datetime('now')");
      else setParts.push('closed_at = NULL');
    }
  }
  if (capabilities.correctness) {
    setParts.push('crm_revision = crm_revision + 1', 'crm_action_id = ?');
    updateValues.push(actionId);
  }
  setParts.push("updated_at = datetime('now')");

  const update = capabilities.correctness
    ? db.prepare(`UPDATE leads SET ${setParts.join(', ')} WHERE id = ? AND crm_revision = ?`)
      .bind(...updateValues, leadId, expectedRevision)
    : db.prepare(`UPDATE leads SET ${setParts.join(', ')} WHERE id = ?`).bind(...updateValues, leadId);
  const statements: D1PreparedStatement[] = [update];
  if (capabilities.correctness) {
    statements.push(...changes.map((change) => createGuardedLeadActivityStatement(db, leadId, change, actionId)));
  } else {
    statements.push(...changes.map((change) => createCrmActivityStatement(db, {
      leadId,
      type: change.type,
      from: change.field === 'notes' ? null : change.from,
      to: change.field === 'notes' ? null : change.to,
      note: change.note,
      entityType: 'lead',
      entityId: leadId,
      actionId,
      metadata: { field: change.field, before: change.from, after: change.to },
    }, capabilities.auditContext)));
  }
  const results = await db.batch(statements);
  if (capabilities.correctness && resultChanges(results[0]) === 0) {
    throw conflictError('Lead was changed in another tab. Reload it before saving.');
  }
  const lead = await getCrmLead(db, leadId, capabilities.workspace, capabilities.correctness);
  return { changed: true, lead, activities_created: changes.length, action_id: actionId };
}

async function addNote(db: D1Database, body: LeadCrmPayload, leadId: number): Promise<Record<string, unknown>> {
  const noteBody = normalizeBoundedText(body.body, 'body', MAX_NOTE_LENGTH, true);
  const pinned = body.pinned === undefined ? false : parseBoolean(body.pinned, 'pinned');
  const actionId = normalizeActionId(body.action_id);
  const results = await db.batch([
    db.prepare(
      `INSERT INTO crm_notes (lead_id, body, pinned, revision, action_id)
       VALUES (?, ?, ?, 0, ?) ON CONFLICT DO NOTHING`,
    ).bind(leadId, noteBody, pinned ? 1 : 0, actionId),
    db.prepare(
      `INSERT INTO lead_activity
         (lead_id, type, "from", "to", note, actor, entity_type, entity_id, action_id, metadata_json)
       SELECT n.lead_id, 'note_created', NULL, NULL, n.body, 'admin', 'note', n.id, ?, ?
       FROM crm_notes n
       WHERE n.lead_id = ? AND n.action_id = ?
         AND NOT EXISTS (SELECT 1 FROM lead_activity a WHERE a.action_id = ? AND a.type = 'note_created')`,
    ).bind(actionId, JSON.stringify({ pinned }), leadId, actionId, actionId),
  ]);
  const note = await db.prepare('SELECT * FROM crm_notes WHERE lead_id = ? AND action_id = ?')
    .bind(leadId, actionId).first<CrmNoteRow>();
  if (!note) throw conflictError('action_id was already used by another CRM mutation');
  return { note, action_id: actionId, idempotent: resultChanges(results[0]) === 0 };
}

function expectedEntityRevision(body: LeadCrmPayload, current: { revision?: number; updated_at: string }, entity: string): number {
  if (body.expected_revision !== undefined) {
    return parseBoundedInteger(body.expected_revision, 0, Number.MAX_SAFE_INTEGER, 'expected_revision');
  }
  if (body.expected_updated_at !== undefined && String(body.expected_updated_at) === current.updated_at) {
    return Number(current.revision || 0);
  }
  throw validationError(`expected_revision is required for ${entity}`);
}

async function updateNote(db: D1Database, body: LeadCrmPayload, leadId: number): Promise<Record<string, unknown>> {
  const noteId = parsePositiveInteger(body.note_id);
  if (!noteId) throw validationError('A valid note_id is required');
  const current = await db.prepare('SELECT * FROM crm_notes WHERE id = ? AND lead_id = ?').bind(noteId, leadId).first<CrmNoteRow>();
  if (!current) throw Object.assign(new Error('Note not found'), { name: 'NotFoundError' });
  const actionId = normalizeActionId(body.action_id);
  if (current.action_id === actionId) return { changed: false, idempotent: true, note: current, action_id: actionId };
  const expectedRevision = expectedEntityRevision(body, current, 'note');
  if (expectedRevision !== Number(current.revision || 0)) throw conflictError('Note was changed in another tab. Reload it before saving.');
  const nextBody = body.body === undefined ? current.body : normalizeBoundedText(body.body, 'body', MAX_NOTE_LENGTH, true);
  const nextPinned = body.pinned === undefined ? current.pinned === 1 : parseBoolean(body.pinned, 'pinned');
  if (nextBody === current.body && nextPinned === (current.pinned === 1)) return { changed: false, note: current };
  const results = await db.batch([
    db.prepare(
      `UPDATE crm_notes SET body = ?, pinned = ?, revision = revision + 1, action_id = ?, updated_at = datetime('now')
       WHERE id = ? AND lead_id = ? AND revision = ?`,
    ).bind(nextBody, nextPinned ? 1 : 0, actionId, noteId, leadId, expectedRevision),
    db.prepare(
      `INSERT INTO lead_activity
         (lead_id, type, "from", "to", note, actor, entity_type, entity_id, action_id, metadata_json)
       SELECT n.lead_id, 'note_updated', NULL, NULL, n.body, 'admin', 'note', n.id, ?, ?
       FROM crm_notes n
       WHERE n.id = ? AND n.lead_id = ? AND n.action_id = ? AND n.revision = ?
         AND NOT EXISTS (SELECT 1 FROM lead_activity a WHERE a.action_id = ? AND a.type = 'note_updated')`,
    ).bind(
      actionId,
      JSON.stringify({ before: { body: current.body, pinned: current.pinned === 1 }, after: { body: nextBody, pinned: nextPinned } }),
      noteId,
      leadId,
      actionId,
      expectedRevision + 1,
      actionId,
    ),
  ]);
  if (resultChanges(results[0]) === 0) throw conflictError('Note was changed in another tab. Reload it before saving.');
  const note = await db.prepare('SELECT * FROM crm_notes WHERE id = ?').bind(noteId).first<CrmNoteRow>();
  return { changed: true, note, action_id: actionId };
}

async function deleteNote(db: D1Database, body: LeadCrmPayload, leadId: number): Promise<Record<string, unknown>> {
  const noteId = parsePositiveInteger(body.note_id);
  if (!noteId) throw validationError('A valid note_id is required');
  const actionId = normalizeActionId(body.action_id);
  const current = await db.prepare('SELECT * FROM crm_notes WHERE id = ? AND lead_id = ?').bind(noteId, leadId).first<CrmNoteRow>();
  if (!current) {
    const prior = await db.prepare("SELECT id FROM lead_activity WHERE action_id = ? AND type = 'note_deleted' AND entity_id = ?")
      .bind(actionId, noteId).first<{ id: number }>();
    if (prior) return { deleted: true, idempotent: true, note_id: noteId, action_id: actionId };
    throw Object.assign(new Error('Note not found'), { name: 'NotFoundError' });
  }
  const expectedRevision = expectedEntityRevision(body, current, 'note');
  if (expectedRevision !== Number(current.revision || 0)) throw conflictError('Note was changed in another tab. Reload it before deleting.');
  const results = await db.batch([
    db.prepare(
      `INSERT INTO lead_activity
         (lead_id, type, "from", "to", note, actor, entity_type, entity_id, action_id, metadata_json)
       SELECT n.lead_id, 'note_deleted', NULL, NULL, '', 'admin', 'note', n.id, ?, ?
       FROM crm_notes n
       WHERE n.id = ? AND n.lead_id = ? AND n.revision = ?
         AND NOT EXISTS (SELECT 1 FROM lead_activity a WHERE a.action_id = ? AND a.type = 'note_deleted')`,
    ).bind(actionId, JSON.stringify({ deleted: current }), noteId, leadId, expectedRevision, actionId),
    db.prepare('DELETE FROM crm_notes WHERE id = ? AND lead_id = ? AND revision = ?')
      .bind(noteId, leadId, expectedRevision),
  ]);
  if (resultChanges(results[1]) === 0) throw conflictError('Note was changed in another tab. Reload it before deleting.');
  return { deleted: true, note_id: noteId, action_id: actionId };
}

async function createTask(db: D1Database, body: LeadCrmPayload, leadId: number): Promise<Record<string, unknown>> {
  const title = normalizeBoundedText(body.title, 'title', MAX_TASK_TITLE_LENGTH, true);
  const kind = body.kind === undefined ? 'follow_up' : normalizeEnum(body.kind, 'kind', ADMIN_CRM_TASK_KINDS);
  const priority = body.priority === undefined ? 'normal' : normalizeEnum(body.priority, 'priority', ADMIN_CRM_PRIORITIES);
  const dueAt = normalizeDateTime(body.due_at ?? null, 'due_at');
  const actionId = normalizeActionId(body.action_id);
  const results = await db.batch([
    db.prepare(
      `INSERT INTO crm_tasks (lead_id, title, kind, priority, due_at, revision, action_id)
       VALUES (?, ?, ?, ?, ?, 0, ?) ON CONFLICT DO NOTHING`,
    ).bind(leadId, title, kind, priority, dueAt, actionId),
    db.prepare(
      `INSERT INTO lead_activity
         (lead_id, type, "from", "to", note, actor, entity_type, entity_id, action_id, metadata_json)
       SELECT t.lead_id, 'task_created', NULL, NULL, t.title, 'admin', 'task', t.id, ?, ?
       FROM crm_tasks t
       WHERE t.lead_id = ? AND t.action_id = ?
         AND NOT EXISTS (SELECT 1 FROM lead_activity a WHERE a.action_id = ? AND a.type = 'task_created')`,
    ).bind(actionId, JSON.stringify({ kind, priority, due_at: dueAt }), leadId, actionId, actionId),
  ]);
  const task = await db.prepare('SELECT * FROM crm_tasks WHERE lead_id = ? AND action_id = ?')
    .bind(leadId, actionId).first<CrmTaskRow>();
  if (!task) throw conflictError('action_id was already used by another CRM mutation');
  return { task, action_id: actionId, idempotent: resultChanges(results[0]) === 0 };
}

async function updateTask(db: D1Database, body: LeadCrmPayload, leadId: number): Promise<Record<string, unknown>> {
  const taskId = parsePositiveInteger(body.task_id);
  if (!taskId) throw validationError('A valid task_id is required');
  const current = await db.prepare('SELECT * FROM crm_tasks WHERE id = ? AND lead_id = ?').bind(taskId, leadId).first<CrmTaskRow>();
  if (!current) throw Object.assign(new Error('Task not found'), { name: 'NotFoundError' });
  const actionId = normalizeActionId(body.action_id);
  if (current.action_id === actionId) return { changed: false, idempotent: true, task: current, action_id: actionId };
  const expectedRevision = expectedEntityRevision(body, current, 'task');
  if (expectedRevision !== Number(current.revision || 0)) throw conflictError('Task was changed in another tab. Reload it before saving.');
  const next = {
    title: body.title === undefined ? current.title : normalizeBoundedText(body.title, 'title', MAX_TASK_TITLE_LENGTH, true),
    kind: body.kind === undefined ? current.kind : normalizeEnum(body.kind, 'kind', ADMIN_CRM_TASK_KINDS),
    status: body.status === undefined ? current.status : normalizeEnum(body.status, 'status', ADMIN_CRM_TASK_STATUSES),
    priority: body.priority === undefined ? current.priority : normalizeEnum(body.priority, 'priority', ADMIN_CRM_PRIORITIES),
    due_at: body.due_at === undefined ? current.due_at : normalizeDateTime(body.due_at, 'due_at'),
  };
  const same = next.title === current.title && next.kind === current.kind && next.status === current.status
    && next.priority === current.priority && next.due_at === current.due_at;
  if (same) return { changed: false, task: current };
  const completedAtSql = next.status === 'completed'
    ? "COALESCE(completed_at, datetime('now'))"
    : 'NULL';
  const results = await db.batch([
    db.prepare(
      `UPDATE crm_tasks SET title = ?, kind = ?, status = ?, priority = ?, due_at = ?,
       completed_at = ${completedAtSql}, revision = revision + 1, action_id = ?, updated_at = datetime('now')
       WHERE id = ? AND lead_id = ? AND revision = ?`,
    ).bind(next.title, next.kind, next.status, next.priority, next.due_at, actionId, taskId, leadId, expectedRevision),
    db.prepare(
      `INSERT INTO lead_activity
         (lead_id, type, "from", "to", note, actor, entity_type, entity_id, action_id, metadata_json)
       SELECT t.lead_id, ?, NULL, NULL, t.title, 'admin', 'task', t.id, ?, ?
       FROM crm_tasks t
       WHERE t.id = ? AND t.lead_id = ? AND t.action_id = ? AND t.revision = ?
         AND NOT EXISTS (SELECT 1 FROM lead_activity a WHERE a.action_id = ? AND a.type = ?)`,
    ).bind(
      next.status !== current.status ? `task_${next.status}` : 'task_updated',
      actionId,
      JSON.stringify({ before: current, after: next }),
      taskId,
      leadId,
      actionId,
      expectedRevision + 1,
      actionId,
      next.status !== current.status ? `task_${next.status}` : 'task_updated',
    ),
  ]);
  if (resultChanges(results[0]) === 0) throw conflictError('Task was changed in another tab. Reload it before saving.');
  const task = await db.prepare('SELECT * FROM crm_tasks WHERE id = ?').bind(taskId).first<CrmTaskRow>();
  return { changed: true, task, action_id: actionId };
}

async function deleteTask(db: D1Database, body: LeadCrmPayload, leadId: number): Promise<Record<string, unknown>> {
  const taskId = parsePositiveInteger(body.task_id);
  if (!taskId) throw validationError('A valid task_id is required');
  const actionId = normalizeActionId(body.action_id);
  const current = await db.prepare('SELECT * FROM crm_tasks WHERE id = ? AND lead_id = ?').bind(taskId, leadId).first<CrmTaskRow>();
  if (!current) {
    const prior = await db.prepare("SELECT id FROM lead_activity WHERE action_id = ? AND type = 'task_deleted' AND entity_id = ?")
      .bind(actionId, taskId).first<{ id: number }>();
    if (prior) return { deleted: true, idempotent: true, task_id: taskId, action_id: actionId };
    throw Object.assign(new Error('Task not found'), { name: 'NotFoundError' });
  }
  const expectedRevision = expectedEntityRevision(body, current, 'task');
  if (expectedRevision !== Number(current.revision || 0)) throw conflictError('Task was changed in another tab. Reload it before deleting.');
  const results = await db.batch([
    db.prepare(
      `INSERT INTO lead_activity
         (lead_id, type, "from", "to", note, actor, entity_type, entity_id, action_id, metadata_json)
       SELECT t.lead_id, 'task_deleted', NULL, NULL, '', 'admin', 'task', t.id, ?, ?
       FROM crm_tasks t
       WHERE t.id = ? AND t.lead_id = ? AND t.revision = ?
         AND NOT EXISTS (SELECT 1 FROM lead_activity a WHERE a.action_id = ? AND a.type = 'task_deleted')`,
    ).bind(actionId, JSON.stringify({ deleted: current }), taskId, leadId, expectedRevision, actionId),
    db.prepare('DELETE FROM crm_tasks WHERE id = ? AND lead_id = ? AND revision = ?')
      .bind(taskId, leadId, expectedRevision),
  ]);
  if (resultChanges(results[1]) === 0) throw conflictError('Task was changed in another tab. Reload it before deleting.');
  return { deleted: true, task_id: taskId, action_id: actionId };
}

interface NormalizedTag {
  name: string;
  slug: string;
  color: string;
}

function normalizeTags(value: unknown): NormalizedTag[] {
  if (!Array.isArray(value)) throw validationError('tags must be an array');
  if (value.length > MAX_TAGS_PER_LEAD) throw validationError(`A lead can have at most ${MAX_TAGS_PER_LEAD} tags`);
  const tags = value.map((raw, index) => {
    const nameValue = typeof raw === 'string' ? raw : (raw && typeof raw === 'object' ? (raw as Record<string, unknown>).name : '');
    const colorValue = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).color : undefined;
    const name = normalizeBoundedText(nameValue, `tags[${index}].name`, MAX_TAG_NAME_LENGTH, true);
    const slug = normalizeTagSlug(name);
    if (!slug) throw validationError(`tags[${index}].name must contain a letter or number`);
    return { name, slug, color: normalizeTagColor(colorValue) };
  });
  return Array.from(new Map(tags.map((tag) => [tag.slug, tag])).values());
}

async function leadHasColumn(db: D1Database, column: string): Promise<boolean> {
  const rows = await db.prepare('PRAGMA table_info(leads)').all<{ name: string }>();
  return (rows.results || []).some((row) => row.name === column);
}

/**
 * Слияние дублей: две карточки одного человека сводятся в одну.
 *
 * Ничего не удаляется безвозвратно — дубль уходит в корзину заявок, откуда
 * его можно вернуть. Заполненные поля основной карточки не перезаписываются:
 * из дубля подтягивается только то, чего в основной нет. Заметки и задачи
 * переезжают целиком, счётчик обращений складывается, а в основную карточку
 * добавляется заметка о слиянии — чтобы через месяц было понятно, откуда
 * взялись чужие данные.
 */
async function mergeLead(db: D1Database, body: LeadCrmPayload, leadId: number): Promise<Record<string, unknown>> {
  const duplicateId = parsePositiveInteger(body.duplicate_id);
  if (!duplicateId) throw validationError('A valid duplicate_id is required');
  if (duplicateId === leadId) throw validationError('Нельзя объединить заявку саму с собой');

  const hasSoftDelete = await leadHasColumn(db, 'deleted_at');
  if (!hasSoftDelete) throw validationError('Нужна миграция 0020: без корзины слияние необратимо');

  const columns = ['id', 'name', 'email', 'phone', 'telegram_username', 'contact_method', 'budget', 'message', 'service', 'page_path'];
  const optional = ['submissions_count', 'last_submitted_at', 'utm_source', 'utm_medium', 'utm_campaign'];
  for (const column of optional) {
    if (await leadHasColumn(db, column)) columns.push(column);
  }
  const select = columns.join(', ');

  const [primary, duplicate] = await Promise.all([
    db.prepare(`SELECT ${select} FROM leads WHERE id = ? AND deleted_at IS NULL`).bind(leadId).first<Record<string, unknown>>(),
    db.prepare(`SELECT ${select} FROM leads WHERE id = ? AND deleted_at IS NULL`).bind(duplicateId).first<Record<string, unknown>>(),
  ]);
  if (!primary) throw validationError('Основная заявка не найдена или уже в корзине');
  if (!duplicate) throw validationError('Дубль не найден или уже в корзине');

  // Переносим только пустые поля: то, что уже заполнено руками, — приоритетнее.
  const fillable = columns.filter((column) => column !== 'id' && column !== 'submissions_count' && column !== 'last_submitted_at');
  const updates: string[] = [];
  const values: unknown[] = [];
  const filled: string[] = [];
  for (const column of fillable) {
    const current = String(primary[column] ?? '').trim();
    const incoming = String(duplicate[column] ?? '').trim();
    if (current || !incoming) continue;
    updates.push(`${column} = ?`);
    values.push(incoming);
    filled.push(column);
  }

  if (columns.includes('submissions_count')) {
    const total = (Number(primary.submissions_count) || 1) + (Number(duplicate.submissions_count) || 1);
    updates.push('submissions_count = ?');
    values.push(total);
  }
  if (columns.includes('last_submitted_at')) {
    const latest = [String(primary.last_submitted_at || ''), String(duplicate.last_submitted_at || '')]
      .filter(Boolean)
      .sort()
      .pop();
    if (latest) {
      updates.push('last_submitted_at = ?');
      values.push(latest);
    }
  }

  const summary = [
    `Объединено с заявкой #${duplicateId}${duplicate.name ? ` («${String(duplicate.name).slice(0, 80)}»)` : ''}.`,
    filled.length ? `Перенесены пустые поля: ${filled.join(', ')}.` : 'Все поля основной заявки уже были заполнены.',
    'Дубль отправлен в корзину — его можно вернуть.',
  ].join(' ');

  const statements = [
    db.prepare('UPDATE crm_notes SET lead_id = ? WHERE lead_id = ?').bind(leadId, duplicateId),
    db.prepare('UPDATE crm_tasks SET lead_id = ? WHERE lead_id = ?').bind(leadId, duplicateId),
    db.prepare(
      `UPDATE leads SET deleted_at = datetime('now'), deleted_reason = ?, updated_at = datetime('now')
       WHERE id = ? AND deleted_at IS NULL`,
    ).bind(`Объединена с заявкой #${leadId}`, duplicateId),
    db.prepare('INSERT INTO crm_notes (lead_id, body, pinned) VALUES (?, ?, 0)').bind(leadId, summary),
  ];
  if (updates.length) {
    statements.unshift(
      db.prepare(`UPDATE leads SET ${updates.join(', ')}, updated_at = datetime('now') WHERE id = ?`).bind(...values, leadId),
    );
  }

  await db.batch(statements);
  return { merged: duplicateId, filled, summary };
}

async function setTags(db: D1Database, body: LeadCrmPayload, leadId: number): Promise<Record<string, unknown>> {
  const requested = normalizeTags(body.tags);
  const actionId = normalizeActionId(body.action_id);
  const lead = await db.prepare('SELECT crm_revision, crm_action_id FROM leads WHERE id = ?')
    .bind(leadId).first<{ crm_revision: number; crm_action_id: string }>();
  if (!lead) throw Object.assign(new Error('Lead not found'), { name: 'NotFoundError' });
  const currentResult = await db.prepare(
    `SELECT t.id, t.name, t.slug, t.color, t.created_at, t.updated_at
     FROM crm_tags t INNER JOIN crm_lead_tags lt ON lt.tag_id = t.id
     WHERE lt.lead_id = ? ORDER BY lower(t.name), t.id`,
  ).bind(leadId).all<CrmTagRow>();
  const current = currentResult.results || [];
  if (lead.crm_action_id === actionId) {
    return { changed: false, idempotent: true, tags: current, action_id: actionId };
  }
  if (body.expected_revision === undefined) throw validationError('expected_revision is required');
  const expectedRevision = parseBoundedInteger(body.expected_revision, 0, Number.MAX_SAFE_INTEGER, 'expected_revision');
  if (expectedRevision !== Number(lead.crm_revision || 0)) {
    throw conflictError('Lead was changed in another tab. Reload it before saving tags.');
  }

  const currentSlugs = current.map((tag) => tag.slug).sort().join(',');
  const requestedSlugs = requested.map((tag) => tag.slug).sort().join(',');
  if (currentSlugs === requestedSlugs) return { changed: false, tags: current };

  // Every statement is guarded by the same lead revision. D1 batch execution is
  // transactional, so a competing tab cannot leave a half-applied tag set.
  const statements: D1PreparedStatement[] = [];
  for (const tag of requested) {
    statements.push(db.prepare(
      `INSERT INTO crm_tags (name, slug, color)
       SELECT ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM leads WHERE id = ? AND crm_revision = ?)
       ON CONFLICT(slug) DO UPDATE SET
         name = excluded.name,
         color = excluded.color,
         updated_at = datetime('now')`,
    ).bind(tag.name, tag.slug, tag.color, leadId, expectedRevision));
  }
  statements.push(db.prepare(
    `DELETE FROM crm_lead_tags
     WHERE lead_id = ?
       AND EXISTS (SELECT 1 FROM leads WHERE id = ? AND crm_revision = ?)`,
  ).bind(leadId, leadId, expectedRevision));
  for (const tag of requested) {
    statements.push(db.prepare(
      `INSERT OR IGNORE INTO crm_lead_tags (lead_id, tag_id)
       SELECT ?, t.id FROM crm_tags t
       WHERE t.slug = ?
         AND EXISTS (SELECT 1 FROM leads WHERE id = ? AND crm_revision = ?)`,
    ).bind(leadId, tag.slug, leadId, expectedRevision));
  }
  const updateIndex = statements.length;
  statements.push(db.prepare(
    `UPDATE leads
     SET crm_revision = crm_revision + 1, crm_action_id = ?, updated_at = datetime('now')
     WHERE id = ? AND crm_revision = ?`,
  ).bind(actionId, leadId, expectedRevision));
  statements.push(db.prepare(
    `INSERT INTO lead_activity
       (lead_id, type, "from", "to", note, actor, entity_type, entity_id, action_id, metadata_json)
     SELECT id, 'tags_updated', NULL, NULL, '', 'admin', 'tag', NULL, ?, ?
     FROM leads
     WHERE id = ? AND crm_action_id = ?
       AND NOT EXISTS (SELECT 1 FROM lead_activity WHERE action_id = ? AND type = 'tags_updated')`,
  ).bind(
    actionId,
    JSON.stringify({
      before: current.map(({ id, name, slug, color }) => ({ id, name, slug, color })),
      after: requested,
    }),
    leadId,
    actionId,
    actionId,
  ));

  const results = await db.batch(statements);
  if (resultChanges(results[updateIndex]) === 0) {
    throw conflictError('Lead was changed in another tab. Reload it before saving tags.');
  }
  const nextResult = await db.prepare(
    `SELECT t.id, t.name, t.slug, t.color, t.created_at, t.updated_at
     FROM crm_tags t INNER JOIN crm_lead_tags lt ON lt.tag_id = t.id
     WHERE lt.lead_id = ? ORDER BY lower(t.name), t.id`,
  ).bind(leadId).all<CrmTagRow>();
  return { changed: true, tags: nextResult.results || [], action_id: actionId };
}

async function getGlobalTasks(db: D1Database, url: URL): Promise<CrmTaskRow[]> {
  const status = url.searchParams.get('status') || 'open';
  if (!(ADMIN_CRM_TASK_STATUSES as readonly string[]).includes(status) && status !== 'all') {
    throw validationError(`status must be one of: ${ADMIN_CRM_TASK_STATUSES.join(', ')}, all`);
  }
  const scope = url.searchParams.get('scope') || 'all';
  if (!['all', 'overdue', 'today', 'upcoming', 'unscheduled'].includes(scope)) {
    throw validationError('scope must be one of: all, overdue, today, upcoming, unscheduled');
  }
  const requestedLimit = Number(url.searchParams.get('limit') || DEFAULT_TASK_LIMIT);
  const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), MAX_TASK_LIMIT) : DEFAULT_TASK_LIMIT;
  const where: string[] = [];
  const values: Array<string | number> = [];
  if (status !== 'all') { where.push('t.status = ?'); values.push(status); }
  if (scope === 'overdue') where.push("t.due_at IS NOT NULL AND datetime(t.due_at) < datetime('now')");
  if (scope === 'today') where.push("t.due_at IS NOT NULL AND date(t.due_at) = date('now')");
  if (scope === 'upcoming') where.push("t.due_at IS NOT NULL AND datetime(t.due_at) > datetime('now')");
  if (scope === 'unscheduled') where.push('t.due_at IS NULL');
  values.push(limit);
  const result = await db.prepare(
    `SELECT t.id, t.lead_id, t.title, t.kind, t.status, t.priority, t.due_at, t.completed_at,
            t.created_at, t.updated_at, l.name AS lead_name, l.service AS lead_service,
            l.pipeline_stage AS pipeline_stage
     FROM crm_tasks t INNER JOIN leads l ON l.id = t.lead_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'normal' THEN 2 ELSE 3 END,
              CASE WHEN t.due_at IS NULL THEN 1 ELSE 0 END, t.due_at ASC, t.id DESC LIMIT ?`,
  ).bind(...values).all<CrmTaskRow>();
  return result.results || [];
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
  try {
    const capabilities = await assertAdminCrmSchema(env.DB, 'base');
    const resource = url.searchParams.get('resource') || 'lead';
    if (resource === 'tags') {
      await assertAdminCrmSchema(env.DB, 'workspace');
      const result = await env.DB.prepare(
        `SELECT t.id, t.name, t.slug, t.color, t.created_at, t.updated_at, COUNT(lt.lead_id) AS leads_count
         FROM crm_tags t LEFT JOIN crm_lead_tags lt ON lt.tag_id = t.id
         GROUP BY t.id ORDER BY lower(t.name), t.id`,
      ).all<CrmTagRow>();
      return json({ success: true, capabilities, tags: result.results || [] }, { headers: noStore });
    }
    if (resource === 'tasks') {
      await assertAdminCrmSchema(env.DB, 'workspace');
      const tasks = await getGlobalTasks(env.DB, url);
      return json({ success: true, capabilities, tasks }, { headers: noStore });
    }
    if (resource !== 'lead') throw validationError('resource must be one of: lead, tags, tasks');

    const leadId = parsePositiveInteger(url.searchParams.get('lead_id') || url.searchParams.get('id'));
    if (!leadId) throw validationError('A valid lead_id is required');
    const requestedLimit = Number(url.searchParams.get('limit') || DEFAULT_ACTIVITY_LIMIT);
    const activityLimit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), MAX_ACTIVITY_LIMIT)
      : DEFAULT_ACTIVITY_LIMIT;
    const bundle = await getLeadBundle(env.DB, leadId, capabilities, activityLimit);
    if (!bundle) return json({ success: false, error: 'Lead not found' }, { status: 404, headers: noStore });
    return json({ success: true, capabilities, ...bundle }, { headers: noStore });
  } catch (error) {
    if (error instanceof Error && error.name === 'NotFoundError') {
      return json({ success: false, error: error.message }, { status: 404, headers: noStore });
    }
    return handleError(error, 'Failed to load CRM data');
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
  if (!leadId) return json({ success: false, error: 'A valid lead_id is required' }, { status: 400, headers: noStore });
  const action = String(body.action || 'update_lead');
  try {
    const requirement = action === 'update_lead' ? 'base' : 'correctness';
    const capabilities = await assertAdminCrmSchema(env.DB, requirement);
    const exists = await env.DB.prepare('SELECT id FROM leads WHERE id = ?').bind(leadId).first<{ id: number }>();
    if (!exists) return json({ success: false, error: 'Lead not found' }, { status: 404, headers: noStore });

    let result: Record<string, unknown>;
    if (action === 'update_lead') result = await updateLead(env.DB, body, leadId, capabilities);
    else if (action === 'add_note') result = await addNote(env.DB, body, leadId);
    else if (action === 'update_note') result = await updateNote(env.DB, body, leadId);
    else if (action === 'delete_note') result = await deleteNote(env.DB, body, leadId);
    else if (action === 'create_task') result = await createTask(env.DB, body, leadId);
    else if (action === 'update_task') result = await updateTask(env.DB, body, leadId);
    else if (action === 'delete_task') result = await deleteTask(env.DB, body, leadId);
    else if (action === 'set_tags') result = await setTags(env.DB, body, leadId);
    else if (action === 'merge_lead') result = await mergeLead(env.DB, body, leadId);
    else throw validationError('Unknown action');

    return json({ success: true, action, ...result }, { headers: noStore });
  } catch (error) {
    if (error instanceof Error && error.name === 'NotFoundError') {
      return json({ success: false, error: error.message }, { status: 404, headers: noStore });
    }
    return handleError(error, 'Failed to update CRM data');
  }
};
