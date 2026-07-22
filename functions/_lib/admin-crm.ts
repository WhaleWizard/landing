export const ADMIN_CRM_MIGRATION = '0012_admin_control_center.sql';
export const ADMIN_CRM_WORKSPACE_MIGRATION = '0014_crm_workspace.sql';
export const ADMIN_CRM_CORRECTNESS_MIGRATION = '0017_crm_correctness.sql';

export const ADMIN_CRM_STAGES = [
  'new',
  'contacted',
  'discovery',
  'proposal',
  'won',
  'lost',
  'archived',
] as const;

export const ADMIN_CRM_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export const ADMIN_CRM_TASK_STATUSES = ['open', 'completed', 'cancelled'] as const;
export const ADMIN_CRM_TASK_KINDS = ['call', 'message', 'meeting', 'proposal', 'follow_up', 'other'] as const;

export type AdminCrmStage = typeof ADMIN_CRM_STAGES[number];
export type AdminCrmPriority = typeof ADMIN_CRM_PRIORITIES[number];
export type AdminCrmTaskStatus = typeof ADMIN_CRM_TASK_STATUSES[number];
export type AdminCrmTaskKind = typeof ADMIN_CRM_TASK_KINDS[number];

export interface AdminCrmLeadRow {
  id: number;
  pipeline_stage: AdminCrmStage;
  next_action_at: string | null;
  loss_reason: string;
  notes: string;
  deal_value: number | null;
  deal_currency: string;
  priority?: AdminCrmPriority;
  lead_score?: number;
  next_action_text?: string;
  pipeline_changed_at?: string | null;
  last_contacted_at?: string | null;
  closed_at?: string | null;
  crm_revision?: number;
  crm_action_id?: string;
  updated_at?: string;
}

export interface AdminCrmActivityRow {
  id: number;
  lead_id: number;
  type: string;
  from: string | null;
  to: string | null;
  note: string;
  created_at: string;
  actor?: string;
  entity_type?: string;
  entity_id?: number | null;
  action_id?: string;
  metadata_json?: string;
}

export interface AdminCrmCapabilities {
  base: boolean;
  workspace: boolean;
  correctness: boolean;
  notes: boolean;
  tasks: boolean;
  tags: boolean;
  auditContext: boolean;
  searchFilters: boolean;
  requiredMigration: string | null;
}

export type CrmRequirement = 'base' | 'workspace' | 'correctness';

export class AdminCrmMigrationRequiredError extends Error {
  readonly code: 'ADMIN_CRM_MIGRATION_REQUIRED' | 'ADMIN_CRM_WORKSPACE_MIGRATION_REQUIRED' | 'ADMIN_CRM_CORRECTNESS_MIGRATION_REQUIRED';
  readonly migration: string;

  constructor(requirement: CrmRequirement = 'base') {
    const workspace = requirement === 'workspace';
    const correctness = requirement === 'correctness';
    const migration = correctness
      ? ADMIN_CRM_CORRECTNESS_MIGRATION
      : workspace ? ADMIN_CRM_WORKSPACE_MIGRATION : ADMIN_CRM_MIGRATION;
    super(`Apply D1 migration ${migration} before using ${correctness ? 'safe CRM mutations' : workspace ? 'the CRM workspace' : 'the mini-CRM'}`);
    this.name = 'AdminCrmMigrationRequiredError';
    this.code = correctness
      ? 'ADMIN_CRM_CORRECTNESS_MIGRATION_REQUIRED'
      : workspace ? 'ADMIN_CRM_WORKSPACE_MIGRATION_REQUIRED' : 'ADMIN_CRM_MIGRATION_REQUIRED';
    this.migration = migration;
  }
}

const REQUIRED_LEAD_COLUMNS = [
  'id',
  'status',
  'updated_at',
  'pipeline_stage',
  'next_action_at',
  'loss_reason',
  'notes',
  'deal_value',
  'deal_currency',
] as const;

const REQUIRED_ACTIVITY_COLUMNS = [
  'id',
  'lead_id',
  'type',
  'from',
  'to',
  'note',
  'created_at',
] as const;

const WORKSPACE_LEAD_COLUMNS = [
  'priority',
  'lead_score',
  'next_action_text',
  'pipeline_changed_at',
  'last_contacted_at',
  'closed_at',
  'crm_revision',
] as const;

const WORKSPACE_ACTIVITY_COLUMNS = [
  'actor',
  'entity_type',
  'entity_id',
  'action_id',
  'metadata_json',
] as const;

const WORKSPACE_TABLES = ['crm_notes', 'crm_tasks', 'crm_tags', 'crm_lead_tags'] as const;

const CORRECTNESS_LEAD_COLUMNS = [
  'crm_action_id',
  'quality_revision',
  'quality_updated_at',
  'quality_action_id',
  'quality_processing',
] as const;

const CORRECTNESS_ENTITY_COLUMNS = ['revision', 'action_id'] as const;

function containsAll(values: Set<string>, required: readonly string[]): boolean {
  return required.every((value) => values.has(value));
}

