import { verifyAdminPassword } from '../../_lib/auth';
import { CACHE_CONTROL } from '../../_lib/cache';
import { json } from '../../_lib/http';
import { migrationRequiredPayload } from '../../_lib/migration-guard';
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
    const limit = Math.min(Math.max(Math.trunc(Number(url.searchParams.get('limit'))) || 100, 10), 300);
    const offset = Math.min(Math.max(Math.trunc(Number(url.searchParams.get('offset'))) || 0, 0), 100_000);
    const actorFilter = url.searchParams.get('actor') || '';
    // Несколько кодов через запятую: у одного действия бывает старый и новый
    // код («trashed» и «lead_trashed»), и фильтр «В корзину» должен находить
    // оба (DA-116).
    const typeFilter = (url.searchParams.get('type') || '').split(',').map((item) => item.trim()).filter(Boolean).slice(0, 10);
    const query = (url.searchParams.get('q') || '').trim().slice(0, 200);

    // Схема журнала собирается двумя миграциями (DA-117): таблицу создаёт
    // 0012, автора и ID действия добавляет 0014. Без любой из них раздел
    // говорит, какую применить, а не показывает пустой журнал или 500.
    const columns = new Set(((await env.DB.prepare('PRAGMA table_info(lead_activity)').all<{ name: string }>()).results || []).map((column) => column.name));
    if (!columns.size) {
      return json(migrationRequiredPayload('0012_admin_control_center.sql', 'до неё журналу действий негде храниться.', 'lead_activity'), { status: 503, headers: noStore });
    }
    if (!['actor', 'entity_type', 'entity_id', 'action_id', 'metadata_json'].every((column) => columns.has(column))) {
      return json(migrationRequiredPayload('0014_crm_workspace.sql', 'до неё в журнале нет автора и номера действия.', 'lead_activity'), { status: 503, headers: noStore });
    }

    let sql = `
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
      sql += ' AND la.actor = ?';
      params.push(actorFilter);
    }
    if (typeFilter.length) {
      sql += ` AND la.type IN (${typeFilter.map(() => '?').join(', ')})`;
      params.push(...typeFilter);
    }
    sql += ' ORDER BY la.created_at DESC, la.id DESC';

    // Поиск идёт по всему журналу, а не по последним 200 строкам в браузере
    // (DA-114). Сравнение — в коде, а не в SQL: LOWER и LIKE в SQLite не
    // знают кириллицы, и «иван» не нашёл бы «Иван». Журнал небольшой, а
    // просмотр ограничен десятью тысячами последних записей.
    if (query) {
      const all = (await env.DB.prepare(`${sql} LIMIT ${AUDIT_SEARCH_SCAN}`).bind(...params).all<AuditActivityRecord>()).results || [];
      const matched = all.filter((record) => auditRecordMatches(record, query));
      return json({
        success: true,
        activities: matched.slice(offset, offset + limit),
        total: matched.length,
        offset,
        limit,
        hasMore: offset + limit < matched.length,
        scanLimited: all.length >= AUDIT_SEARCH_SCAN,
        timestamp: new Date().toISOString(),
      }, { headers: noStore });
    }

    const countSql = `SELECT COUNT(*) AS total FROM lead_activity la WHERE 1=1${actorFilter ? ' AND la.actor = ?' : ''}${typeFilter.length ? ` AND la.type IN (${typeFilter.map(() => '?').join(', ')})` : ''}`;
    const [page, count] = await Promise.all([
      env.DB.prepare(`${sql} LIMIT ? OFFSET ?`).bind(...params, limit, offset).all<AuditActivityRecord>(),
      env.DB.prepare(countSql).bind(...params).first<{ total: number }>(),
    ]);
    const total = Number(count?.total || 0);
    return json({
      success: true,
      activities: page.results || [],
      total,
      offset,
      limit,
      hasMore: offset + limit < total,
      timestamp: new Date().toISOString(),
    }, { headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({
      success: false,
      error: `Ошибка чтения журнала действий: ${message}`,
    }, { status: 500, headers: noStore });
  }
};

/** Сколько последних записей просматривает поиск по журналу. */
const AUDIT_SEARCH_SCAN = 10_000;

/**
 * Совпадение записи с поиском: имя, телефон, примечание, ID действия и
 * номер записи — тот самый «#201», который журнал показывает в деталях
 * записи без своего action_id (DA-115).
 */
export function auditRecordMatches(record: Pick<AuditActivityRecord, 'id' | 'lead_name' | 'lead_phone' | 'note' | 'action_id'>, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const number = q.replace(/^#/, '');
  if (/^\d+$/.test(number) && String(record.id) === number) return true;
  const digits = q.replace(/\D/g, '');
  if (digits.length >= 3 && String(record.lead_phone || '').replace(/\D/g, '').includes(digits)) return true;
  return [record.lead_name, record.lead_phone, record.note, record.action_id]
    .some((value) => String(value || '').toLowerCase().includes(q));
}

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
