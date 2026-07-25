import type { MetaOutboxEventState, OutboxStatus } from './meta-outbox';

export type AdminLeadQuality = 'target' | 'nontarget';
export type AdminQualityDeliveryStatus = 'queued' | 'sent' | 'skipped' | 'failed' | 'unknown';

export interface AdminQualityDeliveryItem {
  quality: AdminLeadQuality;
  event_name: 'QualifiedLead' | 'UnqualifiedLead';
  event_id: string;
  status: AdminQualityDeliveryStatus;
  queue_status?: OutboxStatus;
  attempts?: number;
  reason?: string | null;
  sent_at?: number | null;
  updated_at?: string | null;
  current: boolean;
}

export interface AdminQualityLeadRow {
  id: number;
  event_id?: string;
  quality?: string;
  quality_action_id?: string;
  [key: string]: unknown;
}

type DiagnosticRow = {
  id: number;
  event_name: string;
  event_id: string;
  status: string;
  events_received: number | null;
  error_message: string | null;
  created_at: string;
};

type Evidence = {
  outbox?: MetaOutboxEventState;
  latestDiagnostic?: DiagnosticRow;
  sentDiagnostic?: DiagnosticRow;
};

const QUERY_CHUNK_SIZE = 100;

function isMissingTableError(error: unknown): boolean {
  return /no such table|no such column/i.test(error instanceof Error ? error.message : String(error));
}