export async function getAdminCrmCapabilities(db: D1Database): Promise<AdminCrmCapabilities> {
  try {
    const [leadColumnsResult, activityColumnsResult, tablesResult, noteColumnsResult, taskColumnsResult] = await Promise.all([
      db.prepare('PRAGMA table_info(leads)').all<{ name: string }>(),
      db.prepare('PRAGMA table_info(lead_activity)').all<{ name: string }>(),
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all<{ name: string }>(),
      db.prepare('PRAGMA table_info(crm_notes)').all<{ name: string }>(),
      db.prepare('PRAGMA table_info(crm_tasks)').all<{ name: string }>(),
    ]);
    const leadColumns = new Set((leadColumnsResult.results || []).map((column) => String(column.name || '')));
    const activityColumns = new Set((activityColumnsResult.results || []).map((column) => String(column.name || '')));
    const tables = new Set((tablesResult.results || []).map((table) => String(table.name || '')));
    const noteColumns = new Set((noteColumnsResult.results || []).map((column) => String(column.name || '')));
    const taskColumns = new Set((taskColumnsResult.results || []).map((column) => String(column.name || '')));
    const base = containsAll(leadColumns, REQUIRED_LEAD_COLUMNS)
      && containsAll(activityColumns, REQUIRED_ACTIVITY_COLUMNS)
      && tables.has('lead_activity');
    const notes = tables.has('crm_notes');
    const tasks = tables.has('crm_tasks');
    const tags = tables.has('crm_tags') && tables.has('crm_lead_tags');
    const auditContext = containsAll(activityColumns, WORKSPACE_ACTIVITY_COLUMNS);
    const workspace = base
      && containsAll(leadColumns, WORKSPACE_LEAD_COLUMNS)
      && containsAll(tables, WORKSPACE_TABLES)
      && auditContext;
    const correctness = workspace
      && containsAll(leadColumns, CORRECTNESS_LEAD_COLUMNS)
      && containsAll(noteColumns, CORRECTNESS_ENTITY_COLUMNS)
      && containsAll(taskColumns, CORRECTNESS_ENTITY_COLUMNS);
    return {
      base,
      workspace,
      correctness,
      notes,
      tasks,
      tags,
      auditContext,
      searchFilters: workspace,
      requiredMigration: correctness
        ? null
        : workspace ? ADMIN_CRM_CORRECTNESS_MIGRATION : base ? ADMIN_CRM_WORKSPACE_MIGRATION : ADMIN_CRM_MIGRATION,
    };
  } catch (error) {
    if (/no such table|no such column/i.test(error instanceof Error ? error.message : String(error))) {
      return {
        base: false,
        workspace: false,
        correctness: false,
        notes: false,
        tasks: false,
        tags: false,
        auditContext: false,
        searchFilters: false,
        requiredMigration: ADMIN_CRM_MIGRATION,
      };
    }
    throw error;
  }
}

export async function assertAdminCrmSchema(
  db: D1Database,
  requirement: CrmRequirement = 'base',
): Promise<AdminCrmCapabilities> {
  const capabilities = await getAdminCrmCapabilities(db);
  if (!capabilities.base) throw new AdminCrmMigrationRequiredError('base');
  if (requirement === 'workspace' && !capabilities.workspace) {
    throw new AdminCrmMigrationRequiredError('workspace');
  }
  if (requirement === 'correctness') {
    if (!capabilities.workspace) throw new AdminCrmMigrationRequiredError('workspace');
    if (!capabilities.correctness) throw new AdminCrmMigrationRequiredError('correctness');
  }
  return capabilities;
}

export function isAdminCrmMigrationError(error: unknown): boolean {
  if (error instanceof AdminCrmMigrationRequiredError) return true;
  return /no such table:\s*(lead_activity|crm_notes|crm_tasks|crm_tags|crm_lead_tags)|no such column:\s*(pipeline_stage|next_action_at|loss_reason|notes|deal_value|deal_currency|priority|lead_score|next_action_text|crm_revision|crm_action_id|quality_revision|quality_updated_at|quality_action_id|quality_processing|revision|actor|entity_type|entity_id|action_id|metadata_json)/i
    .test(error instanceof Error ? error.message : String(error));
}

export function adminCrmMigrationResponse(
  error?: AdminCrmMigrationRequiredError,
): Record<string, unknown> {
  const migrationError = error || new AdminCrmMigrationRequiredError('base');
  return {
    success: false,
    code: migrationError.code,
    error: migrationError.message,
    migration: migrationError.migration,
  };
}

export interface CrmActivityInput {
  leadId: number;
  type: string;
  from?: string | number | null;
  to?: string | number | null;
  note?: string;
  actor?: string;
  entityType?: 'lead' | 'note' | 'task' | 'tag' | 'quality';
  entityId?: number | null;
  actionId?: string;
  metadata?: Record<string, unknown>;
}

function serializeActivityValue(value: string | number | null | undefined): string | null {
  return value === null || value === undefined ? null : String(value);
}

export function createCrmActivityStatement(
  db: D1Database,
  input: CrmActivityInput,
  withAuditContext: boolean,
): D1PreparedStatement {
  if (!withAuditContext) {
    return db.prepare(
      `INSERT INTO lead_activity (lead_id, type, "from", "to", note)
       VALUES (?, ?, ?, ?, ?)`,
    ).bind(
      input.leadId,
      input.type,
      serializeActivityValue(input.from),
      serializeActivityValue(input.to),
      input.note || '',
    );
  }
  return db.prepare(
    `INSERT INTO lead_activity
       (lead_id, type, "from", "to", note, actor, entity_type, entity_id, action_id, metadata_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    input.leadId,
    input.type,
    serializeActivityValue(input.from),
    serializeActivityValue(input.to),
    input.note || '',
    input.actor || 'admin',
    input.entityType || 'lead',
    input.entityId ?? null,
    input.actionId || crypto.randomUUID(),
    JSON.stringify(input.metadata || {}),
  );
}
