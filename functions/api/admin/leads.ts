import { json } from '../../_lib/http';
import { CACHE_CONTROL } from '../../_lib/cache';
import { verifyAdminPassword } from '../../_lib/auth';
import {
  AdminCrmMigrationRequiredError,
  adminCrmMigrationResponse,
  assertAdminCrmSchema,
} from '../../_lib/admin-crm';
import {
  attachAdminQualityDelivery,
  qualityEventIds,
  type AdminQualityDeliveryItem,
} from '../../_lib/admin-lead-quality-status';
import { enforceRateLimit } from '../../_lib/rate-limit';
import { sendLeadQualityEvent, type LeadQualityResult, type LeadQualityRow } from '../../_lib/lead-quality';
import { recordMetaDiagnostics } from '../../_lib/meta-diagnostics';
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
    const leads = await attachAdminQualityDelivery(env.DB, (rows.results || []) as AdminLeadRow[]);
    return json({ success: true, leads, counts: byStatus }, { headers: noStore });
  } catch (error) {
    if (isMissingTableError(error)) {
      return json({ success: false, error: 'Таблица заявок ещё не создана — примените миграцию 0008 в D1' }, { status: 503, headers: noStore });
    }
    return json({ success: false, error: error instanceof Error ? error.message : 'Failed to load leads' }, { status: 500, headers: noStore });
  }
};

const LEAD_QUALITIES = new Set(['', 'target', 'nontarget']);

function resultChanges(result: { meta?: { changes?: number } } | undefined): number {
  return Number(result?.meta?.changes || 0);
}

function normalizeActionId(value: unknown): string {
  if (value === undefined || value === null || value === '') return crypto.randomUUID();
  const normalized = String(value).trim();
  if (!normalized || normalized.length > 80 || !/^[a-zA-Z0-9:_-]+$/.test(normalized)) {
    throw new Error('action_id must be 1-80 safe characters');
  }
  return normalized;
}

function currentQualityDelivery(
  history: AdminQualityDeliveryItem[] | undefined,
  quality: string,
): AdminQualityDeliveryItem | undefined {
  if (quality !== 'target' && quality !== 'nontarget') return undefined;
  return history?.find((item) => item.current)
    || history?.find((item) => item.quality === quality);
}

function qualityStateError(
  code: string,
  error: string,
  delivery?: AdminQualityDeliveryItem,
): Response {
  return json({ success: false, code, error, delivery }, { status: 409, headers: noStore });
}

