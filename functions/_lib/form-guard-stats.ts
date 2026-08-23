/**
 * Счётчик отказов на форме заявки.
 *
 * Отвечает на единственный вопрос: не отсекает ли защита живых людей. Пока
 * это число близко к нулю — Turnstile работает правильно; если оно поползло
 * вверх, владелец увидит это в разделе «Проверка», а не узнает по отсутствию
 * заявок.
 *
 * Всё здесь подчинено бесплатному тарифу Cloudflare, где суточный лимит
 * записей в D1 конечный:
 *
 * - хранится суточный агрегат, а не запись на каждый отказ;
 * - у записей есть дневной бюджет, и при потоке ботов счётчик перестаёт
 *   писать, отметив день как неполный. Подробный журнал атаки стоил бы
 *   дороже самой атаки;
 * - бюджет считается в кэше Cloudflare — он бесплатный и не пишет в базу.
 *
 * Неполный день показывается как «не меньше N». Выдавать усечённое число за
 * точное нельзя: на такие цифры смотрят, чтобы принимать решения.
 */

import type { TurnstileFailureReason } from './turnstile';
import type { Env } from './types';

/**
 * Сколько записей в D1 позволено потратить за сутки. Хватает, чтобы точно
 * посчитать любой нормальный день, и мало, чтобы поток ботов что-то стоил.
 */
const DAILY_WRITE_BUDGET = 200;

function budgetKey(day: string): Request {
  return new Request(`https://internal-form-guard.local/budget/${day}`);
}

/**
 * Бюджет считается в кэше дата-центра: он неточен (у каждого дата-центра свой
 * счёт, одновременные запросы могут прочитать одно значение), и это здесь
 * допустимо. Задача — грубый потолок, а не точный учёт.
 */
async function claimWriteBudget(day: string): Promise<boolean> {
  const cache = caches.default;
  const key = budgetKey(day);

  const existing = await cache.match(key);
  const used = existing ? Number(await existing.text()) || 0 : 0;
  if (used >= DAILY_WRITE_BUDGET) return false;

  await cache.put(key, new Response(String(used + 1), {
    // Сутки с запасом: ключ всё равно меняется вместе с датой.
    headers: { 'Cache-Control': 'max-age=86400' },
  }));
  return true;
}

export async function recordFormRejection(env: Env, reason: TurnstileFailureReason): Promise<void> {
  if (!env.DB) return;

  const day = new Date().toISOString().slice(0, 10);

  try {
    if (await claimWriteBudget(day)) {
      await env.DB.prepare(
        `INSERT INTO form_guard_daily (day, reason, count, throttled, updated_at)
         VALUES (?, ?, 1, 0, strftime('%s','now'))
         ON CONFLICT(day, reason) DO UPDATE SET
           count = form_guard_daily.count + 1,
           updated_at = excluded.updated_at`,
      ).bind(day, reason).run();
      return;
    }

    // Бюджет исчерпан. Отмечаем день неполным — но только если отметки ещё
    // нет, иначе экономия записей превратилась бы в поток апдейтов.
    await env.DB.prepare(
      `UPDATE form_guard_daily SET throttled = 1, updated_at = strftime('%s','now')
       WHERE day = ? AND reason = ? AND throttled = 0`,
    ).bind(day, reason).run();
  } catch (error) {
    // Телеметрия не имеет права влиять на приём заявок: миграции может не
    // быть, база может быть недоступна — на решение по заявке это не влияет.
    console.error('[Form guard] Не удалось записать отказ:', error);
  }
}

export interface FormGuardDay {
  reason: string;
  count: number;
  throttled: boolean;
}

/** Отказы за последние сутки — для раздела «Проверка». */
export async function readFormGuardToday(env: Env): Promise<FormGuardDay[]> {
  if (!env.DB) return [];
  const day = new Date().toISOString().slice(0, 10);
  const result = await env.DB.prepare(
    'SELECT reason, count, throttled FROM form_guard_daily WHERE day = ?',
  ).bind(day).all<{ reason: string; count: number; throttled: number }>();

  return (result.results || []).map((row) => ({
    reason: String(row.reason),
    count: Number(row.count || 0),
    throttled: Number(row.throttled || 0) === 1,
  }));
}
