import { verifyAdminPassword } from '../../_lib/auth';
import { CACHE_CONTROL } from '../../_lib/cache';
import { json } from '../../_lib/http';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };
const MIGRATION = '0025_crm_speed.sql';
const MAX_TEMPLATES = 40;
const MAX_TITLE = 80;
const MAX_BODY = 2000;

interface Template {
  id: number;
  title: string;
  body: string;
  sort_order: number;
}

/**
 * Готовые ответы на заявку. Скорость первого ответа сильнее всего влияет на
 * конверсию, а набирать одно и то же руками — самый долгий шаг.
 * Подстановки {имя}, {услуга}, {бюджет} раскрываются уже в интерфейсе.
 */
const STARTER_TEMPLATES: Array<{ title: string; body: string }> = [
  {
    title: 'Первый ответ',
    body: '{имя}, здравствуйте! Получил вашу заявку по направлению «{услуга}». Готов обсудить задачу — подскажите, когда удобно созвониться на 15 минут?',
  },
  {
    title: 'Запрос вводных',
    body: '{имя}, чтобы посчитать прогноз, нужны три вещи:\n1) сайт или посадочная страница,\n2) какой результат считаете успехом,\n3) планируемый бюджет на месяц.\nМожно коротко, в свободной форме.',
  },
  {
    title: 'Отправка предложения',
    body: '{имя}, отправил предложение по «{услуга}». Внутри — план на первый месяц, прогноз по заявкам и стоимость работ. Посмотрите, пожалуйста, и напишите, что вызывает вопросы.',
  },
  {
    title: 'Мягкое напоминание',
    body: '{имя}, напоминаю о себе по предложению. Если сейчас неактуально — просто напишите, я не буду беспокоить. Если актуально, но нужно время — скажите, когда вернуться к разговору.',
  },
];

function isMissingTableError(error: unknown): boolean {
  return /no such table/i.test(error instanceof Error ? error.message : String(error));
}

function migrationResponse(): Response {
  return json({
    success: false,
    code: 'MIGRATION_REQUIRED',
    migration: MIGRATION,
    error: `Примените миграцию ${MIGRATION} — до неё шаблоны негде хранить.`,
  }, { status: 503, headers: noStore });
}

function clean(value: unknown, max: number): string {
  return String(value ?? '').replace(/\r\n/g, '\n').replace(/[^\S\n]+/g, ' ').trim().slice(0, max);
}

async function listTemplates(db: D1Database): Promise<Template[]> {
  const rows = await db.prepare(
    'SELECT id, title, body, sort_order FROM crm_templates ORDER BY sort_order ASC, id ASC LIMIT ?',
  ).bind(MAX_TEMPLATES).all<Template>();
  return rows.results || [];
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;
  if (!verifyAdminPassword(request.headers.get('X-Admin-Password') || '', env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.DB) {
    return json({ success: false, code: 'D1_NOT_BOUND', error: 'Шаблоны хранятся в D1 и доступны на production.' }, { status: 503, headers: noStore });
  }

  try {
    return json({ success: true, templates: await listTemplates(env.DB), starters: STARTER_TEMPLATES }, { headers: noStore });
  } catch (error) {
    if (isMissingTableError(error)) return migrationResponse();
    return json({ success: false, error: error instanceof Error ? error.message : 'Не удалось загрузить шаблоны' }, { status: 500, headers: noStore });
  }
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (!verifyAdminPassword(request.headers.get('X-Admin-Password') || String(body.password || ''), env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.DB) {
    return json({ success: false, code: 'D1_NOT_BOUND', error: 'Шаблоны хранятся в D1 и доступны на production.' }, { status: 503, headers: noStore });
  }

  const db = env.DB;
  const action = String(body.action || '');

  try {
    if (action === 'seed') {
      const existing = await listTemplates(db);
      if (existing.length > 0) {
        return json({ success: true, templates: existing, seeded: 0 }, { headers: noStore });
      }
      const statements = STARTER_TEMPLATES.map((template, index) => db.prepare(
        'INSERT INTO crm_templates (title, body, sort_order) VALUES (?, ?, ?)',
      ).bind(template.title, template.body, index));
      await db.batch(statements);
      return json({ success: true, templates: await listTemplates(db), seeded: statements.length }, { headers: noStore });
    }

    if (action === 'save') {
      const title = clean(body.title, MAX_TITLE);
      const text = String(body.body ?? '').replace(/\r\n/g, '\n').trim().slice(0, MAX_BODY);
      if (!title || !text) {
        return json({ success: false, error: 'Нужны и название, и текст шаблона' }, { status: 400, headers: noStore });
      }
      const id = Number(body.id);
      if (Number.isInteger(id) && id > 0) {
        await db.prepare(
          "UPDATE crm_templates SET title = ?, body = ?, updated_at = datetime('now') WHERE id = ?",
        ).bind(title, text, id).run();
      } else {
        const count = await db.prepare('SELECT COUNT(*) AS total FROM crm_templates').first<{ total: number }>();
        if (Number(count?.total || 0) >= MAX_TEMPLATES) {
          return json({ success: false, error: `Больше ${MAX_TEMPLATES} шаблонов хранить не будем — это уже не быстрый доступ` }, { status: 400, headers: noStore });
        }
        await db.prepare('INSERT INTO crm_templates (title, body, sort_order) VALUES (?, ?, ?)')
          .bind(title, text, Number(count?.total || 0))
          .run();
      }
      return json({ success: true, templates: await listTemplates(db) }, { headers: noStore });
    }

    if (action === 'delete') {
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) {
        return json({ success: false, error: 'Некорректный идентификатор шаблона' }, { status: 400, headers: noStore });
      }
      await db.prepare('DELETE FROM crm_templates WHERE id = ?').bind(id).run();
      return json({ success: true, templates: await listTemplates(db) }, { headers: noStore });
    }

    return json({ success: false, error: 'Неизвестное действие' }, { status: 400, headers: noStore });
  } catch (error) {
    if (isMissingTableError(error)) return migrationResponse();
    return json({ success: false, error: error instanceof Error ? error.message : 'Не удалось сохранить шаблон' }, { status: 500, headers: noStore });
  }
};
