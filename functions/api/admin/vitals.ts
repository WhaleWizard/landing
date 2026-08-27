import { verifyAdminPassword } from '../../_lib/auth';
import { CACHE_CONTROL } from '../../_lib/cache';
import { json } from '../../_lib/http';
import { enforceRateLimit } from '../../_lib/rate-limit';
import type { Env } from '../../_lib/types';

const noStore = { 'Cache-Control': CACHE_CONTROL.noStore };
const MIGRATION = '0027_web_vitals.sql';

const METRIC_LABELS: Record<string, { label: string; hint: string; unit: 'ms' | 'score' }> = {
  LCP: { label: 'Загрузка главного блока', hint: 'Когда появляется основной контент. Хорошо — до 2,5 с.', unit: 'ms' },
  INP: { label: 'Отклик на действие', hint: 'Насколько быстро страница отвечает на клик. Хорошо — до 200 мс.', unit: 'ms' },
  CLS: { label: 'Смещение вёрстки', hint: 'Насколько прыгает контент при загрузке. Хорошо — до 0,1.', unit: 'score' },
  TTFB: { label: 'Ответ сервера', hint: 'Сколько ждём первый байт. Хорошо — до 800 мс.', unit: 'ms' },
};

function number(value: unknown): number {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isMissingTableError(error: unknown): boolean {
  return /no such table/i.test(error instanceof Error ? error.message : String(error));
}

/**
 * Реальные Core Web Vitals из суточных агрегатов. Доля «хорошо» здесь
 * важнее среднего: Google смотрит на распределение, а одно медленное
 * устройство легко утягивает среднее вниз.
 */
export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  const rateLimited = await enforceRateLimit(request, 'admin');
  if (rateLimited) return rateLimited;
  if (!verifyAdminPassword(request.headers.get('X-Admin-Password') || '', env)) {
    return json({ success: false, error: 'Unauthorized' }, { status: 401, headers: noStore });
  }
  if (!env.DB) {
    return json({ success: false, code: 'D1_NOT_BOUND', error: 'Метрики хранятся в D1 и доступны на production.' }, { status: 503, headers: noStore });
  }

  const raw = Number(new URL(request.url).searchParams.get('days') || 28);
  const days = Number.isFinite(raw) ? Math.min(Math.max(Math.floor(raw), 7), 90) : 28;

  try {
    const totals = await env.DB.prepare(`
      SELECT metric,
        SUM(samples) AS samples,
        SUM(value_sum) AS value_sum,
        SUM(good) AS good,
        SUM(needs_improvement) AS needs_improvement,
        SUM(poor) AS poor
      FROM web_vitals_daily
      WHERE day >= date('now', ?)
      GROUP BY metric
    `).bind(`-${days - 1} day`).all<{
      metric: string; samples: number; value_sum: number;
      good: number; needs_improvement: number; poor: number;
    }>();

    const byDevice = await env.DB.prepare(`
      SELECT metric, device, SUM(samples) AS samples, SUM(good) AS good
      FROM web_vitals_daily
      WHERE day >= date('now', ?) AND device != ''
      GROUP BY metric, device
    `).bind(`-${days - 1} day`).all<{ metric: string; device: string; samples: number; good: number }>();

    // HAVING SUM(samples), а не HAVING samples: `samples` — это и колонка
    // таблицы, и псевдоним результата, и SQLite в HAVING берёт **колонку**.
    // Проверено: страница с двумя выборками в день за много дней (в сумме
    // десятки) отсеивалась как «меньше трёх», и список самых медленных
    // страниц оставался пустым на небольшом трафике — то есть ровно там,
    // где он и нужен.
    const worstPages = await env.DB.prepare(`
      SELECT page_path, SUM(samples) AS samples,
        SUM(value_sum) / NULLIF(SUM(samples), 0) AS average,
        SUM(poor) AS poor
      FROM web_vitals_daily
      WHERE day >= date('now', ?) AND metric = 'LCP' AND page_path != ''
      GROUP BY page_path
      HAVING SUM(samples) >= 3
      ORDER BY average DESC
      LIMIT 8
    `).bind(`-${days - 1} day`).all<{ page_path: string; samples: number; average: number; poor: number }>();

    const metrics = (totals.results || []).map((row) => {
      const samples = number(row.samples);
      const meta = METRIC_LABELS[row.metric] || { label: row.metric, hint: '', unit: 'ms' as const };
      return {
        metric: row.metric,
        label: meta.label,
        hint: meta.hint,
        unit: meta.unit,
        samples,
        average: samples > 0 ? Math.round((number(row.value_sum) / samples) * 1000) / 1000 : null,
        goodShare: samples > 0 ? Math.round((number(row.good) / samples) * 1000) / 10 : null,
        good: number(row.good),
        needsImprovement: number(row.needs_improvement),
        poor: number(row.poor),
      };
    });

    return json({
      success: true,
      days,
      metrics,
      devices: (byDevice.results || []).map((row) => ({
        metric: row.metric,
        device: row.device,
        samples: number(row.samples),
        goodShare: number(row.samples) > 0 ? Math.round((number(row.good) / number(row.samples)) * 1000) / 10 : null,
      })),
      slowestPages: (worstPages.results || []).map((row) => ({
        path: row.page_path,
        samples: number(row.samples),
        average: Math.round(number(row.average)),
        poor: number(row.poor),
      })),
      notes: [
        'Это данные настоящих посетителей, а не лабораторный замер: именно по ним Google оценивает страницы.',
        'Доля «хорошо» важнее среднего — одно медленное устройство легко утягивает среднее вниз.',
        'Отклик на действие считается приближённо: берётся самое долгое взаимодействие на странице.',
        'Отдельные визиты не хранятся: в базе только суточные счётчики по метрике, устройству и странице.',
      ],
    }, { headers: noStore });
  } catch (error) {
    if (isMissingTableError(error)) {
      return json({
        success: false,
        code: 'MIGRATION_REQUIRED',
        migration: MIGRATION,
        error: `Примените миграцию ${MIGRATION} — до неё метрики посетителей негде хранить.`,
      }, { status: 503, headers: noStore });
    }
    return json({ success: false, error: error instanceof Error ? error.message : 'Не удалось прочитать метрики' }, { status: 500, headers: noStore });
  }
};
