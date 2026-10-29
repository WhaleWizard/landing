import { verifyAdminPassword } from '../../_lib/auth';
import { CACHE_CONTROL } from '../../_lib/cache';
import { json } from '../../_lib/http';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };

export interface AuditActivityRecord {
  id: number;
  lead_id: number;
  type: string;
  from_val: string;
  to_val: string;
  note: string;
  actor: string;
  entity_type: string;
  entity_id: number | null;
  action_id: string;
  metadata_json: string;
  created_at: string;
  lead_name: string | null;
  lead_phone: string | null;
  current_status: string | null;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  if (!verifyAdminPassword(request.headers.get('X-Admin-Password') || '', env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }

  if (!env.DB) {
    return json({
      success: true,
      activities: getMockAuditTrail(),
      isDemo: true,
      note: 'D1 не привязан локально — отображаются демонстрационные записи аудита',
    }, { headers: noStore });
  }

  try {
    const url = new URL(request.url);
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 10), 300);
    const actorFilter = url.searchParams.get('actor') || '';
    const typeFilter = url.searchParams.get('type') || '';

    let query = `
      SELECT 
        la.id,
        la.lead_id,
        la.type,
        la."from" AS from_val,
        la."to" AS to_val,
        la.note,
        la.actor,
        la.entity_type,
        la.entity_id,
        la.action_id,
        la.metadata_json,
        la.created_at,
        l.name AS lead_name,
        l.phone AS lead_phone,
        l.status AS current_status
      FROM lead_activity la
      LEFT JOIN leads l ON l.id = la.lead_id
      WHERE 1=1
    `;

    const params: Array<string | number> = [];

    if (actorFilter) {
      query += ` AND la.actor = ?`;
      params.push(actorFilter);
    }

    if (typeFilter) {
      query += ` AND la.type = ?`;
      params.push(typeFilter);
    }

    query += ` ORDER BY la.created_at DESC, la.id DESC LIMIT ?`;
    params.push(limit);

    const stmt = env.DB.prepare(query).bind(...params);
    const result = await stmt.all<AuditActivityRecord>();

    return json({
      success: true,
      activities: result.results || [],
      total: result.results?.length || 0,
      timestamp: new Date().toISOString(),
    }, { headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Graceful fallback if lead_activity table hasn't migrated yet
    if (message.includes('no such table: lead_activity')) {
      return json({
        success: true,
        activities: [],
        migrationRequired: '0014_crm_workspace.sql',
        error: 'Таблица журнала действий lead_activity ещё не создана. Примените миграцию 0014_crm_workspace.sql',
      }, { headers: noStore });
    }

    return json({
      success: false,
      error: `Ошибка чтения журнала действий: ${message}`,
    }, { status: 500, headers: noStore });
  }
};

function getMockAuditTrail(): AuditActivityRecord[] {
  const now = new Date();
  const iso = (minsAgo: number) => new Date(now.getTime() - minsAgo * 60000).toISOString();

  return [
    {
      id: 101,
      lead_id: 42,
      type: 'status_change',
      from_val: 'new',
      to_val: 'qualified',
      note: 'Лид подтвердил бюджет $2,000/мес на Meta Ads',
      actor: 'admin',
      entity_type: 'lead',
      entity_id: 42,
      action_id: 'action-101',
      metadata_json: '{"source":"manual","confidence":0.95}',
      created_at: iso(15),
      lead_name: 'Алексей Смирнов',
      lead_phone: '+998 90 123 45 67',
      current_status: 'qualified',
    },
    {
      id: 100,
      lead_id: 42,
      type: 'task_created',
      from_val: '',
      to_val: 'call',
      note: 'Подготовить КП по тарифам Performance до пятницы',
      actor: 'admin',
      entity_type: 'crm_task',
      entity_id: 12,
      action_id: 'action-100',
      metadata_json: '{"due":"2026-10-31"}',
      created_at: iso(45),
      lead_name: 'Алексей Смирнов',
      lead_phone: '+998 90 123 45 67',
      current_status: 'qualified',
    },
    {
      id: 99,
      lead_id: 41,
      type: 'lead_intake',
      from_val: '',
      to_val: 'new',
      note: 'Новая заявка с лендинга /meta-ads (Услуги рекламы)',
      actor: 'system',
      entity_type: 'lead',
      entity_id: 41,
      action_id: 'lead-created:ev-998',
      metadata_json: '{"form":"HeroForm","utm_source":"instagram"}',
      created_at: iso(120),
      lead_name: 'Елена Васильева',
      lead_phone: '+7 916 555 44 33',
      current_status: 'new',
    },
    {
      id: 98,
      lead_id: 39,
      type: 'status_change',
      from_val: 'in_progress',
      to_val: 'won',
      note: 'Договор подписан, оплачен счёт за первый месяц ($1,400)',
      actor: 'admin',
      entity_type: 'lead',
      entity_id: 39,
      action_id: 'action-98',
      metadata_json: '{"deal_value":1400,"currency":"USD"}',
      created_at: iso(360),
      lead_name: 'Тимур Каримов',
      lead_phone: '+998 97 777 88 99',
      current_status: 'won',
    },
    {
      id: 97,
      lead_id: 38,
      type: 'note_added',
      from_val: '',
      to_val: 'note',
      note: 'Клиент просит паузу до следующего понедельника, уехал в командировку',
      actor: 'admin',
      entity_type: 'crm_note',
      entity_id: 8,
      action_id: 'action-97',
      metadata_json: '{}',
      created_at: iso(720),
      lead_name: 'Дмитрий Волков',
      lead_phone: '+7 999 111 22 33',
      current_status: 'contacted',
    },
  ];
}