// Обновление заявки: { id, status?: new|in_progress|closed, quality?: ''|target|nontarget }
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => ({})) as {
    password?: string;
    id?: number;
    status?: string;
    quality?: string;
    expected_quality_revision?: number;
    confirm_previous_delivery?: boolean;
    action_id?: string;
  };
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
  // These mutations have different delivery semantics. Keeping them separate
  // prevents a quality conflict from returning an error after status persisted.
  if (hasStatus && hasQuality) {
    return json({ success: false, error: 'Update status and quality in separate requests' }, { status: 400, headers: noStore });
  }
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
      await assertAdminCrmSchema(env.DB, 'correctness');
      const row = await env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(id).first<AdminLeadRow & {
        quality_revision?: number;
        quality_action_id?: string;
      }>();
      if (!row) return json({ success: false, error: 'Lead not found' }, { status: 404, headers: noStore });

      const actionId = normalizeActionId(body.action_id);
      const expectedRevision = Number(body.expected_quality_revision);
      if (!Number.isInteger(expectedRevision) || expectedRevision < 0) {
        return json({ success: false, error: 'expected_quality_revision is required' }, { status: 400, headers: noStore });
      }
      const currentQuality = row.quality === 'target' || row.quality === 'nontarget' ? row.quality : '';
      const currentRevision = Number(row.quality_revision || 0);

      // A retried request with the same action id must finish the Meta delivery
      // phase instead of applying the CRM mutation twice.
      if (row.quality_action_id === actionId) {
        if (quality !== currentQuality) {
          return qualityStateError('QUALITY_ACTION_ID_REUSED', 'Этот action_id уже относится к другой классификации.');
        }
        if (currentQuality === 'target' || currentQuality === 'nontarget') {
          try {
            meta = await sendLeadQualityEvent(env, row, currentQuality);
          } finally {
            await env.DB.prepare(
              "UPDATE leads SET quality_processing = 0 WHERE id = ? AND quality_action_id = ?",
            ).bind(id, actionId).run();
          }
        }
        const refreshed = await env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(id).first<AdminLeadRow>();
        const [delivery] = refreshed ? await attachAdminQualityDelivery(env.DB, [refreshed]) : [];
        return json({ success: true, idempotent: true, meta, lead: delivery }, { headers: noStore });
      }
      if (Number(row.quality_processing || 0) === 1) {
        return qualityStateError(
          'QUALITY_DELIVERY_IN_PROGRESS',
          'Предыдущая операция ещё завершает отправку в Meta. Повторите её или дождитесь результата.',
        );
      }
      if (expectedRevision !== currentRevision) {
        return qualityStateError('CRM_CONFLICT', 'Классификация изменена в другой вкладке. Обновите карточку.');
      }
      if (quality === currentQuality) {
        const [delivery] = await attachAdminQualityDelivery(env.DB, [row]);
        return json({ success: true, unchanged: true, lead: delivery }, { headers: noStore });
      }

      const [enrichedCurrent] = await attachAdminQualityDelivery(env.DB, [row]);
      const history = enrichedCurrent.quality_meta_history as AdminQualityDeliveryItem[] | undefined;
      const previousDelivery = currentQualityDelivery(history, currentQuality);
      const confirmPrevious = body.confirm_previous_delivery === true;

      if (previousDelivery?.queue_status === 'sending') {
        return qualityStateError(
          'QUALITY_DELIVERY_IN_PROGRESS',
          'Предыдущее событие уже отправляется. Дождитесь результата и повторите действие.',
          previousDelivery,
        );
      }
      if (
        currentQuality
        && previousDelivery
        && (previousDelivery.status === 'sent'
          || previousDelivery.status === 'unknown'
          || previousDelivery.queue_status === 'retry')
        && !confirmPrevious
      ) {
        return qualityStateError(
          'QUALITY_CONFIRMATION_REQUIRED',
          previousDelivery.status === 'sent'
            ? 'Предыдущее событие уже подтверждено Meta и не может быть отозвано.'
            : previousDelivery.queue_status === 'retry'
              ? 'Предыдущее событие ожидает повторной отправки. Подтвердите его отмену.'
              : 'Статус предыдущей отправки неизвестен. Подтвердите изменение вручную.',
          previousDelivery,
        );
      }

      const previousEventIds = currentQuality ? qualityEventIds(row, currentQuality) : [];
      const cancellableStatuses = confirmPrevious ? ['pending', 'retry'] : ['pending'];
      const statements: D1PreparedStatement[] = previousEventIds.map((eventId) => env.DB!.prepare(
        `DELETE FROM meta_outbox
         WHERE id = ? AND status IN (${cancellableStatuses.map(() => '?').join(', ')})
           AND EXISTS (
             SELECT 1 FROM leads
             WHERE id = ? AND quality_revision = ? AND COALESCE(quality, '') = ?
           )`,
      ).bind(eventId, ...cancellableStatuses, id, expectedRevision, currentQuality));

      const actionIdForAudit = actionId;
      const activePlaceholders = previousEventIds.map(() => '?').join(', ');
      const outboxGuards = previousEventIds.length
        ? `AND NOT EXISTS (
             SELECT 1 FROM meta_outbox
             WHERE id IN (${activePlaceholders}) AND status IN ('pending','retry','sending')
           )
           AND (? = 1 OR NOT EXISTS (
             SELECT 1 FROM meta_outbox
             WHERE id IN (${activePlaceholders}) AND status = 'sent'
           ))`
        : '';
      const updateValues: Array<string | number> = [
        quality,
        actionId,
        quality ? 1 : 0,
        actionIdForAudit,
        id,
        expectedRevision,
        currentQuality,
      ];
      if (previousEventIds.length) {
        updateValues.push(...previousEventIds, confirmPrevious ? 1 : 0, ...previousEventIds);
      }
      const updateIndex = statements.length;
      statements.push(env.DB.prepare(
        `UPDATE leads
         SET quality = ?, quality_revision = quality_revision + 1,
             quality_updated_at = datetime('now'), quality_action_id = ?,
             quality_processing = ?, crm_revision = crm_revision + 1,
             crm_action_id = ?, updated_at = datetime('now')
         WHERE id = ? AND quality_revision = ? AND COALESCE(quality, '') = ?
         ${outboxGuards}`,
      ).bind(...updateValues));
      statements.push(env.DB.prepare(
        `INSERT INTO lead_activity
           (lead_id, type, "from", "to", note, actor, entity_type, entity_id, action_id, metadata_json)
         SELECT id, 'quality_changed', ?, ?, '', 'admin', 'quality', id, ?, ?
         FROM leads
         WHERE id = ? AND quality_action_id = ? AND quality_revision = ?
           AND NOT EXISTS (SELECT 1 FROM lead_activity a WHERE a.action_id = ? AND a.type = 'quality_changed')`,
      ).bind(
        currentQuality,
        quality,
        actionId,
        JSON.stringify({ before: currentQuality, after: quality, confirmed_previous_delivery: confirmPrevious }),
        id,
        actionId,
        expectedRevision + 1,
        actionId,
      ));

      const results = await env.DB.batch(statements);
      if (resultChanges(results[updateIndex]) === 0) {
        const refreshed = await env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(id).first<AdminLeadRow>();
        const [withDelivery] = refreshed ? await attachAdminQualityDelivery(env.DB, [refreshed]) : [];
        const refreshedCurrent = withDelivery
          ? currentQualityDelivery(withDelivery.quality_meta_history as AdminQualityDeliveryItem[], currentQuality)
          : undefined;
        if (refreshedCurrent?.queue_status === 'sending') {
          return qualityStateError('QUALITY_DELIVERY_IN_PROGRESS', 'Meta уже начала отправку предыдущего события. Дождитесь результата.', refreshedCurrent);
        }
        return qualityStateError('CRM_CONFLICT', 'Классификация или очередь изменились параллельно. Обновите карточку.', refreshedCurrent);
      }

      for (let index = 0; index < previousEventIds.length; index += 1) {
        if (resultChanges(results[index]) === 0) continue;
        const cancelledQuality = currentQuality as 'target' | 'nontarget';
        await recordMetaDiagnostics(env, {
          event_name: cancelledQuality === 'target' ? 'QualifiedLead' : 'UnqualifiedLead',
          event_id: previousEventIds[index],
          event_time: Math.floor(Date.now() / 1000),
          status: 'skipped',
          error_message: 'cancelled_before_delivery_by_admin',
          page_path: row.page_path,
          event_source_url: row.event_source_url,
          service: row.service,
          marketing_consent: Number(row.marketing_consent || 0) === 1,
        });
      }

      // Метка «целевой/нецелевой» — сигнал качества для Meta. Снятие метки
      // не пытается «отозвать» уже подтверждённое событие: история сохраняется.
      if (quality === 'target' || quality === 'nontarget') {
        const updated = await env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(id).first<LeadQualityRow>();
        if (updated) {
          try {
            meta = await sendLeadQualityEvent(env, updated, quality);
          } finally {
            await env.DB.prepare(
              "UPDATE leads SET quality_processing = 0 WHERE id = ? AND quality_action_id = ?",
            ).bind(id, actionId).run();
          }
        }
      }
    }
    return json({ success: true, meta }, { headers: noStore });
  } catch (error) {
    if (error instanceof AdminCrmMigrationRequiredError) {
      return json(adminCrmMigrationResponse(error), { status: 503, headers: noStore });
    }
    return json({ success: false, error: error instanceof Error ? error.message : 'Failed to update lead' }, { status: 500, headers: noStore });
  }
};