function chunks<T>(values: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

function qualityEventName(quality: AdminLeadQuality): 'QualifiedLead' | 'UnqualifiedLead' {
  return quality === 'target' ? 'QualifiedLead' : 'UnqualifiedLead';
}

export function qualityEventId(
  lead: Pick<AdminQualityLeadRow, 'id' | 'event_id' | 'quality_action_id'>,
  quality: AdminLeadQuality,
): string {
  const base = String(lead.event_id || lead.id);
  const actionId = String(lead.quality_action_id || '').trim();
  return actionId ? `lq:${quality}:${base}:a:${actionId}` : `lq:${quality}:${base}`;
}

export function qualityEventIds(
  lead: Pick<AdminQualityLeadRow, 'id' | 'event_id' | 'quality_action_id'>,
  quality: AdminLeadQuality,
): string[] {
  const canonical = qualityEventId(lead, quality);
  const priorCanonical = `lq:${quality}:${String(lead.event_id || lead.id)}`;
  const legacy = `lq:${quality}:${lead.id}`;
  return Array.from(new Set([canonical, priorCanonical, legacy]));
}

function safeReason(value: unknown): string | null {
  let reason = String(value || '').replace(/[\r\n\t]+/g, ' ').trim();
  if (!reason) return null;
  reason = reason
    .replace(/([?&](?:access_token|token|secret|key)=)[^\s&]+/gi, '$1[скрыто]')
    .replace(/(["']?(?:access_token|token|secret|key)["']?\s*[:=]\s*["']?)[^"',\s}]+/gi, '$1[скрыто]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email скрыт]')
    .replace(/(?:\+?\d[\s().-]*){8,}/g, '[телефон скрыт]');
  return reason.slice(0, 400);
}

function diagnosticTime(row: DiagnosticRow | undefined): number {
  if (!row) return 0;
  const parsed = Date.parse(row.created_at || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function outboxTime(row: MetaOutboxEventState | undefined): number {
  if (!row) return 0;
  return Number(row.sent_at || row.updated_at || 0) * 1000;
}

function resolveEvidence(
  eventId: string,
  quality: AdminLeadQuality,
  evidence: Evidence,
): AdminQualityDeliveryItem {
  const eventName = qualityEventName(quality);
  const outbox = evidence.outbox;
  const sentDiagnostic = evidence.sentDiagnostic;
  const latestDiagnostic = evidence.latestDiagnostic;

  if (sentDiagnostic) {
    return {
      quality,
      event_name: eventName,
      event_id: eventId,
      status: 'sent',
      queue_status: outbox?.status,
      attempts: Number(outbox?.attempts || 0),
      sent_at: Math.floor(diagnosticTime(sentDiagnostic) / 1000) || null,
      updated_at: sentDiagnostic.created_at,
      current: false,
    };
  }
  // Статус 'sent' в очереди ставится только после подтверждения events_received
  // от Meta (прямая отправка, обработчик очереди и идемпотентный маркер — все
  // требуют подтверждённой квитанции). Поэтому запись очереди — достаточное
  // доказательство доставки, даже когда строка диагностики уже очищена по
  // сроку хранения.
  if (outbox?.status === 'sent') {
    return {
      quality,
      event_name: eventName,
      event_id: eventId,
      status: 'sent',
      queue_status: outbox.status,
      attempts: Number(outbox.attempts || 0),
      reason: 'Доставка подтверждена журналом очереди; детальная запись диагностики уже очищена по сроку хранения',
      sent_at: outbox.sent_at ?? null,
      updated_at: outbox.updated_at ? new Date(outbox.updated_at * 1000).toISOString() : null,
      current: false,
    };
  }
  if (outbox && ['pending', 'retry', 'sending'].includes(outbox.status)) {
    return {
      quality,
      event_name: eventName,
      event_id: eventId,
      status: 'queued',
      queue_status: outbox.status,
      attempts: Number(outbox.attempts || 0),
      reason: safeReason(outbox.last_error),
      updated_at: outbox.updated_at ? new Date(outbox.updated_at * 1000).toISOString() : null,
      current: false,
    };
  }
  if (outbox?.status === 'dead_letter') {
    return {
      quality,
      event_name: eventName,
      event_id: eventId,
      status: 'failed',
      queue_status: outbox.status,
      attempts: Number(outbox.attempts || 0),
      reason: safeReason(outbox.last_error) || 'Повторные отправки остановлены',
      updated_at: outbox.updated_at ? new Date(outbox.updated_at * 1000).toISOString() : null,
      current: false,
    };
  }
  if (latestDiagnostic) {
    const status: AdminQualityDeliveryStatus = latestDiagnostic.status === 'skipped'
      ? 'skipped'
      : latestDiagnostic.status === 'sent' && Number(latestDiagnostic.events_received || 0) > 0
        ? 'sent'
        : 'failed';
    return {
      quality,
      event_name: eventName,
      event_id: eventId,
      status,
      attempts: Number(outbox?.attempts || 0),
      reason: safeReason(latestDiagnostic.error_message),
      sent_at: status === 'sent' ? Math.floor(diagnosticTime(latestDiagnostic) / 1000) || null : null,
      updated_at: latestDiagnostic.created_at,
      current: false,
    };
  }
  return {
    quality,
    event_name: eventName,
    event_id: eventId,
    status: 'unknown',
    reason: 'В outbox и диагностике нет записи об этой отправке',
    current: false,
  };
}

async function readOutbox(db: D1Database, eventIds: string[]): Promise<MetaOutboxEventState[]> {
  const rows: MetaOutboxEventState[] = [];
  for (const part of chunks(eventIds, QUERY_CHUNK_SIZE)) {
    const placeholders = part.map(() => '?').join(', ');
    try {
      const result = await db.prepare(
        `SELECT id, event_name, event_id, status, attempts, last_error, sent_at, updated_at
         FROM meta_outbox
         WHERE id IN (${placeholders})`,
      ).bind(...part).all<MetaOutboxEventState>();
      rows.push(...(result.results || []));
    } catch (error) {
      if (!isMissingTableError(error)) throw error;
      return [];
    }
  }
  return rows;
}

async function readDiagnostics(db: D1Database, eventIds: string[]): Promise<DiagnosticRow[]> {
  const rows: DiagnosticRow[] = [];
  for (const part of chunks(eventIds, QUERY_CHUNK_SIZE)) {
    const placeholders = part.map(() => '?').join(', ');
    try {
      const result = await db.prepare(
        `SELECT id, event_name, event_id, status, events_received, error_message, created_at
         FROM meta_capi_diagnostics
         WHERE event_name IN ('QualifiedLead', 'UnqualifiedLead')
           AND event_id IN (${placeholders})
         ORDER BY datetime(created_at) DESC, id DESC`,
      ).bind(...part).all<DiagnosticRow>();
      rows.push(...(result.results || []));
    } catch (error) {
      if (!isMissingTableError(error)) throw error;
      return [];
    }
  }
  return rows;
}

export async function attachAdminQualityDelivery<T extends AdminQualityLeadRow>(
  db: D1Database,
  leads: T[],
): Promise<Array<T & {
  quality_meta_event_id?: string;
  quality_meta_status?: AdminQualityDeliveryStatus;
  quality_meta_queue_status?: OutboxStatus;
  quality_meta_attempts?: number;
  quality_meta_error?: string | null;
  quality_meta_sent_at?: number | null;
  quality_meta_requires_confirmation?: boolean;
  quality_meta_change_blocked?: boolean;
  quality_meta_processing?: boolean;
  quality_meta_history: AdminQualityDeliveryItem[];
}>> {
  if (leads.length === 0) return [];

  const ids = Array.from(new Set(leads.flatMap((lead) => [
    ...qualityEventIds(lead, 'target'),
    ...qualityEventIds(lead, 'nontarget'),
  ])));
  const [outboxRows, diagnosticRows] = await Promise.all([readOutbox(db, ids), readDiagnostics(db, ids)]);
  const evidence = new Map<string, Evidence>();

  for (const row of outboxRows) {
    const item = evidence.get(row.id) || {};
    if (!item.outbox || outboxTime(row) >= outboxTime(item.outbox)) item.outbox = row;
    evidence.set(row.id, item);
  }
  for (const row of diagnosticRows) {
    if (!row.event_id) continue;
    const item = evidence.get(row.event_id) || {};
    if (!item.latestDiagnostic || diagnosticTime(row) > diagnosticTime(item.latestDiagnostic)) item.latestDiagnostic = row;
    if (row.status === 'sent' && Number(row.events_received || 0) > 0) {
      if (!item.sentDiagnostic || diagnosticTime(row) > diagnosticTime(item.sentDiagnostic)) item.sentDiagnostic = row;
    }
    evidence.set(row.event_id, item);
  }

  return leads.map((lead) => {
    const currentQuality = lead.quality === 'target' || lead.quality === 'nontarget' ? lead.quality : '';
    const history: AdminQualityDeliveryItem[] = [];
    for (const quality of ['target', 'nontarget'] as const) {
      for (const eventId of qualityEventIds(lead, quality)) {
        const item = evidence.get(eventId);
        if (item) history.push(resolveEvidence(eventId, quality, item));
      }
    }

    let current: AdminQualityDeliveryItem | undefined;
    if (currentQuality) {
      const currentIds = qualityEventIds(lead, currentQuality);
      current = history.find((item) => item.quality === currentQuality && item.event_id === currentIds[0])
        || history.find((item) => item.quality === currentQuality && currentIds.includes(item.event_id));
      if (!current) {
        current = Number(lead.quality_processing || 0) === 1
          ? {
              quality: currentQuality,
              event_name: qualityEventName(currentQuality),
              event_id: currentIds[0],
              status: 'queued',
              reason: 'Сервер завершает постановку события качества в Meta',
              current: false,
            }
          : resolveEvidence(currentIds[0], currentQuality, {});
        history.push(current);
      }
      current.current = true;
    }

    history.sort((left, right) => {
      const leftTime = Date.parse(left.updated_at || '') || Number(left.sent_at || 0) * 1000;
      const rightTime = Date.parse(right.updated_at || '') || Number(right.sent_at || 0) * 1000;
      return rightTime - leftTime || left.event_id.localeCompare(right.event_id);
    });

    return {
      ...lead,
      quality_meta_event_id: current?.event_id,
      quality_meta_status: current?.status,
      quality_meta_queue_status: current?.queue_status,
      quality_meta_attempts: current?.attempts,
      quality_meta_error: current?.reason,
      quality_meta_sent_at: current?.sent_at,
      quality_meta_requires_confirmation: Boolean(current && ['queued', 'sent', 'unknown'].includes(current.status)),
      quality_meta_change_blocked: current?.queue_status === 'sending' || Number(lead.quality_processing || 0) === 1,
      quality_meta_processing: Number(lead.quality_processing || 0) === 1,
      quality_meta_history: history,
    };
  });
}
