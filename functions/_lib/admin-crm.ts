export const ADMIN_CRM_MIGRATION = '0012_admin_control_center.sql';

export const ADMIN_CRM_STAGES = [
  'new',
  'contacted',
  'discovery',
  'proposal',
  'won',
  'lost',
  'archived',
] as const;

export type AdminCrmStage = typeof ADMIN_CRM_STAGES[number];

export interface AdminCrmLeadRow {
  id: number;
  pipeline_stage: AdminCrmStage;
  next_action_at: string | null;
  loss_reason: string;
  notes: string;
  deal_value: number | null;
  deal_currency: string;
}

export interface AdminCrmActivityRow {
  id: number;
  lead_id: number;
  type: string;
  from: string | null;
  to: string | null;
  note: string;
  created_at: string;
}

export class AdminCrmMigrationRequiredError extends Error {
  readonly code = 'ADMIN_CRM_MIGRATION_REQUIRED';

  constructor() {
    super(`Apply D1 migration ${ADMIN_CRM_MIGRATION} before using the mini-CRM`);
    this.name = 'AdminCrmMigrationRequiredError';
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

export async function assertAdminCrmSchema(db: D1Database): Promise<void> {
  try {
    const [leadColumnsResult, activityColumnsResult, activityTable] = await Promise.all([
      db.prepare('PRAGMA table_info(leads)').all<{ name: string }>(),
      db.prepare('PRAGMA table_info(lead_activity)').all<{ name: string }>(),
      db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'lead_activity'")
        .first<{ name: string }>(),
    ]);

    const leadColumns = new Set(
      (leadColumnsResult.results || []).map((column) => String(column.name || '')),
    );
    const activityColumns = new Set(
      (activityColumnsResult.results || []).map((column) => String(column.name || '')),
    );
    const hasAllLeadColumns = REQUIRED_LEAD_COLUMNS.every((column) => leadColumns.has(column));
    const hasAllActivityColumns = REQUIRED_ACTIVITY_COLUMNS.every((column) => activityColumns.has(column));
    if (!hasAllLeadColumns || !hasAllActivityColumns || !activityTable) {
      throw new AdminCrmMigrationRequiredError();
    }
  } catch (error) {
    if (error instanceof AdminCrmMigrationRequiredError) throw error;
    if (/no such table|no such column/i.test(error instanceof Error ? error.message : String(error))) {
      throw new AdminCrmMigrationRequiredError();
    }
    throw error;
  }
}

export function isAdminCrmMigrationError(error: unknown): boolean {
  if (error instanceof AdminCrmMigrationRequiredError) return true;
  return /no such table:\s*lead_activity|no such column:\s*(id|status|updated_at|pipeline_stage|next_action_at|loss_reason|notes|deal_value|deal_currency)/i
    .test(error instanceof Error ? error.message : String(error));
}

export function adminCrmMigrationResponse(): Record<string, unknown> {
  return {
    success: false,
    code: 'ADMIN_CRM_MIGRATION_REQUIRED',
    error: `Apply D1 migration ${ADMIN_CRM_MIGRATION} before using the mini-CRM`,
    migration: ADMIN_CRM_MIGRATION,
  };
}
